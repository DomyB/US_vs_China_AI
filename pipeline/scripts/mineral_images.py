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
WIDTH = 900


def get(url: str, params: dict | None = None) -> dict:
    r = requests.get(url, params=params, headers={"User-Agent": UA, "Accept": "application/json"}, timeout=60)
    r.raise_for_status()
    return r.json()


def lead_file(article: str) -> str | None:
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

        return {"file": name, "image_url": ii.get("thumburl") or ii.get("url"), "page_url": ii.get("descriptionurl"), "author": val("Artist") or None,
                "license": val("LicenseShortName") or None, "license_url": val("LicenseUrl") or None, "credit": val("Credit") or None}
    return None


if __name__ == "__main__":
    ids = sys.argv[1:] or list(ARTICLES)
    out: dict[str, dict] = {}
    for mid in ids:
        article = ARTICLES.get(mid)
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
    print("# Lead pictures of the minerals' English Wikipedia articles with their Commons author and licence; looked up by scripts/mineral_images.py (read-only), committed by hand.")
    print(json.dumps(out, ensure_ascii=False, indent=1))
