"""Lender–recipient network from the finance events: nodes are the funding institutions (banks, ministries,
agencies, companies) and the receiving agencies named in the records, edges the commitments between them
(weight = summed amount). Centralities are computed on the whole twelve-country graph so a lender active in
several countries shows its reach; communities come from greedy modularity. Contracts carry no company names
and cadastres exist for one country only, so ownership links are not part of this graph yet."""
from __future__ import annotations

import pandas as pd

MAX_NAME = 120


def _split(value) -> list[str]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return []
    return [p.strip()[:MAX_NAME] for p in str(value).split("|") if p.strip()]


def network(finance: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, int]:
    """(network_metric rows, network_edge rows, events without a named recipient)."""
    mcols = ["node_id", "node_type", "label", "origin", "country", "degree", "weighted_degree", "betweenness", "eigenvector", "community"]
    ecols = ["source_node", "target_node", "country", "weight_usd", "n_events", "source_ids"]
    if finance.empty:
        return pd.DataFrame(columns=mcols), pd.DataFrame(columns=ecols), 0
    import networkx as nx

    edges: dict[tuple[str, str, str], dict] = {}
    nodes: dict[str, dict] = {}
    unattributed = 0
    for r in finance.sort_values("event_id").itertuples(index=False):
        lenders = _split(r.actor_from) or ["unspecified lender"]
        recipients = _split(r.actor_to)
        if not recipients:
            unattributed += 1
            continue
        amount = float(r.amount_usd) if not pd.isna(r.amount_usd) else 0.0
        for lender in lenders:
            lid = f"lender:{lender}"
            nodes.setdefault(lid, {"node_id": lid, "node_type": "lender", "label": lender, "origin": r.origin, "country": None})
            for rec in recipients:
                rid = f"recipient:{r.country}:{rec}"
                nodes.setdefault(rid, {"node_id": rid, "node_type": "recipient", "label": rec, "origin": None, "country": r.country})
                e = edges.setdefault((lid, rid, r.country), {"weight_usd": 0.0, "n_events": 0, "sources": set()})
                e["weight_usd"] += amount / (len(lenders) * len(recipients))
                e["n_events"] += 1
                e["sources"].add(r.source_id)
    if not edges:
        return pd.DataFrame(columns=mcols), pd.DataFrame(columns=ecols), unattributed
    g = nx.Graph()
    for nid in sorted(nodes):
        g.add_node(nid)
    for (a, b, _), e in sorted(edges.items()):
        if g.has_edge(a, b):
            g[a][b]["weight"] += e["weight_usd"]
            g[a][b]["n"] += e["n_events"]
        else:
            g.add_edge(a, b, weight=e["weight_usd"], n=e["n_events"])
    degree = dict(g.degree())
    strength = dict(g.degree(weight="weight"))
    betweenness = nx.betweenness_centrality(g, normalized=True)
    # eigenvector centrality is defined on a connected graph: computed on the largest component, null elsewhere
    largest = max(nx.connected_components(g), key=len)
    sub = g.subgraph(largest)
    eigen: dict[str, float] = {}
    for weight in ("weight", None):
        try:
            eigen = nx.eigenvector_centrality(sub, max_iter=5000, tol=1e-6, weight=weight)
            break
        except (nx.PowerIterationFailedConvergence, nx.NetworkXException):
            continue
    community = {}
    for i, comm in enumerate(nx.community.greedy_modularity_communities(g, weight="weight")):
        for nid in comm:
            community[nid] = i
    metrics = pd.DataFrame([{**nodes[nid], "degree": int(degree[nid]), "weighted_degree": round(float(strength[nid]), 2), "betweenness": round(float(betweenness[nid]), 6),
                             "eigenvector": round(float(eigen[nid]), 6) if nid in eigen else None, "community": int(community.get(nid, -1))} for nid in sorted(nodes)])
    edge_rows = pd.DataFrame([{"source_node": a, "target_node": b, "country": c, "weight_usd": round(e["weight_usd"], 2), "n_events": int(e["n_events"]),
                               "source_ids": ",".join(sorted(e["sources"]))} for (a, b, c), e in sorted(edges.items())])
    return metrics[mcols], edge_rows[ecols], unattributed
