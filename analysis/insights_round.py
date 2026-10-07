"""Round-number finish times ("the 3:59 effect").

Descriptive bunching of eligible finish times just before round-number marks.
Smooth-curve expectations are Poisson log-polynomial fits that leave out the
region around each mark; they are a reference, not a counterfactual of what
any runner would have done. Goals, pacers and wave offsets are not observed.
"""
import numpy as np

from insights_stats import MIN_CELL, SEED, bspline_basis, poisson_design_fit, poisson_poly_fit, r

BARRIERS = [150, 165, 180, 195, 210, 225, 240, 270, 300, 330, 360]
MAJOR = [180, 210, 240, 270, 300]
HIST_LO, HIST_HI = 120, 421          # minutes, histogram window published for charts
M0, M1 = 90, 480                      # minute matrix used for fits
MAIN = dict(W=25, XL=5, XR=10, D=3)
GENDER_SETS = {'all': (0, 1, 2), 'men': (1,), 'women': (2,)}


def label(minutes):
    return f'{minutes // 60}:{minutes % 60:02d}'


def minute_matrix(f):
    """editions × gender(3) × minute counts for 90–479 minutes."""
    minute = np.floor(f.finish / 60).astype(np.int64)
    keep = (minute >= M0) & (minute < M1)
    n_ed = len(f.editions)
    M = np.zeros((n_ed, 3, M1 - M0))
    np.add.at(M, (f.edition[keep], f.gender[keep].astype(np.int64), minute[keep] - M0), 1)
    return M


def local_fit(counts, B, W=25, XL=5, XR=10, D=3):
    ms = np.arange(B - W, B + W)
    y = counts[ms - M0].astype(float)
    mask = ~((ms >= B - XL) & (ms < B + XR))
    for K in range(B - W - 2, B + W + 3):
        if K != B and (K % 10 == 0 or K % 15 == 0):
            mask &= ~((ms >= K - 2) & (ms < K + 1))
    exp = poisson_poly_fit(ms, y, D, mask)
    i1 = int(np.flatnonzero(ms == B - 1)[0])
    pre = (ms >= B - XL) & (ms < B)
    post = (ms >= B) & (ms < B + XR)
    return dict(obs_pre1=y[i1], exp_pre1=exp[i1], ratio_pre1=y[i1] / exp[i1], obs_post1=y[i1 + 1],
                excess=(y[pre] - exp[pre]).sum(), deficit=(exp[post] - y[post]).sum())


def cliff_index(c, K):
    f = lambda m: c[m - M0]
    return float(np.exp(np.log(f(K - 1) / f(K)) - 0.5 * (np.log(f(K - 3) / f(K - 2)) + np.log(f(K + 2) / f(K + 3)))))


def mark_kind(K):
    return 'hour' if K % 60 == 0 else 'half-hour' if K % 30 == 0 else 'quarter' if K % 15 == 0 else 'ten' if K % 10 == 0 else 'five' if K % 5 == 0 else 'minute'


def global_curve(counts):
    """Smooth reference curve (cubic B-spline, knots every 20 min) leaving out every mark's window."""
    lo, hi = 130, 420
    ms = np.arange(lo, hi).astype(float)
    y = counts[(ms - M0).astype(int)].astype(float)
    mask = np.ones(len(ms), bool)
    majors = list(range(150, 391, 30))
    for B in majors:
        mask &= ~((ms >= B - 6) & (ms < B + 12))
    for K in range(lo, hi + 1):
        if K not in majors and (K % 10 == 0 or K % 15 == 0):
            mask &= ~((ms >= K - 2) & (ms < K + 1))
    exp = poisson_design_fit(bspline_basis(ms, np.arange(lo, hi + 1, 20).astype(float)), y, mask)
    return ms.astype(int), exp


