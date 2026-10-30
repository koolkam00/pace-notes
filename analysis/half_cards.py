"""cards.json: the four unnumbered "From the half" card plots (spec 2.5 and 3.5).

Each card is drawn by the Top 100 card kit from a plot in the lib/charts/spec.ts shape and reads its values from one
family file, never from a new count: `half-under-2` (field.json), `half-more-women` (women.json), `half-double` and
`half-same-half` (linked.json). The words live in lib/charts/text/half.ts; a linked card prints the chip in its footer.

What each plot draws, as the pages draw it:
- `half-under-2`: a waffle of the verified finishes under 2:00 (values also carry the recorded women's and men's shares
  the takeaway quotes);
- `half-more-women`: a dumbbell of the same-city cities, the marathon a hollow ring and the half the filled dot (the
  page's key), under a signal row "Typical" at the two medians the takeaway quotes;
- `half-double`: a waffle of the marathons under double the half (signal) and those within 20 minutes over it (ink), so
  the lit squares stop near the typical marathon's double plus 21 minutes;
- `half-same-half`: a dumbbell of recorded men's (the hollow ring) and women's (the filled dot) sustained-slowdown
  shares at four half bands, the flagship's band (the 5-minute band nearest the pooled median half, as
  lib/nuggets/half.ts picks it) the signal row. The dumbbell form lights its filled dot, so the signal lands on the
  women's share the takeaway prints in orange, as the story's guess lights the women's answer (round 2 review).
"""
from __future__ import annotations

import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import math  # noqa: E402

from half_common import fail, sh  # noqa: E402

SAME_HALF = (5400, 6300, 7200, 8100)     # 1:30, 1:45, 2:00, 2:15
PLOT_STRING_KEYS = frozenset({'form', 'tone', 'rest', 'fmt', 'a', 'b'})


def label(seconds: int) -> str:
    m = seconds // 60
    return f'{m // 60}:{m % 60:02d}'


def window(linked, group, h):
    for w in linked['windows'][group]:
        if w['h'] == h:
            return w
    return None


def flagship_band(linked) -> int:
    """The 5-minute band nearest the pooled median half (JavaScript's Math.round, as lib/nuggets/half.ts flagshipWindow)."""
    return int(math.floor(linked['checks']['battery']['pooled_half_p50_s'] / 300 + 0.5)) * 300


def build(field: dict, women: dict, linked: dict) -> dict:
    under = next((u for u in field['under'] if u['s'] == 7200), None)
    if under is None:
        fail('cards: field.json has no share under 2:00')
    cities = women['same_city']['cities']
    summary = women['same_city']['summary']
    under_double = linked['overall']['under_double_plus_min']['0']
    within_20 = linked['overall']['under_double_plus_min']['20']
    if not 0 < under_double <= within_20 < 1:
        fail('cards: the shares under double the half and within 20 minutes over it are out of order')
    flagship = flagship_band(linked)
    rows, values = [], {}
    for h in SAME_HALF:
        f, m = window(linked, 'F', h), window(linked, 'M', h)
        if f is None or m is None:
            continue
        rows.append({'label': label(h), 'a': m['sus'], 'b': f['sus'], **({'tone': 'signal'} if h == flagship else {})})
        values[f'F_{h}'] = f['sus']
        values[f'M_{h}'] = m['sus']
    if len(rows) < 2:
        fail('cards: fewer than two half bands with both recorded sexes')
    cards = [
        {'slug': 'half-under-2', 'scope': 'verified',
         'plot': {'form': 'waffle', 'parts': [{'share': under['all'], 'tone': 'signal', 'label': 'under 2:00'}], 'rest': '2:00 or slower'},
         'values': {'under_7200': under['all'], 'women_under_7200': under['F'], 'men_under_7200': under['M'],
                    'finishes': field['cohort']['finishes'], 'editions': field['cohort']['editions']},
         'source': {'file': 'field.json', 'path': 'under[s=7200].all'}},
        {'slug': 'half-more-women', 'scope': 'verified',
         'plot': {'form': 'dumbbell',
                  'rows': [{'label': 'Typical', 'a': summary['marathon_median'], 'b': summary['half_median'], 'tone': 'signal'}]
                  + [{'label': c['city'], 'a': c['marathon'], 'b': c['half']} for c in cities],
                  'x': {'min': 0, 'max': 0.6, 'ticks': [0, 0.2, 0.4, 0.6], 'fmt': 'share'}, 'fmt': 'share', 'a': 'Marathon', 'b': 'Half'},
         'values': {'half_median': summary['half_median'], 'marathon_median': summary['marathon_median'], 'pairs': summary['pairs'],
                    'cities': summary['cities'], 'half_higher': summary['half_higher']},
         'source': {'file': 'women.json', 'path': 'same_city.cities'}},
        {'slug': 'half-double', 'scope': 'linked',
         'plot': {'form': 'waffle', 'parts': [{'share': under_double, 'tone': 'signal', 'label': 'under double'},
                                              {'share': sh(within_20 - under_double), 'tone': 'ink', 'label': '0–20 min over'}],
                  'rest': '20+ min over'},
         'values': {'under_double': under_double, 'within_20': within_20, 'pairs': linked['set']['pairs'],
                    'extra_p50_s': linked['overall']['extra_s']['p50']},
         'source': {'file': 'linked.json', 'path': 'overall.under_double_plus_min.0'}},
        {'slug': 'half-same-half', 'scope': 'linked',
         'plot': {'form': 'dumbbell', 'rows': rows, 'x': {'min': 0, 'max': 0.6, 'ticks': [0, 0.2, 0.4, 0.6], 'fmt': 'share'}, 'fmt': 'share',
                  'a': 'Recorded men’s', 'b': 'Recorded women’s'},
         'values': values,
         'source': {'file': 'linked.json', 'path': 'windows.F[h].sus, windows.M[h].sus'}},
    ]
    return {'schema_version': 1, 'family': 'half-cards', 'cards': cards}
