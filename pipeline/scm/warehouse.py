"""Build the DuckDB warehouse over the Parquet files and derive cross-source tables."""
from __future__ import annotations

from pathlib import Path

import duckdb
import pandas as pd

from .paths import WAREHOUSE_DIR
from .schema import SCHEMAS


def table_frames(table: str, warehouse: Path = WAREHOUSE_DIR) -> pd.DataFrame:
    """Concatenate every source's Parquet for a table (empty frame with schema columns if none)."""
    d = warehouse / table
    files = sorted(d.glob("*.parquet")) if d.exists() else []
    if not files:
        return pd.DataFrame({c: pd.Series(dtype=object) for c in SCHEMAS[table].columns})
    return pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)


def slot_path(table: str, slot: str, warehouse: Path = WAREHOUSE_DIR) -> Path:
    return warehouse / table / f"{slot}.parquet"


def load_slot(table: str, slot: str, warehouse: Path = WAREHOUSE_DIR) -> pd.DataFrame:
    """One Parquet file of a table (empty frame with the schema's columns when absent)."""
    p = slot_path(table, slot, warehouse)
    if not p.exists():
        return pd.DataFrame({c: pd.Series(dtype=object) for c in SCHEMAS[table].columns})
    return pd.read_parquet(p)


def upsert(table: str, slot: str, df: pd.DataFrame, warehouse: Path = WAREHOUSE_DIR) -> int:
    """Validate `df` and merge it into warehouse/<table>/<slot>.parquet on schema.KEY_COLUMNS, the NEW row
    winning (model outputs are recomputed, unlike facts where the first observation is kept). Returns rows stored."""
    from .schema import KEY_COLUMNS, validate

    keys = KEY_COLUMNS[table]
    new = validate(table, df.copy()) if not df.empty else df
    prev = load_slot(table, slot, warehouse)
    if not prev.empty and not new.empty:
        merged = pd.concat([prev, new], ignore_index=True).drop_duplicates(subset=keys, keep="last")
    elif new.empty:
        merged = prev
    else:
        merged = new
    merged = merged.reset_index(drop=True)
    p = slot_path(table, slot, warehouse)
    p.parent.mkdir(parents=True, exist_ok=True)
    if not merged.empty:
        validate(table, merged.copy()).to_parquet(p, index=False)
    return int(len(merged))


def replace_slot(table: str, slot: str, df: pd.DataFrame, warehouse: Path = WAREHOUSE_DIR) -> int:
    """Overwrite warehouse/<table>/<slot>.parquet (topic models are refitted wholesale)."""
    from .schema import validate

    p = slot_path(table, slot, warehouse)
    p.parent.mkdir(parents=True, exist_ok=True)
    if df.empty:
        p.unlink(missing_ok=True)
        return 0
    validate(table, df.copy()).to_parquet(p, index=False)
    return int(len(df))


def summary(warehouse: Path = WAREHOUSE_DIR) -> dict[str, int]:
    """Rows per table (from Parquet metadata, no data read) plus the Parquet file count under `_files`."""
    import pyarrow.parquet as pq

    out: dict[str, int] = {}
    files = 0
    for table in SCHEMAS:
        d = warehouse / table
        parts = sorted(d.glob("*.parquet")) if d.exists() else []
        if parts:
            out[table] = sum(pq.ParquetFile(f).metadata.num_rows for f in parts)
            files += len(parts)
    out["_files"] = files
    return out


MAX_SHRINK = 0.25  # a table may lose a quarter of its rows between releases (sources are re-fetched); more is a broken run


def check_not_below(current: dict[str, int], reference: dict[str, int]) -> list[str]:
    """Problems that mean the current warehouse must not replace the reference release: a table that vanished,
    a table that shrank by more than MAX_SHRINK, or fewer Parquet files. ingest_run is operational and exempt."""
    problems = []
    for table, ref_rows in reference.items():
        if table in ("ingest_run", "_files"):
            continue
        cur = current.get(table)
        if cur is None:
            problems.append(f"{table}: present in the restored release ({ref_rows} rows), missing now")
        elif ref_rows and cur < ref_rows * (1 - MAX_SHRINK):
            problems.append(f"{table}: {ref_rows} rows in the restored release, {cur} now (more than {int(MAX_SHRINK * 100)}% lost)")
    if current.get("_files", 0) < reference.get("_files", 0):
        problems.append(f"parquet files: {reference.get('_files')} in the restored release, {current.get('_files', 0)} now")
    return problems


