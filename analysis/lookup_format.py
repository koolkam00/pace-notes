"""Runner lookup v2: the file format. Encoders, the leaf cutter and decoders, with no data access of their own.

    public/data/runners/
      manifest.json              the root of the SHA-256 chain
      editions.json.gz           every edition with a listed result, once
      index/p/NN.json.gz         directory pages of 64 leaves
      index/NNNNN.json.gz        leaves of the name index
      profiles/p/NN.json.gz      directory pages of 64 shards
      profiles/XXX.json.gz       4,096 profile shards (three hex digits)

Every file but the manifest is gzip JSON (level 9, mtime 0) written with `encode`; none repeats the release tag.
docs/RUNNERS_AND_REPORT.md is the contract and has one worked example per file; scripts/lib/lookup.cjs is the Node
decoder and search planner the browser client ports. This module is what analysis/build_runner_lookup.py writes with
and what the tests and the source-side audit read with.
"""
from __future__ import annotations

import gzip
import hashlib
import json

from lookup_names import separator

SCHEMA_VERSION = 2
TIME_UNIT_MS = 1000
POINTS_KM = {'marathon': [5, 10, 15, 20, 25, 30, 35, 40, 42.195], 'half': [5, 10, 15, 20, 21.0975]}
CHECKPOINTS = {'marathon': 8, 'half': 4}            # recorded checkpoints before the finish
PROFILE_SHARDS = 4096
PAGE_SIZE = 64                                        # leaves or shards per directory page
# The name index (design section 3.4; frozen with the format). A word is heavy when more than `heavy_over` search
# names contain it. `heavy_over + min_rows <= max_rows`, so a light word always fits in one leaf.
INDEX_RULES = {'target_rows': 6000, 'max_rows': 8000, 'min_rows': 2000, 'heavy_over': 6000, 'order': 'code point'}
# What the client may load for one search (bytes of leaves, compressed).
SEARCH_AUTO = 300_000
SEARCH_HARD_CAP = 1_000_000

TIERS = ['stamped', 'stamped_weaker_source', 'partial', 'held_for_review', 'unverified']     # digit = position
# Link codes of a result (`c`). 1 to 3 are confirmed links (the person keys a runner under the one identity rule);
# 4 to a are possible matches by tier; b, c, d are tiers 1, 2, 3 of a person who fails a screen (shown as possible).
LINK_TIERS = {'high_elite': '1', 'high': '2', 'medium': '3', 'medium_variant': '4', 'low': '5', 'low_noage': '6',
              'low_noage_series': '7', 'low_nosex': '8', 'low_city_pace': '9', 'low_carryover': 'a'}
LINK_SCREENED = {'1': 'b', '2': 'c', '3': 'd'}
LINK_CODES = '0123456789abcd'
CONFIRMED = '123'
# Marathon record status (`s`), after ruling R4: 0 counted, 1 own record, 2 to 6 limited (recorded times only).
STATUS_CODES = '0123456'
STATUS_WORDS = {
    '0': 'counted: pooled figures, peers and its own pacing view',
    '1': 'own record: its own pacing view with the tier label; no peers; in no pooled figure',
    '2': 'limited: duplicate of another record',
    '3': 'limited: a checkpoint or the finish is missing',
    '4': 'limited: times not in order',
    '5': 'limited: outside the timing bounds',
    '6': 'limited: its edition gives recorded times only',
}
NO_COMPARISON = {'0': 'none', '1': 'gross (gun) times', '2': 'course suspected short'}


def encode(value):
    """The one JSON form of every file: UTF-8, no escaping of non-ASCII, no spaces, a final newline."""
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')


def compress(body):
    return gzip.compress(body, compresslevel=9, mtime=0)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def write_gz(path, body):
    """Write one gzip JSON file from its uncompressed body. Returns (compressed bytes, sha256 of the compressed file)."""
    data = compress(body)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return len(data), sha256(data)


def read_gz(path):
    return json.loads(gzip.decompress(path.read_bytes()).decode('utf-8'))


def leaf_path(number):
    return f'index/{number:05d}.json.gz'


def index_page_path(number):
    return f'index/p/{number:02d}.json.gz'


def shard_path(number):
    return f'profiles/{number:03x}.json.gz'


