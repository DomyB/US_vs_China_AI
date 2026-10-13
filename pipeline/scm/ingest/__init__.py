"""Adapter registry: maps registry source ids to adapter classes."""
from __future__ import annotations

from .aei_cgit import CGIT
from .aiddata import AidData
from .baci import BACI
from .base import Adapter
from .bgs import BGS
from .comtrade import Comtrade
from .dfc import DFC
from .dpi import DPI
from .exim import EXIM
from .federal_register import FederalRegister
from .gdelt import GDELTDoc
from .imf_dip import IMFDIP
from .legis_arg import HCDN
from .legis_bra import CamaraBR, SenadoBR
from .legis_chl import CamaraCL, SenadoCL
from .legis_col import CamaraCO
from .legis_misc import SPLEY, AsambleaEC, SILpy
from .legis_ury import ParlamentoUY
from .mediacloud import MediaCloud
from .national_chl import Cochilco
from .national_col import ANMAnna
from .national_ecu import ECUCadastre
from .national_guy import GGMC
from .national_per import BCRP
from .pink_sheet import PinkSheet
from .press import make_rss_adapters
from .resourcecontracts import ResourceContracts
from .statements import Statements
from .tier2 import BUCODF, CensusTrade, CongressGov
from .unga import UNGA
from .usgs_mcs import USGSMCS
from .vdem import VDem
from .worldbank import IDS, WDI, WGI

TIER1: list[type[Adapter]] = [WDI, WGI, IDS, IMFDIP, USGSMCS, PinkSheet, Comtrade, AidData, CGIT, DFC, EXIM, FederalRegister, ResourceContracts, VDem, UNGA, DPI, BGS, Statements]
TIER2: list[type[Adapter]] = [CongressGov, CensusTrade, BUCODF]
# Phase 2b national groups
LEGISLATURE: list[type[Adapter]] = [CamaraBR, SenadoBR, CamaraCL, SenadoCL, HCDN, ParlamentoUY, CamaraCO, SILpy, AsambleaEC, SPLEY]
PRESS: list[type[Adapter]] = [*make_rss_adapters(), GDELTDoc, MediaCloud]  # one class per registry press outlet with access: rss, plus GDELT and Media Cloud history
NATIONAL: list[type[Adapter]] = [GGMC, ANMAnna, ECUCadastre, Cochilco, BCRP]
ANNUAL = {"usgs_mcs", "vdem", "unga_votes", "idb_dpi", "bgs_wms", "guy_ggmc", "chl_cochilco"}

GROUPS: dict[str, list[type[Adapter]]] = {"tier1": TIER1, "tier2": TIER2, "legislature": LEGISLATURE, "press": PRESS, "national": NATIONAL}
# heavy, annual, run by id only (a 2.3 GB download): never part of a group
HEAVY: list[type[Adapter]] = [BACI]
ADAPTERS: dict[str, type[Adapter]] = {a.source_id: a for a in TIER1 + TIER2 + LEGISLATURE + PRESS + NATIONAL + HEAVY}
