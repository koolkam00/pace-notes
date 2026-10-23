"""Top 100 charts (analysis/build_charts.py). Who runs: the gender gap through the
field, age and slowing, women's share by finish time and by race under 4:00, older finishes against the young median,
matched even pacing, the age of the quickest finishes and the 70+ field."""
import numpy as np

from charts_common import MIN_CELL, median, quantile, require_cell, sh, sec

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


def _edition_counts(c, mask):
    return np.bincount(c.edition[mask], minlength=len(c.editions))


def _gender_ok_editions(c, min_recorded):
    """Editions without gender-recording gaps: not a listed gap edition, at most 2% of finishes without a recorded men's
    or women's gender, at least `min_recorded` finishes with one, and at least 80% of the edition's records retained as
    finishes."""
    E = len(c.editions)
    raw = getattr(c.f, 'raw_by_edition', None)
    if raw is None:
        raise ValueError('no raw record counts for the retention screen')
    mw = _edition_counts(c, (c.gender == 1) | (c.gender == 2))
    other = _edition_counts(c, c.gender == 0)
    return np.array([(not c.gender_gap_edition[e]) and mw[e] >= min_recorded and other[e] <= 0.02 * c.ed_n[e]
                     and raw[e] > 0 and c.ed_n[e] >= 0.8 * raw[e] for e in range(E)])


def _even_pace(c):
    """Every full 5K section within 3% of the mean of the eight 5K section paces (summed in mat order)."""
    p = c.paces
    mean = (p[:, 0] + p[:, 1] + p[:, 2] + p[:, 3] + p[:, 4] + p[:, 5] + p[:, 6] + p[:, 7]) / 8
    ok = np.ones(c.n, bool)
    for k in range(8):
        ok &= np.abs(p[:, k] / mean - 1) <= 0.03
    return ok


def _races(c, eds):
    """The races of a set of editions, most editions first (ties by name), as prose: 'New York, Washington and Paris'."""
    k = {}
    for e in eds:
        k[str(c.ed_city[e])] = k.get(str(c.ed_city[e]), 0) + 1
    names = sorted(k, key=lambda x: (-k[x], x))
    return (', '.join(names[:-1]) + ' and ' + names[-1]) if len(names) > 1 else names[0], len(names)


GAP_PCTS = [(0.01, '1st'), (0.05, '5th'), (0.10, '10th'), (0.25, '25th'), (0.50, '50th'), (0.75, '75th'), (0.90, '90th')]


@chart('gap-widest-at-the-front')
def gap_widest_at_the_front(c):
    """Per edition with 1,000+ men's and women's finishes: women's percentile finish over men's at the same percentile;
    the median of each gap across editions (editions equal)."""
    men, women = c.gender == 1, c.gender == 2
    nm, nw = _edition_counts(c, men), _edition_counts(c, women)
    eds = [e for e in range(len(c.editions)) if not c.gender_gap_edition[e] and nm[e] >= 1000 and nw[e] >= 1000]
    if not eds:
        raise ValueError("no editions with 1,000+ men's and 1,000+ women's finishes")
    gaps = []
    n = 0
    for e in eds:
        m = c.edition == e
        fm, fw = np.sort(c.finish[m & men]), np.sort(c.finish[m & women])
        gaps.append([quantile(fw, p) / quantile(fm, p) - 1 for p, _ in GAP_PCTS])
        n += len(fm) + len(fw)
    gaps = np.array(gaps)
    med = [median(gaps[:, j]) for j in range(len(GAP_PCTS))]
    j5, j90 = 1, 6
    wider = int((gaps[:, j5] > gaps[:, j90]).sum())
    front3, rest4 = max(med[:3]), max(med[3:])
    rows = [dict(label=lab, value=sh(med[j]), tone='signal' if j == j5 else 'ink' if j == j90 else 'quiet') for j, (_, lab) in enumerate(GAP_PCTS)]
    return dict(
        values=dict(front=sh(med[j5]), back=sh(med[j90]), mid=sh(med[4]), first=sh(med[0]), p10=sh(med[2]), p25=sh(med[3]),
                    p75=sh(med[5]), front_max=sh(front3), rest_max=sh(rest4), eds=len(eds), wider_eds=wider,
                    wider_share=sh(wider / len(eds))),
        plot=dict(form='bars', rows=rows, fmt='share1', x=dict(min=0, max=0.2, fmt='share')),
        cohort_n=int(n), editions_n=len(eds), weighting='editions-equal',
        method=(f'In each of {len(eds)} editions with at least 1,000 men\'s and 1,000 women\'s finishes (gender-recording gap editions '
                'left out), the women\'s finish at each percentile of the women\'s field over the men\'s finish at the same percentile '
                'of the men\'s field; the median of each gap across editions, every edition counting once.'),
    )


