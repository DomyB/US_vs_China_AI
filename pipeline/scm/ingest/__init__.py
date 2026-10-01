"""Adapter registry: maps registry source ids to adapter classes."""
from __future__ import annotations

from .aei_cgit import CGIT
from .aiddata import AidData
from .base import Adapter
from .bgs import BGS
from .comtrade import Comtrade
from .dfc import DFC
from .dpi import DPI
from .exim import EXIM
from .federal_register import FederalRegister
from .pink_sheet import PinkSheet
from .resourcecontracts import ResourceContracts
from .tier2 import BUCODF, CensusTrade, CongressGov
from .unga import UNGA
from .usgs_mcs import USGSMCS
from .vdem import VDem
from .worldbank import IDS, WDI, WGI

TIER1: list[type[Adapter]] = [WDI, WGI, IDS, USGSMCS, PinkSheet, Comtrade, AidData, CGIT, DFC, EXIM, FederalRegister, ResourceContracts, VDem, UNGA, DPI, BGS]
TIER2: list[type[Adapter]] = [CongressGov, CensusTrade, BUCODF]
ANNUAL = {"usgs_mcs", "vdem", "unga_votes", "idb_dpi", "bgs_wms"}

ADAPTERS: dict[str, type[Adapter]] = {a.source_id: a for a in TIER1 + TIER2}
