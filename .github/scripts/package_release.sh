#!/usr/bin/env bash
# Package the warehouse (and trained text models, when present) as a per-run data release.
# Tags are never reused, so a bad run can never overwrite a good release; the restore script picks the newest usable one.
set -euo pipefail
tag="data-v$(date -u +%Y.%m.%d).${GITHUB_RUN_NUMBER}"
dirs="warehouse"
[ -d data/models ] && dirs="$dirs models"
tar czf "warehouse-$tag.tar.gz" -C data $dirs
ls -la "warehouse-$tag.tar.gz"
echo "TAG=$tag" >> "$GITHUB_ENV"
