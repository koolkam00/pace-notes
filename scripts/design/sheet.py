#!/usr/bin/env python3
"""Contact sheets, filmstrips and before/after pixel diffs for shoot.cjs captures (the redesign spec, section 8.0).

  python3 scripts/design/sheet.py sheets <shots> [--routes=a,b]       one contact sheet per route: <shots>/sheets/<slug>.png
  python3 scripts/design/sheet.py strips <shots> [--routes=a,b]       full pages cut into screens: <shots>/strips/<profile>/<slug>-NN.png
  python3 scripts/design/sheet.py diff <before> <after> [--threshold=0.1] [--tolerance=24] [--out=<dir>]

diff compares every PNG present in both folders (same profile and name). A pixel differs when any channel moves by
more than --tolerance (0-255), so sub-pixel anti-aliasing noise is ignored; rows one image has and the other lacks count
as different. It writes a red-on-grey diff image for each pair that differs, a JSON summary, and exits 1 when any pair
differs by more than --threshold percent of its pixels. Canvases masked by shoot.cjs --mask=canvas compare equal.

Needs Pillow. Reads only the capture folders it is given.
"""
import json
import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None

PROFILE_ORDER = ['phone', 'phone664', 'phone714', 'km', 'zoom', 'dark', 'reduced', 'desktop']


def font(size, bold=False):
    name = 'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'
    for root in ('/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/dejavu', '/Library/Fonts'):
        try:
            return ImageFont.truetype(os.path.join(root, name), size)
        except OSError:
            continue
    return ImageFont.load_default()


def parse(argv):
    pos, opts = [], {}
    for a in argv:
        if a.startswith('--'):
            k, _, v = a[2:].partition('=')
            opts[k] = v if v else True
        else:
            pos.append(a)
    return pos, opts


def slugs_in(shots, routes=None):
    if routes:
        out = []
        for r in routes.split(','):
            r = r.strip().split('?')[0].strip('/')
            out.append(r.replace('/', '__') or 'home')
        return out
    found = set()
    for prof in os.listdir(shots):
        d = os.path.join(shots, prof)
        if not os.path.isdir(d) or prof in ('sheets', 'strips', 'diff'):
            continue
        for f in os.listdir(d):
            if f.endswith('-first.png') or f.endswith('-full.png'):
                found.add(f.rsplit('-', 1)[0])
    return sorted(found)


def wrapped(im, width, max_h):
    """Scales an image to `width` and cuts it into columns at most max_h tall, so a long page stays legible."""
    scale = width / im.width
    im = im.resize((width, max(1, int(im.height * scale))), Image.LANCZOS)
    if im.height <= max_h:
        return im
    cols = math.ceil(im.height / max_h)
    out = Image.new('RGB', (cols * (width + 6) - 6, max_h), (210, 210, 210))
    for c in range(cols):
        part = im.crop((0, c * max_h, width, min(im.height, (c + 1) * max_h)))
        out.paste(part, (c * (width + 6), 0))
    return out


