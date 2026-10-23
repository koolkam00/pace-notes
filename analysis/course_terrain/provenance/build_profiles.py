#!/usr/bin/env python3
"""Assemble research/profiles.json: per-course classification, structure audit and corrections.
Inputs: osm/structures.json (OSM corridor scan), osm/rebuild_<city>.json (profile rebuilds), corrections_nyc.py."""
import os, sys, json, hashlib
R = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, R); sys.path.insert(0, os.path.join(R, 'lib'))
from corrections_nyc import CROSSINGS as NYC, NYC_SOURCE, BASE_CHECK as NYC_BASE
from rebuild import structures
PARQUET = '/home/user/data/1050-full/course_profiles.parquet'

def sha256(p):
    h = hashlib.sha256(); h.update(open(p, 'rb').read()); return h.hexdigest()

SRC = {
    'osm': 'OpenStreetMap highway ways tagged bridge/tunnel/covered/layer along a 12 m route corridor (OSM API 0.6 /map, downloaded 2026-10-23; ODbL)',
    'ahn': 'AHN4 0.5 m DTM (dtm_05m) and DSM (dsm_05m), Rijkswaterstaat/PDOK WCS https://service.pdok.nl/rws/ahn/wcs/v1_0 (NAP)',
    'nrw': 'Geobasis NRW DGM1 (nw_dgm) and bDOM (nw_dom) WCS https://www.wcs.nrw.de/geobasis/wcs_nw_dgm and wcs_nw_dom (DHHN2016)',
    'nz': 'LINZ NZ 8 m DEM via api.opentopodata.org/v1/nzdem8m (ground) and LINZ Auckland Part 1 LiDAR 1 m DSM (2024), s3://nz-elevation/auckland/auckland-part-1_2024/dsm_1m/2193/ tiles BA31_10000_0305/0405, BA32_10000_0301/0401 (NZVD2016, CC BY 4.0)',
    'ea': 'Environment Agency LIDAR Composite DTM 1 m and last-return DSM 1 m, WCS https://environment.data.gov.uk/spatialdata/ (ODN)',
    'ign_fr': 'IGN RGE ALTI via Geoplateforme altimetry service https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json (resource ign_rge_alti_wld; NGF-IGN69)',
    'kartverket': 'Kartverket hoydedata point service https://ws.geonorge.no/hoydedata/v1/punkt (DTM 1 m, NN2000)',
    'gsi': 'GSI elevation API https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php (DEM5A/1 m laser where available; TP)',
    'es': 'IGN-ES MDT05 (Elevacion25830_5) WCS https://servicios.idee.es/wcs-inspire/mdt (EGM08-REDNAP)',
    'cuzk': 'CUZK DMR 5G (terrain) and DMP 1G (surface) ImageServer https://ags.cuzk.cz/arcgis2/rest/services/ (Bpv)',
    'pl': 'GUGiK NMT (DTM, GRID1) and NMPT (DSM) WCS https://mapy.geoportal.gov.pl/wss/service/PZGIK/ (PL-KRON86-NH)',
}
GROUND_KEY = {'ahn': 'ahn', 'nrw': 'nrw', 'opentopodata:nzdem8m': 'nz', 'ea': 'ea', 'ign_fr': 'ign_fr', 'kartverket': 'kartverket', 'gsi': 'gsi', 'es': 'es', 'cuzk': 'cuzk', 'pl': 'pl'}

