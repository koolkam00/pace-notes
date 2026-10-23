"""Rebuild a route profile from an authoritative terrain model, with structure decks from a surface model."""
import numpy as np
from route import points, project, densify, elev_at, osm_way
def route_samples(city, step_km=0.025):
    pts = points(city); ds = np.array([p['d_km'] for p in pts])
    d = np.arange(0, ds[-1] + 1e-9, step_km)
    return pts, d, np.interp(d, ds, [p['lat'] for p in pts]), np.interp(d, ds, [p['lon'] for p in pts])
def running_median(x, k):
    out = np.copy(x); h = k // 2
    for i in range(len(x)):
        w = x[max(0, i - h): i + h + 1]; w = w[np.isfinite(w)]
        out[i] = np.median(w) if w.size else np.nan
    return out
def deck_profile(pts, way_ids, sampler, d_lo, d_hi, max_off=15):
    """Sample sampler(lats, lons) along OSM ways, map to route d within [d_lo, d_hi]; return sorted (d, z)."""
    rows = []
    for wid in way_ids:
        tags, coords = osm_way(wid); dens = densify(coords, 5)
        z = sampler([a for a, b in dens], [b for a, b in dens])
        for (a, b), v in zip(dens, z):
            pr = [x for x in project(pts, a, b, max_off) if d_lo <= x[0] <= d_hi]
            if pr and v == v: rows.append((min(pr, key=lambda x: x[1])[0], v))
    return sorted(rows)
def bin_profile(rows, step=0.025, stat=np.median):
    b = {}
    for d, z in rows: b.setdefault(round(d / step) * step, []).append(z)
    return [(round(k, 3), round(float(stat(v)), 2)) for k, v in sorted(b.items())]
def rebuild(city, ground, surface, deck_ways, step_km=0.025, out_step_km=0.05, smooth_k=5, deck_win=(None, None)):
    """ground(lats,lons)->z terrain; surface(lats,lons)->z surface model; deck_ways: list of (way_ids, d_lo, d_hi).
    Returns dict with anchors [[d,z]] at out_step_km, residual stats vs the supplied DEM, and deck spans."""
    pts, d, la, lo = route_samples(city, step_km)
    g = np.array(ground(list(la), list(lo)), dtype=float)
    z = running_median(g, smooth_k)
    spans = []
    for ways, d0, d1 in deck_ways:
        rows = deck_profile(pts, ways, surface, d0, d1)
        if not rows: continue
        bp = bin_profile(rows, step_km)
        bd = np.array([a for a, b in bp]); bz = running_median(np.array([b for a, b in bp]), 3)
        m = (d >= bd.min()) & (d <= bd.max())
        z[m] = np.interp(d[m], bd, bz)
        spans.append(dict(ways=ways, d_from=round(float(bd.min()), 3), d_to=round(float(bd.max()), 3), peak_m=round(float(np.nanmax(bz)), 1)))
    ok = np.isfinite(z)
    z = np.interp(d, d[ok], z[ok])
    dem = np.array([elev_at(pts, x) for x in d])
    od = np.arange(0, d[-1] + 1e-9, out_step_km)
    oz = np.interp(od, d, z)
    anchors = [[round(float(a), 3), round(float(b), 1)] for a, b in zip(od, oz)]
    if anchors[-1][0] < d[-1]: anchors.append([round(float(d[-1]), 3), round(float(z[-1]), 1)])
    res = dem - z
    return dict(anchors=anchors, coverage=round(float(np.isfinite(g).mean()), 3), spans=spans,
                dem_minus_new=dict(median=round(float(np.median(res)), 2), p05=round(float(np.percentile(res, 5)), 2),
                                   p95=round(float(np.percentile(res, 95)), 2), max_abs=round(float(np.max(np.abs(res))), 2)),
                gain_loss_new=gain_loss(oz), gain_loss_dem=gain_loss(np.interp(od, d, dem)))
def gain_loss(z, thr=1.0):
    g = l = 0.0; ref = z[0]
    for v in z[1:]:
        if v - ref >= thr: g += v - ref; ref = v
        elif ref - v >= thr: l += ref - v; ref = v
    return [round(g, 1), round(l, 1)]

ROAD = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street',
        'pedestrian', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'road', 'busway'}
def structures(scan_ways, min_len_km=0.04, merge_gap=0.05):
    """Group corridor-scan ways into route structures. Keeps road-class bridges/tunnels/covered ways."""
    keep = []
    for w in scan_ways:
        if w['highway'] not in ROAD: continue
        kind = 'bridge' if (w.get('bridge') not in (None, 'no')) else ('tunnel' if (w.get('tunnel') not in (None, 'no') or w.get('covered') not in (None, 'no')) else None)
        if kind is None:
            try: lay = int(w.get('layer') or 0)
            except ValueError: lay = 0
            kind = 'bridge' if lay > 0 else ('tunnel' if lay < 0 else None)
        if kind: keep.append(dict(w, kind=kind))
    keep.sort(key=lambda w: (w['kind'], w['d_from']))
    groups = []
    for w in keep:
        g = groups[-1] if groups else None
        if g and g['kind'] == w['kind'] and w['d_from'] <= g['d_to'] + merge_gap:
            g['d_to'] = max(g['d_to'], w['d_to']); g['ways'].append(w['way']); g['names'].add(w['name'] or w.get('bridge_name') or '')
        else:
            groups.append(dict(kind=w['kind'], d_from=w['d_from'], d_to=w['d_to'], ways=[w['way']], names={w['name'] or w.get('bridge_name') or ''}))
    out = []
    for g in sorted(groups, key=lambda g: g['d_from']):
        if g['d_to'] - g['d_from'] < min_len_km: continue
        g['names'] = sorted(n for n in g['names'] if n); out.append(g)
    return out
