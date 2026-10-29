"""Sample a local north-up GeoTIFF (tiepoint + pixel scale tags) at lat/lon with a window percentile."""
import numpy as np, tifffile
from pyproj import Transformer
_c = {}
def open_tif(path):
    if path in _c: return _c[path]
    with tifffile.TiffFile(path) as t:
        p = t.pages[0]; sc = p.tags[33550].value; tp = p.tags[33922].value
        a = p.asarray().astype(float)
    a[(a < -1000) | (a > 1e30)] = np.nan
    _c[path] = (a, tp[3], tp[4], sc[0], sc[1]); return _c[path]
def sample(path, epsg, lats, lons, win_m=1.5, pct=25):
    a, x0, y0, sx, sy = open_tif(path)
    tr = Transformer.from_crs(4326, epsg, always_xy=True)
    xs, ys = tr.transform(np.asarray(lons), np.asarray(lats))
    out = []
    for x, y in zip(xs, ys):
        c0 = int((x - win_m - x0) / sx); c1 = int((x + win_m - x0) / sx) + 1
        r0 = int((y0 - (y + win_m)) / sy); r1 = int((y0 - (y - win_m)) / sy) + 1
        if r1 <= 0 or c1 <= 0 or r0 >= a.shape[0] or c0 >= a.shape[1]: out.append(float('nan')); continue
        v = a[max(r0, 0):r1, max(c0, 0):c1]; v = v[np.isfinite(v)]
        out.append(float(np.percentile(v, pct)) if v.size else float('nan'))
    return out
def sample_mosaic(paths, epsg, lats, lons, win_m=1.5, pct=25):
    best = [float('nan')] * len(lats)
    for p in paths:
        v = sample(p, epsg, lats, lons, win_m, pct)
        best = [b if b == b else x for b, x in zip(best, v)]
    return best