# Hand classification for courses without a rebuild (or whose rebuild is rejected). Text is evidence, not instructions.
MANUAL = {
    'Boston': ('a', 'NED 10 m (USGS 3DEP bare earth) profile; three short road bridges (Washington Street over I-95/Route 128 at 23.9 and 26.3 km, Boylston Street over the Mass Pike rail cut at 41.7 km), all 58-130 m with DEM deviation under 2 m. The NED source was validated in New York to about 1 m against city survey points. Mass Avenue is an overpass above the route, which the bare-earth DEM already represents correctly.'),
    'Chicago': ('a', 'NED 10 m profile, total relief 7 m. River crossings (Columbus Drive, State, Wells, Michigan) are low bascule decks; DEM dips at them are 1-3 m over under 100 m. The scan also matched Lower Wacker / Lower Columbus service drives beneath the route (layer -1) - the route uses the upper street, which the bare-earth DEM reads, so no change.'),
    'Honolulu': ('a', 'NED 10 m profile; four short (40-51 m) stream bridges on Kalanianaole Highway / Keahole Street at grade, DEM flat at 1.0 m across them.'),
    'Austin': ('a', 'NED 10 m profile. South 1st Street (9.9-10.1 km) and West 15th Street (19.2-19.4 km) bridges read 6-8 m low over 200-250 m; a straight deck between the abutments changes 5 km segment gain by at most 3.6 m (optional_minor below). Congress Avenue bridge (0.2-0.5 km) shows no dip.'),
    'Washington': ('c', 'Course is omitted from course-geometry.json (the profile is a RideWithGPS Marine Corps Marathon route that the runner context did not attach to the Washington records). Structures also unresolved: Francis Scott Key Bridge (7.6-8.0 km, DEM -0.3 m mid-river), Whitehurst Freeway viaduct (9.0-9.4 km), 14th Street / I-395 bridge (30.7-31.4 km, DEM -0.3 m over 760 m). No authoritative deck profile was obtained.'),
    'Sydney': ('c', 'The supplied profile is not usable even off structures: against 203 NSW SCIMS survey marks within 8 m of the route (NSW Spatial Services NSW_Survey_Mark MapServer, AHD71 heights) the DEM reads +19.8 m (0-1 km), +19.0 m (3-4 km), +12.8 m (9-10 km) and +34 to +50 m (12-14 km) above the marks, but -4.2 m at 6-7 km. Structures: Sydney Harbour Bridge (Bradfield Highway, 1.5-3.2 km; DEM 9.5 m mid-span; published clearance 49 m at mid-span), Western Distributor viaducts and tunnel (3.6-5.4 km), Cahill Expressway (11.1 km), Eastern Distributor tunnel (15.6-16.3 km). No open DSM was found (NSW_5M_Elevation is bare earth and NoData on the bridge).'),
    'Singapore': ('c', 'Large parts of the route are on elevated expressways (East Coast Parkway 10.6-11.7 km, Ayer Rajah Expressway 30.6-31.5 and 39.1-40.5 km, West Coast Highway viaducts 32.4-38.4 km), Nicoll Highway bridges (2.6-3.2, 6.2-6.7 km). The mapzen profile has spikes to 40-55 m that are building returns. No open terrain or surface model was found.'),
    'Stockholm': ('c', 'Vasterbron (28.1-29.0 km, 960 m) reads 12.3 m mid-bridge in the DEM; the published navigation clearance is 26 m under the southern arch (Wikipedia; Structurae), so the deck crown is roughly 28-31 m and the error is about 17 m. Lantmateriet elevation data needs an account, so neither the deck profile nor the base profile could be verified. Smaller: Slussbron, Sankt Eriksbron, Vasabron, Norrbro.'),
    'Gold Coast': ('c', 'Gold Coast Highway bridges over the Nerang River / Broadwater inlet (1.1-1.5 km and 30.1-30.4 km, 310-370 m) read 0.3-2.7 m (water); deck heights not found. Base mapzen profile not validated (no open Queensland DSM/DTM point service was tested).'),
    'Copenhagen': ('c', 'Structures are minor (Dybbolsbro over the rail yard 32.2-32.4 km; Christians Brygge covered roadway at grade 33.9-34.2 km; the two Kongens Nytorv hits are station passages, not the route). The base mapzen profile (smoothed 800 m) could not be validated: Danish DHM/DSM services require a token.'),
    'Helsinki': ('c', 'Structures minor (Hakaniemensilta 6.4-6.5 km, Pitkasilta 8.2 km). The mapzen profile is jagged (4-35 m swings every 1-2 km) and could not be validated (NLS elevation API needs a key).'),
    'Berlin': ('c', 'Structures minor (Spree/canal bridges at grade, 44-75 m). Base mapzen profile not validated; no open Berlin/Brandenburg DGM point service was reachable.'),
    'Hamburg': ('c', 'The route runs through the Wallringtunnel (14.2-14.8 km, two sections ~400 m); the DEM shows the surface above (11-15 m). Portal levels and the base mapzen profile could not be validated (no Hamburg DGM service reached).'),
    'Frankfurt': ('c', 'Structures minor (Alte Brucke 13.3-13.6 km, B 40 Main bridge 24.2-24.7 km where the DEM is level at 99-100 m). Base mapzen profile not validated (no open Hessen DGM point service tested).'),
    'Vienna': ('a', 'Profile is the organiser GPX elevation (Vienna City Marathon 2026 download), not a bare-earth DEM: it already carries the Reichsbrucke hump (165.5 -> 173.6 -> 164.1 m over 0.1-1.0 km) and the smaller Danube canal bridges (Aspernbrucke, Friedensbrucke, Franzensbrucke, 1-3 m humps). Not independently validated (no open Austrian DGM point service was tested); treat as provisional.'),
    'Athens': ('c', 'Structures minor (two underpasses on Marathonos Avenue / Mesogeion 30.7-30.8 and 37.5 km, 100 m each; the race likely uses the surface lanes). The real 200+ m climb is in the profile, but the base mapzen profile was not validated (no open Greek DTM service).'),
    'Dubai': ('c', 'Flat course; one 87 m underpass hit at 3.4 km. Base mapzen profile swings -4 to +7 m on a sea-level route and could not be validated; even pace is the right band here anyway.'),
    'Mexico City': ('c', 'Structures minor (Reforma and Ejercito Nacional overpass bridges, 50-320 m, DEM level). Base mapzen profile not validated (INEGI elevation service not tested).'),
}

