"""Copernicus GLO-30 DSM sampler (1x1 degree COG tiles from the public AWS bucket)."""
import os, math, urllib.request, numpy as np, tifffile
D = '/tmp/claude-0/-home-user/c10c350d-a8c7-5189-a9e6-98ed5e071f3a/scratchpad/shape/research/dl/cop'
_cache = {}
def tile_name(lat, lon):
    la = math.floor(lat); lo = math.floor(lon)
    ns = 'N' if la >= 0 else 'S'; ew = 'E' if lo >= 0 else 'W'
    return f"Copernicus_DSM_COG_10_{ns}{abs(la):02d}_00_{ew}{abs(lo):03d}_00_DEM"
def load(lat, lon):
    n = tile_name(lat, lon)
    if n in _cache: return _cache[n]
    p = os.path.join(D, n + '.tif')
    if not os.path.exists(p):
        urllib.request.urlretrieve(f"https://copernicus-dem-30m.s3.amazonaws.com/{n}/{n}.tif", p)
    a = tifffile.imread(p)
    la = math.floor(lat); lo = math.floor(lon)
    _cache[n] = (a, la, lo)
    return _cache[n]
def sample(lat, lon, bilinear=True):
    a, la, lo = load(lat, lon)
    h, w = a.shape
    # pixel-is-point grid: row 0 at lat la+1, col 0 at lon lo; spacing 1/h, 1/w
    r = (la + 1 - lat) * (h); c = (lon - lo) * (w)
    r0 = int(math.floor(r)); c0 = int(math.floor(c))
    r0 = min(max(r0, 0), h - 2); c0 = min(max(c0, 0), w - 2)
    fr = r - r0; fc = c - c0
    v = a[r0:r0 + 2, c0:c0 + 2].astype(float)
    if not bilinear: return float(a[int(round(r)) % h, int(round(c)) % w])
    return float(v[0, 0] * (1 - fr) * (1 - fc) + v[0, 1] * (1 - fr) * fc + v[1, 0] * fr * (1 - fc) + v[1, 1] * fr * fc)
