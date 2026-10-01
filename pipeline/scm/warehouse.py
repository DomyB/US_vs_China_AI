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
    con.close()
    return db_path
