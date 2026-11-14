"""Runner lookup v2 across the two languages: the Node verifier (scripts/verify-lookup.cjs) and the source-side
audit (analysis/lookup_audit.py) on the small made-up release of test_runner_lookup.py, and the parity fixture of name
normalisation (scripts/lib/lookup-parity.json) that Python writes and both languages must reproduce.

    python3 analysis/test_runner_lookup_verifier.py --write-parity     regenerate the fixture after adding a case
"""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lookup_audit  # noqa: E402
import lookup_format as fmt  # noqa: E402
import lookup_names as names  # noqa: E402
from test_runner_lookup import small_release  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
VERIFY = REPO / 'scripts/verify-lookup.cjs'
PARITY = REPO / 'scripts/lib/lookup-parity.json'
NODE = shutil.which('node')


def parity_names():
    """Made-up names that between them cover every step of the normalisation, each script the release holds and
    the letters of the fold table. Characters that are hard to see are written by code point."""
    c = chr
    return [
        # punctuation, spacing, codes
        'Smith, José (GBR)', 'smith,jose', "O'Neil-Smith", 'D’Angelo  Ünsal', 'Jose "Jay", Lee\n', 'a\tb\nc', '  spaced   out  ', '', '***', '(USA)', '(usa)',
        'Lee (ESP)\n', 'Lee (ES)', 'Lee (ESPA)', 'Lee(GBR)', 'Lee (GBR) ', 'Lee Lee LEE', 'Lee  (GBR)', 'Lee' + c(0xA0) + '(GBR)', '(Smith), Clara (GBR)', 'St. John', 'J.R.R. Tolkien',
        '1728207887 Martin', '007', 'A1 B2', 'Mc-Donald', 'O`Brien', 'Anne-Marie O’Connor', 'no' + c(0xA0) + 'break', 'zero' + c(0x200B) + 'width', 'soft' + c(0xAD) + 'hyphen',
        'thin' + c(0x2009) + 'space', 'ideographic' + c(0x3000) + 'space', 'line' + c(0x2028) + 'separator', 'bom' + c(0xFEFF) + 'mark', 'unit' + c(0x1F) + 'separator',
        # the fold table, both cases, and letters NFKD leaves that are not folded
        'ŁUKASZ Żółć', 'Łukasz Zolc', 'Søren Ødegård', 'SØREN', 'Æsa Þórsdóttir', 'ÆSA ÞÓRSDÓTTIR', 'Guðrún', 'GUÐRÚN', 'Đorđe Đoković', 'ĐORĐE', 'Œuvre Cœur', 'ŒUVRE',
        'Groß', 'GRO' + c(0x1E9E), 'Straße', 'Işık IŞIK İpek ıi', 'Ħal Għargħur', 'Ŧ ŧ Ŋ ŋ ĸ', 'ǿ Ǿ ǽ Ǽ', 'ɖ ƀ ɨ',
        # compatibility forms and marks
        'Ĳsbrand ĳ', 'ŉ', 'ǅemal Ǆ ǆ', 'ﬁnn ﬂynn ﬀ', 'Ⅷ ⅷ', '½ ¾', '① ② ⑩', 'x²', 'ＬＩ 李 １２', 'e' + c(0x301), 'a' + c(0x308) + 'o' + c(0x30A), c(0x1D400) + c(0x1D41B),
        'José María de la Cruz-Núñez', 'Müller, Jürgen', 'Dvořák Antonín', 'Nguyễn Thị Hương', 'Çağrı Öztürk', 'Ångström', 'Þór', 'Zoë Brontë', 'Ñandú',
        # other scripts
        'Ιωάννης ΠΑΠΑΔΌΠΟΥΛΟΣ', 'ΟΔΥΣΣΕΎΣ Σ', 'ΑΣ ΣΑ ΑΣΑ', 'Иван Ёлкин', 'ЙОСИФ Щукин', 'สมชาย ใจดี', 'กิตติ์', '李 伟', '王小明', 'さとう はなこ', 'ガガ ｶﾞ', 'パク', '김철수', '박 지성',
        'דוד כהן', 'דָּוִד', 'محمد علي', 'مُحَمَّد', 'राम कुमार', '٣ ٤ ५', c(0x20BB7) + '野家', c(0xFA0E) + 'x', c(0x10400) + c(0x10428), 'Runner ' + c(0x1F3C3), 'Kim ' + c(0x2764) + c(0xFE0F),
        c(0x20BB7) + ' ' + c(0xFA0E) + ' z a', 'b ' + c(0x10428) + ' ' + c(0xFA0E),
    ]


