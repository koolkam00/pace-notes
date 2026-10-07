"""Race replay samples and the shape of a field "on the clock".

Start offsets and wave starts are not recorded, so every replay starts all
runners together at elapsed time zero and moves them between their recorded
checkpoints at a constant speed within each section. Samples are stratified by
finish-time quantile with no names or record ids.
"""
import math

import numpy as np

from insights_data import SECTION_KM, start_offset_screen
from insights_stats import MIN_CELL, quantile, r

SAMPLE = 1500
REPLAY_CITIES = ('Berlin', 'New York', 'London', 'Chicago', 'Boston', 'Paris', 'Valencia', 'Amsterdam')


def replay_editions(f):
    """For each flagship city, the edition with the most eligible finishes (ties: latest year)."""
    counts = np.bincount(f.edition, minlength=len(f.editions))
    chosen = []
    for city in REPLAY_CITIES:
        options = [(counts[i], e['year'], i) for i, e in enumerate(f.editions) if e['city'] == city and counts[i] >= 5000]
        if options:
            chosen.append(max(options)[2])
    return chosen


def sample_edition(f, edition):
    idx = np.flatnonzero(f.edition == edition)
    order = idx[np.argsort(f.finish[idx], kind='stable')]
    n = len(order)
    take = order[np.round(np.linspace(0, n - 1, min(SAMPLE, n))).astype(int)]
    rows = [[int(round(v)) for v in f.times[i]] + [int(f.gender[i])] for i in take]
    # Rounding to whole seconds must keep each row strictly increasing.
    for row in rows:
        for k in range(1, 9):
            if row[k] <= row[k - 1]:
                row[k] = row[k - 1] + 1
    t = f.times[idx]
    snapshots = []
    for hour in (1, 2, 3, 4, 5, 6):
        clock = hour * 3600
        dist = np.array([position(row, clock) for row in t])
        running = dist < 42.195
        # Positions of the runner 10% from the front, the median runner and the runner 10% from the back.
        snapshots.append(dict(clock_s=clock, finished_share=r(1 - running.mean(), 4),
                              front10_km=r(quantile(dist, .9), 3), median_km=r(quantile(dist, .5), 3), back10_km=r(quantile(dist, .1), 3)))
    e = f.editions[edition]
    slug = f"{e['city'].lower().replace(' ', '-')}-{e['year']}"
    return dict(slug=slug, city=e['city'], year=e['year'], race=e['race'], finishes=int(n), sample=len(rows),
                first_finish_s=r(f.finish[idx].min(), 1), median_finish_s=r(quantile(f.finish[idx], .5), 1),
                last_finish_s=r(f.finish[idx].max(), 1), snapshots=snapshots, rows=rows)


KM = np.array([0, 5, 10, 15, 20, 25, 30, 35, 40, 42.195])


def position(times, clock):
    cum = np.concatenate([[0.0], times])
    if clock >= cum[-1]:
        return 42.195
    j = int(np.searchsorted(cum, clock, side='right')) - 1
    frac = (clock - cum[j]) / (cum[j + 1] - cum[j])
    return float(KM[j] + frac * (KM[j + 1] - KM[j]))


def field_spread(f):
    """All-course quantiles of elapsed time at each checkpoint (the field stretching out)."""
    rows = []
    for k, km in enumerate(KM[1:]):
        t = f.times[:, k]
        rows.append(dict(km=float(km), p10_s=r(quantile(t, .1), 1), p25_s=r(quantile(t, .25), 1), p50_s=r(quantile(t, .5), 1),
                         p75_s=r(quantile(t, .75), 1), p90_s=r(quantile(t, .9), 1)))
    return rows


def moments(f, edition):
    """Clock moments for one edition, computed on its full eligible field."""
    idx = np.flatnonzero(f.edition == edition)
    t = f.times[idx]
    fin = t[:, 8]
    n = len(idx)
    first = float(fin.min())
    at_first = np.array([position(row, first) for row in t])
    half = float(np.sort(fin)[math.ceil(n / 2) - 1])
    minutes = np.floor(fin / 60).astype(int)
    counts = np.bincount(minutes)
    peak = int(np.argmax(counts))
    return dict(
        first_finish_s=r(first, 1), not_past_20_at_first=int((t[:, 3] > first).sum()), not_past_10_at_first=int((t[:, 1] > first).sum()),
        past_30_at_first=int((t[:, 5] <= first).sum()), back_km_at_first=r(at_first.min(), 2),
        half_home_s=r(half, 1), half_home_ratio=r(half / first, 3),
        finish_quantiles_s={str(q): r(quantile(fin, q), 1) for q in (.01, .1, .5, .9, .99)},
        peak_minute=peak, peak_minute_n=int(counts[peak]), minute_240_n=int(counts[240]) if len(counts) > 240 else 0)