def profile_page_path(number):
    return f'profiles/p/{number:02d}.json.gz'


def unlinked_key(source_db_letter, record_id):
    """The text an unlinked result's shard is hashed from: the source database letter and the record id."""
    return f'{source_db_letter}:{record_id}'


def unlinked_shard(source_db_letter, record_id):
    """Shard of an unlinked result: the first three hex digits of sha256("f:<id>") or sha256("h:<id>")."""
    return int(hashlib.sha256(unlinked_key(source_db_letter, record_id).encode()).hexdigest()[:3], 16)


# ---------------------------------------------------------------------------------------------------------------
# Profile shards
# ---------------------------------------------------------------------------------------------------------------

class ShardBody:
    """One profile shard as columns. Results arrive in profile order; `add` starts a profile when told to."""

    def __init__(self):
        self.k, self.u, self.n = [], [], []
        self.e, self.i, self.f, self.x, self.a, self.c, self.j, self.s, self.m, self.d = [], [], [], [], [], [], [], [], [], []
        self._names = None

    def start_profile(self):
        self.k.append(0)
        self.u.append(0)
        self._names = {}

    def add(self, edition, id_offset, finish, sex, age, link, name, status, checkpoints):
        """One result of the open profile. `checkpoints`: the recorded checkpoint times before the finish, None where
        none was recorded. Returns True when `name` is new in the profile."""
        names = self._names
        at = names.get(name)
        new = at is None
        if new:
            at = names[name] = len(names)
            self.n.append(name)
            self.u[-1] += 1
        self.k[-1] += 1
        self.e.append(edition)
        self.i.append(id_offset)
        self.f.append(-1 if finish is None else finish)
        self.x.append(sex)
        self.a.append(age)
        self.c.append(link)
        self.j.append(at)
        self.s.append(status)
        mask, previous = 0, 0
        for bit, value in enumerate(checkpoints):
            if value is not None:
                mask |= 1 << bit
                self.d.append(value - previous)
                previous = value
        self.m.append(mask)
        return new

    def profiles(self):
        return len(self.k)

    def results(self):
        return len(self.e)

    def body(self):
        return encode({'v': SCHEMA_VERSION, 'k': self.k, 'u': self.u, 'n': self.n, 'e': self.e, 'i': self.i, 'f': self.f,
                       'x': ''.join(self.x), 'a': self.a, 'c': ''.join(self.c), 'j': self.j, 's': ''.join(self.s),
                       'm': self.m, 'd': self.d})


def decode_shard(data, editions=None):
    """A shard body (the parsed JSON) as a list of profiles: {'names': [...], 'results': [{...}]}. With `editions`
    (decode_editions' rows) each result also carries 'id', 'db', 'distance' and its 'times' (None where not recorded)."""
    assert data['v'] == SCHEMA_VERSION
    results = len(data['e'])
    for column in ('i', 'f', 'x', 'a', 'c', 'j', 's', 'm'):
        assert len(data[column]) == results, f'profile shard: column {column} has another length'
    assert sum(data['k']) == results and sum(data['u']) == len(data['n']) and len(data['k']) == len(data['u'])
    assert sum(bin(mask).count('1') for mask in data['m']) == len(data['d'])
    out, at, name_at, gap_at = [], 0, 0, 0
    for count, names in zip(data['k'], data['u']):
        profile = {'names': data['n'][name_at:name_at + names], 'results': []}
        for r in range(at, at + count):
            mask = data['m'][r]
            row = {'e': data['e'][r], 'i': data['i'][r], 'f': data['f'][r], 'x': data['x'][r], 'a': data['a'][r],
                   'c': data['c'][r], 'j': data['j'][r], 's': data['s'][r], 'm': mask,
                   'name': profile['names'][data['j'][r]]}
            gaps = data['d'][gap_at:gap_at + bin(mask).count('1')]
            gap_at += len(gaps)
            row['gaps'] = gaps
            if editions is not None:
                edition = editions[row['e']]
                row['distance'], row['db'] = edition['distance'], edition['db']
                row['id'] = row['i'] + 256 * edition['q']
                row['times'] = result_times(mask, gaps, row['f'], edition['distance'])
            profile['results'].append(row)
        at += count
        name_at += names
        out.append(profile)
    return out


