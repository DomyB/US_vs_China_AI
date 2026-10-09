"""Generate the Phase 1 SAMPLE dataset for the website.

Everything produced here is synthetic. Values come from a seeded random
generator and carry no information about the real world. Source links point
to the registry entry that will supply the real data in Phase 2, so the UI can
demonstrate provenance links, but every value is labelled "SAMPLE DATA".

Usage: python3 pipeline/scripts/make_sample_data.py
Writes: web/public/data/sample/*.json
"""

from __future__ import annotations

import json
import random
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "data" / "sample"
CONFIG = ROOT / "pipeline" / "config"
SEED = 20261001
YEARS = list(range(2008, 2027))
ACTORS = ["US", "CN"]
LABEL = "SAMPLE DATA"

COUNTRIES = [
    # iso3, name, lat, lon (approximate centroids for labels), eiti, note
    ("ARG", "Argentina", -36.5, -64.5, True, "Lithium Triangle; RIGI investment regime from 2024."),
    ("BOL", "Bolivia", -17.0, -64.5, False, "Lithium Triangle; YLB state lithium company."),
    ("BRA", "Brazil", -10.5, -53.0, False, "Niobium, rare earths, graphite, nickel, lithium."),
    ("CHL", "Chile", -29.5, -71.2, False, "Largest copper producer; second lithium producer."),
    ("COL", "Colombia", 4.0, -73.0, True, "Nickel, gold, copper exploration."),
    ("ECU", "Ecuador", -1.8, -78.2, True, "Copper (Mirador); gold."),
    ("GUY", "Guyana", 5.2, -59.6, True, "Bauxite, manganese, gold."),
    ("PRY", "Paraguay", -23.3, -58.4, False, "Recognises Taiwan; exploration-stage titanium, uranium, rare earths."),
    ("PER", "Peru", -9.5, -75.0, True, "Second copper producer; silver, tin, zinc; Chancay port."),
    ("SUR", "Suriname", 3.4, -56.0, True, "Gold (Zijin Rosebel, Newmont Merian); bauxite history."),
    ("URY", "Uruguay", -32.9, -55.9, False, "Minimal mining; China trade and Mercosur politics."),
    ("VEN", "Venezuela", 7.0, -66.0, False, "Arco Minero del Orinoco; official data scarce."),
]

# Illustrative list of real, publicly known projects with approximate coordinates.
# Attributes other than name, country and location are SAMPLE values.
PROJECTS = [
    ("Salar de Atacama (SQM / Albemarle)", "CHL", "lithium", "mine", -23.5, -68.3),
    ("Escondida", "CHL", "copper", "mine", -24.27, -69.07),
    ("Chuquicamata (Codelco)", "CHL", "copper", "mine", -22.3, -68.9),
    ("Cauchari-Olaroz (Ganfeng / Lithium Argentina)", "ARG", "lithium", "mine", -23.6, -66.7),
    ("Mariana (Ganfeng)", "ARG", "lithium", "mine", -25.0, -67.2),
    ("Tres Quebradas (Zijin)", "ARG", "lithium", "mine", -27.1, -68.6),
    ("Rincón (Rio Tinto)", "ARG", "lithium", "mine", -24.2, -67.1),
    ("Los Azules (McEwen Copper)", "ARG", "copper", "mine", -31.1, -70.2),
    ("Salar de Uyuni (YLB / CBC pilot)", "BOL", "lithium", "plant", -20.3, -67.5),
    ("Araxá niobium (CBMM)", "BRA", "niobium", "mine", -19.6, -46.9),
    ("Catalão niobium / phosphate (CMOC)", "BRA", "niobium", "mine", -18.2, -47.8),
    ("Grota do Cirilo lithium (Sigma)", "BRA", "lithium", "mine", -16.9, -41.6),
    ("Serra Verde rare earths", "BRA", "rare_earths", "mine", -14.3, -49.9),
    ("Las Bambas (MMG)", "PER", "copper", "mine", -14.1, -72.3),
    ("Toromocho (Chinalco)", "PER", "copper", "mine", -11.6, -76.1),
    ("Chancay port (COSCO)", "PER", "copper", "port", -11.57, -77.28),
    ("San Rafael tin (Minsur)", "PER", "tin", "mine", -14.2, -70.3),
    ("Mirador copper (EcuaCorriente)", "ECU", "copper", "mine", -3.6, -78.5),
    ("Cerro Matoso nickel", "COL", "nickel", "mine", 7.9, -75.6),
    ("Linden bauxite (Bosai)", "GUY", "bauxite_aluminum", "mine", 6.0, -58.3),
    ("Rosebel gold (Zijin)", "SUR", "gold", "mine", 5.1, -55.2),
    ("Las Cristinas / Arco Minero", "VEN", "gold", "mine", 6.3, -61.5),
    ("Alto Paraná titanium (exploration)", "PRY", "titanium", "mine", -25.4, -54.9),
    ("Huanuni tin (COMIBOL)", "BOL", "tin", "mine", -18.3, -66.8),
]