AGE_BANDS = [(18, 30, '18–29'), (30, 40, '30–39'), (40, 50, '40–49'), (50, 60, '50–59'), (60, 70, '60–69'), (70, 80, '70–79')]
FINISH_COLS = [(10800 + 1800 * j, 10800 + 1800 * (j + 1)) for j in range(6)]


@chart('younger-finishes-slowed-more')
def younger_finishes_slowed_more(c):
    """Men's finishes with an exact age in start-screened editions: sustained slowdown share by age band and 30-minute finish band."""
    base = c.exact_age_ok & c.shape_keep & (c.gender == 1) & ~c.gender_gap_edition[c.edition]
    cells, n = [], 0
    for lo, hi, _ in AGE_BANDS:
        row = []
        for f0, f1 in FINISH_COLS:
            m = base & (c.exact_age >= lo) & (c.exact_age < hi) & (c.finish >= f0) & (c.finish < f1)
            k = int(m.sum())
            if k >= MIN_CELL:
                row.append(sh(c.slow[m].mean()))
                n += k
            else:
                row.append(None)
        cells.append(row)
    require_cell((base & (c.exact_age >= 18) & (c.exact_age < 30) & (c.finish >= 14400) & (c.finish < 16200)).sum(), '18–29 at 4:00')
    require_cell((base & (c.exact_age >= 70) & (c.exact_age < 80) & (c.finish >= 14400) & (c.finish < 16200)).sum(), '70–79 at 4:00')
    young, old = cells[0][2], cells[5][2]
    mono = 0
    for j in range(len(FINISH_COLS)):
        col = [cells[i][j] for i in range(len(AGE_BANDS)) if cells[i][j] is not None]
        mono += int(len(col) >= 2 and all(b < a for a, b in zip(col, col[1:])))
    sig = [cells[i][2] for i in range(len(AGE_BANDS))]
    mono_signal = int(None not in sig and all(b < a for a, b in zip(sig, sig[1:])))
    eds = np.unique(c.edition[base])
    series = []
    for j, lab, tone in ((0, '3:00–3:30', 'quiet'), (4, '5:00–5:30', 'quiet'), (2, '4:00–4:30', 'signal')):
        pts = [[i, cells[i][j]] for i in range(len(AGE_BANDS)) if cells[i][j] is not None]
        if len(pts) < 2:
            raise ValueError(f'too few age bands with 100+ finishes at {lab}')
        s_ = dict(label=lab, points=pts, tone=tone)
        if tone == 'signal':
            s_.update(dots=True, width=2.5)
        series.append(s_)
    # A line that stops before the last age band is named beside its own last point, not at the plot's right edge.
    short = []
    for s_ in series:
        if s_['points'][-1][0] < len(AGE_BANDS) - 1:
            s_['labelAt'] = 'none'
            x_, y_ = s_['points'][-1]
            short.append(dict(x=x_, y=y_, text=s_['label'], tone='quiet', anchor='start', dx=10, dy=6))
    return dict(
        values=dict(young=young, old=old, mono_cols=mono, cols=len(FINISH_COLS), mono_signal=mono_signal),
        plot=dict(form='lines', series=series,
                  x=dict(min=0, max=5, cats=['<30', '30s', '40s', '50s', '60s', '70s'], fmt='int'),
                  y=dict(min=0, max=0.8, ticks=[0, 0.3, 0.6], fmt='share'),
                  notes=[dict(x=0, y=young, text='{v}', value=young, fmt='share', tone='ink', anchor='start', dx=6, dy=22),
                         dict(x=5, y=old, text='{v}', value=old, fmt='share', tone='signal', anchor='end', dx=-8, dy=24)] + short),
        cohort_n=int(n), editions_n=int(len(eds)), weighting='pooled',
        method=(f'Men\'s finishes with an exact recorded age in start-screened editions ({n:,} finishes), by ten-year age band '
                'and 30-minute finish band from 3:00 to 6:00 (three bands drawn); cells under 100 finishes are left out.'),
    )


