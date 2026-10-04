#!/usr/bin/env bash
# Restore the Parquet warehouse from the newest usable data release.
# Usable = tag data-v*, with a warehouse-*.tar.gz asset of at least MIN_BYTES (a real warehouse is megabytes;
# an empty one is a few KB). Any API error fails the job: a silent empty warehouse once overwrote a good
# release (2026-10-03). Releases carrying an empty asset are deleted so they can never be restored.
set -euo pipefail
MIN_BYTES="${MIN_BYTES:-100000}"
releases=$(gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=50")
tag=$(jq -r --argjson min "$MIN_BYTES" '[.[] | select(.tag_name | startswith("data-v")) | select(any(.assets[]; (.name | startswith("warehouse-")) and .size >= $min))] | sort_by(.published_at) | reverse | .[0].tag_name // empty' <<<"$releases")
broken=$(jq -r --argjson min "$MIN_BYTES" '.[] | select(.tag_name | startswith("data-v")) | select(all(.assets[]; (.name | startswith("warehouse-")) and .size < $min)) | .tag_name' <<<"$releases")
for b in $broken; do
  echo "::warning::release $b carries an empty warehouse asset; deleting it"
  gh release delete "$b" --yes --cleanup-tag || echo "::warning::could not delete $b"
done
if [ -z "$tag" ]; then
  if [ "${ALLOW_EMPTY_WAREHOUSE:-false}" = "true" ]; then
    echo "no usable data release; starting from an empty warehouse (allow_empty_warehouse)"
    mkdir -p data/warehouse
    exit 0
  fi
  echo "::error::no usable data release found (set allow_empty_warehouse to start from scratch)"
  exit 1
fi
rm -rf /tmp/prev && mkdir -p /tmp/prev data
gh release download "$tag" --pattern 'warehouse-*.tar.gz' --dir /tmp/prev
tar xzf /tmp/prev/warehouse-*.tar.gz -C data
echo "restored $tag"
ls data/warehouse
(cd pipeline && python -m scm stats --write /tmp/restored.json >/dev/null)
for t in document trade_flow; do
  jq -e --arg t "$t" 'has($t)' /tmp/restored.json >/dev/null || { echo "::error::restored warehouse has no $t table"; exit 1; }
done
echo "RESTORED_TAG=$tag" >> "$GITHUB_ENV"