def parity_document():
    return {'document': ('Name normalisation and search words (analysis/lookup_names.py), written by analysis/test_runner_lookup_verifier.py --write-parity. '
                         'Python and scripts/lib/lookup.cjs must each reproduce every entry; every name is made up.'),
            'cases': [{'name': name, 'normalized': names.normalize_name(name), 'words': names.search_words(name)} for name in parity_names()]}


class Parity(unittest.TestCase):
    def test_the_fixture_is_what_python_gives(self):
        self.assertEqual(json.loads(PARITY.read_text()), parity_document(), 'regenerate with: python3 analysis/test_runner_lookup_verifier.py --write-parity')

    def test_the_fast_path_and_the_written_out_steps_agree(self):
        for name in parity_names():
            self.assertEqual(names.normalize_name(name), names.normalize_name_reference(name), repr(name))

    def test_some_entries_by_hand(self):
        cases = {case['name']: case for case in parity_document()['cases']}
        self.assertEqual(cases['GRO' + chr(0x1E9E)]['normalized'], 'gross')
        self.assertEqual(cases['Æsa Þórsdóttir']['words'], ['aesa', 'thorsdottir'])
        self.assertEqual(cases['(Smith), Clara (GBR)']['words'], ['clara', 'smith'])
        self.assertEqual(cases['Lee (ESPA)']['words'], ['espa', 'lee'])
        self.assertEqual(cases['Lee (GBR) ']['words'], ['gbr', 'lee'])                 # the code must end the name
        self.assertEqual(cases['Lee' + chr(0xA0) + '(GBR)']['words'], ['lee'])
        self.assertEqual(cases['½ ¾']['normalized'], '1 2 3 4')
        self.assertEqual(cases['ガガ ｶﾞ']['normalized'], 'カカ カ')                        # the voicing marks go, as in the browser
        self.assertEqual(cases[chr(0x20BB7) + ' ' + chr(0xFA0E) + ' z a']['words'], ['a', 'z', chr(0xFA0E), chr(0x20BB7)])   # code point order

    @unittest.skipUnless(NODE, 'node is not installed')
    def test_javascript_reproduces_the_fixture(self):
        script = ("const L = require(process.argv[1]); const cases = require(process.argv[2]).cases; let bad = 0;"
                  "for (const c of cases) if (L.normalizeName(c.name) !== c.normalized || JSON.stringify(L.searchWords(c.name)) !== JSON.stringify(c.words)) { bad++; console.log(JSON.stringify(c.name)); }"
                  "process.exit(bad ? 1 : 0);")
        done = subprocess.run([NODE, '-e', script, str(REPO / 'scripts/lib/lookup.cjs'), str(PARITY)], capture_output=True, text=True)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)


