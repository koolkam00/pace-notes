# Provenance of corrections.json (October 23, 2026)

These scripts sampled public terrain and surface models along each supplied route and wrote the correction registry
(`../corrections.json`, promoted from the research `profiles.json`, version `2026-10-23.1`). They are kept as a record
of how every anchor was made. They need network access, read and write the research workspace paths written into
them (`/tmp/claude-0/.../scratchpad/shape/research`, `/home/user/data/1050-full`), and are **never run in CI**: the
builder (`analysis/build_course_terrain.py`) only applies the anchors already in the registry.

| Script | Role |
|---|---|
| `osm_corridor.py` | OpenStreetMap API 0.6 `/map` downloads in small boxes along each route; lists highway ways tagged bridge, tunnel, covered or with a non-zero layer within 12 m of the route for at least half their length |
| `compact_osm.py` | Converts the cached OSM XML into compact highway-only JSON |
| `osm_sample.py` | Earlier Nominatim reverse-geocoding scan (1 request per second), superseded by the corridor scan |
| `run_rebuild.py`, `lib/rebuild.py` | Rebuild a course profile from a national terrain model every 25 m after snapping the route to the aligned OSM road centreline (5-sample running median, output every 50 m), with structure decks |
| `lib/samplers.py`, `lib/wcs.py`, `lib/geotiff.py`, `lib/cop.py` | Point and WCS samplers for each terrain or surface model |
| `lib/route.py`, `lib/snap.py`, `lib/bridges.py` | Route geometry, road snapping and structure projection |
| `corrections_nyc.py` | New York: NYC Planimetric Elevation Points projected onto the route (bridge and street spot elevations) |
| `build_profiles.py` | Assembles the registry: classification, structure audit, corrections and summaries |
| `apply_profile_corrections.py` | The research version of the correction step; the builder's `apply_one` is this code without the latitude and longitude interpolation |

## Datasets (retrieved October 23, 2026)

| Dataset | Used for | Licence |
|---|---|---|
| USGS 3DEP 1/3 arc-second DEM (NED 10 m), through the supplied course profiles (OpenTopoData `ned10m`) | New York, Boston, Chicago, Austin base profiles | Public domain |
| NYC Planimetric Database: Elevation Points (NYC Open Data `9uxf-ng6q`, NYC Office of Technology and Innovation; March 2022 imagery) | New York bridge decks, the Bay Ridge cut and the Central Park arches; check of the NED base profile (1,616 street spot elevations, median difference −0.01 m) | NYC Open Data Terms of Use |
| Environment Agency LIDAR Composite DTM 1 m and last-return DSM 1 m (WCS `environment.data.gov.uk/spatialdata`) | London rebuild and Tower Bridge deck | Open Government Licence v3.0 (contains Environment Agency information) |
| IGN España MDT05 (WCS `servicios.idee.es/wcs-inspire/mdt`) | Madrid, Valencia, Barcelona rebuilds | CC BY 4.0 (© Instituto Geográfico Nacional) |
| AHN4 0.5 m DTM and DSM, Rijkswaterstaat via PDOK (WCS `service.pdok.nl/rws/ahn/wcs/v1_0`) | Amsterdam, Eindhoven, Rotterdam rebuilds and the Erasmusbrug deck | CC0 1.0 |
| OpenStreetMap (API 0.6) | Structure locations and road snapping | ODbL 1.0 (© OpenStreetMap contributors) |
| Geobasis NRW DGM1 and bDOM; LINZ NZ 8 m DEM and Auckland LiDAR 1 m DSM; IGN RGE ALTI; Kartverket DTM 1 m; GSI DEM; CUZK DMR 5G and DMP 1G; GUGiK NMT and NMPT | Corrected profiles of Cologne, Auckland, Paris, Oslo, Tokyo, Prague and Warsaw, which stay at even pace | recorded per course in `../corrections.json` (`source`); not used by any terrain split |

Rejected: Copernicus GLO-30 DSM and SRTM 30 m both read 0 m on the Verrazzano-Narrows main span.

The raw samples (`research/osm/`, sampled points) are not committed. Publishing them as a public GitHub Release
asset `course-terrain-20261023` with SHA-256 checksums is an open, optional item.
