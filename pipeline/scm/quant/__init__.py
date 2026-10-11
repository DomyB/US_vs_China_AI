"""Phase 4 quantitative analysis, computed from the fact tables and stored apart from them
(docs/PHASE0_PLAN.md section 4.4): concentration measures, the composite influence index with its
sensitivity band, the say–do gap, rule-based anomaly flags and the lender–recipient finance network.

Everything here is plain numpy/pandas (plus networkx for the graph metrics), runs in seconds on the
committed warehouse, and writes one Parquet slot per table that every run replaces. Rows carry the
method version, the run id and the data release they were computed from; nothing is imputed, and a
missing input leaves a component unavailable with the reason recorded.

Method 2026.10.2 (index.py): normalisation bounds come from the mineral "all" rows per component and apply to every
row; a composite is held back (null, components kept) in a year where a component it rested on the year before is
missing only because its source's release lags; the US finance component names the DFC and EXIM."""
from __future__ import annotations

METHOD_VERSION = "2026.10.2"
WEIGHTS_VERSION = "2026.10.eq"  # equal weights over the available components

__all__ = ["METHOD_VERSION", "WEIGHTS_VERSION"]