def result_times(mask, gaps, finish, distance):
    """Cumulative times at the distance's points, None where not recorded; the last is the finish."""
    times, total, used = [], 0, 0
    for bit in range(CHECKPOINTS[distance]):
        if mask >> bit & 1:
            total += gaps[used]
            used += 1
            times.append(total)
        else:
            times.append(None)
    assert used == len(gaps) and mask >> CHECKPOINTS[distance] == 0
    return times + [None if finish < 0 else finish]


# ---------------------------------------------------------------------------------------------------------------
# Editions
# ---------------------------------------------------------------------------------------------------------------

def editions_body(races, rows, reasons):
    """`races`: [[distance letter, label, display name]]. `rows`: one dict per edition, in order, with keys race, year,
    tier, splits, db, no_comparison, q, cohort, reason, unlisted. `reasons`: the distinct reason sentences."""
    return encode({
        'v': SCHEMA_VERSION, 'races': races,
        'sr': [r['race'] for r in rows], 'y': [r['year'] for r in rows],
        't': ''.join(str(r['tier']) for r in rows), 'sp': ''.join('1' if r['splits'] else '0' for r in rows),
        'db': ''.join(r['db'] for r in rows), 'g': ''.join(str(r['no_comparison']) for r in rows),
        'q': [r['q'] for r in rows], 'cx': [r['cohort'] for r in rows], 'rs': [r['reason'] for r in rows],
        'nl': [r['unlisted'] for r in rows], 'reasons': reasons,
    })


def decode_editions(data):
    """editions.json.gz (parsed) as one dict per edition, in index order."""
    assert data['v'] == SCHEMA_VERSION
    count = len(data['sr'])
    for column in ('y', 't', 'sp', 'db', 'g', 'q', 'cx', 'rs', 'nl'):
        assert len(data[column]) == count, f'editions: column {column} has another length'
    out = []
    for at in range(count):
        letter, label, name = data['races'][data['sr'][at]]
        out.append({
            'index': at, 'distance': 'marathon' if letter == 'm' else 'half', 'city': label, 'race': name, 'year': data['y'][at],
            'tier': int(data['t'][at]), 'splits': data['sp'][at] == '1', 'db': data['db'][at], 'no_comparison': int(data['g'][at]),
            'q': data['q'][at], 'context': None if data['cx'][at] < 0 else data['cx'][at],
            'reason': None if data['rs'][at] < 0 else data['reasons'][data['rs'][at]], 'unlisted': data['nl'][at],
        })
    return out


# ---------------------------------------------------------------------------------------------------------------
# The name index
# ---------------------------------------------------------------------------------------------------------------

LEAF_COLUMNS = ('n', 'b', 'o', 'e', 'y', 's', 'm', 'h', 'q', 'p')


def leaf_body(rows):
    """`rows`: postings (word, partner, shown, shard, position, e, y, s, m, h, q, p) in order."""
    body = {'v': SCHEMA_VERSION}
    for at, column in enumerate(LEAF_COLUMNS):
        body[column] = [row[at + 2] for row in rows]
    return encode(body)


def decode_leaf(data):
    assert data['v'] == SCHEMA_VERSION
    count = len(data['n'])
    for column in LEAF_COLUMNS:
        assert len(data[column]) == count, f'index leaf: column {column} has another length'
    return [{column: data[column][at] for column in LEAF_COLUMNS} for at in range(count)]