def seconds_lens(f, B):
    """10-second bins ±5 minutes around a mark, with a Poisson log-cubic reference over ±25 minutes."""
    Bs = B * 60
    t = f.finish
    sel = (t >= Bs - 1500) & (t < Bs + 1500)
    bins = np.floor((t[sel] - (Bs - 1500)) / 10).astype(np.int64)
    y = np.bincount(bins, minlength=300).astype(float)[:300]
    s = np.arange(Bs - 1500, Bs + 1500, 10)
    mask = ~((s >= Bs - 300) & (s < Bs + 600))
    for K in range(Bs - 1800, Bs + 1801, 60):
        km = K // 60
        if K != Bs and (km % 10 == 0 or km % 15 == 0):
            mask &= ~((s >= K - 120) & (s < K + 60))
    exp = poisson_poly_fit(s, y, 3, mask)
    window = (s >= Bs - 300) & (s < Bs + 300)
    pre = (s >= Bs - 300) & (s < Bs)
    excess = y[pre] - exp[pre]
    total = excess.sum()
    last60 = (s >= Bs - 60) & (s < Bs)
    ratio = y / exp
    peak = int(np.argmax(np.where(pre, ratio, -1)))
    return dict(mark=label(B), minutes=B,
                bins=[dict(offset_s=int(a - Bs), n=int(b), expected=r(c, 1)) for a, b, c in zip(s[window], y[window], exp[window])],
                peak_offset_s=int(s[peak] - Bs), peak_ratio=r(ratio[peak], 3),
                share_of_pile_in_last_minute=r((y[last60] - exp[last60]).sum() / total, 4) if total > 0 else None)


def bubble(f, B, rng):
    """Finishes projected from 40 km (at their own 35–40 km pace) to land 0–2 minutes over a mark."""
    t7, t6, t8 = f.times[:, 7], f.times[:, 6], f.finish
    proj = t7 + 2.195 * (t7 - t6) / 5.0
    gain = proj - t8
    fade_ratio = ((t7 - t6) / 5.0) / f.baseline
    cuts = np.quantile(fade_ratio, np.linspace(.1, .9, 9))
    fade = np.searchsorted(cuts, fade_ratio)
    Bs = B * 60
    marks = np.array([b * 60 for b in BARRIERS])
    quarters = np.arange(120, 420, 15) * 60
    neutral = (proj >= Bs - 900) & (proj < Bs + 900)
    rem = np.floor(proj) % 600
    neutral &= (rem >= 180) & (rem < 420)
    for m in np.concatenate([marks, quarters]):
        neutral &= np.abs(proj - m) >= 120
    by_fade = {k: np.sort(gain[neutral & (fade == k)]) for k in range(10)}

    def p_gain_gt(d, fd):
        out = np.empty(len(d))
        for k in range(10):
            s = fd == k
            arr = by_fade[k]
            out[s] = 1 - np.searchsorted(arr, d[s], side='right') / len(arr)
        return out

    rows = {}
    for side, lo, hi in (('over', 0, 120), ('under', -120, 0)):
        s = (proj - Bs >= lo) & (proj - Bs < hi)
        d = proj[s] - Bs
        under = t8[s] < Bs
        expected = p_gain_gt(d, fade[s])
        e = f.edition[s]
        nE = len(f.editions)
        U = np.bincount(e, weights=under, minlength=nE)
        P = np.bincount(e, weights=expected, minlength=nE)
        N = np.bincount(e, minlength=nE)
        boots = []
        for _ in range(200):
            pick = rng.integers(0, nE, nE)
            boots.append(U[pick].sum() - P[pick].sum())
        draws = []
        for k in range(10):
            n = int((fade[s] == k).sum())
            if n and len(by_fade[k]):
                draws.append(rng.choice(by_fade[k], size=n * 10))
        rows[side] = dict(n=int(s.sum()), share_under=r(under.mean(), 4), expected_share_under=r(expected.mean(), 4),
                          extra_under=r(under.sum() - expected.sum(), 1),
                          extra_under_ci95=[r(np.percentile(boots, 2.5), 1), r(np.percentile(boots, 97.5), 1)],
                          median_final_gain_s=r(np.median(gain[s]), 1),
                          expected_median_final_gain_s=r(np.median(np.concatenate(draws)), 1) if draws else None)
    premium = []
    for lo in range(-120, 240, 15):
        s = (proj - Bs >= lo) & (proj - Bs < lo + 15)
        if s.sum() < MIN_CELL:
            continue
        d = proj[s] - Bs
        premium.append(dict(margin_s=lo, n=int(s.sum()), share_under=r((t8[s] < Bs).mean(), 4),
                            expected_share_under=r(p_gain_gt(d, fade[s]).mean(), 4), median_final_gain_s=r(np.median(gain[s]), 1)))
    return dict(mark=label(B), minutes=B, n_comparison=int(neutral.sum()), **rows, premium=premium)


