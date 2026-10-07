"""Race replay samples and the shape of a field "on the clock".

Start offsets and wave starts are not recorded, so every replay starts all
runners together at elapsed time zero and moves them between their recorded
checkpoints at a constant speed within each section. Samples are stratified by
finish-time quantile with no names or record ids.
"""
import numpy as np

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


def build(f):
    samples = [sample_edition(f, e) for e in replay_editions(f)]
    extra = {f"replay/{s['slug']}.json": dict(slug=s['slug'], city=s['city'], year=s['year'], finishes=s['finishes'],
                                              sample=s['sample'], rows=s['rows']) for s in samples}
    index = [{k: v for k, v in s.items() if k != 'rows'} | dict(file=f"replay/{s['slug']}.json") for s in samples]
    return dict(editions=index, field_spread=field_spread(f), extra_files=extra,
                method=('Each replay is a stratified sample of up to 1,500 eligible finishes from one race edition, chosen at evenly spaced '
                        'finish-time ranks. Everyone starts together at elapsed time zero because wave and start offsets are not recorded, '
                        'and each runner moves at a constant speed within each recorded section. Colours compare the current section with '
                        "that runner's own 5–20 km pace."))