SHARE_BANDS = [(0, 10800, '<3:00')] + [(10800 + 900 * i, 10800 + 900 * (i + 1), f'{(180 + 15 * i) // 60}:{(180 + 15 * i) % 60:02d}') for i in range(13)]


@chart('womens-share-by-finish-time')
def womens_share_by_finish_time(c):
    """Editions of 2,000+ finishes without gender-recording gaps that hold 100+ recorded men's and women's finishes in
    every band: women's share of those finishes in each band, the median over that one fixed set of editions."""
    ok = _gender_ok_editions(c, 1) & (c.ed_n >= 2000)
    if not ok.any():
        raise ValueError('no editions with 2,000+ finishes and no gender-recording gaps')
    mw = (c.gender == 1) | (c.gender == 2)
    J = len(SHARE_BANDS)
    per = [[] for _ in range(J)]
    used, n, pw, pt, under10 = [], 0, 0, 0, 0
    for e in np.flatnonzero(ok):
        m = (c.edition == e) & mw
        f, w = c.finish[m], c.gender[m] == 2
        ks, shares = [], []
        for lo, hi, _ in SHARE_BANDS:
            b = (f >= lo) & (f < hi)
            ks.append(int(b.sum()))
            shares.append(float(w[b].mean()) if ks[-1] else 0.0)
        if min(ks) < MIN_CELL:
            continue
        for j in range(J):
            per[j].append(shares[j])
        pw += int(w[f < SHARE_BANDS[0][1]].sum()); pt += ks[0]; under10 += int(shares[0] < 0.10)
        used.append(int(e)); n += int(m.sum())
    if not used:
        raise ValueError('no edition with 100+ finishes in every band')
    med = [median(np.array(x)) for x in per]
    # The first band from which every later band's median share is above half.
    cross_j = None
    for j in range(J - 1, 0, -1):
        if med[j] > 0.5:
            cross_j = j
        else:
            break
    if cross_j is None:
        raise ValueError('no run of bands above half at the slow end')
    cols = [dict(label=lab, value=sh(med[j]), tone='signal' if j == 0 else 'ink' if j >= cross_j else 'quiet') for j, (_, _, lab) in enumerate(SHARE_BANDS)]
    last_end = SHARE_BANDS[-1][1]
    run = f'{SHARE_BANDS[cross_j][2]}–{last_end // 3600}:{last_end % 3600 // 60:02d}'
    return dict(
        values=dict(sub3=sh(med[0]), cross=int(SHARE_BANDS[cross_j][0]), cross_share=sh(med[cross_j]), before_cross=sh(med[cross_j - 1]),
                    last_start=int(SHARE_BANDS[-1][0]), last_end=int(last_end), last_share=sh(med[-1]), eds=len(used),
                    sub3_pooled=sh(pw / pt), sub3_under10=int(under10)),
        plot=dict(form='columns', cols=cols, fmt='share', y=dict(min=0, max=0.65, fmt='share', ticks=[0, 0.25, 0.5]),
                  ref=dict(axis='y', value=0.5, tone='quiet'), values='none',
                  notes=[dict(x=0, y=sh(med[0]), text='{v}', value=sh(med[0]), fmt='share', tone='signal', dy=-8),
                         dict(x=J - 1, y=sh(max(med[cross_j:])), text=f'Over half, {run}', tone='ink', anchor='end', dx=10, dy=-14)]),
        cohort_n=int(n), editions_n=len(used), weighting='editions-equal',
        method=(f'Women\'s share of recorded men\'s and women\'s finishes in each 15-minute finish band, in the {len(used)} editions of at '
                'least 2,000 finishes without gender-recording gaps that hold at least 100 such finishes in every band (under 3:00, then '
                '3:00 to 6:15); each band shows the median over those same editions, every edition counting once.'),
    )


