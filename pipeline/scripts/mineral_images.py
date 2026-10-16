"""A read-only lookup for the Actions runner: for each tracked mineral, the lead picture of its English Wikipedia
article and that picture's author and licence from Wikimedia Commons, printed as YAML for `config/mineral_images.yaml`.
The sandbox that writes the site cannot reach Wikimedia, so the runner does the lookup and the owner's session commits
the YAML after reading the file names in the job log (a lead picture can be a chart or a map; the override map below
names a better file where one was chosen). Writes nothing; two requests per mineral, one at a time, with a named
user agent as the Wikimedia API etiquette asks."""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse

import requests

UA = "scm-probe/0.1 (+https://github.com/DomyB/US_vs_China_AI; research project, read-only lookup)"
# mineral id -> English Wikipedia article whose lead picture is used; an explicit "File:" name overrides the lead picture
ARTICLES: dict[str, str] = {
    "lithium": "Lithium", "copper": "Copper", "rare_earths": "Rare-earth element", "niobium": "Niobium", "graphite": "Graphite", "nickel": "Nickel", "tin": "Tin",
    "silver": "Silver", "molybdenum": "Molybdenum", "cobalt": "Cobalt", "manganese": "Manganese", "bauxite_aluminum": "Bauxite", "uranium": "Uranium", "tungsten": "Tungsten",
    "zinc": "Zinc", "gold": "Gold", "phosphate_potash": "Phosphorite", "iron_ore": "Iron ore", "titanium": "Titanium", "gallium_germanium_antimony": "Gallium",
}
OVERRIDES: dict[str, str] = {}
# place and theme pictures for the site's pages (country case files, chapter openers, page headers): the lead picture of the
# article named; a country without a mine article gets a landscape. Looked up with `--places`, written to web/public/data/pictures.json.
PLACES: dict[str, str] = {
    "ARG": "Salar de Arizaro", "BOL": "Salar de Uyuni", "BRA": "Carajás Mine", "CHL": "Chuquicamata", "COL": "Cerrejón",
    "ECU": "Cotopaxi", "GUY": "Kaieteur Falls", "PRY": "Itaipu Dam", "PER": "Antamina mine", "SUR": "Rosebel gold mine",
    "URY": "Port of Montevideo", "VEN": "Angel Falls", "MEX": "Cananea", "GTM": "Lake Izabal", "BLZ": "Belize Barrier Reef",
    "HND": "Lake Yojoa", "SLV": "San Salvador", "NIC": "Momotombo", "CRI": "Arenal Volcano",
    "port": "Port of Callao", "votes": "United Nations General Assembly", "smelter": "Smelting", "copper_mine": "Chuquicamata",
    "lithium_field": "Salar de Atacama", "iron": "Carajás Mine", "ship": "Bulk carrier", "container": "Port of Santos",
    "bri": "Belt and Road Initiative", "congress": "United States Capitol", "beijing": "Great Hall of the People", "washington": "Washington, D.C.",
    "andes": "Andes", "amazon": "Amazon rainforest", "refinery": "Copper extraction", "battery": "Lithium-ion battery",
    # second batch: Panama, the legislatures (the Politics tab), the palaces and the uses of the minerals (the arguments and the minerals index)
    "PAN": "Panama City", "PAN_locks": "Miraflores (Panama)",
    "leg_ARG": "Palace of the Argentine National Congress", "leg_BOL": "Plurinational Legislative Assembly", "leg_BRA": "National Congress of Brazil",
    "leg_CHL": "National Congress of Chile", "leg_COL": "Capitolio Nacional", "leg_ECU": "National Assembly (Ecuador)", "leg_GUY": "Parliament Building (Guyana)",
    "leg_PRY": "Congress of Paraguay", "leg_PER": "Legislative Palace (Peru)", "leg_SUR": "National Assembly (Suriname)", "leg_URY": "Legislative Palace (Uruguay)",
    "leg_VEN": "Federal Legislative Palace", "leg_MEX": "Legislative Palace of San Lázaro", "leg_GTM": "Congress of Guatemala", "leg_BLZ": "Belmopan",
    "leg_HND": "National Congress of Honduras", "leg_SLV": "Legislative Assembly of El Salvador", "leg_NIC": "National Assembly (Nicaragua)",
    "leg_CRI": "Legislative Assembly of Costa Rica", "leg_PAN": "National Assembly (Panama)",
    "casa_rosada": "Casa Rosada", "moneda": "Palacio de La Moneda", "planalto": "Palácio do Planalto", "zhongnanhai": "Zhongnanhai", "white_house": "White House",
    "wall_street": "Wall Street", "haul_truck": "Haul truck", "open_pit": "Open-pit mining", "ev": "Electric vehicle", "solar": "Solar panel", "phone": "Smartphone",
    "chip": "Semiconductor", "container_ship": "Container ship", "oas": "Organization of American States", "shanghai_port": "Port of Shanghai",
    "long_beach": "Port of Long Beach", "exim": "Export–Import Bank of the United States", "cdb": "China Development Bank", "lithium_triangle": "Lithium Triangle",
    "santiago": "Santiago", "lima": "Lima", "bogota": "Bogotá", "mexico_city": "Mexico City", "brasilia": "Brasília", "buenos_aires": "Buenos Aires", "la_paz": "La Paz",
}
WIDTH = 900