def build(f):
    rng = np.random.default_rng(SEED)
    M = minute_matrix(f)
    totals = {g: M[:, list(idx), :].sum(axis=(0, 1)) for g, idx in GENDER_SETS.items()}
    per_edition_all = M.sum(axis=1)
    hist = [dict(minute=m, all=int(totals['all'][m - M0]), men=int(totals['men'][m - M0]), women=int(totals['women'][m - M0]))
            for m in range(HIST_LO, HIST_HI)]
    curve_ms, curve = global_curve(totals['all'])
    expected_curve = [dict(minute=int(m), expected=r(e, 1)) for m, e in zip(curve_ms, curve) if HIST_LO <= m < HIST_HI]
    picks = [rng.integers(0, len(per_edition_all), len(per_edition_all)) for _ in range(200)]
    boot_totals = [per_edition_all[p].sum(axis=0) for p in picks]
    marks = []
    for B in BARRIERS:
        est = local_fit(totals['all'], B, **MAIN)
        boots = [local_fit(bt, B, **MAIN)['ratio_pre1'] for bt in boot_totals]
        men = local_fit(totals['men'], B, **MAIN)
        women = local_fit(totals['women'], B, **MAIN)
        marks.append(dict(mark=label(B), minutes=B, kind=mark_kind(B),
                          minute_before=int(est['obs_pre1']), minute_after=int(est['obs_post1']),
                          expected_minute_before=r(est['exp_pre1'], 1), ratio=r(est['ratio_pre1'], 4),
                          ratio_ci95=[r(np.percentile(boots, 2.5), 4), r(np.percentile(boots, 97.5), 4)],
                          excess_5min=r(est['excess'], 1), cliff=r(cliff_index(totals['all'], B), 4),
                          men_ratio=r(men['ratio_pre1'], 4), women_ratio=r(women['ratio_pre1'], 4) if women['obs_pre1'] >= MIN_CELL else None,
                          women_minute_before=int(women['obs_pre1'])))
    cliffs = []
    for K in range(140, 401):
        window = totals['all'][K - 3 - M0:K + 4 - M0]
        if window.min() < MIN_CELL:
            continue
        cliffs.append(dict(minute=K, kind=mark_kind(K), cliff=r(cliff_index(totals['all'], K), 4)))
    total_excess = sum(local_fit(totals['all'], B, **MAIN)['excess'] for B in (150, 180, 210, 240, 270, 300, 330, 360))
    return dict(
        histogram=hist, expected_curve=expected_curve, marks=marks, cliff_index=cliffs,
        total_excess_hour_half_hour=r(total_excess, 0),
        seconds=[seconds_lens(f, B) for B in MAJOR],
        bubble=[bubble(f, B, rng) for B in MAJOR],
        method=('Counts use eligible elapsed finish times in one-minute bins. The expected count in the minute before a mark comes from a Poisson '
                'log-cubic fitted to the ±25 minutes around it, leaving out five minutes before and ten after the mark and short windows around '
                'other 10- and 15-minute marks. Ratio intervals resample whole race editions (200 draws). The cliff index compares the step from '
                'the minute before a mark to the minute after with the neighbouring minute-to-minute steps. The 40 km view projects each finish '
                'from its 40 km time at its own 35–40 km pace; its comparison uses finishes projected away from round marks with the same '
                'decile of 35–40 km slowing. None of these are goals, predictions or causal estimates.'),
    )