@chart('sixties-beat-the-young-median')
def sixties_beat_the_young_median(c):
    """Men's finishes with an exact recorded age: share of each five-year band from 35 quicker than the median men's
    25–34 finish pooled over the same editions (and the women's 60–64 share against the women's 25–34 median)."""
    rows, vals = [], {}
    k_all = 0
    for g, key in ((1, 'm'), (2, 'w')):
        base = c.exact_age_ok & (c.gender == g) & ~c.gender_gap_edition[c.edition]
        young = base & (c.exact_age >= 25) & (c.exact_age < 35)
        require_cell(young.sum(), f'{key} 25–34')
        ref = quantile(c.finish[young], 0.5)
        vals[key + '_ref'] = ref
        if g == 1:
            k_all += int(young.sum())
            rows.append(dict(label='25–34', value=sh((c.finish[young] < ref).mean()), tone='ink'))
        for lo in range(35, 80, 5):
            m = base & (c.exact_age >= lo) & (c.exact_age < lo + 5)
            if g == 1:
                k_all += require_cell(m.sum(), f'men {lo}')
                v = sh((c.finish[m] < ref).mean())
                rows.append(dict(label=f'{lo}–{lo + 4}', value=v, tone='signal' if lo == 60 else 'quiet'))
                vals[f'm{lo}'] = v
            if lo == 60:
                require_cell(m.sum(), f'{key} 60–64')
                vals[key + '6064'] = sh((c.finish[m] < ref).mean())
    eds = np.unique(c.edition[c.exact_age_ok & (c.gender == 1) & ~c.gender_gap_edition[c.edition]])
    races, races_n = _races(c, [int(e) for e in eds])
    return dict(
        values=dict(m6064=vals['m6064'], ref=sec(vals['m_ref']), w6064=vals['w6064'], w_ref=sec(vals['w_ref']), m7074=vals['m70'],
                    m4044=vals['m40'], m3539=vals['m35'], races=races, races_n=int(races_n)),
        plot=dict(form='bars', rows=rows, fmt='share', x=dict(min=0, max=0.55, fmt='share', ticks=[0, 0.25, 0.5])),
        cohort_n=int(k_all), editions_n=int(len(eds)), weighting='pooled',
        method=(f'Men\'s finishes with an exact recorded age ({k_all:,} finishes at 25–79): the share of each five-year age band from 35 '
                'quicker than the median men\'s 25–34 finish pooled over the same editions.'),
    )


EVEN_BANDS = [(0, 12600, 'Under 3:30'), (12600, 16200, '3:30–4:30'), (16200, 10 ** 9, '4:30+')]


def _matched(cell, women, y):
    """Women's and men's shares of y, each cell (edition × finish minute) weighted by its smaller group."""
    ids, inv = np.unique(cell, return_inverse=True)
    nw = np.bincount(inv, weights=women, minlength=len(ids))
    nm = np.bincount(inv, weights=~women, minlength=len(ids))
    yw = np.bincount(inv, weights=women & y, minlength=len(ids))
    ym = np.bincount(inv, weights=~women & y, minlength=len(ids))
    w = np.minimum(nw, nm)
    k = w > 0
    return float((w[k] * yw[k] / nw[k]).sum() / w[k].sum()), float((w[k] * ym[k] / nm[k]).sum() / w[k].sum()), int(w.sum())