EVENT_TYPES = [
    "loan",
    "equity_stake",
    "offtake",
    "concession",
    "contract",
    "mou",
    "infrastructure",
    "export_control",
    "tariff",
]
CHAMBERS = {
    "ARG": ["Cámara de Diputados", "Senado"],
    "BOL": ["Cámara de Diputados", "Senado"],
    "BRA": ["Câmara dos Deputados", "Senado Federal"],
    "CHL": ["Cámara de Diputadas y Diputados", "Senado"],
    "COL": ["Cámara de Representantes", "Senado"],
    "ECU": ["Asamblea Nacional"],
    "GUY": ["National Assembly"],
    "PRY": ["Cámara de Diputados", "Senado"],
    "PER": ["Congreso de la República"],
    "SUR": ["De Nationale Assemblée"],
    "URY": ["Cámara de Representantes", "Senado"],
    "VEN": ["Asamblea Nacional (contested legitimacy)"],
}
LANG = {"BRA": "pt", "GUY": "en", "SUR": "nl"}
OUTLETS = {
    "ARG": ["La Nación", "Clarín", "Infobae", "Página/12", "El Cronista"],
    "BOL": ["El Deber", "Los Tiempos", "La Razón", "Opinión"],
    "BRA": ["Folha de S.Paulo", "Estadão", "O Globo", "Valor Econômico"],
    "CHL": ["La Tercera", "El Mercurio", "BioBioChile", "CIPER", "El Mostrador"],
    "COL": ["El Tiempo", "El Espectador", "Semana", "La Silla Vacía"],
    "ECU": ["El Universo", "El Comercio", "Primicias", "GK"],
    "GUY": ["Stabroek News", "Kaieteur News", "Guyana Chronicle"],
    "PRY": ["ABC Color", "Última Hora", "La Nación"],
    "PER": ["El Comercio", "La República", "Gestión", "OjoPúblico", "IDL-Reporteros"],
    "SUR": ["De Ware Tijd", "Starnieuws"],
    "URY": ["El País", "El Observador", "la diaria", "Búsqueda"],
    "VEN": ["Efecto Cocuyo", "El Pitazo", "Tal Cual", "Runrunes"],
}
SAMPLE_TITLES = {
    "es": [
        "Proyecto de ley sobre regalías del litio",
        "Debate sobre inversiones extranjeras en minería",
        "Moción sobre acuerdo de cooperación en minerales críticos",
        "Interpelación por concesiones mineras",
        "Informe de comisión sobre puertos y logística minera",
    ],
    "pt": [
        "Projeto de lei sobre minerais críticos e estratégicos",
        "Debate sobre investimento estrangeiro na mineração",
        "Requerimento sobre exportação de nióbio",
        "Audiência pública sobre terras raras",
    ],
    "en": [
        "Motion on mineral agreements and foreign investment",
        "Debate on bauxite concessions",
        "Committee report on mining royalties",
    ],
    "nl": [
        "Wetsvoorstel over mijnbouwconcessies",
        "Debat over buitenlandse investeringen in de goudsector",
        "Commissieverslag over bauxiet",
    ],
}
SAMPLE_HEADLINES = {
    "es": [
        "Empresa china amplía inversión en proyecto de litio",
        "EE.UU. ofrece financiamiento para minería",
        "Gobierno negocia contrato de cobre con consorcio extranjero",
        "Comunidades protestan por concesión minera",
        "Embajada anuncia acuerdo de cooperación en minerales",
    ],
    "pt": [
        "Empresa chinesa amplia participação em projeto de nióbio",
        "EUA oferecem financiamento para terras raras",
        "Governo discute política de minerais críticos",
    ],
    "en": [
        "Chinese firm expands bauxite operations",
        "US agency offers financing for mining project",
        "Government reviews mineral agreements",
    ],
    "nl": [
        "Chinees bedrijf breidt goudmijn uit",
        "VS biedt financiering voor mijnbouw",
        "Regering herziet mijnbouwovereenkomsten",
    ],
}
SOURCE_FOR = {
    "trade": "un_comtrade",
    "loan": "bu_codf",
    "equity_stake": "aei_cgit",
    "offtake": "sec_edgar",
    "concession": "resourcecontracts",
    "contract": "resourcecontracts",
    "mou": "state_msp_forge",
    "infrastructure": "aei_cgit",
    "export_control": "mofcom_export_controls",
    "tariff": "federal_register",
}


