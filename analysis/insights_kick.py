"""The final kick, sustained slowdowns and the second half of a marathon.

Every pace here is compared with the runner's own 5–20 km pace (the baseline
in the published sustained-slowdown definition). The final section is 2.195 km,
so "kick" compares its pace with the 35–40 km pace.

Shape cohort: story cohort minus start-offset editions, and minus editions
whose timing grid looks shifted for these section-by-section statistics. Each
grid screen is a rule and is published with its values:
* final-section anomaly: edition median final 2.195 km more than 15% faster than
  its 35–40 km (consistent with the splits and the finish being timed on
  different bases);
* misplaced-mat anomaly: an edition median 5 km section after 20 km more than 5%
  faster than its 5–20 km pace.
The cost comparison (same 5–20 km pace, with and without a sustained slowdown)
uses the story cohort; the shape screens do not change it materially.
"""
import numpy as np

from insights_data import start_offset_screen, sustained_slowdown
from insights_stats import MIN_CELL, r

EPS = 1e-12
SECTIONS = ['0–5', '5–10', '10–15', '15–20', '20–25', '25–30', '30–35', '35–40', '40–42.2']
STATES = ['On pace or faster', 'Drifting (5–10% slower)', 'Slowing (10–25% slower)', 'Sustained-slowdown pace (25%+ slower)']
KICK_ANOMALY = -0.15
MAT_ANOMALY = -0.05


def clock(minutes):
    return f'{int(minutes) // 60}:{int(minutes) % 60:02d}'


def grid_screen(f, R, kick):
    """Editions whose section grid looks shifted (rules above). Returns (keep mask, audit)."""
    order = np.argsort(f.edition, kind='stable')
    uniq, starts = np.unique(f.edition[order], return_index=True)
    ends = np.r_[starts[1:], len(order)]
    flagged, audit = [], []
    for e, a, b in zip(uniq, starts, ends):
        idx = order[a:b]
        if len(idx) < MIN_CELL:
            continue
        mk = float(np.median(kick[idx]))
        mr = np.median(R[idx, 4:8], axis=0)
        reason = None
        if mk < KICK_ANOMALY:
            reason = f'Median final 2.195 km {abs(mk) * 100:.1f}% faster than 35–40 km'
        elif mr.min() < MAT_ANOMALY:
            k = int(mr.argmin()) + 4
            reason = f'Median {SECTIONS[k]} km {abs(mr.min()) * 100:.1f}% faster than the 5–20 km pace'
        if reason:
            flagged.append(e)
            ed = f.editions[e]
            audit.append(dict(city=ed['city'], year=ed['year'], finishes=int(len(idx)), reason=reason))
    return ~np.isin(f.edition, flagged), audit


def episodes(R):
    """First sustained-slowdown episode: first post-20 km 5 km section at 25%+ slower, extended through contiguous 25%+ sections."""
    hit = (R[:, 4:8] + EPS) >= .25
    allhit = np.c_[hit, (R[:, 8] + EPS) >= .25]
    detected = hit.any(1)
    first = hit.argmax(1)
    end = np.where(detected, first, -1)
    for c in range(1, 5):
        end = np.where(detected & (end == c - 1) & allhit[:, c], c, end)
    return detected, first + 4, end + 4


def strata_loo(keys, values):
    """Leave-one-out mean of each column of `values` within strata; NaN where the stratum has < MIN_CELL rows."""
    uniq, inv, counts = np.unique(keys, return_inverse=True, return_counts=True)
    out = np.full(values.shape, np.nan)
    for j in range(values.shape[1]):
        sums = np.bincount(inv, weights=values[:, j], minlength=len(uniq))
        out[:, j] = (sums[inv] - values[:, j]) / np.maximum(counts[inv] - 1, 1)
    out[counts[inv] < MIN_CELL] = np.nan
    return out