def trade_discrepancies(trade: pd.DataFrame) -> pd.DataFrame:
    """Reported vs mirror values for the same reporter/partner/hs6/year/flow (annual only)."""
    if trade.empty:
        return pd.DataFrame(columns=["reporter", "partner", "hs6", "mineral", "year", "flow", "reported_usd", "mirror_usd", "ratio", "flag"])
    t = trade[trade["month"].isna()] if "month" in trade else trade
    keys = ["reporter", "partner", "hs6", "mineral", "year", "flow"]
    rep = t[t["value_type"] == "reported"].groupby(keys, as_index=False)["value_usd"].sum().rename(columns={"value_usd": "reported_usd"})
    mir = t[t["value_type"] == "mirror"].groupby(keys, as_index=False)["value_usd"].sum().rename(columns={"value_usd": "mirror_usd"})
    m = rep.merge(mir, on=keys, how="outer")
    m["ratio"] = m["mirror_usd"] / m["reported_usd"]
    m["flag"] = "consistent"
    m.loc[m["reported_usd"].isna() & m["mirror_usd"].notna(), "flag"] = "mirror_only"
    m.loc[m["reported_usd"].notna() & m["mirror_usd"].isna(), "flag"] = "reported_only"
    both = m["reported_usd"].notna() & m["mirror_usd"].notna()
    m.loc[both & ((m["ratio"] > 2) | (m["ratio"] < 0.5)), "flag"] = "large_discrepancy"
    return m


def finance_clusters(fin: pd.DataFrame) -> pd.DataFrame:
    """Group finance events that several databases report: same country, year and origin, an
    amount within 10 percent of the cluster's first member, and never two rows from the same
    source. Keeps every source id in `source_ids`. Conservative by design."""
    fin = fin.copy()
    if fin.empty:
        fin["dedup_cluster_id"] = pd.Series(dtype=str)
        fin["source_ids"] = pd.Series(dtype=str)
        return fin
    f = fin.sort_values(["country", "year", "actor_from_origin", "amount_usd"], na_position="last").reset_index(drop=True)
    cluster_ids: list[str] = []
    counter = 0
    group_key: tuple | None = None
    clusters: list[dict] = []  # per group: {"id", "anchor", "sources"}
    for _, row in f.iterrows():
        key = (row["country"], row["year"], row["actor_from_origin"])
        if key != group_key:
            group_key, clusters = key, []
        amt = row["amount_usd"]
        amt = None if amt is None or pd.isna(amt) else float(amt)
        chosen = None
        if amt is not None and amt > 0:
            for c in clusters:
                if c["anchor"] and abs(amt - c["anchor"]) / c["anchor"] <= 0.10 and row["source_id"] not in c["sources"]:
                    chosen = c
                    break
        if chosen is None:
            counter += 1
            chosen = {"id": f"c{counter:06d}", "anchor": amt, "sources": set()}
            clusters.append(chosen)
        chosen["sources"].add(row["source_id"])
        cluster_ids.append(chosen["id"])
    f["dedup_cluster_id"] = cluster_ids
    f["source_ids"] = f.groupby("dedup_cluster_id")["source_id"].transform(lambda s: ",".join(sorted(set(s))))
    return f


def news_clusters(docs: pd.DataFrame) -> pd.DataFrame:
    """The same article seen through an outlet's feed and through GDELT: group news rows by
    country and normalised URL, keep every source id in `source_ids`, and let the publisher's
    own date (RSS, precision "day") win over GDELT's indexing date ("seen")."""
    docs = docs.copy()
    if docs.empty:
        docs["source_ids"] = pd.Series(dtype=str)
        return docs
    news = docs[docs["doc_type"] == "news"].copy()
    other = docs[docs["doc_type"] != "news"].copy()
    other["source_ids"] = other["source_id"]
    if news.empty:
        return pd.concat([other], ignore_index=True)
    prec_rank = {"day": 0, "month": 1, "year": 2, "seen": 3}
    news["_rank"] = news["date_precision"].map(prec_rank).fillna(9)
    news = news.sort_values(["country", "url_norm", "_rank", "retrieved_at"])
    news["source_ids"] = news.groupby(["country", "url_norm"])["source_id"].transform(lambda s: ",".join(sorted(set(s))))
    news = news.drop_duplicates(subset=["country", "url_norm"], keep="first").drop(columns="_rank")
    return pd.concat([other, news], ignore_index=True)


def build(warehouse: Path = WAREHOUSE_DIR, db_name: str = "scm.duckdb") -> Path:
    warehouse.mkdir(parents=True, exist_ok=True)
    db_path = warehouse / db_name
    if db_path.exists():
        db_path.unlink()
    con = duckdb.connect(str(db_path))
    for table in SCHEMAS:
        d = warehouse / table
        if d.exists() and any(d.glob("*.parquet")):
            con.execute(f"CREATE VIEW {table} AS SELECT * FROM read_parquet('{d}/*.parquet', union_by_name=true)")
    trade = table_frames("trade_flow", warehouse)
    disc = trade_discrepancies(trade)
    con.register("disc_df", disc)
    con.execute("CREATE TABLE trade_discrepancy AS SELECT * FROM disc_df")
    fin = finance_clusters(table_frames("finance_event", warehouse))
    con.register("fin_df", fin)
    con.execute("CREATE TABLE finance_event_dedup AS SELECT * FROM fin_df")
    docs = news_clusters(table_frames("document", warehouse))
    con.register("docs_df", docs)
    con.execute("CREATE TABLE document_dedup AS SELECT * FROM docs_df")
    con.close()
    return db_path
