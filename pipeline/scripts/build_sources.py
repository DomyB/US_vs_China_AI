"""Merge the source registry YAML files, validate them, and generate
SOURCES.md (repository root) and web/public/data/sources.json.

Usage: python3 pipeline/scripts/build_sources.py
Requires: pyyaml
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
REGISTRY_DIR = ROOT / "pipeline" / "config" / "sources"
SOURCES_MD = ROOT / "SOURCES.md"
SITE_JSON = ROOT / "web" / "public" / "data" / "sources.json"
LIVENESS = ROOT / "data" / "liveness.json"

REQUIRED = [
    "id",
    "name",
    "url",
    "category",
    "reliability",
    "license",
    "access",
    "update_frequency",
    "refresh_schedule",
    "coverage_from",
    "coverage_to",
    "language",
    "status",
]
RELIABILITY = {"official", "independent_academic", "partisan", "state_media", "analysis"}
STATUS = {"live", "moved", "dead", "uncertain"}
ACCESS = {"api", "bulk", "rss", "html", "pdf", "derived"}
DEFAULTS = {"verified_on": "2026-10-01", "verified_method": "search", "auth": "none"}

RELIABILITY_LABEL = {
    "official": "Official",
    "independent_academic": "Independent / academic",
    "partisan": "Partisan",
    "state_media": "State-controlled media",
    "analysis": "Analysis (think tank)",
}
COUNTRY_NAME = {
    "ARG": "Argentina",
    "BOL": "Bolivia",
    "BRA": "Brazil",
    "CHL": "Chile",
    "COL": "Colombia",
    "ECU": "Ecuador",
    "GUY": "Guyana",
    "PRY": "Paraguay",
    "PER": "Peru",
    "SUR": "Suriname",
    "URY": "Uruguay",
    "VEN": "Venezuela",
}


def load_registry() -> list[dict]:
    sources: list[dict] = []
    for path in sorted(REGISTRY_DIR.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        for entry in data.get("sources", []):
            entry = {**DEFAULTS, **entry}
            entry.setdefault("scope", "country" if entry.get("countries") else "international")
            entry["_file"] = path.name
            sources.append(entry)
    return sources


def validate(sources: list[dict]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for s in sources:
        sid = s.get("id", "<missing id>")
        for field in REQUIRED:
            if field not in s:
                errors.append(f"{sid}: missing field '{field}' ({s['_file']})")
        if sid in seen:
            errors.append(f"{sid}: duplicate id")
        seen.add(sid)
        if s.get("reliability") not in RELIABILITY:
            errors.append(f"{sid}: bad reliability '{s.get('reliability')}'")
        if s.get("status") not in STATUS:
            errors.append(f"{sid}: bad status '{s.get('status')}'")
        if s.get("access") not in ACCESS:
            errors.append(f"{sid}: bad access '{s.get('access')}'")
        for c in s.get("countries", []) or []:
            if c not in COUNTRY_NAME:
                errors.append(f"{sid}: unknown country code '{c}'")
        if str(s.get("verified_on")) > str(date.today()):
            errors.append(f"{sid}: verified_on is in the future")
    return errors


def load_liveness() -> dict:
    """Latest direct HTTP check per source id (from the liveness workflow), or {} if none has run."""
    if not LIVENESS.exists():
        return {}
    payload = json.loads(LIVENESS.read_text(encoding="utf-8"))
    out = {}
    for sid, r in payload.get("results", {}).items():
        u = r.get("url", {})
        a = r.get("api_url")
        out[sid] = {
            "checked_at": r.get("checked_at"),
            "status": u.get("status"),
            "ok": bool(u.get("ok")),
            "error": u.get("error"),
            "api_status": a.get("status") if a else None,
            "api_ok": bool(a.get("ok")) if a else None,
        }
    return out


def liveness_label(lv: dict | None) -> str:
    if not lv:
        return "not checked"
    if lv["ok"] or lv.get("api_ok"):
        return "reachable"
    if lv["status"] in (401, 403):
        return "blocks automated clients (403)"
    if lv["status"] == 404:
        return "404 at registry URL"
    if lv["error"]:
        kind = lv["error"].split(":")[0]
        return {"SSLError": "TLS error (site certificate)", "ConnectTimeout": "timeout", "ConnectionError": "connection refused"}.get(kind, kind)
    return f"HTTP {lv['status']}"


def group_title(s: dict) -> str:
    if s.get("countries"):
        return "National: " + ", ".join(COUNTRY_NAME[c] for c in s["countries"])
    return {
        "international": "International",
        "regional": "Regional (Latin America)",
        "US": "United States",
        "CN": "China",
        "other": "Other jurisdictions",
    }.get(s.get("scope", "international"), "International")


def md_escape(text: object) -> str:
    return str(text).replace("|", "\\|").replace("\n", " ")


def render_markdown(sources: list[dict], liveness: dict | None = None) -> str:
    liveness = liveness or {}
    groups: dict[str, list[dict]] = {}
    for s in sources:
        groups.setdefault(group_title(s), []).append(s)
    order = ["International", "United States", "China", "Regional (Latin America)", "Other jurisdictions"]
    national = sorted(k for k in groups if k.startswith("National"))
    keys = [k for k in order if k in groups] + national

    counts = {k: 0 for k in STATUS}
    for s in sources:
        counts[s["status"]] += 1

    lines = [
        "# Sources",
        "",
        "Generated from `pipeline/config/sources/*.yaml` by `pipeline/scripts/build_sources.py`.",
        "Do not edit by hand. Every dataset and document on the site links back to one of these entries.",
        "",
        f"Total: {len(sources)} sources. Status: {counts['live']} live, {counts['moved']} moved, "
        f"{counts['dead']} dead, {counts['uncertain']} uncertain.",
        "",
        "**Verification caveat.** Statuses dated 2026-10-01 with method `search` were established from "
        "search-engine results, GitHub mirrors and package indexes, because the development sandbox cannot "
        "reach other hosts. Method `direct` means an HTTP check from a GitHub Actions runner.",
        "",
        (f"**Direct check.** The liveness workflow last tested every URL on {next(iter(liveness.values()))['checked_at'][:10]}. "
         "'Blocks automated clients' means the site answered 403 to a generic HTTP client (bot protection), not that it is down; "
         "'TLS error' means the site's certificate chain did not validate on the runner."
         if liveness else "**Direct check.** No liveness run recorded yet."),
        "",
        "**Reliability ratings:** Official (government, central bank, multilateral, exchange); "
        "Independent / academic (universities, NGOs, independent press); Partisan (documented political "
        "alignment or advocacy); State-controlled media (state-owned outlets and government communication); "
        "Analysis (think-tank commentary, used as context, not data).",
        "",
    ]
    for key in keys:
        lines += [f"## {key}", ""]
        lines.append("| Source | Status | Direct check | Reliability | Coverage | Access | Refresh | License | Notes |")
        lines.append("|---|---|---|---|---|---|---|---|---|")
        for s in sorted(groups[key], key=lambda x: (x["category"], x["name"])):
            name = f"[{md_escape(s['name'])}]({s['url']})"
            if s.get("api_url"):
                name += f" ([data]({s['api_url']}))"
            notes = []
            if s.get("orientation"):
                notes.append(f"Orientation: {s['orientation']}.")
            if s.get("paywall") and s["paywall"] != "none":
                notes.append(f"Paywall: {s['paywall']}.")
            if s.get("auth") and s["auth"] != "none":
                notes.append(f"Access: {s['auth']}.")
            if s.get("python_package"):
                notes.append(f"Python: `{s['python_package']}`.")
            if s.get("notes"):
                notes.append(s["notes"])
            lines.append(
                "| "
                + " | ".join(
                    [
                        name,
                        s["status"],
                        liveness_label(liveness.get(s["id"])),
                        RELIABILITY_LABEL[s["reliability"]],
                        f"{s['coverage_from']}–{s['coverage_to']}",
                        s["access"],
                        s["refresh_schedule"],
                        md_escape(s["license"]),
                        md_escape(" ".join(notes)),
                    ]
                )
                + " |"
            )
        lines.append("")
    return "\n".join(lines)


def generated_on(sources: list[dict], liveness: dict) -> str:
    """Date stamp of the generated files, derived from their inputs (the last liveness check, else the newest
    registry verification) rather than today's clock, so regenerating them on another day changes nothing and
    CI's "generated files must be committed" check stays meaningful."""
    checked = [str(v.get("checked_at") or "")[:10] for v in liveness.values() if v.get("checked_at")]
    if checked:
        return max(checked)
    return max((str(s.get("verified_on") or "") for s in sources), default=str(date.today())) or str(date.today())


def main() -> int:
    sources = load_registry()
    errors = validate(sources)
    if errors:
        print("Registry validation failed:", file=sys.stderr)
        for e in errors:
            print("  -", e, file=sys.stderr)
        return 1
    liveness = load_liveness()
    SOURCES_MD.write_text(render_markdown(sources, liveness), encoding="utf-8")
    SITE_JSON.parent.mkdir(parents=True, exist_ok=True)
    public = [{**{k: v for k, v in s.items() if not k.startswith("_")}, "liveness": liveness.get(s["id"])} for s in sources]
    SITE_JSON.write_text(
        json.dumps({"generated_on": generated_on(sources, liveness), "sources": public}, ensure_ascii=False, indent=1, default=str),
        encoding="utf-8",
    )
    print(f"{len(sources)} sources -> {SOURCES_MD.relative_to(ROOT)}, {SITE_JSON.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