def contact_sheet(shots, slug):
    """One route: first screens across profiles, then the full pages, then interaction captures."""
    head, small = font(26, True), font(16)
    tiles = []  # (label, image)
    for prof in PROFILE_ORDER:
        f = os.path.join(shots, prof, f'{slug}-first.png')
        if os.path.exists(f):
            im = Image.open(f).convert('RGB')
            w = 300 if prof != 'desktop' else 640
            if prof == 'zoom':
                w = 150
            tiles.append((f'{prof} · first', wrapped(im, w, 1400)))
    rows = [tiles]
    full = []
    for prof in PROFILE_ORDER:
        f = os.path.join(shots, prof, f'{slug}-full.png')
        if os.path.exists(f):
            im = Image.open(f).convert('RGB')
            w = 220 if prof != 'desktop' else 420
            full.append((f'{prof} · full ({im.height // (2 if prof != "desktop" else 1)} px)', wrapped(im, w, 2400)))
    rows.append(full)
    ix = []
    for prof in ('phone', 'desktop'):
        d = os.path.join(shots, prof)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.startswith(f'{slug}-ix-'):
                im = Image.open(os.path.join(d, f)).convert('RGB')
                ix.append((f'{prof} · {f[len(slug) + 4:-4]}', wrapped(im, 260 if prof == 'phone' else 520, 1200)))
    rows.append(ix)
    rows = [r for r in rows if r]
    if not rows:
        return None
    pad, label_h = 18, 30
    # Wrap each row of tiles at 3000 px wide.
    lines = []
    for r in rows:
        line, w = [], pad
        for t in r:
            if line and w + t[1].width + pad > 3000:
                lines.append(line)
                line, w = [], pad
            line.append(t)
            w += t[1].width + pad
        if line:
            lines.append(line)
    W = max(sum(t[1].width + pad for t in line) + pad for line in lines)
    H = 60 + sum(max(t[1].height for t in line) + label_h + pad for line in lines) + pad
    sheet = Image.new('RGB', (W, H), (236, 233, 226))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 16), '/' + slug.replace('__', '/').replace('home', '', 1 if slug == 'home' else 0), fill=(20, 20, 20), font=head)
    y = 60
    for line in lines:
        x = pad
        for label, im in line:
            d.text((x, y), label, fill=(70, 70, 70), font=small)
            sheet.paste(im, (x, y + label_h))
            x += im.width + pad
        y += max(t[1].height for t in line) + label_h + pad
    out = os.path.join(shots, 'sheets', f'{slug}.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out, optimize=True)
    return out


def filmstrips(shots, slug):
    """Cuts each full page into viewport-sized frames, 4×2 (phone sizes) or 2×3 (desktop) frames per image."""
    written = []
    small = font(16)
    for prof in PROFILE_ORDER:
        f = os.path.join(shots, prof, f'{slug}-full.png')
        if not os.path.exists(f):
            continue
        im = Image.open(f).convert('RGB')
        desktop = prof == 'desktop'
        dpr = 1 if desktop else 2
        css_w, css_h = (1440, 900) if desktop else (390, 844)
        fw, fh = im.width, css_h * dpr
        n = math.ceil(im.height / fh)
        cols, rows = (2, 3) if desktop else (4, 2)
        tw = 720 if desktop else 390
        th = int(fh * tw / fw)
        per = cols * rows
        outdir = os.path.join(shots, 'strips', prof)
        os.makedirs(outdir, exist_ok=True)
        for k, start in enumerate(range(0, n, per)):
            frames = list(range(start, min(n, start + per)))
            r = math.ceil(len(frames) / cols)
            sheet = Image.new('RGB', (cols * (tw + 8) + 8, r * (th + 30) + 8), (60, 60, 60))
            d = ImageDraw.Draw(sheet)
            for i, fi in enumerate(frames):
                crop = im.crop((0, fi * fh, fw, min(im.height, (fi + 1) * fh)))
                crop = crop.resize((tw, max(1, int(crop.height * tw / fw))), Image.LANCZOS)
                x, y = 8 + (i % cols) * (tw + 8), 8 + (i // cols) * (th + 30)
                d.text((x, y), f'{prof} · screen {fi + 1} / {n}', fill='white', font=small)
                sheet.paste(crop, (x, y + 22))
            out = os.path.join(outdir, f'{slug}-{k:02d}.png')
            sheet.save(out, optimize=True)
            written.append(out)
    return written


def diff_pair(a_path, b_path, tolerance, out_path):
    a = Image.open(a_path).convert('RGB')
    b = Image.open(b_path).convert('RGB')
    w, h = max(a.width, b.width), max(a.height, b.height)
    ow, oh = min(a.width, b.width), min(a.height, b.height)
    total = w * h
    extra = total - ow * oh
    ac, bc = a.crop((0, 0, ow, oh)), b.crop((0, 0, ow, oh))
    delta = ImageChops.difference(ac, bc)
    # A pixel differs when its largest channel difference exceeds the tolerance.
    r, g, bl = delta.split()
    mx = ImageChops.lighter(ImageChops.lighter(r, g), bl)
    mask = mx.point(lambda v: 255 if v > tolerance else 0)
    changed = mask.histogram()[255] + extra
    pct = 100.0 * changed / total if total else 0.0
    box = mask.getbbox()
    if changed and out_path:
        base = ac.convert('L').point(lambda v: 150 + v // 3).convert('RGB')
        red = Image.new('RGB', base.size, (230, 20, 20))
        base.paste(red, (0, 0), mask)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        base.save(out_path, optimize=True)
    return {'changed': changed, 'total': total, 'pct': round(pct, 4), 'size': [a.size, b.size], 'bbox': box}


def cmd_diff(before, after, opts):
    threshold = float(opts.get('threshold', 0.1))
    tolerance = int(opts.get('tolerance', 24))
    out = opts.get('out') or os.path.join(after, 'diff')
    rows, worst = [], 0.0
    for prof in sorted(os.listdir(before)):
        bd, ad = os.path.join(before, prof), os.path.join(after, prof)
        if not os.path.isdir(bd) or not os.path.isdir(ad) or prof in ('sheets', 'strips', 'diff'):
            continue
        for f in sorted(os.listdir(bd)):
            if not f.endswith('.png') or not os.path.exists(os.path.join(ad, f)):
                continue
            res = diff_pair(os.path.join(bd, f), os.path.join(ad, f), tolerance, os.path.join(out, prof, f))
            res.update(profile=prof, file=f, ok=res['pct'] <= threshold)
            rows.append(res)
            worst = max(worst, res['pct'])
            flag = 'ok  ' if res['ok'] else 'FAIL'
            print(f"{flag} {res['pct']:8.4f}%  {prof:8s} {f}{'  bbox=' + str(res['bbox']) if res['changed'] else ''}")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, 'diff.json'), 'w') as fh:
        json.dump({'threshold': threshold, 'tolerance': tolerance, 'worst': worst, 'pairs': rows}, fh, indent=1, default=list)
    failed = [r for r in rows if not r['ok']]
    print(f'{len(rows)} pairs compared, worst {worst:.4f}%, {len(failed)} over {threshold}% → {out}/diff.json')
    return 1 if failed or not rows else 0


def main():
    pos, opts = parse(sys.argv[1:])
    if not pos or pos[0] in ('-h', 'help'):
        print(__doc__)
        return 0
    cmd = pos[0]
    if cmd == 'diff':
        if len(pos) < 3:
            print('diff needs <before> <after>')
            return 2
        return cmd_diff(pos[1], pos[2], opts)
    shots = pos[1]
    for slug in slugs_in(shots, opts.get('routes')):
        if cmd == 'sheets':
            out = contact_sheet(shots, slug)
            if out:
                print(out)
        elif cmd == 'strips':
            for out in filmstrips(shots, slug):
                print(out)
        else:
            print(f'unknown command {cmd}')
            return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
