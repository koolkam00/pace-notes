"""The marathon cohort: the names-free records every analysis reads, and the one Python reader of them.

The cohort (analysis/build_cohort.py writes it; lead ruling D24.1 of the adoption plan, 2026-11-14) replaces the
runner lookup's profile shards as the audited input of the marathon analyses. It holds, for every edition with a
record an analysis can use (a counted edition or one that keeps an own-record view):

- every written record of the edition that passes the timing checks: its record id, the runner it belongs to under
  the screened identity rule (analysis/build_identity.py), recorded sex and age, and its nine cumulative times,
  exactly as the pipeline's prepare() parses them;
- every other written record of the edition: its id and why its timing is not usable (a duplicate, missing
  checkpoints, times out of order, outside the bounds), with its nine times when all nine parse.

No name, bib or person id is in it. A runner is named by the smallest record id among the written marathon records of
its key, which leads back to a name only through the release itself. Editions that give recorded times only are listed
in the manifest with their raw counts and have no file.

Layout under the cohort folder (`analysis/marathon-cohort/` in the repository; the name differs from this module's so
that `import cohort` can only mean the reader): `manifest.json` and one `editions/<race id>-<year>.json.gz` per edition. An edition
file depends only on that edition's records and their runners, carries no tag and no clock time, and is written with
a fixed gzip header, so an edition that does not change between releases keeps its bytes.

An edition file is a JSON object:

    v        1
    city, year, use     the edition as the pipeline names it; `use` is counted or own_record
    i        ids of the timing-eligible records, ascending, delta-encoded (first id, then differences)
    g        the runner of each: 0 when the record has no runner key; else id - u + 1, where u is the smallest
             record id of the runner's written marathon records (so 1 means this record is that smallest one)
    x        one letter of recorded sex per record: M, F, X, or - when none is recorded
    a        recorded age per record (a number, or null)
    s        ticks per second of this file's times: 1 (whole seconds) or 1000
    t        nine numbers per record: the first cumulative time in ticks, then the eight gaps
    tx       [[k, t0, ..., t8], ...]: records (by position k) with a time that is not exactly a tick; their nine
             cumulative times in seconds, exact
    oi, oc   ids (delta-encoded) and one reason letter each for the other written records: d duplicate,
             m missing_checkpoints, o times_out_of_order, b outside_bounds
    on       positions in `oi` of the records whose nine times all parse; `ot`, `otx` their times, as `t` and `tx`

`read_edition` returns the decoded values and `decoded_sha256` hashes them in a form the Node reader
(scripts/lib/cohort.cjs) reproduces byte for byte, so the manifest's `decoded_sha256` of each edition proves that the
two readers give the same numbers.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import re
import struct
from pathlib import Path

SCHEMA_VERSION = 1
EDITION_VERSION = 1
POINTS_KM = [5, 10, 15, 20, 25, 30, 35, 40, 42.195]
USES = ('counted', 'own_record')
REASON_LETTERS = {'duplicate': 'd', 'missing_checkpoints': 'm', 'times_out_of_order': 'o', 'outside_bounds': 'b'}
REASONS = {letter: reason for reason, letter in REASON_LETTERS.items()}
SEX_LETTERS = ('M', 'F', 'X', '-')
FILE_PATTERN = re.compile(r'editions/[a-z0-9]+(?:-[a-z0-9]+)*-[0-9]{4}\.json\.gz')
NO_AGE = struct.pack('>d', float('nan'))


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def file_name(race_id, year):
    return f'editions/{race_id}-{year}.json.gz'


def delta(values):
    return [values[0]] + [b - a for a, b in zip(values, values[1:])] if values else []


def undelta(values):
    out, total = [], 0
    for value in values:
        total += value
        out.append(total)
    return out


def time_unit(rows):
    """Ticks per second for a file: 1 when every time is a whole second, else 1000."""
    return 1 if all(float(t).is_integer() for row in rows for t in row) else 1000


def pack_times(rows, unit):
    """Nine cumulative times in seconds per row -> (flat tick list, exceptions). A row is read back from its ticks when
    every time is exactly ticks / unit as a double; else its exact seconds are in the exception list, and its ticks
    (the rounded values) are never read back."""
    flat, exceptions = [], []
    for k, row in enumerate(rows):
        ticks = [round(t * unit) for t in row]
        if any(tick / unit != t for tick, t in zip(ticks, row)):
            exceptions.append([k, *row])
        flat.extend(delta(ticks))
    return flat, exceptions


def unpack_times(unit, flat, exceptions, count):
    assert len(flat) == 9 * count, 'nine times per record'
    rows = []
    for k in range(count):
        rows.append([tick / unit for tick in undelta(flat[9 * k:9 * k + 9])])
    for k, *row in exceptions:
        assert len(row) == 9 and 0 <= k < count, 'an exception row of another shape'
        rows[k] = [float(t) for t in row]
    return rows


def encode_edition(city, year, use, records, others):
    """`records`: timing-eligible rows (id, u or 0, sex or None, age or None, [nine seconds]) ascending by id.
    `others`: rows (id, reason, [nine seconds] or None) ascending by id. Returns the file's bytes."""
    assert use in USES and all(a[0] < b[0] for a, b in zip(records, records[1:])) and all(a[0] < b[0] for a, b in zip(others, others[1:]))
    ids = [r[0] for r in records]
    for rid, u, sex, age, times in records:
        assert (u == 0 or 0 < u <= rid) and (sex is None or sex in SEX_LETTERS[:3]) and len(times) == 9, f'record {rid}'
    timed = [(k, o[2]) for k, o in enumerate(others) if o[2] is not None]
    assert all(len(row) == 9 for _, row in timed)
    unit = time_unit([r[4] for r in records] + [row for _, row in timed])
    t, tx = pack_times([r[4] for r in records], unit)
    ot, otx = pack_times([row for _, row in timed], unit)
    document = {
        'v': EDITION_VERSION, 'city': city, 'year': year, 'use': use,
        'i': delta(ids), 'g': [0 if r[1] == 0 else r[0] - r[1] + 1 for r in records], 'x': ''.join(r[2] or '-' for r in records),
        'a': [None if r[3] is None else int(r[3]) if float(r[3]).is_integer() else float(r[3]) for r in records],
        's': unit, 't': t, 'tx': tx,
        'oi': delta([o[0] for o in others]), 'oc': ''.join(REASON_LETTERS[o[1]] for o in others), 'on': [k for k, _ in timed], 'ot': ot, 'otx': otx,
    }
    data = (json.dumps(document, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode()
    return gzip.compress(data, 9, mtime=0)


def decode_edition(data):
    """An edition file's bytes -> its decoded values (lists; times in seconds)."""
    document = json.loads(gzip.decompress(data))
    assert document['v'] == EDITION_VERSION and document['use'] in USES, 'an edition file of another version'
    ids = undelta(document['i'])
    n = len(ids)
    assert len(document['g']) == len(document['x']) == len(document['a']) == n, 'columns of different lengths'
    assert all(letter in SEX_LETTERS for letter in document['x'])
    runner = [0 if g == 0 else rid - g + 1 for rid, g in zip(ids, document['g'])]
    other_ids = undelta(document['oi'])
    assert len(document['oc']) == len(other_ids) and all(letter in REASONS for letter in document['oc'])
    other_times = [None] * len(other_ids)
    for k, row in zip(document['on'], unpack_times(document['s'], document['ot'], document['otx'], len(document['on']))):
        other_times[k] = row
    return {'city': document['city'], 'year': document['year'], 'use': document['use'], 'ids': ids, 'runner': runner,
            'sex': [None if letter == '-' else letter for letter in document['x']], 'age': document['a'],
            'times': unpack_times(document['s'], document['t'], document['tx'], n),
            'other_ids': other_ids, 'other_reasons': [REASONS[letter] for letter in document['oc']], 'other_times': other_times}


def decoded_sha256(edition):
    """A digest of the decoded values that the Node reader reproduces: fixed-width big-endian integers and doubles."""
    h = hashlib.sha256()
    h.update(json.dumps([edition['city'], edition['year'], edition['use'], len(edition['ids']), len(edition['other_ids'])],
                        ensure_ascii=False, separators=(',', ':')).encode())
    for rid, runner, sex, age, times in zip(edition['ids'], edition['runner'], edition['sex'], edition['age'], edition['times']):
        h.update(struct.pack('>QQ', rid, runner) + (sex or '-').encode() + (NO_AGE if age is None else struct.pack('>d', float(age))) + struct.pack('>9d', *times))
    for rid, reason, times in zip(edition['other_ids'], edition['other_reasons'], edition['other_times']):
        h.update(struct.pack('>Q', rid) + REASON_LETTERS[reason].encode() + (b'\x00' if times is None else b'\x01' + struct.pack('>9d', *times)))
    return h.hexdigest()


def read_manifest(root):
    """(manifest, sha256 of its exact bytes). The digest is what an output stores to say which cohort it was built on."""
    data = (Path(root) / 'manifest.json').read_bytes()
    manifest = json.loads(data)
    assert manifest['schema_version'] == SCHEMA_VERSION, 'a cohort manifest of another version'
    return manifest, sha256(data)


def read_edition(root, entry):
    """One edition's decoded values, after its file's size and SHA-256 are checked against its manifest entry."""
    assert FILE_PATTERN.fullmatch(entry['file']), f"an unexpected cohort path: {entry['file']}"
    data = (Path(root) / entry['file']).read_bytes()
    assert len(data) == entry['bytes'] and sha256(data) == entry['sha256'], f"{entry['file']}: size or checksum differs from the manifest"
    edition = decode_edition(data)
    assert (edition['city'], edition['year'], edition['use']) == (entry['city'], entry['year'], entry['use']), f"{entry['file']}: another edition"
    assert (len(edition['ids']), len(edition['other_ids'])) == (entry['timing_eligible'], entry['other']), f"{entry['file']}: record counts differ from the manifest"
    return edition


def editions(root, manifest=None):
    """Yield (index, manifest entry, decoded edition) for every edition of the cohort, in manifest order."""
    manifest = manifest or read_manifest(root)[0]
    for index, entry in enumerate(manifest['editions']):
        yield index, entry, read_edition(root, entry)


def load(root, uses=('counted',)):
    """The records of the editions with one of `uses`, as numpy arrays: `times` (n x 9 seconds), `edition` (index into
    the manifest's editions), `record_id`, `runner` (the runner id, or the record's own id when it has no key, so equal
    values are one runner and no two runners share one), `keyed`, `sex` (b'M', b'F', b'X' or b'-') and `age` (NaN when
    not recorded). Returns (arrays, manifest, manifest sha256). `uses=('counted',)` is the eligible cohort."""
    import numpy as np
    manifest, digest = read_manifest(root)
    times, edition, ids, runner, keyed, sex, age = [], [], [], [], [], [], []
    for index, entry, values in editions(root, manifest):
        if values['use'] not in uses:
            continue
        n = len(values['ids'])
        times.append(np.asarray(values['times'], dtype=np.float64).reshape(n, 9))
        edition.append(np.full(n, index, dtype=np.int32))
        own = np.asarray(values['ids'], dtype=np.int64)
        key = np.asarray(values['runner'], dtype=np.int64)
        ids.append(own)
        runner.append(np.where(key > 0, key, own))
        keyed.append(key > 0)
        sex.append(np.frombuffer(''.join(s or '-' for s in values['sex']).encode(), dtype='S1'))
        age.append(np.asarray([np.nan if a is None else a for a in values['age']], dtype=np.float64))
    join = lambda parts, dtype: np.concatenate(parts) if parts else np.empty(0, dtype=dtype)  # noqa: E731
    arrays = {'times': np.concatenate(times) if times else np.empty((0, 9)), 'edition': join(edition, np.int32), 'record_id': join(ids, np.int64),
              'runner': join(runner, np.int64), 'keyed': join(keyed, bool), 'sex': join(sex, 'S1'), 'age': join(age, np.float64)}
    return arrays, manifest, digest