def build(full):
    keep_offset, offset_audit = start_offset_screen(full)
    s0 = full.subset(keep_offset)
    R0 = s0.paces / s0.baseline[:, None] - 1
    kick0 = s0.paces[:, 8] / s0.paces[:, 7] - 1
    keep_grid, grid_audit = grid_screen(s0, R0, kick0)
    s = s0.subset(keep_grid)
    R = R0[keep_grid]
    P = s.paces
    kick = kick0[keep_grid]
    n = s.n
    detected, first_sec, end_sec = episodes(R)

    # 1. The finish-line magnet: share faster than the previous section, all finishes and sustained slowdowns.
    magnet = []
    for i in range(4, 9):
        faster = P[:, i] < P[:, i - 1]
        magnet.append(dict(section=SECTIONS[i], previous=SECTIONS[i - 1], all=r(faster.mean(), 4), slowdown=r(faster[detected].mean(), 4)))
    gain = (P[:, 7] - P[:, 8]) * 2.195
    kick_summary = dict(
        n=int(n), faster=int((kick < 0).sum()), share=r((kick < 0).mean(), 4), median_kick=r(np.median(kick), 5), median_gain_s=r(np.median(gain), 1),
        slowdown_n=int(detected.sum()), slowdown_faster=int((kick[detected] < 0).sum()), slowdown_share=r((kick[detected] < 0).mean(), 4),
        slowdown_final_below_baseline=r((R[detected, 8] < 0).mean(), 4), other_final_below_baseline=r((R[~detected, 8] < 0).mean(), 4),
        slowdown_final_median_vs_baseline=r(np.median(R[detected, 8]), 4))
    # by how slow 35–40 km was
    by_slow = []
    for lo, hi, label in ((-1, 0, 'Faster than 5–20 km pace'), (0, .05, '0–5% slower'), (.05, .10, '5–10% slower'), (.10, .15, '10–15% slower'),
                          (.15, .25, '15–25% slower'), (.25, .40, '25–40% slower'), (.40, .60, '40–60% slower'), (.60, 10, '60% or more slower')):
        m = (R[:, 7] >= lo) & (R[:, 7] < hi)
        if m.sum() >= MIN_CELL:
            by_slow.append(dict(label=label, n=int(m.sum()), share=r((kick[m] < 0).mean(), 4), median_gain_s=r(np.median(gain[m]), 1),
                                final_vs_baseline=r(np.median(R[m, 8]), 4)))

    # 2. States and flows after 20 km.
    S = np.digitize(R + EPS, [.05, .10, .25])
    occupancy = [dict(section=SECTIONS[i], counts=[int((S[:, i] == k).sum()) for k in range(4)]) for i in range(4, 9)]
    flows = []
    for i in range(4, 8):
        mat = np.zeros((4, 4), dtype=np.int64)
        np.add.at(mat, (S[:, i], S[:, i + 1]), 1)
        flows.append(dict(source=SECTIONS[i], target=SECTIONS[i + 1], counts=mat.tolist()))
    later = (np.arange(9)[None] > end_sec[:, None]) & detected[:, None]
    full5 = later & (np.arange(9)[None] <= 7)
    second_wind = (full5 & (R <= .10)).any(1)
    any_back = (later & (R <= .10)).any(1)
    gen = s.gender
    recovery = dict(
        slowdown_n=int(detected.sum()), full_section_within_10=int(second_wind[detected].sum()), any_within_10=int(any_back[detected].sum()),
        share_full_section=r(second_wind[detected].mean(), 4), share_any=r(any_back[detected].mean(), 4),
        women_n=int((detected & (gen == 2)).sum()), women_any=r(any_back[detected & (gen == 2)].mean(), 4),
        men_n=int((detected & (gen == 1)).sum()), men_any=r(any_back[detected & (gen == 1)].mean(), 4),
        stay=[dict(source=SECTIONS[i], target=SECTIONS[i + 1], n=int((S[:, i] == 3).sum()), stay=r((S[S[:, i] == 3, i + 1] == 3).mean(), 4),
                   back_within_10=r((S[S[:, i] == 3, i + 1] <= 1).mean(), 4)) for i in (5, 6)])

    # 3. Where the field breaks: section distribution of pace vs own 5–20 km pace, overall and by 5–20 km pace band.
    def section_rows(mask):
        out = []
        for i in range(9):
            v = R[mask, i]
            q = np.quantile(v, [.1, .25, .5, .75, .9])
            out.append(dict(section=SECTIONS[i], p10=r(q[0], 4), p25=r(q[1], 4), p50=r(q[2], 4), p75=r(q[3], 4), p90=r(q[4], 4),
                            over10=r((v > .10).mean(), 4), over25=r(((v + EPS) >= .25).mean(), 4)))
        return out
    edges = [150, 180, 210, 240, 270, 300, 330, 360]
    labels = ['Under 2:30', '2:30–3:00', '3:00–3:30', '3:30–4:00', '4:00–4:30', '4:30–5:00', '5:00–5:30', '5:30–6:00', '6:00 and over']
    band = np.digitize(s.baseline * 42.195 / 60, edges)
    breaks = dict(all=dict(n=int(n), sections=section_rows(np.ones(n, bool))), bands=[])
    for k, label in enumerate(labels):
        m = band == k
        if m.sum() < MIN_CELL:
            continue
        rows = section_rows(m)
        majority = next((row['section'] for row in rows[4:] if row['over10'] > .5), None)
        breaks['bands'].append(dict(label=label, n=int(m.sum()), slowdown=r(detected[m].mean(), 4), break_section=majority, sections=rows))

    # 4. Warning lights: later sustained slowdown among finishes without one so far, by how slow the latest section was.
    hit = (R[:, 4:8] + EPS) >= .25
    warning = []
    bins = [(-10, 0, 'Faster'), (0, .05, '0–5% slower'), (.05, .10, '5–10% slower'), (.10, .15, '10–15% slower'), (.15, .20, '15–20% slower'), (.20, .25, '20–25% slower')]
    for sec in (4, 5, 6):
        clean = ~hit[:, :sec - 3].any(1)
        later_hit = hit[:, sec - 3:].any(1)
        rows = []
        for lo, hi, label in bins:
            m = clean & (R[:, sec] >= lo) & (R[:, sec] < hi)
            if m.sum() >= MIN_CELL:
                rows.append(dict(label=label, n=int(m.sum()), later=r(later_hit[m].mean(), 4)))
        warning.append(dict(after=SECTIONS[sec], rows=rows))

    # 5. Bank and pay: same race, same 5–20 km pace (5 s/km), leave-one-out residuals by opening pace.
    key = s.edition.astype(np.int64) * 1000 + np.floor(s.baseline / 5).astype(np.int64)
    vals = np.c_[s.times[:, 0], s.times[:, 3] - s.times[:, 0], s.times[:, 8] - s.times[:, 3], detected.astype(float)]
    loo = strata_loo(key, vals)
    ok = np.isfinite(loo[:, 0])
    resid = vals - loo
    opening = 100 * (P[:, 0] / s.baseline - 1)
    curve = []
    for lo in range(-12, 13):
        m = ok & (opening >= lo) & (opening < lo + 1)
        if m.sum() < MIN_CELL:
            continue
        curve.append(dict(lo=lo, n=int(m.sum()), slowdown=r(detected[m].mean(), 4), excess=r(resid[m, 3].mean(), 4),
                          open_s=r(resid[m, 0].mean(), 1), after20_s=r(resid[m, 2].mean(), 1),
                          finish_s=r((resid[m, 0] + resid[m, 1] + resid[m, 2]).mean(), 1)))
    opening_bands = []
    for lo, hi, label in ((-1e9, -10, 'More than 10% faster'), (-10, -5, '5–10% faster'), (-5, -2, '2–5% faster'), (-2, 2.000001, 'Within 2%'),
                          (2.000001, 5.000001, '2–5% slower'), (5.000001, 1e9, 'More than 5% slower')):
        m = ok & (opening >= lo) & (opening < hi)
        if m.sum() >= MIN_CELL:
            opening_bands.append(dict(label=label, n=int(m.sum()), slowdown=r(detected[m].mean(), 4), expected=r(loo[m, 3].mean(), 4),
                                      open_s=r(resid[m, 0].mean(), 1), after20_s=r(resid[m, 2].mean(), 1),
                                      finish_s=r((resid[m, 0] + resid[m, 1] + resid[m, 2]).mean(), 1)))

    # 6. Same 5–20 km pace, with and without a sustained slowdown (story cohort).
    det_full, _ = sustained_slowdown(full)
    bfull = full.baseline * 42.195 / 60
    cost = []
    for lo in range(150, 360, 15):
        m = (bfull >= lo) & (bfull < lo + 15)
        a, c = m & det_full, m & ~det_full
        if a.sum() < MIN_CELL or c.sum() < MIN_CELL:
            continue
        cost.append(dict(label=f'{clock(lo)}–{clock(lo + 15)}', lo_min=lo, slowdown_n=int(a.sum()), other_n=int(c.sum()),
                         slowdown_20km_s=r(np.median(full.times[a, 3]), 0), other_20km_s=r(np.median(full.times[c, 3]), 0),
                         slowdown_finish_s=r(np.median(full.finish[a]), 0), other_finish_s=r(np.median(full.finish[c]), 0)))
    # Stratified: same edition, recorded gender and 5 s/km band, both sides >= 100; weighted by slowdown finishes.
    skey = (full.edition.astype(np.int64) * 10 + full.gender) * 1000 + np.floor(full.baseline / 5).astype(np.int64)
    combined = skey * 2 + det_full
    order = np.lexsort((full.finish, combined))
    cs, fs = combined[order], full.finish[order]
    groups, starts, counts = np.unique(cs, return_index=True, return_counts=True)
    medians = (fs[starts + (counts - 1) // 2] + fs[starts + counts // 2]) / 2
    by_group = {int(g): (int(c), float(med)) for g, c, med in zip(groups, counts, medians)}
    gaps, weights = [], []
    for g, (c, med) in by_group.items():
        if g % 2 == 1 and c >= MIN_CELL:
            other = by_group.get(g - 1)
            if other and other[0] >= MIN_CELL:
                gaps.append(med - other[1])
                weights.append(c)
    gaps, weights = np.array(gaps), np.array(weights, float)
    o = np.argsort(gaps)
    cum = np.cumsum(weights[o]) / weights.sum()
    stratified = dict(strata=int(len(gaps)), slowdown_finishes=int(weights.sum()), mean_gap_s=r((gaps * weights).sum() / weights.sum(), 1),
                      median_gap_s=r(gaps[o][np.searchsorted(cum, .5)], 1))

    # 7. Women and men: share faster over the final section, by 5–20 km pace band (30-minute equivalent).
    gender_kick = []
    for k, label in enumerate(labels):
        row = dict(label=label)
        for code, name in ((2, 'women'), (1, 'men')):
            m = (band == k) & (gen == code)
            if m.sum() >= MIN_CELL:
                row[f'{name}_n'] = int(m.sum())
                row[name] = r((kick[m] < 0).mean(), 4)
                row[f'{name}_35_40'] = r(np.median(R[m, 7]), 4)
        if 'women' in row and 'men' in row:
            gender_kick.append(row)

    # 8. It follows you: consecutive races of one screened candidate profile, 1–3 years apart.
    recurrence = follow(s, detected, key, loo, ok)

    return dict(
        cohort_n=int(n), editions=int(len(np.unique(s.edition))), start_offset_editions=offset_audit, grid_screen=grid_audit,
        kick=kick_summary, magnet=magnet, by_35_40=by_slow, states=dict(labels=STATES, occupancy=occupancy, flows=flows), recovery=recovery,
        breaks=breaks, warning=warning, bank=dict(curve=curve, bands=opening_bands), cost=dict(bands=cost, stratified=stratified),
        gender_kick=gender_kick, recurrence=recurrence,
        method=('Each section is compared with the runner\'s own 5–20 km pace, the baseline of the sustained-slowdown definition: at least 25% '
                'slower for at least 5 km after 20 km. The kick compares the final 2.195 km with 35–40 km. Same-race comparisons use strata '
                'of one edition and one 5 s/km band of 5–20 km pace with at least 100 finishes, and leave each finish out of its own '
                'stratum\'s mean. Thirteen start-offset editions and two editions whose timing grid looks shifted are left out.'),
    )


def follow(s, detected, key, loo, ok):
    order = np.lexsort((s.year, s.profile))
    prof, year = s.profile[order], s.year[order]
    # Keep profile-years with exactly one eligible finish.
    dup = (prof[1:] == prof[:-1]) & (year[1:] == year[:-1])
    single = ~(np.r_[False, dup] | np.r_[dup, False])
    idx = order[single]
    prof, year = s.profile[idx], s.year[idx]
    same = prof[1:] == prof[:-1]
    gap = year[1:] - year[:-1]
    pair = same & (gap >= 1) & (gap <= 3)
    a, b = idx[:-1][pair], idx[1:][pair]
    usable = ok[b]
    a, b = a[usable], b[usable]
    expected = loo[b, 3]
    after = detected[a]
    same_course = s.city[a] == s.city[b]
    def cell(m):
        return dict(pairs=int(m.sum()), observed=r(detected[b][m].mean(), 4), expected=r(expected[m].mean(), 4)) if m.sum() >= MIN_CELL else None
    return dict(pairs=int(len(a)), after_slowdown=cell(after), after_none=cell(~after),
                after_slowdown_same_course=cell(after & same_course), after_slowdown_other_course=cell(after & ~same_course),
                note='Pairs are consecutive eligible races of one screened candidate profile, 1–3 years apart; profiles are not verified people.')
