"""cards.json: the four unnumbered "From the half" card plots (spec 2.5 and 3.5).

Each card is drawn by the Top 100 card kit from a plot in the lib/charts/spec.ts shape and reads its values from one
family file, never from a new count: `half-under-2` (field.json), `half-more-women` (women.json), `half-double` and
`half-same-half` (linked.json). The words live in lib/charts/text/half.ts; a linked card prints the chip in its footer.
"""
from __future__ import annotations

import sys
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from half_common import fail  # noqa: E402

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


def build(field: dict, women: dict, linked: dict) -> dict:
    under = next((u for u in field['under'] if u['s'] == 7200), None)
    if under is None:
        fail('cards: field.json has no share under 2:00')
    cities = women['same_city']['cities']
    summary = women['same_city']['summary']
    under_double = linked['overall']['under_double_plus_min']['0']
    rows, values = [], {}
    for h in SAME_HALF:
        f, m = window(linked, 'F', h), window(linked, 'M', h)
        if f is None or m is None:
            continue
        rows.append({'label': label(h), 'a': f['sus'], 'b': m['sus']})
        values[f'F_{h}'] = f['sus']
        values[f'M_{h}'] = m['sus']
    if len(rows) < 2:
        fail('cards: fewer than two half bands with both recorded sexes')
    cards = [
        {'slug': 'half-under-2', 'scope': 'verified',
         'plot': {'form': 'waffle', 'parts': [{'share': under['all'], 'tone': 'signal', 'label': 'under 2:00'}], 'rest': '2:00 or slower'},
         'values': {'under_7200': under['all'], 'finishes': field['cohort']['finishes'], 'editions': field['cohort']['editions']},
         'source': {'file': 'field.json', 'path': 'under[s=7200].all'}},
        {'slug': 'half-more-women', 'scope': 'verified',
         'plot': {'form': 'dumbbell', 'rows': [{'label': c['city'], 'a': c['half'], 'b': c['marathon']} for c in cities],
                  'x': {'min': 0, 'max': 0.6, 'ticks': [0, 0.2, 0.4, 0.6], 'fmt': 'share'}, 'fmt': 'share', 'a': 'Half', 'b': 'Marathon'},
         'values': {'half_median': summary['half_median'], 'marathon_median': summary['marathon_median'], 'pairs': summary['pairs'],
                    'cities': summary['cities'], 'half_higher': summary['half_higher']},
         'source': {'file': 'women.json', 'path': 'same_city.cities'}},
        {'slug': 'half-double', 'scope': 'linked',
         'plot': {'form': 'waffle', 'parts': [{'share': under_double, 'tone': 'signal', 'label': 'under double the half'}],
                  'rest': 'double the half or slower'},
         'values': {'under_double': under_double, 'pairs': linked['set']['pairs'], 'extra_p50_s': linked['overall']['extra_s']['p50']},
         'source': {'file': 'linked.json', 'path': 'overall.under_double_plus_min.0'}},
        {'slug': 'half-same-half', 'scope': 'linked',
         'plot': {'form': 'dumbbell', 'rows': rows, 'x': {'min': 0, 'max': 0.6, 'ticks': [0, 0.2, 0.4, 0.6], 'fmt': 'share'}, 'fmt': 'share',
                  'a': 'Recorded women’s', 'b': 'Recorded men’s'},
         'values': values,
         'source': {'file': 'linked.json', 'path': 'windows.F[h].sus, windows.M[h].sus'}},
    ]
    return {'schema_version': 1, 'family': 'half-cards', 'cards': cards}