REBUILD_NOTES = {
    'Rotterdam': ('Erasmusbrug crossed twice (0.07-0.80 km and 26.4-27.1 km): AHN DSM deck rises from 6-7 m to 16.5-16.7 m NAP; supplied DEM read 2-9 m. Varkenoordseviaduct (2.6-2.9 km) 11.4 m. The supplied mapzen profile is also wrong off structures: a fake 16 m hill at 28.2-28.5 km and +13.5 m at 41 km (high-rise returns); AHN DTM there is 0-4 m.', []),
    'Amsterdam': ('Short structures only (Rozenburglaan bridge, S100 bridge at 37.4 km, Mauritskade underpass); AHN DTM replaces the noisy mapzen profile.', []),
    'Eindhoven': ('Short bridges only (Airbornelaan, Professor Holstlaan twice, 62-73 m).', []),
    'Cologne': ('Deutzer Brucke at the start (0.59-1.07 km): NRW bDOM deck rises to 56.7 m; the supplied DEM read a level 47 m. Four short underpasses on the Ring/Universitatsstrasse/Erftstrasse are drawn through the underpass (6-7 m dips over ~120 m); if the race uses the surface lanes these dips are absent (minor at 5 km resolution).', ['underpass_use_unverified']),
    'Auckland': ('Auckland Harbour Bridge (15.3-16.9 km): LINZ 1 m DSM deck climbs ~5% from 3-5 m to 45.8 m NZVD2016 at 16.10 km and descends to ~5 m at 16.9 km; the supplied DEM read 13 m then 0.6 m (water). Published navigation clearance 43 m at high tide (Wikipedia). Off the bridge the supplied mapzen profile differs from the LINZ 8 m DEM by median +3.5 m (p95 +11 m) and its 800 m smoothing removed real 10-20 m hills (e.g. 25-27 and 33-35 km).', []),
    'London': ('Tower Bridge (19.9-20.2 km) from the EA last-return DSM; Upper Thames Street tunnel and Blackfriars Underpass (38.3-38.9 km) drawn portal to portal (the London Marathon runs through both).', []),
    'Paris': ('Quay tunnels drawn portal to portal: Tunnel des Tuileries (4.2-4.5 km and 27.1-28.0 km) and Voie Georges-Pompidou tunnels (29.2-29.5, 30.0-30.2 km); Boulevard Exelmans underpass (33.9-34.1 km). RGE ALTI reads the ground above a tunnel, so portal-to-portal is used.', ['tunnel_use_assumed']),
    'Oslo': ('Rebuilt from Kartverket DTM 1 m: supplied mapzen reads a median 8.4 m high (p95 18 m) and its 800 m smoothing flattened short climbs (gain 193 m supplied vs 233 m rebuilt after 200 m smoothing). Two short underpass hits on the two laps (12.3-12.5 and 33.8-34.0 km) drawn portal to portal; Dronning Mauds gate bridge straight.', ['tunnel_use_assumed']),
    'Valencia': ('Turia bridges (Pont de Montolivet at the start, Glories Valencianes 32.7-32.9 km, Nou d Octubre 34.8-35.0 km) drawn as straight decks between the bank levels (the old riverbed is a sunken park; decks sit at street level); MDT05 is bare earth so it reads the riverbed under them. Guillem de Castro / Mauro Guillen underpasses drawn portal to portal.', ['straight_deck_assumed', 'tunnel_use_assumed']),
    'Barcelona': ('Two short bridges (Carrer de Valencia 9.7 km, Pont de Bac de Roda 10.1-10.2 km over the rail cut) drawn as straight decks between their ends.', ['straight_deck_assumed']),
    'Madrid': ('Underpass hits (Francisco Silvela/Doctor Esquerdo 11.4-11.7 km, Bailen/Plaza de Espana 20.5-21.3 km, Atocha 40.4-40.7 km, two unnamed) are NOT drawn as dips: it is not verified that the race uses them, so the surface (MDT05) is kept; Manzanares bridges (Enrique de la Mata Gorostizaga, Castilla, San Isidro) drawn as straight decks.', ['straight_deck_assumed']),
    'Prague': ('Rebuilt from CUZK DMR 5G. Vltava bridges (Cechuv, Karluv, Manesuv, Libensky, Jiraskuv, Palackeho twice, most Legii) drawn as straight decks between the bank levels (the DMP 1G surface samples were noisy at the bridge ends); Tesnovsky tunel and short embankment underpasses portal to portal; the Celetna (Powder Tower gate) hit is at grade and left alone. The rebuilt profile is the roughest of the set (embankment walls next to the road): smooth grades over at least 200 m.', ['tunnel_use_assumed']),
    'Tokyo': ('Rebuilt from the GSI elevation service: the supplied mapzen profile reads a median 12.8 m above GSI (p95 22 m) and its 157 m of gain falls to 37 m (after the 35 m descent from Shinjuku the course is within a few metres of sea level). Sumida river bridges (Kuramaebashi twice, Kiyosumi-dori, Shin-Ohashi-dori) and the start overpasses (Tocho-dori, Gijido-dori) drawn as straight decks between the ground at both ends; short underpasses portal to portal.', ['straight_deck_assumed', 'tunnel_use_assumed']),
    'Warsaw': ('Aleje Jerozolimskie viaduct and Most Poniatowskiego (1.8-3.1 km) from the GUGiK NMPT surface model: deck 103 m at the escarpment end descending to 92.6-97 m over the Vistula, where the supplied DEM read 86 m (river level); Most Gdanski (16.6-17.2 km) deck 93.8-96 m vs DEM 86-90 m; Slowackiego and Andersa viaducts likewise. NMPT nodata (0) masked.', []),
}