class LeafCutter:
    """Cuts the sorted postings into leaves and gives each its directory key.

    Postings arrive in order of (word, partner, shown name, shard, position). The rules (design section 3.4):
    - a light word's postings are never split: the open leaf is closed first when the word would take it past
      `max_rows`, or past `target_rows` when it already holds `min_rows`;
    - inside a heavy word whole (word, partner) groups are added and the leaf is closed when it reaches the target; a
      group is split only when it cannot fit (an open leaf under `min_rows` meeting a group that would pass
      `max_rows`, or a group over `max_rows`), and is then cut where the leaf reaches the target; a leaf that starts
      inside a group is marked `c`;
    - a last leaf under `min_rows` is merged into the one before it.
    So every leaf of a build with more than `min_rows` postings holds `min_rows` to `max_rows + min_rows - 1` rows.

    The key of a leaf is (word, partner, c). A leaf that starts a word has partner '' and, as its word, the shortest
    beginning of that word that still sorts after the last word of the leaf before it; a leaf that starts inside a
    heavy word has that word and the shortest beginning of its first partner that sorts after the last partner before
    it; a leaf that starts inside a group has the group's word and partner and c = 1. The first leaf's key is ('', '').
    """

    def __init__(self, heavy, emit, rules=INDEX_RULES):
        self.heavy, self.emit = heavy, emit
        self.target, self.max, self.min = rules['target_rows'], rules['max_rows'], rules['min_rows']
        if not (0 < self.min <= self.target <= self.max and rules['heavy_over'] + self.min <= self.max):
            raise ValueError('index rules: need 0 < min_rows <= target_rows <= max_rows and heavy_over + min_rows <= max_rows')
        self.leaf, self.group, self.group_key, self.group_heavy = [], [], None, False
        self.pending, self.previous_last, self.last_key, self.rows = None, None, None, 0

    def add(self, row):
        """`row`: a tuple starting with (word, partner)."""
        word, partner = row[0], row[1]
        if self.last_key is not None and (word, partner) < self.last_key:
            raise ValueError(f'postings out of order at {(word, partner)!r}')
        self.last_key = (word, partner)
        heavy = word in self.heavy
        if not heavy and partner != '':
            raise ValueError(f'a light word has a partner: {(word, partner)!r}')
        key = (word, partner) if heavy else (word,)
        if key != self.group_key:
            self._close_group()
            self.group_key, self.group_heavy = key, heavy
        self.group.append(row)
        self.rows += 1

    def finish(self):
        self._close_group()
        if self.leaf:
            if self.pending is not None and len(self.leaf) < self.min:
                self.pending['rows'].extend(self.leaf)      # the short tail joins the leaf before it
                self.leaf = []
            else:
                self._close_leaf()
        if self.pending is not None:
            self.emit(self.pending)
            self.pending = None

    def _close_group(self):
        group, self.group = self.group, []
        if not group:
            return
        if not self.group_heavy:
            if self.leaf and (len(self.leaf) + len(group) > self.max
                              or (len(self.leaf) >= self.min and len(self.leaf) + len(group) > self.target)):
                self._close_leaf()
            if len(group) > self.max:
                raise ValueError(f'the light word {group[0][0]!r} has {len(group)} postings, over max_rows')
            self.leaf.extend(group)
            return
        if len(self.leaf) + len(group) > self.max and len(self.leaf) >= self.min:
            self._close_leaf()
        if len(self.leaf) + len(group) <= self.max:
            self.leaf.extend(group)
            if len(self.leaf) >= self.target:
                self._close_leaf()
            return
        at = 0                                               # the group cannot fit: cut it where the leaf reaches the target
        while at < len(group):
            if len(self.leaf) >= self.target:
                self._close_leaf()
            take = group[at:at + self.target - len(self.leaf)]
            self.leaf.extend(take)
            at += len(take)
        if len(self.leaf) >= self.target:
            self._close_leaf()

    def _close_leaf(self):
        rows, self.leaf = self.leaf, []
        first, last = rows[0][:2], rows[-1][:2]
        if self.previous_last is None:
            key = ('', '', 0)
        elif first[0] != self.previous_last[0]:
            key = (separator(self.previous_last[0], first[0]), '', 0)
        elif first[1] != self.previous_last[1]:
            key = (first[0], separator(self.previous_last[1], first[1]), 0)
        else:
            key = (first[0], first[1], 1)
        self.previous_last = last
        if self.pending is not None:
            self.emit(self.pending)
        self.pending = {'key': key, 'rows': rows}


def index_page_body(first, leaves):
    """`leaves`: [[word, partner, c, rows, bytes, sha256]] of up to PAGE_SIZE leaves, the first numbered `first`."""
    return encode({'v': SCHEMA_VERSION, 'first': first, 'leaves': leaves})


def profile_page_body(first, shards):
    """`shards`: [[profiles, results, bytes, sha256]] of up to PAGE_SIZE shards, the first numbered `first`."""
    return encode({'v': SCHEMA_VERSION, 'first': first, 'shards': shards})