def rebuild2(city, ground, structs, surface=None, step_km=0.025, out_step_km=0.05, smooth_k=5, pad_km=0.03, base='ground', snap_roads=True):
    """base='ground': profile from ground(); base='dem': keep the supplied DEM outside structures.
    Bridges: deck from surface() along their OSM ways when given, else a straight line between the ground at both ends.
    Tunnels: straight line between portals."""
    pts, d, la, lo = route_samples(city, step_km)
    dem = np.array([elev_at(pts, x) for x in d])
    snapped = None
    if base == 'ground':
        sla, slo = la, lo
        if snap_roads:
            import snap as _snap
            sla, slo, mv = _snap.snap(la, lo); snapped = dict(share_snapped=round(float((mv > 0).mean()), 3), median_shift_m=round(float(np.median(mv[mv > 0])) if (mv > 0).any() else 0.0, 1))
        g = np.array(ground(list(sla), list(slo)), dtype=float); z = running_median(g, smooth_k)
        cov = float(np.isfinite(g).mean())
    else:
        z = dem.copy(); cov = None
    applied = []
    for s in structs:
        a, b = s['d_from'] - pad_km, s['d_to'] + pad_km
        m = (d >= a) & (d <= b)
        method = 'straight'
        if s['kind'] == 'bridge' and surface is not None and not s.get('force_straight'):
            rows = deck_profile(pts, s['ways'], surface, a - 0.05, b + 0.05)
            if len(rows) >= 5:
                bp = bin_profile(rows, step_km, stat=lambda v: np.percentile(v, 20)); bd = np.array([p for p, q in bp]); bz = running_median(np.array([q for p, q in bp]), 7)
                mm = (d >= bd.min()) & (d <= bd.max()) & np.isfinite(np.interp(d, bd, bz))
                z[mm] = np.interp(d[mm], bd, bz); method = 'surface_model'
        if method == 'straight':
            left = z[(d < a)][-3:] if np.any(d < a) else z[m][:1]
            right = z[(d > b)][:3] if np.any(d > b) else z[m][-1:]
            za = np.nanmedian(left) if len(left) else np.nan; zb = np.nanmedian(right) if len(right) else np.nan
            if np.isfinite(za) and np.isfinite(zb):
                z[m] = za + (zb - za) * (d[m] - a) / max(b - a, 1e-6)
        applied.append(dict(kind=s['kind'], names=s.get('names'), ways=s['ways'], d_from=round(float(a), 3), d_to=round(float(b), 3), method=method,
                            dem_min=round(float(np.min(dem[m])), 1) if m.any() else None, dem_max=round(float(np.max(dem[m])), 1) if m.any() else None,
                            new_min=round(float(np.nanmin(z[m])), 1) if m.any() else None, new_max=round(float(np.nanmax(z[m])), 1) if m.any() else None))
    ok = np.isfinite(z); z = np.interp(d, d[ok], z[ok])
    od = np.arange(0, d[-1] + 1e-9, out_step_km); oz = np.interp(od, d, z)
    anchors = [[round(float(p), 3), round(float(q), 1)] for p, q in zip(od, oz)]
    if anchors[-1][0] < d[-1] - 1e-6: anchors.append([round(float(d[-1]), 3), round(float(z[-1]), 1)])
    res = dem - z
    seg = []
    for k in range(0, int(d[-1] // 5) + 1):
        mm = (d >= 5 * k) & (d < 5 * k + 5)
        if mm.sum() > 2:
            seg.append(dict(km=f'{5*k}-{5*k+5}', dem_net=round(float(dem[mm][-1] - dem[mm][0]), 1), new_net=round(float(z[mm][-1] - z[mm][0]), 1),
                            dem_gain=gain_loss(dem[mm])[0], new_gain=gain_loss(z[mm])[0]))
    return dict(anchors=anchors, coverage=None if cov is None else round(cov, 3), snapping=snapped, structures=applied,
                dem_minus_new=dict(median=round(float(np.median(res)), 2), p05=round(float(np.percentile(res, 5)), 2), p95=round(float(np.percentile(res, 95)), 2), max_abs=round(float(np.max(np.abs(res))), 2)),
                gain_loss_new=[float(x) for x in gain_loss(oz)], gain_loss_dem=[float(x) for x in gain_loss(np.interp(od, d, dem))], segments_5km=seg)