def rebuild_ok(r):
    if r is None: return False, 'no rebuild'
    if r.get('coverage') is not None and r['coverage'] < 0.85: return False, f"terrain coverage {r['coverage']}"
    return True, ''

def main():
    scan = json.load(open(os.path.join(R, 'osm', 'structures.json')))
    import pandas as pd
    df = pd.read_parquet(PARQUET)
    courses = []
    for _, row in df.sort_values('city').iterrows():
        city = row['city']
        sts = structures(scan[city]['ways']) if city in scan else []
        found = [dict(kind=s['kind'], names=s['names'], km_from=s['d_from'], km_to=s['d_to'], osm_ways=s['ways'][:12]) for s in sts]
        entry = dict(city=city, profile_source=row['source'], supplied_km=round(float(row['distance_km']), 3),
                     supplied_gain_loss_m=[float(row['elev_gain_m']), float(row['elev_loss_m'])], structures_found=found,
                     osm_scan=dict(boxes=scan.get(city, {}).get('boxes'), failed=scan.get(city, {}).get('failed')))
        if city == 'New York':
            entry.update(**{'class': 'b'}, summary='Five bridges and three minor overpass dips corrected from NYC city survey elevations; base NED profile validated to about 1 m.',
                         base_profile_check=NYC_BASE, source=NYC_SOURCE,
                         corrections=[dict(c, mode=c.get('mode', 'replace_range')) for c in NYC])
        else:
            rp = os.path.join(R, 'osm', f'rebuild_{city.replace(" ", "_")}.json')
            r = json.load(open(rp)) if os.path.exists(rp) and city in REBUILD_NOTES else None
            ok, why = rebuild_ok(r)
            if ok:
                gk = GROUND_KEY.get(r.get('ground', r.get('sampler')), r.get('ground', r.get('sampler'))); note, flags = REBUILD_NOTES[city]
                entry.update(**{'class': 'b'}, summary=note, flags=flags,
                             base_profile_check=dict(method=f'supplied profile minus rebuilt profile every 25 m', **r['dem_minus_new'],
                                                     gain_loss_supplied_resampled=r['gain_loss_dem'], gain_loss_rebuilt=r['gain_loss_new'], terrain_coverage=r.get('coverage'), road_snapping=r.get('snapping')),
                             source=SRC.get(gk), structure_source=SRC['osm'],
                             structures_applied=r['structures'], segments_5km=r['segments_5km'],
                             corrections=[dict(id=f'{city.lower().replace(" ", "-")}-rebuild', mode='replace_all', name=f'{city} profile rebuilt from {gk} with structure decks',
                                               km_from=0.0, km_to=r['anchors'][-1][0], anchors=r['anchors'],
                                               uncertainty_m=dict(terrain='about 0.5 m vertical on the road where snapped; up to 2-3 m where the GPX and OSM road disagree', structures='see structures_applied'))])
            elif city in MANUAL:
                cl, note = MANUAL[city]
                entry.update(**{'class': cl}, summary=note, corrections=[])
                if city == 'Austin':
                    ra = os.path.join(R, 'osm', 'rebuild_Austin.json')
                    if os.path.exists(ra):
                        a = json.load(open(ra)); entry['optional_minor'] = dict(note='Straight decks between abutments on the NED profile (not applied for class a).', structures=a['structures'], segments_5km=a['segments_5km'])
            else:
                entry.update(**{'class': 'c'}, summary=f'Rebuild unavailable ({why}); structures and base profile not verified.', corrections=[])
        courses.append(entry)
    out = dict(
        schema='pace-notes/course-profile-corrections', version='2026-10-23.1', generated='2026-10-23',
        input=dict(path=PARQUET, sha256=sha256(PARQUET)),
        axis='km values are distances along each supplied GPX route (points_json d_km), not official race kilometres; rescale to the official 42.195 km before matching timing mats.',
        classes=dict(a='no structures that matter; profile usable as is', b='correctable now with cited data; apply the corrections', c='not verifiable in time; the band should stay even pace'),
        method=['Structures: every OSM highway way tagged bridge/tunnel/covered (or non-zero layer) lying along the route within 12 m for at least half its length; pedestrian subways and footbridges excluded; ways merged per crossing.',
                'Base check and rebuild: national terrain models sampled every 25 m along the route after snapping the GPX line to the nearest aligned OSM road centreline, 5-sample running median, output every 50 m.',
                'Bridge decks: surface model (DSM) 25th percentile within 1 m along the bridge way where an open DSM exists; otherwise a straight deck between the ground at both ends (flag straight_deck_assumed).',
                'Tunnels and underpasses: straight line between the portals (flag tunnel_use_assumed) unless the race is not known to use them.',
                'New York: NYC Planimetric Elevation Points (bridge and street spot elevations) projected onto the route.',
                'Use: rebuilt profiles carry 0.4-1.7 m of sample noise (second-difference SD at 50 m); a grade model should use grades smoothed over at least 200 m and gain thresholds of 2 m. After that smoothing rebuilt and supplied total gains agree within about 15 m except Auckland (236 vs 115 m) and Oslo (233 vs 180 m), where the supplied 800 m smoothing removed real short hills.',
                'Rejected sources: Copernicus GLO-30 DSM reads 0.0 m on the Verrazzano-Narrows main span (water flattened); SRTM 30 m reads 0 m at the same point (lead check); NSW 5 m elevation is NoData on the Harbour Bridge.'],
        courses=courses)
    out['summary_counts'] = {k: sum(1 for c in courses if c['class'] == k) for k in 'abc'}
    json.dump(out, open(os.path.join(R, 'profiles.json'), 'w'), indent=1, ensure_ascii=False)
    print(out['summary_counts'], [(c['city'], c['class']) for c in courses])

if __name__ == '__main__':
    main()
