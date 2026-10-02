# Hand-supplied source files

Files placed here are picked up by adapters whose open endpoint is broken (see
`docs/PIPELINE.md`, "Hand-supplied files"). Each file must be redistributable; the
adapter records the registry URL and a note saying the file was supplied by hand.

| File | Adapter | Where to download | License |
|---|---|---|---|
| `exim_authorizations.csv` | `exim_authorizations` | catalog.data.gov, organization "Export-Import Bank of the United States", dataset "Authorizations from 10-01-2006 thru …" (latest) | US government work, public domain |
| `ury_asuntos.csv` or `ury_asuntos.json` | `ury_parlamento` | https://parlamento.gub.uy (Transparencia → Datos abiertos → Asuntos entrados; the site answers 403 to non-browser clients) | Open data (catalogodatos.gub.uy) |
| `dpi2023.csv` or `dpi2023.xlsx` | `idb_dpi` | https://data.iadb.org/dataset/the-database-of-political-institutions-dpi-2023 (the site prepares the download after a browser click) | IDB open data (CC BY 3.0 IGO) |

Do **not** place the AEI China Global Investment Tracker or the BU CODF file here: their
terms do not allow redistribution. Point `CGIT_FILE_URL` / `CODF_DOWNLOAD_URL` at a private
location instead.