def load_registry() -> dict[str, dict]:
    reg: dict[str, dict] = {}
    for path in sorted((CONFIG / "sources").glob("*.yaml")):
        for s in (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("sources", []):
            reg[s["id"]] = s
    return reg


def src(reg: dict, sid: str) -> dict:
    s = reg[sid]
    return {"id": sid, "name": s["name"], "url": s["url"], "reliability": s["reliability"], "sample": True}


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def main() -> None:
    rng = random.Random(SEED)
    reg = load_registry()
    minerals = yaml.safe_load((CONFIG / "minerals.yaml").read_text(encoding="utf-8"))["minerals"]
    core = [m["id"] for m in minerals if m.get("core")]
    today = str(date.today())
    OUT.mkdir(parents=True, exist_ok=True)

    # Per-country latent trajectories: a smooth random walk per actor so the
    # animation over years shows plausible-looking movement.
    def walk(start: float, drift: float, vol: float) -> list[float]:
        vals, x = [], start
        for _ in YEARS:
            x = clamp(x + drift + rng.gauss(0, vol), 5, 95)
            vals.append(x)
        return vals

    latent: dict[str, dict[str, list[float]]] = {}
    for iso, *_ in COUNTRIES:
        latent[iso] = {
            "US": walk(rng.uniform(25, 60), rng.uniform(-1.0, 1.0), 4),
            "CN": walk(rng.uniform(15, 45), rng.uniform(0.0, 2.5), 5),
        }

    # ---------- meta
    meta = {
        "dataset": LABEL,
        "generated_on": today,
        "seed": SEED,
        "generator": "pipeline/scripts/make_sample_data.py",
        "years": YEARS,
        "actors": ACTORS,
        "minerals": [{"id": m["id"], "name": m["name"], "core": bool(m.get("core"))} for m in minerals],
        "countries": [
            {"iso3": iso, "name": name, "lat": lat, "lon": lon, "in_scope": True, "eiti_member": eiti, "note": note}
            for iso, name, lat, lon, eiti, note in COUNTRIES
        ]
        + [
            {
                "iso3": "GUF",
                "name": "French Guiana",
                "lat": 2.8,
                "lon": -53.1,
                "in_scope": False,
                "eiti_member": False,
                "note": "French overseas territory; shown on the map, outside the analysis.",
            },
            {
                "iso3": "FLK",
                "name": "Falkland Islands / Islas Malvinas",
                "lat": -51.7,
                "lon": -59.5,
                "in_scope": False,
                "eiti_member": False,
                "note": "Disputed territory; shown on the map, outside the analysis.",
            },
        ],
        "refresh_schedule": [
            {"layer": "News (media)", "cadence": "daily", "note": "RSS and Media Cloud; GDELT daily files"},
            {"layer": "Parliaments and gazettes", "cadence": "weekly"},
            {"layer": "Trade, finance, investment", "cadence": "monthly or when the source publishes"},
            {"layer": "Production, reserves, governance indices", "cadence": "annual"},
        ],
        "freshness": {
            "actions": {
                "last_updated": today,
                "source_ids": ["un_comtrade", "bu_codf", "aei_cgit"],
                "schedule": "monthly",
            },
            "parliament": {
                "last_updated": today,
                "source_ids": ["bra_camara_api", "chl_camara", "arg_hcdn"],
                "schedule": "weekly",
            },
            "media": {"last_updated": today, "source_ids": ["mediacloud", "gdelt"], "schedule": "daily"},
            "analysis": {"last_updated": today, "source_ids": [], "schedule": "with each data refresh"},
            "forecast": {"last_updated": today, "source_ids": [], "schedule": "quarterly"},
        },
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    # ---------- influence index (country x year x actor x mineral)
    index_rows = []
    for iso, *_ in COUNTRIES:
        for mineral in ["all", *core]:
            tilt = rng.uniform(-12, 12)  # mineral-specific offset
            for yi, year in enumerate(YEARS):
                for actor in ACTORS:
                    base = latent[iso][actor][yi] + (0 if mineral == "all" else tilt + rng.gauss(0, 3))
                    v = clamp(base, 0, 100)
                    width = rng.uniform(4, 10)
                    index_rows.append(
                        {
                            "iso3": iso,
                            "year": year,
                            "actor": actor,
                            "mineral": mineral,
                            "value": round(v, 1),
                            "lower": round(clamp(v - width, 0, 100), 1),
                            "upper": round(clamp(v + width, 0, 100), 1),
                        }
                    )
    (OUT / "index.json").write_text(
        json.dumps({"dataset": LABEL, "method": "SAMPLE random walk, not a real index", "rows": index_rows}),
        encoding="utf-8",
    )

    # ---------- per-country files (flows.json is accumulated from the same events and trade rows)
    flow_finance: dict[tuple[str, int, str], dict] = {}
    flow_trade: list[dict] = []
    for iso, name, _lat, _lon, eiti, note in COUNTRIES:
        lang = LANG.get(iso, "es")
        # Actions
        events = []
        for year in YEARS:
            for _ in range(rng.randint(1, 4)):
                etype = rng.choice(EVENT_TYPES)
                side = rng.choices(["CN", "US", "other"], weights=[5, 3, 2])[0]
                mineral = rng.choice(core)
                amount = (
                    None if etype in ("mou", "export_control", "tariff") else round(rng.lognormvariate(4.5, 1.1), 1)
                )
                events.append(
                    {
                        "id": f"{iso}-{year}-{len(events):03d}",
                        "date": f"{year}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}",
                        "year": year,
                        "type": etype,
                        "actor_side": side,
                        "actors": [
                            rng.choice(
                                [
                                    "Policy bank",
                                    "State-owned enterprise",
                                    "Listed company",
                                    "Development finance agency",
                                    "Ministry",
                                    "Embassy",
                                ]
                            )
                        ],
                        "mineral": mineral,
                        "amount_musd": amount,
                        "description": f"SAMPLE {etype.replace('_', ' ')} involving a {side} actor in {mineral.replace('_', ' ')} ({name}).",
                        "source": src(reg, SOURCE_FOR[etype]),
                        "confidence": rng.choice(["documented", "documented", "strongly_indicated"]),
                    }
                )
        trade = []
        for year in YEARS:
            for mineral in core:
                total = rng.lognormvariate(5, 1.2)
                cn_share = clamp(latent[iso]["CN"][YEARS.index(year)] / 100 * rng.uniform(0.5, 1.1), 0.02, 0.85)
                us_share = clamp(latent[iso]["US"][YEARS.index(year)] / 100 * rng.uniform(0.2, 0.7), 0.01, 0.6)
                if cn_share + us_share > 0.95:
                    us_share = 0.95 - cn_share
                trade.append(
                    {
                        "year": year,
                        "mineral": mineral,
                        "exports_musd": {
                            "CN": round(total * cn_share, 1),
                            "US": round(total * us_share, 1),
                            "ROW": round(total * (1 - cn_share - us_share), 1),
                        },
                        "value_type": "sample",
                        "source": src(reg, "un_comtrade"),
                    }
                )
        for e in events:
            if e["actor_side"] not in ("US", "CN"):
                continue
            k = (iso, e["year"], e["actor_side"])
            b = flow_finance.setdefault(k, {"iso3": iso, "year": e["year"], "origin": e["actor_side"], "amount_musd": 0.0, "n_events": 0, "n_with_amount": 0,
                                            "n_undocumented": 0, "undocumented_musd": 0.0, "n_swap": 0, "swap_musd": 0.0, "source_ids": set()})
            b["n_events"] += 1
            b["source_ids"].add(e["source"]["id"])
            if e["confidence"] != "documented":
                b["n_undocumented"] += 1
                b["undocumented_musd"] += e["amount_musd"] or 0.0
            elif e["amount_musd"] is not None:
                b["amount_musd"] += e["amount_musd"]
                b["n_with_amount"] += 1
        for year in YEARS:
            rows = [t for t in trade if t["year"] == year]
            for t in rows:
                flow_trade.append({"iso3": iso, "year": year, "mineral": t["mineral"], "exports_musd": dict(t["exports_musd"]), "source_id": "un_comtrade"})
            flow_trade.append({"iso3": iso, "year": year, "mineral": "all",
                               "exports_musd": {k: round(sum(t["exports_musd"][k] for t in rows), 1) for k in ("US", "CN", "ROW")}, "source_id": "un_comtrade"})
        # Parliament
        docs = []
        stance_series = []
        for year in YEARS:
            n = rng.randint(2, 9)
            s_us, s_cn = [], []
            for i in range(n):
                su = rng.choice([-2, -1, -1, 0, 0, 0, 1, 1, 2])
                sc = rng.choice([-2, -1, 0, 0, 0, 1, 1, 1, 2])
                s_us.append(su)
                s_cn.append(sc)
                docs.append(
                    {
                        "id": f"{iso}-P-{year}-{i}",
                        "date": f"{year}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}",
                        "chamber": rng.choice(CHAMBERS[iso]),
                        "type": rng.choice(["bill", "debate", "vote", "committee_report"]),
                        "title_original": rng.choice(SAMPLE_TITLES[lang]),
                        "language": lang,
                        "title_en": "SAMPLE English rendering of the title (machine translation placeholder)",
                        "stance_us": su,
                        "stance_cn": sc,
                        "topic_minerals": rng.sample(core, k=rng.randint(1, 2)),
                        "vote": None
                        if rng.random() < 0.6
                        else {"yes": rng.randint(20, 120), "no": rng.randint(5, 80), "abstain": rng.randint(0, 20)},
                        "url": "#sample-record",
                        "source": {
                            "id": "sample",
                            "name": "SAMPLE record (will link to the chamber's open-data entry)",
                            "url": "#sample",
                            "reliability": "official",
                            "sample": True,
                        },
                    }
                )
            stance_series.append(
                {
                    "year": year,
                    "stance_us_mean": round(sum(s_us) / n, 2),
                    "stance_cn_mean": round(sum(s_cn) / n, 2),
                    "n_docs": n,
                }
            )
        # Media
        volume = []
        articles = []
        narratives = []
        for year in YEARS:
            n_us = int(rng.lognormvariate(3.2, 0.6))
            n_cn = int(rng.lognormvariate(3.4, 0.6))
            volume.append(
                {
                    "year": year,
                    "articles_us": n_us,
                    "articles_cn": n_cn,
                    "total_articles": n_us + n_cn + int(rng.lognormvariate(7, 0.3)),
                    "tone_us": round(rng.gauss(0.05, 0.3), 2),
                    "tone_cn": round(rng.gauss(-0.05, 0.3), 2),
                }
            )
            labels = [
                "investment and jobs",
                "sovereignty and nationalisation",
                "environment and water",
                "geopolitics / great-power rivalry",
                "corruption and transparency",
            ]
            shares = [rng.random() for _ in labels]
            tot = sum(shares)
            for lab, sh in zip(labels, shares, strict=True):
                narratives.append({"year": year, "label": lab, "share": round(sh / tot, 3)})
            for i in range(rng.randint(2, 5)):
                articles.append(
                    {
                        "id": f"{iso}-M-{year}-{i}",
                        "date": f"{year}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}",
                        "outlet": rng.choice(OUTLETS[iso]),
                        "headline_original": rng.choice(SAMPLE_HEADLINES[lang]),
                        "language": lang,
                        "headline_en": "SAMPLE English rendering of the headline",
                        "url": "#sample-article",
                        "stance_us": rng.choice([-1, 0, 0, 1]),
                        "stance_cn": rng.choice([-1, -1, 0, 1]),
                        "tone": round(rng.gauss(0, 0.4), 2),
                        "topic_minerals": rng.sample(core, k=1),
                    }
                )
        # Analysis
        components = []
        comp_names = [
            "trade_share",
            "finance_flows",
            "investment_stock",
            "diplomatic_agreements",
            "parliament_stance",
            "media_stance",
        ]
        for yi, year in enumerate(YEARS):
            for actor in ACTORS:
                weights = [0.25, 0.2, 0.2, 0.15, 0.1, 0.1]
                vals = [clamp(latent[iso][actor][yi] + rng.gauss(0, 12), 0, 100) for _ in comp_names]
                components.append(
                    {
                        "year": year,
                        "actor": actor,
                        "components": [
                            {"name": c, "normalized_value": round(v, 1), "weight": w}
                            for c, v, w in zip(comp_names, vals, weights, strict=True)
                        ],
                    }
                )
        say_do = []
        for yi, year in enumerate(YEARS):
            for actor in ACTORS:
                rhet = round(rng.gauss(0, 0.8), 2)
                act = round((latent[iso][actor][yi] - 50) / 50, 2)
                say_do.append(
                    {"year": year, "actor": actor, "rhetoric": rhet, "action": act, "gap": round(rhet - act, 2)}
                )
        flags = []
        for i in range(rng.randint(2, 5)):
            lvl = rng.choice(["documented", "strongly_indicated", "speculative"])
            flags.append(
                {
                    "id": f"{iso}-F-{i}",
                    "year": rng.choice(YEARS[8:]),
                    "type": rng.choice(
                        [
                            "third_country_subsidiary",
                            "mirror_data_discrepancy",
                            "sudden_trade_shift",
                            "low_media_coverage_large_flow",
                            "dual_use_infrastructure",
                        ]
                    ),
                    "evidence_level": lvl,
                    "description": f"SAMPLE flag ({lvl.replace('_', ' ')}): an anomaly-detection placeholder for {name}.",
                    "evidence": [src(reg, rng.choice(["un_comtrade", "icij_offshore_leaks", "aei_cgit", "sec_edgar"]))],
                }
            )
        key_events = [
            {"year": y, "title": f"SAMPLE key event in {y}", "actor": rng.choice(ACTORS)} for y in rng.sample(YEARS, 5)
        ]
        # Forecast
        forecast = []
        for actor in ACTORS:
            last = latent[iso][actor][-1]
            for h, year in enumerate(range(2026, 2031)):
                pt = clamp(last + h * rng.uniform(-2, 3), 0, 100)
                w = 4 + 3 * h
                forecast.append(
                    {
                        "target": "influence_index",
                        "actor": actor,
                        "year": year,
                        "point": round(pt, 1),
                        "p05": round(clamp(pt - 1.6 * w, 0, 100), 1),
                        "p25": round(clamp(pt - 0.7 * w, 0, 100), 1),
                        "p75": round(clamp(pt + 0.7 * w, 0, 100), 1),
                        "p95": round(clamp(pt + 1.6 * w, 0, 100), 1),
                        "model": "SAMPLE (no model fitted)",
                    }
                )
        scenarios = [
            {
                "id": "baseline",
                "name": "Baseline",
                "assumptions": "Current policies continue; prices follow futures curves.",
                "description": "SAMPLE scenario text.",
            },
            {
                "id": "gov_change",
                "name": "Change of government",
                "assumptions": "Election produces a government with a different alignment.",
                "description": "SAMPLE scenario text.",
            },
            {
                "id": "price_shock",
                "name": "Lithium and copper price shock",
                "assumptions": "Prices fall 40% for two years.",
                "description": "SAMPLE scenario text.",
            },
            {
                "id": "us_policy",
                "name": "US tariff and sourcing-rule change",
                "assumptions": "IRA-style sourcing rules tightened or removed.",
                "description": "SAMPLE scenario text.",
            },
            {
                "id": "cn_controls",
                "name": "Chinese export controls widen",
                "assumptions": "Controls extend to processing technology.",
                "description": "SAMPLE scenario text.",
            },
            {
                "id": "nationalisation",
                "name": "Resource nationalisation",
                "assumptions": "State takes majority control of lithium or copper.",
                "description": "SAMPLE scenario text.",
            },
        ]
        country = {
            "dataset": LABEL,
            "iso3": iso,
            "name": name,
            "note": note,
            "eiti_member": eiti,
            "language": lang,
            "freshness": meta["freshness"],
            "actions": {"events": events, "trade": trade},
            "parliament": {"documents": docs, "stance_series": stance_series},
            "media": {"volume": volume, "narratives": narratives, "articles": articles},
            "analysis": {"components": components, "say_do_gap": say_do, "flags": flags, "key_events": key_events},
            "forecast": {"series": forecast, "scenarios": scenarios},
        }
        (OUT / "country").mkdir(exist_ok=True)
        (OUT / "country" / f"{iso}.json").write_text(json.dumps(country, ensure_ascii=False), encoding="utf-8")

    # ---------- flows (what the map draws as arcs)
    flows = {
        "dataset": LABEL,
        "generated_on": today,
        "meta": {"last_year": {"finance_CN": YEARS[-1], "finance_US": YEARS[-1], "trade": YEARS[-1]}, "note": "SAMPLE totals accumulated from the sample events and trade rows."},
        "finance": [
            {**b, "amount_musd": round(b["amount_musd"], 2), "undocumented_musd": round(b["undocumented_musd"], 2), "source_ids": sorted(b["source_ids"])}
            for b in sorted(flow_finance.values(), key=lambda x: (x["iso3"], x["year"], x["origin"]))
        ],
        "trade": sorted(flow_trade, key=lambda r: (r["iso3"], r["year"], r["mineral"])),
    }
    (OUT / "flows.json").write_text(json.dumps(flows, ensure_ascii=False), encoding="utf-8")

    # ---------- region
    projects = []
    for i, (pname, iso, mineral, ptype, plat, plon) in enumerate(PROJECTS):
        projects.append(
            {
                "id": f"P{i:02d}",
                "name": pname,
                "iso3": iso,
                "mineral": mineral,
                "type": ptype,
                "lat": plat,
                "lon": plon,
                "operator_origin": rng.choice(["CN", "US", "other"]),
                "stage": rng.choice(["production", "development", "exploration"]),
                "start_year": rng.randint(2005, 2025),
                "note": "Real project name and approximate location; operator origin, stage and year are SAMPLE values.",
            }
        )
    mineral_shares = []
    for year in YEARS:
        for mineral in core:
            cn = rng.uniform(0.1, 0.7)
            us = rng.uniform(0.02, min(0.5, 0.95 - cn))
            mineral_shares.append(
                {
                    "year": year,
                    "mineral": mineral,
                    "share_cn": round(cn, 3),
                    "share_us": round(us, 3),
                    "share_other": round(1 - cn - us, 3),
                }
            )
    region = {"dataset": LABEL, "projects": projects, "mineral_shares": mineral_shares}
    (OUT / "region.json").write_text(json.dumps(region, ensure_ascii=False), encoding="utf-8")
    print(
        f"wrote sample data to {OUT.relative_to(ROOT)} ({len(index_rows)} index rows, {len(COUNTRIES)} country files)"
    )


if __name__ == "__main__":
    main()
