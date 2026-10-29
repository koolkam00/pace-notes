"""New York corrections from NYC Planimetric Database: Elevation Points (NYC OTI, NYC Open Data 9uxf-ng6q;
sub_code 300020 = bridge elevation, 300000 = street spot elevation; feet NAVD88, 2022 imagery, ASPRS vertical
Class 2). Points within 9 m of the GoAndRace 2025 route line were projected onto the route (d_km is the
supplied GPX's own distance axis, 42.61 km long). Values converted to metres (x 0.3048)."""

NYC_SOURCE = {
    'dataset': 'NYC Planimetric Database: Elevation Points (NYC Office of Technology and Innovation)',
    'url': 'https://data.cityofnewyork.us/d/9uxf-ng6q',
    'api': 'https://data.cityofnewyork.us/resource/9uxf-ng6q.json',
    'capture_rules': 'https://github.com/CityOfNewYork/nyc-planimetrics/blob/master/Capture_Rules.md',
    'datum': 'NAVD88 (feet in source, metres here)',
    'vintage': 'imagery March 2022; planimetrics updated Nov 2022 - Oct 2023',
    'accuracy': 'ASPRS vertical Class 2 at 1in=100ft mapping (capture rules)',
}

CROSSINGS = [
    dict(id='nyc-verrazzano', name='Verrazzano-Narrows Bridge, upper level, with Staten Island and Brooklyn approaches',
         osm_ways=['865473231 (and parallel I-278 bridge ways, layer 3)'], km_from=0.0, km_to=3.09,
         anchors=[[0.0, 40.3], [0.187, 47.5], [0.43, 57.1], [0.673, 66.5], [0.81, 71.5], [0.977, 76.4], [1.114, 78.6],
                  [1.236, 79.2], [1.357, 78.8], [1.479, 77.9], [1.601, 75.8], [1.722, 72.0], [1.844, 67.8], [1.966, 63.2],
                  [2.083, 58.2], [2.208, 53.5], [2.33, 48.8], [2.494, 41.8], [2.59, 41.9], [3.03, 13.2], [3.09, 14.0]],
         dem_before='40.6 m at the start, -1.6 m (water) from 0.63 to 2.08 km, 15 m at 2.4 km',
         uncertainty_m=dict(deck=0.5, ramp_2_6_to_3_0_km=6.0),
         evidence=('Bridge-elevation points every ~60 m along the upper-level roadway: 40.3 m at the start line, 79.2 m '
                   'at midspan (1.24 km), 41.8 m at the Brooklyn end of the suspended structure (2.49 km); street spot '
                   'elevations 13.2 m at 3.03-3.14 km where the route is back at grade. The peak agrees with the bridge '
                   'record: 228 ft (69.5 m) clearance above mean high water at midspan (Britannica; Wikipedia infobox '
                   'citing Adams 1996) plus the deck structure.'),
         notes=('Upper level only. The dataset also holds a second series 10.7 m lower at midspan (68.4 m), which is '
                'below the published 69.5 m clearance and cannot be the lower roadway surface as published, so it is not '
                'used; lower-level (Green start) runners climb roughly 7-11 m less. The 2.6-3.0 km ramp descent is '
                'drawn as one straight grade between the last deck point and the first at-grade street point because '
                'two ramps lie within the GPX alignment error there; its total (41.9 to 13.2 m) is pinned.')),
    dict(id='nyc-bay-ridge-cut', name='4th Avenue over the LIRR Bay Ridge Branch open cut (about 64th-65th St)',
         osm_ways=[], km_from=5.85, km_to=6.23,
         anchors=[[5.853, 24.6], [6.016, 23.4], [6.065, 23.8], [6.105, 23.4], [6.224, 23.3]],
         dem_before='11.6-14.5 m at 6.0-6.1 km (the DEM reads the rail cut under the street)',
         uncertainty_m=0.5,
         evidence='Street and bridge spot elevations on 4th Avenue: 23.4-23.8 m across the cut.'),
    dict(id='nyc-pulaski', name='Pulaski Bridge (Newtown Creek, Brooklyn to Queens)', osm_ways=['Pulaski Bridge ways'],
         km_from=20.80, km_to=21.82,
         anchors=[[20.807, 2.8], [20.935, 8.0], [20.996, 10.1], [21.056, 12.6], [21.118, 15.0], [21.179, 16.4],
                  [21.24, 16.3], [21.301, 15.8], [21.362, 15.6], [21.41, 14.3], [21.471, 12.3], [21.532, 10.0],
                  [21.59, 8.1], [21.654, 6.3], [21.71, 5.7], [21.812, 5.3]],
         dem_before='1.7-3.6 m (creek level) across the whole bridge',
         uncertainty_m=0.5,
         evidence=('Bridge and spot elevations peak at 16.4 m (21.18 km). Consistent with the 39 ft (11.9 m) closed '
                   'clearance at mean high water in the Coast Guard drawbridge rule for Newtown Creek (33 CFR 117.801).')),
    dict(id='nyc-queensboro', name='Ed Koch Queensboro (59th Street) Bridge, lower level, with the Queens ramp and the Manhattan exit to First Avenue',
         osm_ways=['Queensboro Bridge (Lower Level) ways, layer 1-2'], km_from=23.55, km_to=26.0,
         anchors=[[23.553, 6.0], [23.62, 7.5], [23.71, 11.3], [23.778, 12.7], [23.891, 16.9], [24.015, 20.3],
                  [24.076, 22.4], [24.137, 24.5], [24.259, 28.7], [24.381, 32.9], [24.5, 37.1], [24.624, 41.2],
                  [24.745, 44.8], [24.887, 44.2], [25.009, 44.9], [25.13, 44.1], [25.252, 42.5], [25.374, 39.2],
                  [25.495, 34.7], [25.617, 28.9], [25.738, 25.6], [25.937, 15.9], [26.0, 16.1]],
         dem_before='0.0-5.2 m along the whole span (East River and Roosevelt Island ground)',
         uncertainty_m=dict(deck=1.5, ramps=2.0),
         evidence=('Lower-level series of bridge elevations 6-8 m off the GPX line, rising about 3.4% from 24.5 m '
                   '(24.14 km) to 44.9 m (25.01 km). The upper level reads 50.6-51.3 m on the same span and is not used: '
                   'the marathon runs the lower level. Consistent with the 131 ft (39.9 m) closed vertical clearance '
                   'listed for the bridge plus the lower floor depth.'),
         notes='Lower-level inner roadway is not visible from the air; the cantilevered lower outer roadway series is used as its level.'),
    dict(id='nyc-willis', name='Willis Avenue Bridge (Harlem River, Manhattan to the Bronx)', osm_ways=['Willis Avenue Bridge ways'],
         km_from=31.25, km_to=32.35,
         anchors=[[31.25, 3.0], [31.322, 4.9], [31.384, 8.3], [31.449, 9.9], [31.534, 11.2], [31.656, 10.9],
                  [31.717, 11.6], [31.777, 13.3], [31.828, 14.8], [31.95, 14.5], [32.057, 15.4], [32.138, 12.3],
                  [32.196, 10.7], [32.287, 7.5], [32.348, 5.3]],
         dem_before='0.0-1.8 m over the river, 10.5 m at 32.14 km',
         uncertainty_m=2.0,
         evidence=('Street and bridge spot elevations: 10.9-11.6 m on the swing span, 15.4 m on the Bronx approach '
                   'viaduct (32.06 km). Coast Guard rule 33 CFR 117.789 gives 24 ft (7.3 m) closed clearance at mean high water.'),
         notes='31.97 km has one 6.4 m street point 0.4 m off the line (the street below the approach); not used.'),
    dict(id='nyc-madison', name='Madison Avenue Bridge (Harlem River, the Bronx to Manhattan)', osm_ways=['Madison Avenue Bridge ways'],
         km_from=33.45, km_to=34.15,
         anchors=[[33.45, 2.7], [33.507, 2.8], [33.586, 4.5], [33.69, 7.2], [33.768, 8.7], [33.833, 9.7], [33.947, 9.9],
                  [33.99, 9.0], [34.05, 6.3], [34.102, 4.2], [34.139, 3.3]],
         dem_before='5.6 m on the Bronx side falling to 1.6 m over the river',
         uncertainty_m=1.0,
         evidence=('Street and bridge spot elevations peak at 9.9 m (33.95 km); 2.7-2.8 m on East 138th Street at 33.50 km. '
                   'Coast Guard rule 33 CFR 117.789 gives 25 ft (7.6 m) closed clearance at mean high water.'),
         notes='The DEM reads 5.4-5.8 m on the Bronx streets at 33.3-33.6 km where the city points read 2.6-3.5 m; the correction starts at 33.45 km.'),
    dict(id='nyc-central-park-arches', name='East Drive and Central Park South over the transverse roads and arches (79th St transverse, Greywacke Arch, 65th St transverse)',
         osm_ways=['East Drive bridge ways (layer 1)'], km_from=38.80, km_to=40.80, mode='point_overrides',
         anchors=[[38.89, 31.9], [39.37, 32.2], [40.77, 19.5]],
         dem_before='26.8 m, 26.8 m and 15.1 m single-point dips',
         uncertainty_m=0.5,
         evidence='Street spot elevations on the drive: 31.9-32.9 m (38.90-38.94 km), 30.8-32.4 m (39.32-39.42 km), 19.4-19.7 m (40.74-40.77 km).',
         notes='Replace only the listed profile points; neighbouring DEM points agree with city points within 1-2 m.'),
]

BASE_CHECK = dict(
    method='NED 10 m profile compared with 1,616 NYC street spot elevations within 10 m of the route',
    median_dem_minus_city_m=-0.01, mad_m=0.83,
    result='Outside the listed structures the supplied profile agrees with city survey elevations to about 1 m.')
