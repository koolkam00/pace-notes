"""analysis/race_registry.py: the naming rule on small cases, and the frozen registry of the adopted release."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import race_registry  # noqa: E402
from insights_tools_common import slugify  # noqa: E402

# The course pages' slugs (lib/analytics-policy.ts COURSE_SLUGS, read 2026-11-14): they must come out of the registry unchanged.
COURSE_SLUGS = ['amsterdam', 'auckland', 'austin', 'barcelona', 'berlin', 'boston', 'chicago', 'copenhagen', 'dubai', 'eindhoven', 'frankfurt', 'gold-coast',
                'hamburg', 'helsinki', 'london', 'madrid', 'new-york', 'oslo', 'paris', 'prague', 'rotterdam', 'singapore', 'stockholm', 'sydney', 'valencia',
                'warsaw', 'washington']


def editions(*rows):
    return [(key, year, race, n) for key, year, race, n in rows]


class Rule(unittest.TestCase):
    def test_slug_is_the_course_rule(self):
        for text in ['New York', 'Gold Coast', 'Zürich Maratón', "Grandma's Marathon", 'São Paulo']:
            self.assertEqual(race_registry.slug(text), slugify(text))
        self.assertEqual(race_registry.slug('New York'), 'new-york')

    def test_place_and_name(self):
        self.assertEqual(race_registry.split_key('Berlin'), ('Berlin', None))
        self.assertEqual(race_registry.split_key('Los Angeles, CA: Los Angeles Marathon'), ('Los Angeles, CA', 'Los Angeles Marathon'))
        # A platform's name is not a place; placeholders and repeated parts are dropped; nothing is added.
        self.assertEqual(race_registry.split_key('XACT: Philadelphia Marathon Race Weekend'), (None, 'Philadelphia Marathon Race Weekend'))
        self.assertEqual(race_registry.split_key('TBD, TBD: Run Barbados Festival'), (None, 'Run Barbados Festival'))
        self.assertEqual(race_registry.split_key('King George Island, TBD: Antarctica Marathon'), ('King George Island', 'Antarctica Marathon'))
        self.assertEqual(race_registry.split_key('MB, MB: Manitoba Marathon'), ('MB', 'Manitoba Marathon'))
        self.assertEqual(race_registry.split_key('Duluth, MN: Grandma&#39;s Marathon'), ('Duluth, MN', "Grandma's Marathon"))
        self.assertEqual(race_registry.display_name('Medieval Marathon 2025'), 'Medieval Marathon')
        self.assertEqual(race_registry.display_name('MARATÓN POWERADE MONTERREY'), 'Maratón Powerade Monterrey')
        self.assertEqual(race_registry.display_name('Zurich Maratón de Sevilla'), 'Zurich Maratón de Sevilla')
        self.assertEqual(race_registry.display_name('41a Estra Firenze Marathon'), '41a Estra Firenze Marathon')  # an ordinal stays in the name

    def test_grouping_form(self):
        same = [['Roma: Run Rome the Marathon', 'Roma: Run Rome The Marathon'], ['Firenze: 40a Estra Firenze Marathon', 'Firenze: 41a Estra Firenze Marathon'],
                ['Kilkenny: Medieval Marathon 2017', 'Kilkenny: Medieval Marathon'], ['Monterrey: MARATÓN POWERADE MONTERREY', 'Monterrey: Maraton Powerade Monterrey'],
                ['Marrakech: 24ème Marathon International de Marrakech', 'Marrakech: 25ème Marathon International de Marrakech']]
        for a, b in same:
            self.assertEqual(race_registry.grouping_form(a), race_registry.grouping_form(b), (a, b))
        # A sponsor rename, another race of the same city and a Roman-numeral edition do not join by rule.
        for a, b in [['Roma: Run Rome The Marathon', 'Roma: Acea Run Rome The Marathon'], ['Toronto, ON: Toronto Marathon', 'Toronto, ON: Toronto Waterfront Marathon'],
                     ['Palermo: XXI Maratona di Palermo', 'Palermo: XXII Maratona di Palermo']]:
            self.assertNotEqual(race_registry.grouping_form(a), race_registry.grouping_form(b), (a, b))

    def test_build_joins_slugs_and_flags(self):
        rows = editions(('Berlin', 2024, 'Berlin Marathon', 10), ('Berlin', 2025, 'BMW Berlin Marathon', 12),
                        ('Roma: Run Rome the Marathon', 2022, 'x', 5), ('Roma: Run Rome The Marathon', 2026, 'x', 6), ('Roma: Acea Run Rome The Marathon', 2025, 'x', 7),
                        ('Springfield, IL: City Marathon', 2020, 'x', 3), ('Springfield, MO: City Marathon', 2021, 'x', 4), ('XACT: City Marathon', 2019, 'x', 2),
                        ('Old Town, ON: Old Town Marathon - Cancelled', 2019, 'x', 2), ('TBD, TBD: Spring Festival 5K', 2018, 'x', 2))
        reviewed = {'joins': [{'id': 'rome', 'keys': ['Roma: Run Rome the Marathon', 'Roma: Acea Run Rome The Marathon'], 'reason': 'sponsor'}],
                    'flags': [{'key': 'TBD, TBD: Spring Festival 5K', 'flag': 'platform_title_misleads', 'reason': 'test'}]}
        races = {r['race_id']: r for r in race_registry.build(rows, reviewed)}
        self.assertEqual(races['berlin']['name'], 'BMW Berlin Marathon')  # a plain key: the race name of its latest edition
        self.assertEqual((races['berlin']['place'], races['berlin']['flags']), ('Berlin', ['several_race_names']))
        rome = races['run-rome-the-marathon']
        self.assertEqual(rome['keys'], ['Roma: Run Rome the Marathon', 'Roma: Acea Run Rome The Marathon', 'Roma: Run Rome The Marathon'])
        self.assertEqual((rome['joined_by'], rome['place'], rome['first_year'], rome['last_year'], rome['editions']), ('reviewed join rome', 'Roma', 2022, 2026, 3))
        # Three races named "City Marathon": each adds its place; the one without a place adds its first year. The slug is the label's.
        self.assertEqual({r for r in races if r.startswith('city-marathon')}, {'city-marathon-springfield-il', 'city-marathon-springfield-mo', 'city-marathon-2019'})
        self.assertEqual({races[r]['label'] for r in races if r.startswith('city-marathon')},
                         {'City Marathon (Springfield, IL)', 'City Marathon (Springfield, MO)', 'City Marathon (2019)'})
        self.assertEqual((races['city-marathon-2019']['labelled_by'], races['city-marathon-springfield-il']['labelled_by']), ('name and first year', 'name and place'))
        # A plain key is its own label; another race takes its name; every slug is its label's; rows are counted per race.
        self.assertEqual((races['berlin']['label'], races['berlin']['labelled_by'], races['berlin']['rows']), ('Berlin', 'plain key', 22))
        self.assertEqual((rome['label'], rome['labelled_by'], rome['rows']), ('Run Rome The Marathon', 'name', 18))
        self.assertTrue(all(r['race_id'] == r['slug'] == race_registry.slug(r['label']) for r in races.values()))
        self.assertEqual(races['old-town-marathon-cancelled']['flags'], ['cancelled_in_title'])
        self.assertEqual(races['spring-festival-5k']['flags'], ['no_marathon_word_in_title', 'other_event_in_title', 'placeholder_place', 'platform_title_misleads'])
        self.assertIsNone(races['spring-festival-5k']['place'])
        # Two keys with an edition in the same year can never be one race, by rule or by a reviewed join.
        clash = rows + editions(('Roma: Acea Run Rome The Marathon', 2022, 'x', 1))
        with self.assertRaisesRegex(AssertionError, 'two keys hold an edition of 2022'):
            race_registry.build(clash, reviewed)
        with self.assertRaisesRegex(AssertionError, 'joins nothing'):
            race_registry.build(rows, {'joins': [{'id': 'x', 'keys': ['Roma: Run Rome the Marathon', 'Roma: Run Rome The Marathon'], 'reason': 'r'}], 'flags': []})

    def test_reviewed_labels(self):
        rows = editions(('Berlin', 2024, 'Berlin Marathon', 10), ('Roma: Run Rome the Marathon', 2022, 'Run Rome the Marathon — Marathon (ENDU)', 5),
                        ('Roma: Acea Run Rome The Marathon', 2025, 'x', 7), ('Ottawa, ON: Tamarack Ottawa Race Weekend', 2024, 'Tamarack Ottawa Race Weekend - Ottawa Marathon (sportstats)', 9),
                        ('Duluth, MN: Grandma&#39;s Marathon', 2002, 'x', 4), ('Rome, GA: Rome Marathon', 2020, 'x', 3))
        reviewed = {'joins': [{'id': 'rome', 'keys': ['Roma: Run Rome the Marathon', 'Roma: Acea Run Rome The Marathon'], 'reason': 'sponsor'}], 'flags': [],
                    'labels': [{'key': 'Roma: Acea Run Rome The Marathon', 'label': 'Rome'}, {'key': 'Duluth, MN: Grandma&#39;s Marathon', 'label': "Grandma's"},
                               {'key': 'Ottawa, ON: Tamarack Ottawa Race Weekend', 'label': 'Ottawa', 'name': 'Ottawa Marathon'}]}
        races = {r['race_id']: r for r in race_registry.build(rows, reviewed)}
        # A reviewed label gives the slug, and names every key of the race; a reviewed name comes from a race name of an edition.
        self.assertEqual((races['rome']['label'], races['rome']['labelled_by'], len(races['rome']['keys'])), ('Rome', 'reviewed label', 2))
        self.assertEqual((races['ottawa']['label'], races['ottawa']['name']), ('Ottawa', 'Ottawa Marathon'))
        self.assertEqual((races['grandma-s']['label'], races['grandma-s']['name']), ("Grandma's", "Grandma's Marathon"))
        # A reviewed label is fixed: the other race whose name gives the same slug moves, not the reviewed one.
        other = dict(reviewed, labels=reviewed['labels'] + [{'key': 'Rome, GA: Rome Marathon', 'label': 'Rome Marathon'}])
        moved = {r['race_id']: r for r in race_registry.build(rows + editions(('Athens, GA: Rome Marathon', 2021, 'x', 2)), other)}
        self.assertEqual((moved['rome-marathon']['keys'], moved['rome-marathon-athens-ga']['label']), (['Rome, GA: Rome Marathon'], 'Rome Marathon (Athens, GA)'))
        # Nothing is added: a label or name must be a phrase one of the race's keys or race names states; a plain key keeps its name.
        for entry, message in [({'key': 'Roma: Acea Run Rome The Marathon', 'label': 'Italy'}, "reviewed label 'Italy'"),
                               ({'key': 'Roma: Acea Run Rome The Marathon', 'label': 'Rome', 'name': 'Rome City Marathon'}, "reviewed name 'Rome City Marathon'"),
                               ({'key': 'Berlin', 'label': 'Berlin'}, 'a race with a plain key keeps that key'),
                               ({'key': 'Nowhere: X', 'label': 'X'}, 'unknown key')]:
            with self.assertRaisesRegex(AssertionError, message):
                race_registry.build(rows, dict(reviewed, labels=[entry]))
        with self.assertRaisesRegex(AssertionError, 'two reviewed labels'):
            race_registry.build(rows, dict(reviewed, labels=reviewed['labels'] + [{'key': 'Roma: Run Rome the Marathon', 'label': 'Roma'}]))
        with self.assertRaisesRegex(AssertionError, 'share a slug'):
            race_registry.build(rows, dict(reviewed, labels=reviewed['labels'] + [{'key': 'Rome, GA: Rome Marathon', 'label': 'Rome'}]))
        # A reviewed label has at most 30 characters, and no label's slug is a reserved route word (lead ruling of 2026-11-14).
        with self.assertRaisesRegex(AssertionError, 'longer than 30 characters'):
            race_registry.build(rows + editions(('Far, ON: The Very Long Named Marathon Of The North Shore', 2020, 'x', 2)),
                                dict(reviewed, labels=reviewed['labels'] + [{'key': 'Far, ON: The Very Long Named Marathon Of The North Shore', 'label': 'Very Long Named Marathon Of The North'}]))
        with self.assertRaisesRegex(AssertionError, 'reserved route word'):
            race_registry.build(rows + editions(('Far, ON: All', 2020, 'x', 2)), reviewed)
        self.assertTrue(race_registry.states('Lévis-Québec', ['Québec, QC: Marathon SSQ Lévis-Québec']))
        self.assertTrue(race_registry.states('St. George', ['XACT: St. George Marathon']))
        self.assertFalse(race_registry.states('Venice', ['Venezia: Wizz Air Venicemarathon']))   # a whole word, never part of one


    def test_a_series_note_names_the_races_of_one_plain_key(self):
        """Lead ruling D29 (2026-11-14): a plain key that holds two races stays one race; the note says which editions are which."""
        rows = editions(('Twotown', 2015, 'Spring Marathon', 5), ('Twotown', 2016, 'Spring Marathon', 6), ('Twotown', 2019, 'Autumn Marathon', 7),
                        ('Berlin', 2024, 'Berlin Marathon', 10), ('Roma: Run Rome The Marathon', 2026, 'x', 6))
        note = {'key': 'Twotown', 'series': [{'name': 'Spring Marathon', 'first_year': 2015, 'last_year': 2016}, {'name': 'Autumn Marathon', 'first_year': 2019, 'last_year': 2019}]}
        reviewed = {'joins': [], 'flags': [], 'labels': [], 'series': [note]}
        races = {r['race_id']: r for r in race_registry.build(rows, reviewed)}
        self.assertEqual(races['twotown']['series'], [{'name': 'Spring Marathon', 'first_year': 2015, 'last_year': 2016, 'editions': 2},
                                                      {'name': 'Autumn Marathon', 'first_year': 2019, 'last_year': 2019, 'editions': 1}])
        # Nothing else changes: one race, one label, the name of its latest edition; a race without a note has no series.
        self.assertEqual((races['twotown']['label'], races['twotown']['name'], races['twotown']['editions'], 'series' in races['berlin']), ('Twotown', 'Autumn Marathon', 3, False))
        self.assertEqual([race_registry.series_of(races['twotown'], y) for y in (2015, 2016, 2019, 2020)], ['Spring Marathon', 'Spring Marathon', 'Autumn Marathon', None])
        self.assertIsNone(race_registry.series_of(races['berlin'], 2024))
        part = note['series']
        for series, message in (([part[0], {**part[1], 'name': 'Fall Marathon'}], 'carries another race name'), ([part[0]], 'fewer than two series'),
                                ([{**part[0], 'last_year': 2019}, part[1]], 'carries another race name'), ([part[0], {**part[1], 'first_year': 2018}], 'not editions of the key'),
                                ([part[0], part[0], part[1]], 'overlap another series')):
            with self.assertRaisesRegex(AssertionError, message):
                race_registry.build(rows, {**reviewed, 'series': [{'key': 'Twotown', 'series': series}]})
        with self.assertRaisesRegex(AssertionError, 'not a plain key'):
            race_registry.build(rows, {**reviewed, 'series': [{**note, 'key': 'Roma: Run Rome The Marathon'}]})


class FrozenRegistry(unittest.TestCase):
    def setUp(self):
        self.registry = json.loads(race_registry.FROZEN.read_text())

    def test_every_key_in_one_race_and_slugs_unique(self):
        races = self.registry['races']
        keys = [k for r in races for k in r['keys']]
        # 811 races until 2026-11-14, when six reviewed joins came with the labels of lead ruling 5 (M2-C): 805.
        self.assertEqual((len(keys), len(set(keys)), len(races)), (894, 894, 805))
        self.assertEqual(self.registry['keys_sha256'], race_registry.digest(sorted(keys)))
        self.assertEqual(self.registry['races_sha256'], race_registry.digest(races))
        ids = [r['race_id'] for r in races]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(r['race_id'] == r['slug'] == race_registry.slug(r['label']) and r['name'] for r in races))
        labels = [r['label'] for r in races]
        self.assertEqual(len(labels), len(set(labels)))
        # 7,820,439 rows until 2026-11-14; lead ruling D33 writes three rows of London 2026 by reviewed exception.
        self.assertEqual((sum(r['rows'] for r in races), sum(r['editions'] for r in races)), (7820442, 2688))
        self.assertEqual(self.registry['tag'], 'pace-notes-marathon-half-20261113-1113')
        self.assertEqual(self.registry['rule'], race_registry.RULE)

    def test_course_slugs_come_out_unchanged(self):
        races = {r['race_id']: r for r in self.registry['races']}
        for course in COURSE_SLUGS:
            self.assertIn(course, races, course)
            plain = [k for k in races[course]['keys'] if ': ' not in k]
            self.assertEqual([race_registry.slug(k) for k in plain], [course])
        # Every plain key keeps the slug the course rule gives it; Austin's three keys are one race under the course slug.
        for race in races.values():
            for key in race['keys']:
                if ': ' not in key:
                    self.assertEqual(race['slug'], slugify(key))
        self.assertEqual(races['austin']['keys'], ['Austin, TX: Austin Marathon and Half Marathon', 'Austin', 'Austin, TX: Ascension Seton Austin Marathon, Half Marathon & 5K'])
        # The label, which the adapter writes as the pipeline's `city`, is the plain key itself: no course city changes.
        self.assertEqual(sorted(r['label'] for r in races.values() if r['labelled_by'] == 'plain key'), sorted(k for r in races.values() for k in r['keys'] if ': ' not in k))
        self.assertEqual((races['austin']['label'], races['new-york']['label'], races['gold-coast']['label']), ('Austin', 'New York', 'Gold Coast'))
        self.assertEqual((races['austin']['name'], races['new-york']['name'], races['new-york']['place']), ('Austin Marathon', 'New York City Marathon', 'New York'))

    def test_joins_and_names(self):
        races = {r['race_id']: r for r in self.registry['races']}
        expected = self.registry['expected']
        # 16 reviewed joins until 2026-11-14 (single keys 767); the labels of lead ruling 5 (M2-C) came with six more:
        # Glass City, Rimouski, Lake Placid, Irving, Starved Rock Country and Museum of Aviation.
        self.assertEqual(expected['races_by_join'], {'reviewed join': 22, 'rule': 28, 'single': 755})
        self.assertEqual(len(self.registry['reviewed']['joins']), 22)
        self.assertEqual({j['id'] for j in self.registry['reviewed']['joins'][16:]}, {'glass-city', 'rimouski', 'lake-placid', 'irving', 'starved-rock-country', 'museum-of-aviation'})
        self.assertEqual((races['glass-city']['name'], races['rimouski']['name'], races['rimouski']['editions'], races['irving']['keys']),
                         ('Glass City Marathon', 'Marathon de Rimouski', 17, ['Irving, TX: Irving Marathon', 'Irving, TX: Irving Marathon - Full & Half']))
        self.assertTrue(all(j['reason'] and j['evidence']['keyed_runners_in_two_or_more_of_the_keys'] > 0 for j in self.registry['reviewed']['joins']))
        self.assertEqual((len(races['rome']['keys']), races['rome']['name']), (4, 'Run Rome The Marathon'))
        self.assertEqual(races['houston']['place'], 'Houston, TX')
        self.assertEqual((races['los-angeles']['label'], races['los-angeles']['name'], races['los-angeles']['place']), ('Los Angeles', 'Los Angeles Marathon', 'Los Angeles, CA'))
        self.assertEqual((races['grandma-s']['label'], races['grandma-s']['name']), ("Grandma's", "Grandma's Marathon"))
        # Two real races of one city stay two; a key under a platform's name has no place.
        self.assertEqual((races['toronto']['name'], races['toronto-waterfront']['name']), ('Toronto Marathon', 'Toronto Waterfront Marathon'))
        self.assertIsNone(races['philadelphia']['place'])
        self.assertEqual((races['philadelphia']['name'], races['ottawa']['name'], races['mississauga']['name']), ('Philadelphia Marathon', 'Ottawa Marathon', 'Mississauga Marathon'))
        self.assertIn('platform_title_misleads', races['mississauga']['flags'])
        # No name carries an HTML entity or a platform's bracketed id, and none is empty.
        self.assertEqual([r['race_id'] for r in races.values() if '&#' in r['name'] or '&amp;' in r['name']], [])


    def test_labels(self):
        races = self.registry['races']
        # 36 reviewed labels until 2026-11-14 (name 651, name and place 86, name and first year 2); lead ruling 5 (M2-C) added 63.
        self.assertEqual(self.registry['expected']['races_by_label'],
                         {'name': 584, 'name and first year': 1, 'name and place': 85, 'name, place and first year': 2, 'plain key': 34, 'reviewed label': 99})
        self.assertEqual(len(self.registry['reviewed']['labels']), 99)
        # The first 36 are the labels of lead decision D19, unchanged; every reviewed label has at most 30 characters.
        self.assertEqual([e['label'] for e in self.registry['reviewed']['labels'][:3] + self.registry['reviewed']['labels'][33:36]],
                         ['Los Angeles', 'Houston', 'Philadelphia', 'Oklahoma City', 'San Sebastián', 'Querétaro'])
        self.assertTrue(all(len(r['label']) <= race_registry.LABEL_MAX for r in races if r['labelled_by'] == 'reviewed label'))
        self.assertFalse({r['slug'] for r in races} & race_registry.RESERVED_SLUGS)
        # The 60 races with most written rows carry a plain or reviewed label (lead decision D19, 2026-11-14).
        largest = sorted(races, key=lambda r: (-r['rows'], r['race_id']))[:race_registry.LARGEST]
        self.assertEqual({r['labelled_by'] for r in largest}, {'plain key', 'reviewed label'})
        # No label is a release key of another kind: none keeps a platform's name, an HTML entity or the ": " of a composite key.
        self.assertEqual([r['label'] for r in races if ': ' in r['label'] or '&#' in r['label'] or r['label'].startswith('XACT')], [])


    def test_warsaw_is_one_race_with_two_series(self):
        """Lead ruling D29 (2026-11-14): the plain key Warsaw holds two races; the note changes no label or grouping."""
        races = {r['race_id']: r for r in self.registry['races']}
        warsaw = races['warsaw']
        self.assertEqual((warsaw['label'], warsaw['editions'], warsaw['labelled_by']), ('Warsaw', 12, 'plain key'))
        self.assertEqual(warsaw['series'], [{'name': 'Orlen Warsaw Marathon', 'first_year': 2015, 'last_year': 2018, 'editions': 4},
                                            {'name': 'PZU Warsaw Marathon', 'first_year': 2019, 'last_year': 2026, 'editions': 8}])
        self.assertEqual([r['race_id'] for r in races.values() if 'series' in r], ['warsaw'])
        self.assertEqual(self.registry['expected']['races_with_series'], 1)
        note = self.registry['reviewed']['series'][0]
        self.assertEqual(sorted(note['evidence']['weather_row_race_dates']), ['Orlen Warsaw Marathon', 'PZU Warsaw Marathon'])
        self.assertTrue(all(day[5:7] == '04' for day in note['evidence']['weather_row_race_dates']['Orlen Warsaw Marathon']))
        self.assertTrue(all(day[5:7] == '09' for day in note['evidence']['weather_row_race_dates']['PZU Warsaw Marathon']))


if __name__ == '__main__':
    unittest.main()
