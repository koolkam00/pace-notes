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
        # Three races named "City Marathon": each adds its place; the one without a place adds its first year.
        self.assertEqual({r for r in races if r.startswith('city-marathon')}, {'city-marathon-springfield-il', 'city-marathon-springfield-mo', 'city-marathon-2019'})
        self.assertEqual(races['old-town-marathon-cancelled']['flags'], ['cancelled_in_title'])
        self.assertEqual(races['spring-festival-5k']['flags'], ['no_marathon_word_in_title', 'other_event_in_title', 'placeholder_place', 'platform_title_misleads'])
        self.assertIsNone(races['spring-festival-5k']['place'])
        # Two keys with an edition in the same year can never be one race, by rule or by a reviewed join.
        clash = rows + editions(('Roma: Acea Run Rome The Marathon', 2022, 'x', 1))
        with self.assertRaisesRegex(AssertionError, 'two keys hold an edition of 2022'):
            race_registry.build(clash, reviewed)
        with self.assertRaisesRegex(AssertionError, 'joins nothing'):
            race_registry.build(rows, {'joins': [{'id': 'x', 'keys': ['Roma: Run Rome the Marathon', 'Roma: Run Rome The Marathon'], 'reason': 'r'}], 'flags': []})


class FrozenRegistry(unittest.TestCase):
    def setUp(self):
        self.registry = json.loads(race_registry.FROZEN.read_text())

    def test_every_key_in_one_race_and_slugs_unique(self):
        races = self.registry['races']
        keys = [k for r in races for k in r['keys']]
        self.assertEqual((len(keys), len(set(keys)), len(races)), (894, 894, 811))
        self.assertEqual(self.registry['keys_sha256'], race_registry.digest(sorted(keys)))
        self.assertEqual(self.registry['races_sha256'], race_registry.digest(races))
        ids = [r['race_id'] for r in races]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(r['race_id'] == r['slug'] and r['slug'] == race_registry.slug(r['slug']) and r['name'] for r in races))
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
        self.assertEqual((races['austin']['name'], races['new-york']['name'], races['new-york']['place']), ('Austin Marathon', 'New York City Marathon', 'New York'))

    def test_joins_and_names(self):
        races = {r['race_id']: r for r in self.registry['races']}
        expected = self.registry['expected']
        self.assertEqual(expected['races_by_join'], {'reviewed join': 16, 'rule': 28, 'single': 767})
        self.assertEqual(len(self.registry['reviewed']['joins']), 16)
        self.assertTrue(all(j['reason'] and j['evidence']['keyed_runners_in_two_or_more_of_the_keys'] > 0 for j in self.registry['reviewed']['joins']))
        self.assertEqual(len(races['run-rome-the-marathon']['keys']), 4)
        self.assertEqual(races['houston-marathon']['place'], 'Houston, TX')
        self.assertEqual((races['los-angeles-marathon']['name'], races['los-angeles-marathon']['place']), ('Los Angeles Marathon', 'Los Angeles, CA'))
        self.assertEqual(races['grandma-s-marathon']['name'], "Grandma's Marathon")
        # Two real races of one city stay two; a key under a platform's name has no place.
        self.assertIn('toronto-marathon', races)
        self.assertIn('toronto-waterfront-marathon', races)
        self.assertIsNone(races['philadelphia-marathon-race-weekend']['place'])
        self.assertIn('platform_title_misleads', races['mississauga-marathon-virtual']['flags'])
        # No name carries an HTML entity or a platform's bracketed id, and none is empty.
        self.assertEqual([r['race_id'] for r in races.values() if '&#' in r['name'] or '&amp;' in r['name']], [])


if __name__ == '__main__':
    unittest.main()
