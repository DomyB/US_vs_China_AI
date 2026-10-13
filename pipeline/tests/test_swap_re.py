from __future__ import annotations

import re

from scm.quant.inputs import SWAP_RE


def test_swap_regex_keeps_swap_lines_and_leaves_debt_for_nature_swaps():
    swap = re.compile(SWAP_RE)
    assert swap.search("PBoC-BCRA currency swap drawdown")
    assert swap.search("Swap line renewed")
    assert swap.search("bilateral swap agreement")
    assert not swap.search("Blue Bonds for Marine Conservation: Debt for nature swap that is expected to ...")
    assert not swap.search("Debt-for-nature swap proposal in El Salvador")
    assert not swap.search("a debt swap for climate")
