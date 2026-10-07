"""Six ways to run a marathon: pacing archetypes, pacing DNA and the pacing barcode.

Each finish's nine section paces are expressed relative to its own whole-race
average. Profiles form a continuum; the six archetypes are landmarks found by
k-means and named by explicit rules. Labels are assigned after the race from
the race's own splits; they are descriptions, not physiology or advice.
"""
import numpy as np

from insights_data import SECTION_KM, relative_pace, start_offset_screen, sustained_slowdown
from insights_stats import MIN_CELL, assign, quantile, r

NAMES = ['Metronome', 'Gentle fader', 'Late fader', 'Early drifter', 'Cliff', 'Fast-start fader']
SLUGS = ['metronome', 'gentle-fader', 'late-fader', 'early-drifter', 'cliff', 'fast-start-fader']
BLURBS = [
    'Holds within a couple of percent of its own average pace almost all the way.',
    'A little quicker than average early, a little slower late. The most common shape.',
    'Holds a brisk pace to about 25 km, then gives most of it back over 30–40 km.',
    'Starts quickest of all and slows a little in every section from early on.',
    'Holds a fast pace to 25 km, then the 35–40 km section is about 40% slower than average.',
    'Very quick for 15 km, with the steepest slowing between 25 and 35 km.',
]
# Published classifier definition, derived from the 0934 exploration and refined below by Lloyd iterations.
CLIP_LO = [-34.654835, -32.246911, -29.447571, -25.555809, -21.665727, -14.586014, -11.248518, -13.39733, -24.798485]
CLIP_HI = [15.730406, 13.298731, 13.338911, 20.771923, 34.04332, 43.99425, 62.092658, 73.352926, 81.844756]
INIT = [
    [-0.020099, -0.756813, -0.789989, -0.521723, 0.198079, 0.36838, 0.863498, 1.328084, -1.074889],
    [-4.122976, -4.706936, -4.185411, -3.298245, -1.301079, 0.824151, 4.827458, 9.019648, 4.418945],
    [-8.769962, -9.428981, -8.611036, -7.241589, -3.911672, 1.06047, 10.33955, 19.785015, 10.184261],
    [-13.159451, -11.074457, -7.83345, -2.815077, 4.948535, 7.70111, 11.293066, 9.761708, 1.599011],
    [-16.144046, -16.79301, -15.750189, -13.805376, -8.941916, -0.03858, 18.245755, 39.931062, 19.151651],
    [-18.262928, -17.60105, -15.018168, -9.978227, 0.631301, 12.058399, 23.119589, 20.701592, 6.143161],
]
WEIGHTS = np.sqrt(SECTION_KM / 5.0)


def features(R):
    return np.clip(R, CLIP_LO, CLIP_HI) * WEIGHTS


def lloyd(X, C, iterations=60, tol=1e-7):
    C = np.array(C, float)
    for _ in range(iterations):
        lab = assign(X, C)
        new = np.stack([X[lab == j].mean(0) for j in range(len(C))])
        shift = np.abs(new - C).max()
        C = new
        if shift < tol:
            break
    return C, assign(X, C)


def name_clusters(R, lab):
    """Rule-based names: order by late-minus-early slowing, split pairs by when the slowing happens."""
    cent = np.stack([R[lab == j].mean(0) for j in range(6)])
    late = cent[:, 4:8].mean(1) - cent[:, 0:4].mean(1)
    early = (cent[:, 4] + cent[:, 5]) - (cent[:, 6] + cent[:, 7])
    order = np.argsort(late)
    names = {order[0]: 'Metronome', order[1]: 'Gentle fader'}
    for pair, (e_name, l_name) in ((order[2:4], ('Early drifter', 'Late fader')), (order[4:6], ('Fast-start fader', 'Cliff'))):
        a, b = pair
        e, l = (a, b) if early[a] > early[b] else (b, a)
        names[e], names[l] = e_name, l_name
    remap = np.array([NAMES.index(names[j]) for j in range(6)])
    return remap


def band_label(lo, width):
    a, b = lo, lo + width
    return f'{a // 60}:{a % 60:02d}–{b // 60}:{b % 60:02d}'


def sentence(R):
    """Nine letters per finish: F faster than own average by more than 3%, E within ±3%, S slower by more than 3%."""
    codes = np.where(R < -3, 0, np.where(R > 3, 2, 1))
    return (codes * (3 ** np.arange(8, -1, -1))).sum(1)