def get(url: str, params: dict | None = None) -> dict:
    r = requests.get(url, params=params, headers={"User-Agent": UA, "Accept": "application/json"}, timeout=60)
    r.raise_for_status()
    return r.json()


def lead_file(article: str) -> str | None:
    """The article's page image by file name (the pageimages API), else the file behind the summary's picture."""
    q = get("https://en.wikipedia.org/w/api.php", {"action": "query", "titles": article, "prop": "pageimages", "piprop": "name", "format": "json", "redirects": 1})
    for p in ((q.get("query") or {}).get("pages") or {}).values():
        if p.get("pageimage"):
            return p["pageimage"].replace(" ", "_")
    s = get(f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(article.replace(' ', '_'))}")
    src = (s.get("originalimage") or {}).get("source") or (s.get("thumbnail") or {}).get("source")
    if not src:
        return None
    m = re.search(r"/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/]+?)(?:/\d+px-[^/]+)?$", src)
    return urllib.parse.unquote(m.group(1)) if m else None


def file_info(name: str) -> dict | None:
    q = get("https://commons.wikimedia.org/w/api.php", {"action": "query", "titles": f"File:{name}", "prop": "imageinfo", "iiprop": "extmetadata|url", "iiurlwidth": WIDTH, "format": "json"})
    pages = (q.get("query") or {}).get("pages") or {}
    for p in pages.values():
        ii = (p.get("imageinfo") or [None])[0]
        if not ii:
            continue
        ext = ii.get("extmetadata") or {}

        def val(k: str, ext: dict = ext) -> str:
            return re.sub(r"<[^>]+>", "", (ext.get(k) or {}).get("value") or "").strip()

        return {"file": name, "image_url": (ii.get("thumburl") or ii.get("url") or "").split("?")[0] or None, "page_url": ii.get("descriptionurl"), "author": val("Artist") or None,
                "license": val("LicenseShortName") or None, "license_url": val("LicenseUrl") or None, "credit": val("Credit") or None}
    return None


if __name__ == "__main__":
    places = "--places" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--places"]
    table = PLACES if places else ARTICLES
    ids = args or list(table)
    out: dict[str, dict] = {}
    for mid in ids:
        article = table.get(mid)
        try:
            name = OVERRIDES.get(mid) or (lead_file(article) if article else None)
            info = file_info(name) if name else None
            if info:
                out[mid] = {"article": article, **info}
                print(f"{mid}: {name} · {info['license']} · {info['author']}", file=sys.stderr)
            else:
                print(f"{mid}: no lead picture", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 - a lookup reports every failure the same way
            print(f"{mid}: error {type(e).__name__}: {e}", file=sys.stderr)
        time.sleep(1)
    if places:
        print("# PICTURES_JSON_BEGIN")
        print(json.dumps({"generated_on": time.strftime("%Y-%m-%d"), "note": "Lead pictures of the English Wikipedia articles named in scripts/mineral_images.py PLACES, with the Commons author and licence; illustrations, not records: nothing on the site is read from them.", "pictures": out}, ensure_ascii=False, indent=1))
        print("# PICTURES_JSON_END")
    else:
        print("# Lead pictures of the minerals' English Wikipedia articles with their Commons author and licence; looked up by scripts/mineral_images.py (read-only), committed by hand.")
        print(json.dumps(out, ensure_ascii=False, indent=1))
