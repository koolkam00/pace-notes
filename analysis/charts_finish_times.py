"""Top 100 charts: finish times (analysis/build_charts.py). Each builder takes the ChartCohort and returns its values,
its chart spec, its cohort size, its weighting and a method line."""
import numpy as np

from charts_common import count_phrase, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


@chart('minute-before-the-hour')
def minute_before_the_hour(c):
    """Finishes per minute from 2:30 to 5:30; the minute before each hour and half hour lit."""
    minutes = np.floor(c.finish / 60).astype(np.int64)
    counts = np.bincount(minutes, minlength=721)
    lo, hi = 150, 330
    bins = [dict(x0=m * 60, x1=(m + 1) * 60, v=sh(counts[m] / c.n), tone='signal' if (m + 1) % 30 == 0 else 'quiet') for m in range(lo, hi)]
    before, after = int(counts[239]), int(counts[240])
    return dict(
        values=dict(before=before, after=after, ratio=sh(before / after)),
        plot=dict(form='histogram', bins=bins,
                  x=dict(min=lo * 60, max=hi * 60, fmt='hm', ticks=[9000, 10800, 12600, 14400, 16200, 18000, 19800]),
                  y=dict(min=0, max=sh(max(b['v'] for b in bins) * 1.08), fmt='share1', title='of finishes'),
                  notes=[dict(x=14370, y=sh(counts[239] / c.n), text='3:59', tone='signal', dy=-8)]),
        cohort_n=int(c.n), editions_n=int(len(np.unique(c.edition))), weighting='pooled',
        method=f'Every eligible finish ({count_phrase(c.n, "finish")}) by its finish minute; the minute before each hour and half hour is lit.',
    )
