# Hand-supplied source files

Files placed here are picked up by adapters whose open endpoint is broken (see
`docs/PIPELINE.md`, "Hand-supplied files"). Each file must be redistributable; the
adapter records the registry URL and a note saying the file was supplied by hand.

| File | Adapter | Where to download | License |
|---|---|---|---|
| `exim_authorizations.csv` | `exim_authorizations` | catalog.data.gov, organization "Export-Import Bank of the United States", dataset "Authorizations from 10-01-2006 thru …" (latest) | US government work, public domain |
| `ury_asuntos.csv` or `ury_asuntos.json` | `ury_parlamento` | https://parlamento.gub.uy (Transparencia → Datos abiertos → Asuntos entrados; the site answers 403 to non-browser clients and is not reachable from abroad, so this needs someone inside Uruguay) | Open data (catalogodatos.gub.uy) |
| `statements/political_statements_minerals.csv` | `manual_statements` | Supplied by the project owner (see `statements/README.md` for provenance, method and limits) | project dataset; each record cites its own public source |
| `dpi2023.csv` or `dpi2023.xlsx` | `idb_dpi` | https://data.iadb.org/dataset/the-database-of-political-institutions-dpi-2023 (the site prepares the download after a browser click) | IDB open data (CC BY 3.0 IGO) |

Two of these the pipeline fetches itself when the portals cooperate (DECISIONS 64):

- EXIM: catalog.data.gov's API answered 404 and its pages are script-rendered, so `exim.py` falls back
  to the direct files the record pointed at when last seen (`https://img.exim.gov/s3fs-public/dataset/vbhv-d8am/data-gov_fy26-q2.csv`,
  then the FY25 Q4 file). When both have moved, download the latest "Authorizations from 10-01-2006
  thru …" CSV from the dataset page and save it here as `exim_authorizations.csv`.
- IDB DPI: data.iadb.org generates the file on demand and answered 202 "preparing" for over a minute;
  `dpi.py` now waits up to five minutes. When it still fails, open the dataset page in a browser,
  download the 2023 CSV and save it here as `dpi2023.csv`.

Do **not** place the AEI China Global Investment Tracker or the BU CODF file here: their
terms do not allow redistribution. Point `CGIT_FILE_URL` / `CODF_DOWNLOAD_URL` at a private
location instead.