def composition(f, edition):
    """The emptying-course illusion: current speed of runners still out, against their own whole-race average speed."""
    idx = np.flatnonzero(f.edition == edition)
    cum = np.concatenate([np.zeros((len(idx), 1)), f.times[idx]], axis=1)
    whole = 42.195 / cum[:, 9] * 3600
    rows = []
    for clock in [600] + [h * 1800 for h in range(2, 15)]:
        out = cum[:, 9] > clock
        if out.sum() < MIN_CELL:
            break
        c = cum[out]
        j = (c <= clock).sum(1) - 1
        speed = SECTION_KM[j] / (c[np.arange(len(c)), j + 1] - c[np.arange(len(c)), j]) * 3600
        rows.append(dict(clock_s=clock, on_course=int(out.sum()), current_kmh=r(speed.mean(), 3), whole_race_kmh=r(whole[out].mean(), 3)))
    base = rows[0]
    for row in rows[1:]:
        drop = base['current_kmh'] - row['current_kmh']
        row['composition_share'] = r((base['whole_race_kmh'] - row['whole_race_kmh']) / drop, 4) if drop > .05 else None
    return rows


def ghosts(f, edition):
    """Even-pace ghosts: share of the field ahead on the clock at each checkpoint, and a typical-shape 20 km time."""
    idx = np.flatnonzero(f.edition == edition)
    t = f.times[idx]
    out = []
    for g in range(150, 361, 15):
        target = g * 60.0
        ahead_n = [int((t[:, k] < target * KM[k + 1] / 42.195).sum()) for k in range(9)]
        ahead = [r(a / len(idx), 4) for a in ahead_n]
        near = np.abs(t[:, 8] - target) <= 150
        typical = r(np.median(t[near, 3] / t[near, 8]) * target, 1) if near.sum() >= MIN_CELL else None
        out.append(dict(target_s=int(target), ahead=ahead, net_passes=ahead_n[0] - ahead_n[8],
                        typical_20km_s=typical, even_20km_s=r(target * 20 / 42.195, 1),
                        near_n=int(near.sum()) if near.sum() >= MIN_CELL else None))
    return out


def clock_pack(f, edition, k=1):
    """The 30-second clock pack around the median 10 km time, and how far apart its members finish."""
    idx = np.flatnonzero(f.edition == edition)
    t = f.times[idx]
    b = math.floor(quantile(t[:, k], .5) / 30) * 30
    m = np.floor(t[:, k] / 30) * 30 == b
    pack = t[m]
    return dict(checkpoint_km=float(KM[k + 1]), window_start_s=int(b), n=int(m.sum()),
                quantiles=[dict(km=float(KM[j + 1]), p10_s=r(quantile(pack[:, j], .1), 1), p50_s=r(quantile(pack[:, j], .5), 1),
                                p90_s=r(quantile(pack[:, j], .9), 1)) for j in range(9)],
                finish_window_min=r((quantile(pack[:, 8], .9) - quantile(pack[:, 8], .1)) / 60, 2))


def stretch(f):
    """Per edition: how much wider the field is (P90/P10) over the 20–40 km block than over 0–20 km."""
    keep, _ = start_offset_screen(f)
    rows = []
    for e in np.unique(f.edition[keep]):
        m = keep & (f.edition == e)
        if m.sum() < 1000:
            continue
        a = f.times[m, 3]
        b = f.times[m, 7] - f.times[m, 3]
        value = (quantile(b, .9) / quantile(b, .1)) / (quantile(a, .9) / quantile(a, .1))
        rows.append(dict(city=f.editions[e]['city'], year=f.editions[e]['year'], n=int(m.sum()), stretch=r(value, 4)))
    values = [x['stretch'] for x in rows]
    return dict(editions=rows, wider_after_20=int(sum(v > 1 for v in values)), mean=r(np.mean(values), 4),
                min=min(rows, key=lambda x: x['stretch']), max=max(rows, key=lambda x: x['stretch']))


def build(f):
    chosen = replay_editions(f)
    samples = [sample_edition(f, e) for e in chosen]
    for s_, e in zip(samples, chosen):
        s_['moments'] = moments(f, e)
        s_['composition'] = composition(f, e)
        s_['ghosts'] = ghosts(f, e)
        s_['pack'] = clock_pack(f, e)
    extra = {f"replay/{s['slug']}.json": dict(slug=s['slug'], city=s['city'], year=s['year'], finishes=s['finishes'],
                                              sample=s['sample'], rows=s['rows']) for s in samples}
    index = [{k: v for k, v in s.items() if k != 'rows'} | dict(file=f"replay/{s['slug']}.json") for s in samples]
    return dict(editions=index, field_spread=field_spread(f), stretch=stretch(f), extra_files=extra,
                method=('Each replay is a stratified sample of up to 1,500 eligible finishes from one race edition, chosen at evenly spaced '
                        'finish-time ranks. Everyone starts together at elapsed time zero because wave and start offsets are not recorded, '
                        'and each runner moves at a constant speed within each recorded section. Colours compare the current section with '
                        "that runner's own 5–20 km pace."))
