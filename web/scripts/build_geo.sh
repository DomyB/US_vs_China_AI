#!/usr/bin/env bash
# Builds web/public/data/world.topo.json, the light world basemap behind the flow view.
#
# Source: Natural Earth 1:10m admin-0 map units (public domain), the same file that produced
# south-america.topo.json. The South American units are dropped here because that file already carries them
# (no double outlines); Antarctica and the open-ocean units are dropped; latitudes are clipped to -60..84;
# the geometry is simplified to 3% of its vertices (about the detail of the 1:110m set); properties are reduced
# to iso3 (the map-unit code, SU_A3) and name. Result: 269 units, about 150 KB.
#
# Usage: scripts/build_geo.sh [ne_10m_admin_0_map_units.zip]
#   Without an argument the zip is downloaded from naciscdn.org. Needs curl, unzip and pnpm (mapshaper runs via pnpm dlx).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../public/data/world.topo.json"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
zip="${1:-}"
if [[ -z "$zip" ]]; then
  zip="$tmp/ne_10m_admin_0_map_units.zip"
  curl -sSL -o "$zip" "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_map_units.zip"
fi
unzip -q -o "$zip" -d "$tmp/ne"
shp="$(ls "$tmp"/ne/*.shp | head -1)"
pnpm dlx mapshaper -i "$shp" \
  -filter 'CONTINENT != "Antarctica" && CONTINENT != "Seven seas (open ocean)" && CONTINENT != "South America"' \
  -clip bbox=-180,-60,180,84 \
  -simplify 3% keep-shapes \
  -filter-fields SU_A3,NAME_EN \
  -rename-fields iso3=SU_A3,name=NAME_EN \
  -o format=topojson quantization=10000 "$out"
echo "wrote $out ($(wc -c < "$out") bytes)"