def decode(value):
    letters = []
    for k in range(8, -1, -1):
        letters.append('FES'[(value // 3 ** k) % 3])
    return ''.join(letters)


def build(f):
    keep, flagged = start_offset_screen(f)
    s = f.subset(keep)
    R = relative_pace(s)
    X = features(R)
    C, lab = lloyd(X, INIT)
    remap = name_clusters(R, lab)
    lab = remap[lab]
    C = C[np.argsort(remap)]
    profiles = np.stack([R[lab == j].mean(0) for j in range(6)])
    if not (np.abs(profiles[0][:8]).max() < 3 and profiles[4][7] > 30 and profiles[4][3] < -10 and profiles[5][0] < -15 and profiles[5][6] > profiles[5][7]):
        raise ValueError('Archetype shapes no longer match their published names')
    detected, onset = sustained_slowdown(s)
    after20_min = (s.finish - s.times[:, 3] - s.baseline * 22.195) / 60
    neg = (s.times[:, 7] - s.times[:, 3]) < s.times[:, 3]
    cv = np.sqrt((SECTION_KM * R ** 2).sum(1) / 42.195)
    minutes = s.finish / 60
    archetypes = []
    for j in range(6):
        m = lab == j
        archetypes.append(dict(
            name=NAMES[j], slug=SLUGS[j], blurb=BLURBS[j], n=int(m.sum()), share=r(m.mean(), 5),
            profile=[r(v, 3) for v in profiles[j]],
            profile_p25=[r(quantile(R[m, k], .25), 3) for k in range(9)], profile_p75=[r(quantile(R[m, k], .75), 3) for k in range(9)],
            median_finish_s=r(quantile(s.finish[m], .5), 1), slowdown_share=r(detected[m].mean(), 5),
            negative_20km_share=r(neg[m].mean(), 5), women_share=r((s.gender[m] == 2).sum() / max(1, ((s.gender[m] == 1) | (s.gender[m] == 2)).sum()), 5),
            median_after20_min=r(quantile(after20_min[m], .5), 2), median_cv=r(quantile(cv[m], .5), 3),
            share_of_slowdowns=r((detected & m).sum() / detected.sum(), 5)))
    # Mix by 15-minute finish band (the "river").
    bands = []
    for lo in range(150, 390, 15):
        m = (minutes >= lo) & (minutes < lo + 15)
        if m.sum() < MIN_CELL:
            continue
        counts = np.bincount(lab[m], minlength=6)
        bands.append(dict(lo_min=lo, label=band_label(lo, 15), n=int(m.sum()), shares=[r(c / m.sum(), 5) for c in counts],
                          negative_20km_share=r(neg[m].mean(), 5), median_cv=r(quantile(cv[m], .5), 3)))
    # Gender, standardized to the pooled men+women 30-minute band mix.
    gender_rows = {}
    mw = (s.gender == 1) | (s.gender == 2)
    edges = list(range(150, 391, 30))
    band30 = np.digitize(minutes, edges)
    weights = np.bincount(band30[mw], minlength=len(edges) + 1).astype(float)
    for g, key in ((1, 'men'), (2, 'women')):
        shares = np.zeros(6)
        total = 0.0
        for b in range(len(edges) + 1):
            m = (s.gender == g) & (band30 == b)
            if m.sum() < MIN_CELL:
                continue
            shares += weights[b] * np.bincount(lab[m], minlength=6) / m.sum()
            total += weights[b]
        gender_rows[key] = dict(n=int((s.gender == g).sum()), standardized_shares=[r(v / total, 5) for v in shares],
                                raw_shares=[r(c / (s.gender == g).sum(), 5) for c in np.bincount(lab[s.gender == g], minlength=6)])
    # Courses, each edition weighted equally.
    courses = []
    for c, city in enumerate(s.cities):
        eds = [e for e in np.unique(s.edition[s.city == c]) if (s.edition == e).sum() >= MIN_CELL]
        if not eds:
            continue
        mix = np.mean([np.bincount(lab[s.edition == e], minlength=6) / (s.edition == e).sum() for e in eds], axis=0)
        courses.append(dict(city=city, editions=len(eds), finishes=int(np.isin(s.edition, eds).sum()), shares=[r(v, 5) for v in mix]))
    # Pacing barcode: 200 finish-percentile bins × 9 sections (median relative pace), plus per-minute rows.
    order = np.argsort(s.finish, kind='stable')
    bins = np.array_split(order, 200)
    barcode = [dict(lo_s=r(s.finish[b].min(), 1), hi_s=r(s.finish[b].max(), 1), n=int(len(b)),
                    median=[r(np.median(R[b, k]), 2) for k in range(9)],
                    archetype=[r(v, 4) for v in np.bincount(lab[b], minlength=6) / len(b)]) for b in bins]
    minute_rows = []
    whole = np.floor(minutes).astype(int)
    for mnt in range(125, 420):
        m = whole == mnt
        if m.sum() < MIN_CELL:
            continue
        minute_rows.append(dict(minute=mnt, n=int(m.sum()), median=[r(np.median(R[m, k]), 2) for k in range(9)],
                                metronome_share=r((lab[m] == 0).mean(), 4)))
    # Pacing sentences with at least 100 finishes.
    codes = sentence(R)
    uniq, counts = np.unique(codes, return_counts=True)
    common = [(int(u), int(c)) for u, c in zip(uniq, counts) if c >= MIN_CELL]
    common.sort(key=lambda x: -x[1])
    sentences = [dict(sentence=decode(u), n=c) for u, c in common]
    # Repeat races: consecutive-year pairs within a screened identity candidate (not a verified person).
    transitions = repeat_pairs(s, lab)
    return dict(
        cohort_n=int(s.n), start_offset_editions=flagged, archetypes=archetypes, river=bands, gender=gender_rows,
        courses=courses, barcode=barcode, barcode_minutes=minute_rows,
        sentences=dict(total_distinct=int(len(uniq)), published=sentences[:600], published_n=int(sum(c for _, c in common[:600])),
                       all_even_n=int(counts[uniq == sentence(np.zeros((1, 9)))[0]].sum())),
        transitions=transitions,
        classifier=dict(section_km=[float(v) for v in SECTION_KM], clip_lo=CLIP_LO, clip_hi=CLIP_HI,
                        weights=[r(v, 8) for v in WEIGHTS], centroids=[[r(v, 6) for v in row] for row in C], names=NAMES,
                        rule='r_i = 100*(section pace / whole-race average pace - 1); x_i = clip(r_i, lo_i, hi_i) * sqrt(km_i / 5); archetype = nearest centroid'),
        method=('Relative pace compares each recorded section with the same finish\'s whole-race average pace. Profiles are clipped at the 0.1st and 99.9th '
                'percentiles, weighted by section length and grouped by k-means into six landmarks, then named by rules: least late slowing is the '
                'Metronome, the next is the Gentle fader, and within the two stronger pairs the one that slows earlier is the Early drifter or Fast-start fader. '
                'Thirteen editions whose first 5 km appears to include start delay are left out of these shape statistics. Repeat pairs use screened identity '
                'candidates with one finish in each of two years at most three years apart; they are not verified people.'),
    )


def repeat_pairs(s, lab):
    order = np.lexsort((s.year, s.profile))
    prof, year, a = s.profile[order], s.year[order], lab[order]
    pairs = []
    i = 0
    n = len(order)
    from_to = np.zeros((6, 6), dtype=np.int64)
    while i < n:
        j = i
        while j < n and prof[j] == prof[i]:
            j += 1
        if j - i >= 2:
            ys, cnt = np.unique(year[i:j], return_counts=True)
            single = set(ys[cnt == 1].tolist())
            idx = [k for k in range(i, j) if year[k] in single]
            for p, q in zip(idx, idx[1:]):
                if 1 <= year[q] - year[p] <= 3:
                    from_to[a[p], a[q]] += 1
        i = j
    total = int(from_to.sum())
    base = from_to.sum(0) / max(1, total)
    rows = []
    for x in range(6):
        out = int(from_to[x].sum())
        rows.append(dict(name=NAMES[x], pairs=out, next_shares=[r(v / out, 5) if out else 0 for v in from_to[x]],
                         repeat_share=r(from_to[x, x] / out, 5) if out else None, overall_share=r(base[x], 5)))
    return dict(pairs=total, repeat_share=r(np.trace(from_to) / max(1, total), 5), rows=rows)