@unittest.skipUnless(NODE, 'node is not installed')
class Verifier(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        cls.release = small_release(cls.root / 'release')
        cls.build = cls.root / 'build'
        cls.release.build(cls.build / 'runners')

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def verify(self, *arguments, root=None):
        return subprocess.run([NODE, str(VERIFY), '--data-root', str(root or self.build), *arguments], capture_output=True, text=True, cwd=REPO)

    def audit(self, *arguments, build=None):
        return lookup_audit.main(['--core', str(self.release.core), '--links', str(self.release.links_path), '--status', str(self.release.status_path),
                                  '--identity', str(self.release.identity_path), '--registry', str(self.release.registry_path),
                                  '--half-records', str(self.release.half_path), '--placeholders', str(self.release.placeholders_path),
                                  '--temp', str(self.root / 'audit-temp'), *arguments] + (['--build', str(build)] if build else []))

    def test_the_build_verifies(self):
        done = self.verify('--fixture', '--allow-provisional')
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertIn('47 results once each in 37 profiles', done.stdout)
        self.assertIn('all 38 search names typed in full are reached', done.stdout)
        self.assertIn('FIXTURE MODE', done.stdout)

    def test_a_provisional_build_and_a_fixture_are_refused_as_published_builds(self):
        done = self.verify('--fixture')
        self.assertEqual(done.returncode, 1)
        self.assertIn('the build is provisional (cohort, half_registry, race_registry)', done.stderr)
        done = self.verify('--allow-provisional')                # without --fixture: the pin, the published index rules, the checked-in files
        self.assertEqual(done.returncode, 1)
        self.assertIn('rules.index', done.stderr)

    def test_the_cohort_binding_is_checked(self):
        cohort = self.release.write_cohort()
        bound = self.root / 'bound'
        self.release.build(bound / 'runners', cohort_path=cohort)
        done = self.verify('--fixture', '--allow-provisional', '--cohort', str(cohort), root=bound)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        other = self.release.write_cohort('cohort-other', lambda document: document['editions'][0].update(raw=12))
        done = self.verify('--fixture', '--allow-provisional', '--cohort', str(other), root=bound)
        self.assertEqual(done.returncode, 1)
        self.assertIn('the cohort manifest is not the one this build names', done.stderr)

    def test_every_mutation_fails(self):
        done = self.verify('--fixture', '--allow-provisional', '--self-test')
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertIn('every mutation', done.stdout)

    def test_the_rows_that_must_not_appear(self):
        keys = self.root / 'never-shown.json'
        self.assertEqual(self.audit('--never-shown', str(keys)), 0)
        listed = json.loads(keys.read_text())['kinds']
        self.assertEqual(listed['marathon'], {'left_out': {'f': [51, 52]}, 'placeholder_flagged': {'f': [56]}, 'placeholder_listed': {'f': [57]}})
        self.assertEqual(listed['half'], {'left_out': {'h': [53, 54, 55]}, 'unnamed': {'h': [58, 59]}})
        done = self.verify('--fixture', '--allow-provisional', '--never-shown', str(keys))
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertIn('None of the 9 rows that must not appear is in a shard', done.stdout)
        document = json.loads(keys.read_text())
        document['kinds']['marathon']['left_out']['f'] = [11, 52]              # a row that is listed, and one row fewer
        keys.write_text(json.dumps(document))
        done = self.verify('--fixture', '--allow-provisional', '--never-shown', str(keys))
        self.assertEqual(done.returncode, 1)
        self.assertIn('1 rows that must not appear are in a shard', done.stderr)

    def test_the_audit_passes_and_sees_a_changed_value(self):
        self.assertEqual(self.audit(build=self.build), 0)
        changed = self.root / 'changed'
        shutil.copytree(self.build, changed)
        path = changed / 'runners' / fmt.shard_path(0)
        data = fmt.read_gz(path)
        data['f'][0] += 1                                                      # one finish, one second
        path.write_bytes(fmt.compress(fmt.encode(data)))
        self.assertEqual(self.audit(build=changed), 1)
        other = self.root / 'other'
        shutil.copytree(self.build, other)
        path = other / 'runners' / fmt.shard_path(0)
        data = fmt.read_gz(path)
        data['c'] = '3' + data['c'][1:]                                        # a high link shown as medium
        path.write_bytes(fmt.compress(fmt.encode(data)))
        self.assertEqual(self.audit(build=other), 1)


if __name__ == '__main__':
    if sys.argv[1:] == ['--write-parity']:
        PARITY.write_text(json.dumps(parity_document(), indent=1, ensure_ascii=True) + '\n')
        print(f'wrote {PARITY}')
    else:
        unittest.main()