@chart('even-pace-paradox')
def even_pace_paradox(c):
    """Start-screened finishes (any finish time) with a recorded men's or women's gender: even-paced shares matched on
    edition and finish minute, by finish band, and unmatched."""
    even = _even_pace(c)
    sel = c.shape_keep & ~c.gender_gap_edition[c.edition] & ((c.gender == 1) | (c.gender == 2))
    women = c.gender[sel] == 2
    y = even[sel]
    f = c.finish[sel]
    if f.max() >= 60000:
        raise ValueError('a finish of 1,000 minutes or more would break the edition × minute cell key')
    cell = c.edition[sel].astype(np.int64) * 1000 + np.floor(f / 60).astype(np.int64)
    w_m, m_m, weight = _matched(cell, women, y)
    rows = [dict(label='Same finish', a=sh(m_m), b=sh(w_m), tone='signal')]
    for lo, hi, lab in EVEN_BANDS:
        b = (f >= lo) & (f < hi)
        bw, bm, bwt = _matched(cell[b], women[b], y[b])
        require_cell(bwt, lab)
        rows.append(dict(label=lab, a=sh(bm), b=sh(bw), tone='quiet'))
    pw, pm = float(y[women].mean()), float(y[~women].mean())
    rows.append(dict(label='All finishes', a=sh(pm), b=sh(pw), tone='ink'))
    require_cell(weight, 'matched weight')
    n = int(sel.sum())
    return dict(
        values=dict(ratio=sh(w_m / m_m), women=sh(w_m), men=sh(m_m), women_pooled=sh(pw), men_pooled=sh(pm), weight=weight),
        plot=dict(form='dumbbell', rows=rows, fmt='share1', a="Men's", b="Women's", x=dict(min=-0.04, max=0.3, fmt='share', ticks=[0, 0.1, 0.2, 0.3]),
                  notes=[dict(row=0, x=rows[0]['a'], text='{v}', value=rows[0]['a'], fmt='share1', tone='quiet', anchor='end', dx=-10, dy=5),
                         dict(row=0, x=rows[0]['b'], text='{v}', value=rows[0]['b'], fmt='share1', tone='signal', anchor='start', dx=10, dy=5),
                         dict(row=4, x=rows[4]['b'], text='{v}', value=rows[4]['b'], fmt='share1', tone='ink', anchor='end', dx=-14, dy=5),
                         dict(row=4, x=rows[4]['a'], text='{v}', value=rows[4]['a'], fmt='share1', tone='quiet', anchor='start', dx=10, dy=5)]),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[sel]))), weighting='pairs',
        method=(f'Start-screened finishes with a recorded men\'s or women\'s gender, gender-recording gap editions left out ({n:,} finishes); '
                'even pace is every full 5K within 3% of the mean 5K pace; women\'s and men\'s finishes are matched on edition and finish '
                f'minute, each cell weighted by its smaller group ({weight:,} per group).'),
    )


@chart('front-of-the-field-is-younger')
def front_of_the_field_is_younger(c):
    """Exact-age editions with 10,000+ men's exact-age finishes: median age of the quickest 1%, 10% and 25%, the slowest 10% and all."""
    base = c.exact_age_ok & (c.gender == 1) & ~c.gender_gap_edition[c.edition]
    cnt = _edition_counts(c, base)
    eds = [e for e in range(len(c.editions)) if cnt[e] >= 10000]
    if not eds:
        raise ValueError("no editions with 10,000+ men's exact-age finishes")
    top1, top10, top25, slow10, allages = [], [], [], [], []
    for e in eds:
        m = base & (c.edition == e)
        f, a = c.finish[m], c.exact_age[m]
        q1, q10, q25, q90 = quantile(f, 0.01), quantile(f, 0.10), quantile(f, 0.25), quantile(f, 0.90)
        top1.append(a[f <= q1]); top10.append(a[f <= q10]); top25.append(a[f <= q25]); slow10.append(a[f >= q90]); allages.append(a)
    min_group = min(len(x) for x in top1)
    require_cell(min_group, 'front 1% group')
    t1, t10, t25, s10, al = (np.concatenate(x) for x in (top1, top10, top25, slow10, allages))
    vals = dict(top1=float(median(t1)), top10=float(median(t10)), top25=float(median(t25)), all=float(median(al)), slow10=float(median(s10)))
    rows = [dict(label='Quickest 1%', value=vals['top1'], tone='signal'), dict(label='Quickest 10%', value=vals['top10'], tone='quiet'),
            dict(label='Quickest 25%', value=vals['top25'], tone='quiet'), dict(label='Slowest 10%', value=vals['slow10'], tone='quiet'),
            dict(label="All men's", value=vals['all'], tone='ink')]
    races, races_n = _races(c, eds)
    return dict(
        values=dict(**vals, top1_40plus=sh((t1 >= 40).mean()), min_group=int(min_group), eds=len(eds), top1_count=int(len(t1)),
                    races=races, races_n=int(races_n)),
        plot=dict(form='bars', rows=rows, fmt='int', x=dict(min=0, max=50, fmt='int', ticks=[0, 10, 20, 30, 40, 50])),
        cohort_n=int(len(al)), editions_n=len(eds), weighting='pooled',
        method=(f'Men\'s finishes with an exact recorded age in the {len(eds)} editions holding at least 10,000 of them '
                f'({len(al):,} finishes): the quickest 1%, 10% and 25% and the slowest 10% by finish time within each edition, '
                'ages pooled across the editions, against the median age of all of them.'),
    )


