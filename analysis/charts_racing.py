"""Top 100 charts: racing (analysis/build_charts.py)."""
import numpy as np

from charts_common import MIN_CELL, count_phrase, edition_ranks, sh

CHARTS = {}


def chart(slug):
    def register(fn):
        CHARTS[slug] = fn
        return fn
    return register


QUARTERS = ['Front', 'Second', 'Third', 'Back']


@chart('quarter-at-20k')
def quarter_at_20k(c):
    """Within each edition of 400+ finishes: the quarter of the field by clock time at 20K against the quarter at the finish."""
    keep = np.isin(c.edition, np.flatnonzero(c.ed_n >= 4 * MIN_CELL))
    r20 = edition_ranks(np.where(keep, c.times[:, 3], np.nan), np.where(keep, c.edition, -1))
    rf = edition_ranks(np.where(keep, c.finish, np.nan), np.where(keep, c.edition, -1))
    q20 = np.minimum(3, np.floor(r20 * 4)).astype(int)
    qf = np.minimum(3, np.floor(rf * 4)).astype(int)
    cells = []
    for i in range(4):
        row = keep & (q20 == i)
        d = int(row.sum())
        cells.append([sh(((qf == j) & row).sum() / d) for j in range(4)])
    n = int(keep.sum())
    return dict(
        values=dict(front_stay=cells[0][0], back_stay=cells[3][3]),
        plot=dict(form='heatmap', rows=QUARTERS, cols=QUARTERS, cells=cells, fmt='share', domain=[0, 1], highlight=[[0, 0]],
                  rowTitle='Quarter of the field at 20K', colTitle='Quarter at the finish'),
        cohort_n=n, editions_n=int(len(np.unique(c.edition[keep]))), weighting='pooled',
        method=f'Places are clock ranks within each edition of at least 400 finishes ({count_phrase(n, "finish")}); quarters split each field by time at 20K and at the finish.',
    )
