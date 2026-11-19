"""Runner lookup v2 across the two languages: the Node verifier (scripts/verify-lookup.cjs), the source-side audit
(analysis/lookup_audit.py) and the importer (analysis/import_runner_lookup.py) on the small made-up release of
test_runner_lookup.py, and the parity fixture of name normalisation (scripts/lib/lookup-parity.json) that Python writes
and both languages must reproduce.

    python3 analysis/test_runner_lookup_verifier.py --write-parity     regenerate the fixture after adding a case
"""
import contextlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_runner_lookup as importer  # noqa: E402
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

    def audit(self, *arguments, build=None, release=None):
        release = release or self.release
        return lookup_audit.main(['--core', str(release.core), '--links', str(release.links_path), '--status', str(release.status_path),
                                  '--identity', str(release.identity_path), '--registry', str(release.registry_path),
                                  '--placeholders', str(release.placeholders_path),
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
        self.assertIn('the build is provisional (cohort, half_registry, race_notes, race_registry)', done.stderr)
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

    def test_a_node_script_can_ask_the_lookup(self):
        script = ("const { openLookup } = require(process.argv[1]); const lookup = openLookup(process.argv[2]);"
                  "const smith = lookup.search('smith', 1), begins = lookup.search('smi', 2), first = lookup.profile(0, 0);"
                  "console.log(JSON.stringify({ exists: ['Ada Smith', 'SMITH, ada (USA)', 'Lee, José', 'Jay Lee Jose', 'Ada', 'Smith', 'Berlin', '***'].map(text => lookup.nameExists(text)),"
                  " alone: [smith.plan.alone, smith.plan.names, smith.rows.length], begins: begins.rows.length, names: first.names.length, results: first.results.map(r => r.key),"
                  " refused: lookup.search('smi', 2, 10).refused }));")
        done = subprocess.run([NODE, '-e', script, str(REPO / 'scripts/lib/lookup-files.cjs'), str(self.build / 'runners')], capture_output=True, text=True)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(json.loads(done.stdout), {
            'exists': [True, True, True, True, False, False, False, False],       # a name is a set of search words; a part of one is not a name
            'alone': ['smith', 6, 0], 'begins': 6, 'names': 3, 'results': ['f11', 'f13', 'h12'], 'refused': True})

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

    def test_an_edition_set_aside_is_checked_from_both_sides(self):
        release = small_release(self.root / 'aside-release', set_aside=True)
        build = self.root / 'aside'
        release.build(build / 'runners', race_notes_path=release.race_notes_path)
        keys, receipt = self.root / 'never-shown-aside.json', self.root / 'audit-aside.json'
        notes = ['--race-notes', str(release.race_notes_path)]
        self.assertEqual(self.audit(*notes, '--never-shown', str(keys), '--receipt', str(receipt), build=build, release=release), 0)
        self.assertEqual(json.loads(keys.read_text())['kinds']['marathon']['set_aside'], {'f': [91, 92]})
        self.assertEqual(json.loads(receipt.read_text())['finish_text_not_a_time'], {'marathon': 0, 'half': 1})
        done = self.verify('--fixture', '--allow-provisional', '--never-shown', str(keys), root=build)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertIn('None of the 11 rows that must not appear is in a shard', done.stdout)
        # An audit that is not told of the notes expects the two rows to be listed; a build that listed them fails the audit that is.
        self.assertEqual(self.audit(build=build, release=release), 1)
        listed = self.root / 'aside-listed'
        release.build(listed / 'runners')
        self.assertEqual(self.audit(*notes, build=listed, release=release), 1)
        self.assertEqual(self.audit(build=listed, release=release), 0)
        # The manifest's own statement of the edition is checked against the files.
        manifest = json.loads((build / 'runners/manifest.json').read_text())
        for at, (change, message) in enumerate([(lambda m: m['counts']['marathon']['set_aside'].update(rows=1), 'set_aside is not {rows, editions'),
                                (lambda m: m['counts']['marathon']['set_aside'].update(rows=0, editions=[]), 'release rows are not the rows left out'),
                                (lambda m: m['counts']['marathon']['set_aside']['editions'][0].__setitem__(1, 2016), 'rows of the edition set aside (2016)'),
                                (lambda m: m['inputs'].pop('race-notes.json'), 'names no race notes')]):
            changed = self.root / f'aside-changed-{at}'
            shutil.copytree(build, changed)
            document = json.loads(json.dumps(manifest))
            change(document)
            (changed / 'runners/manifest.json').write_bytes(fmt.encode(document))
            done = self.verify('--fixture', '--allow-provisional', root=changed)
            self.assertEqual(done.returncode, 1, message)
            self.assertIn(message, done.stderr)

    def test_the_audit_passes_and_sees_a_changed_value(self):
        self.assertEqual(self.audit(build=self.build), 0)
        # Shard 0 opens with person 1: the marathon 11 (Berlin 2019, high, counted), the marathon 13 and the half 12.
        def swap(text, at, letter):
            return text[:at] + letter + text[at + 1:]
        changes = {
            'the column f differs': lambda d: d['f'].__setitem__(0, d['f'][0] + 1),                 # one finish, one second
            'the column c differs': lambda d: d.__setitem__('c', swap(d['c'], 0, '3')),             # a high link shown as medium
            'the column name differs': lambda d: d['n'].__setitem__(0, 'Lee, Jose (ESP)'),          # an accent lost
            'the column x differs': lambda d: d.__setitem__('x', swap(d['x'], 0, 'F')),
            'the column a differs': lambda d: d['a'].__setitem__(0, 35),
            'the column st differs': lambda d: d.__setitem__('s', swap(d['s'], 0, '1')),            # counted shown as own record
            'the column t0 differs': lambda d: (d['d'].__setitem__(0, d['d'][0] + 1), d['d'].__setitem__(1, d['d'][1] - 1)),   # the 5 km time alone
            'results sit in an edition of another race': lambda d: d['e'].__setitem__(0, d['e'][0] + 1),   # Berlin 2019 filed as Berlin 2021
        }
        for at, (message, change) in enumerate(changes.items()):
            changed = self.root / f'changed-{at}'
            shutil.copytree(self.build, changed)
            path = changed / 'runners' / fmt.shard_path(0)
            data = fmt.read_gz(path)
            change(data)
            path.write_bytes(fmt.compress(fmt.encode(data)))
            with contextlib.redirect_stderr(io.StringIO()) as said:
                self.assertEqual(self.audit(build=changed), 1, message)
            self.assertIn(message, said.getvalue())
        # The same values in other profiles: person 1 cut in two, persons 1 and 2 made one; and a result taken out.
        def split(d):
            d['k'][0:1], d['u'][0:1] = [2, 1], [2, 1]            # the half result (its third, under its third name) becomes a profile of its own
            d['j'][2] = 0

        def join(d):
            for at in range(d['k'][0], d['k'][0] + d['k'][1]):
                d['j'][at] += d['u'][0]
            d['k'][0:2], d['u'][0:2] = [d['k'][0] + d['k'][1]], [d['u'][0] + d['u'][1]]

        def drop(d):
            points = bin(d['m'][0]).count('1')                  # its first result, with its recorded checkpoints
            d['k'][0] -= 1
            for column in ('e', 'i', 'f', 'a', 'j', 'm'):
                del d[column][0]
            for column in ('x', 'c', 's'):
                d[column] = d[column][1:]
            del d['d'][:points]
            d['j'][0], d['j'][1] = 1, 2                           # the two that stay keep their names
        for at, (message, change) in enumerate({'a person is spread over two profiles': split, 'a profile joins two persons': join,
                                                'listed rows of the release are in no shard': drop}.items()):
            changed = self.root / f'moved-{at}'
            shutil.copytree(self.build, changed)
            path = changed / 'runners' / fmt.shard_path(0)
            data = fmt.read_gz(path)
            change(data)
            path.write_bytes(fmt.compress(fmt.encode(data)))
            with contextlib.redirect_stderr(io.StringIO()) as said:
                self.assertEqual(self.audit(build=changed), 1, message)
            self.assertIn(message, said.getvalue())

    def test_the_importer_publishes_only_what_the_verifier_passes(self):
        source = self.root / 'to-import'
        shutil.copytree(self.build, source)
        (source / 'runners' / 'beside-the-chain.txt').write_text('not a file of the lookup')
        destination = self.root / 'published'
        (destination / 'runners').mkdir(parents=True)
        (destination / 'runners' / 'manifest.json').write_text('{"the build before": true}')
        (destination / 'live.json').write_text('{}')
        real, commands = subprocess.run, []

        def verifier(*extra):
            def run(command, **options):
                commands.append(command)
                return real(command + list(extra), **{**options, 'capture_output': True})
            return run
        # As it stands the made-up build is provisional and of another release than the pin: the verifier refuses the
        # staged copy, nothing is published and nothing is left beside the destination's own files.
        with mock.patch.object(importer.subprocess, 'run', verifier()), self.assertRaises(subprocess.CalledProcessError):
            importer.run(source, destination)
        self.assertEqual(sorted(path.name for path in destination.iterdir()), ['live.json', 'runners'])
        self.assertEqual((destination / 'runners' / 'manifest.json').read_text(), '{"the build before": true}')
        self.assertEqual(commands[0][:3], ['node', str(REPO / 'scripts/verify-lookup.cjs'), '--data-root'])
        self.assertFalse({'--allow-provisional', '--fixture'} & set(commands[0]))      # the importer never asks for less
        # Verified as the tests' build, the staged copy replaces the build before it: the chain's files and no other.
        keys = self.root / 'never-shown-import.json'
        self.assertEqual(self.audit('--never-shown', str(keys)), 0)
        with mock.patch.object(importer.subprocess, 'run', verifier('--fixture', '--allow-provisional')), contextlib.redirect_stdout(io.StringIO()) as said:
            importer.run(source, destination, never_shown=keys)
        self.assertIn('Imported the runner lookup', said.getvalue())
        self.assertEqual(commands[1][-2:], ['--never-shown', str(keys.resolve())])
        self.assertNotEqual(commands[1][3], str(source))                               # what is verified is the copy
        published = destination / 'runners'
        files = sorted(str(path.relative_to(published)) for path in published.rglob('*') if path.is_file())
        self.assertEqual(files, sorted(importer.members(json.loads((source / 'runners/manifest.json').read_text()))))
        for name in files:
            self.assertEqual((published / name).read_bytes(), (source / 'runners' / name).read_bytes(), name)
        self.assertEqual(sorted(path.name for path in destination.iterdir()), ['live.json', 'runners'])


if __name__ == '__main__':
    if sys.argv[1:] == ['--write-parity']:
        PARITY.write_text(json.dumps(parity_document(), indent=1, ensure_ascii=True) + '\n')
        print(f'wrote {PARITY}')
    else:
        unittest.main()