@chart('seventy-plus-under-four')
def seventy_plus_under_four(c):
    """Finishes with a recorded age group of 70–74 or older (every edition that records age groups; in exact-age
    editions the group agrees with the exact age), under 4:00 and 5:00."""
    m = c.age >= 11
    f = c.finish[m]
    n70 = require_cell(m.sum(), '70+')
    u4 = require_cell((f < 14400).sum(), '70+ under 4:00')
    u5 = require_cell((f < 18000).sum(), '70+ under 5:00')
    k = int(len(np.unique(c.edition[m])))
    return dict(
        values=dict(u4=u4, u5=u5, n70=n70, u4_share=sh(u4 / n70), med=sec(quantile(f, 0.5)), eds=k),
        plot=dict(form='big', value=u4, fmt='count', caption='finishes at 70+ under 4:00',
                  compare=[dict(label='Under 4:00', value=u4, tone='signal'), dict(label='Under 5:00', value=u5, tone='ink'),
                           dict(label='All at 70+', value=n70, tone='quiet')], compareFmt='count'),
        cohort_n=n70, editions_n=k, weighting='pooled',
        method=f'Finishes with a recorded age group of 70–74 or older ({n70:,} finishes in the {k} editions that record age groups), by finish time.',
    )


@chart('womens-share-by-city')
def womens_share_by_city(c):
    """Women's share of recorded men's and women's finishes under 4:00 in each race's latest edition without
    gender-recording gaps (races with 5+ such editions of 1,000+ recorded finishes whose latest, 2023 or later, holds
    10,000+ finishes)."""
    E = len(c.editions)
    ok = _gender_ok_editions(c, 1000)
    picked = []
    for city in sorted(set(c.ed_city[ok].tolist())):
        es = [e for e in range(E) if ok[e] and c.ed_city[e] == city]
        last = max(es, key=lambda e: c.ed_year[e])
        if len(es) >= 5 and c.ed_year[last] >= 2023 and c.ed_n[last] >= 10000:
            picked.append(last)
    if len(picked) < 2:
        raise ValueError('too few races with five gap-free editions of 1,000+ recorded finishes and a latest edition of 10,000+')
    sub4 = c.finish < 14400
    nm, nw = _edition_counts(c, sub4 & (c.gender == 1)), _edition_counts(c, sub4 & (c.gender == 2))
    for e in picked:
        require_cell(nm[e], f'{c.label(e)} men under 4:00')
        require_cell(nw[e], f'{c.label(e)} women under 4:00')
    share = {e: float(nw[e] / (nm[e] + nw[e])) for e in picked}
    picked.sort(key=lambda e: (-share[e], c.ed_city[e]))
    top, second, low = picked[0], picked[1], picked[-1]
    rows = [dict(label=str(c.ed_city[e]), value=sh(share[e]), tone='signal' if e == top else 'ink' if e == low else 'quiet') for e in picked]
    k = int(sum(nm[e] + nw[e] for e in picked))
    return dict(
        values=dict(top=sh(share[top]), top_city=str(c.ed_city[top]), low=sh(share[low]), low_city=str(c.ed_city[low]),
                    second=sh(share[second]), second_city=str(c.ed_city[second]), races_n=len(picked),
                    n_min=int(min(nm[e] + nw[e] for e in picked)), latest_min_year=int(min(c.ed_year[e] for e in picked))),
        plot=dict(form='bars', rows=rows, fmt='share1', x=dict(min=0, max=0.5, fmt='share', ticks=[0, 0.25, 0.5])),
        cohort_n=k, editions_n=len(picked), weighting='pooled',
        method=('Women\'s share of recorded men\'s and women\'s finishes under 4:00 in the latest edition, 2023 or later, of each race with '
                'at least five editions of 1,000 such finishes without gender-recording gaps and 10,000 finishes in that latest edition.'),
    )
