// Duplicate editions: a regression guard for copies like Chicago 2018 and 2019, whose records repeat the Chicago 2024
// field (docs/KNOWN_ISSUES.md). For every pair of editions of one city it counts the nine-checkpoint tuples found in
// both: exact recorded times, from every record with nine numeric times, eligible or not, each distinct tuple once.
// A pair is flagged when that count is at least max(100, 1% of the smaller edition's records). The run fails when
//   - a flagged pair is not covered by the duplicate-edition screen in public/data/insights/manifest.json (one edition
//     listed with `duplicate_of` the other, or both listed with the same `duplicate_of`),
//   - a screen entry's pair is no longer flagged (stale), or
//   - a screen entry names an edition, or a source edition, that the marathon cohort does not have.
// Since November 19, 2026 it reads the cohort's editions (those with a file: counted and own-record; adoption ruling
// 6 of 2026-11-14) through scripts/lib/cohort.cjs, which checks each file against the cohort manifest, and the story
// manifest must name that cohort manifest's digest (`cohort_manifest_sha256`); it read the runner shards before.
// Synthetic self-tests run before the published data.
// Usage: node scripts/verify-duplicate-editions.cjs [--self-test]
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const zlib = require('node:zlib'), assert = require('node:assert/strict');

const started = Date.now();
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
assert.ok(args.every(arg => arg === '--self-test'), 'Usage: node scripts/verify-duplicate-editions.cjs [--self-test]');

const MIN_SHARED = 100, MIN_SHARE = 0.01;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const count = value => value.toLocaleString('en-US');
const editionKey = (city, year) => `${city}\u0000${year}`;
/** The fewest shared tuples that flag a pair: at least 100, and at least 1% of the smaller edition's records. */
const threshold = (a, b) => Math.max(MIN_SHARED, MIN_SHARE * Math.min(a, b));
const nineTimes = times => Array.isArray(times) && times.length === 9 && times.every(value => typeof value === 'number' && Number.isFinite(value));

/**
 * Count records per edition and the nine-time tuples each pair of same-city editions shares. `source` is
 * { editions: [{city, year}], records, eachRecord(visit) }, where eachRecord calls visit(editionIndex, times or null)
 * once for every record of the cohort's editions (since November 19, 2026; the runner shards before).
 */
function scanEditions(source) {
  const editions = source.editions;
  const index = new Map(editions.map((edition, i) => [editionKey(edition.city, edition.year), i]));
  assert.equal(index.size, editions.length, 'Cohort editions are unique by city and year');
  const records = new Uint32Array(editions.length);
  // Every record with nine numeric times: its edition and times, held compactly until each city is compared.
  const capacity = source.records, editionOf = new Uint16Array(capacity), times = new Float64Array(capacity * 9);
  let raw = 0, timed = 0;
  source.eachRecord((edition, values) => {
    assert.ok(Number.isSafeInteger(edition) && edition >= 0 && edition < editions.length, 'A valid edition');
    assert.ok(raw < capacity, 'No more records than the cohort manifest declares');
    raw++; records[edition]++;
    if (!nineTimes(values)) return;
    editionOf[timed] = edition;
    times.set(values, timed * 9);
    timed++;
  });
  assert.equal(raw, source.records, 'Every record of the cohort\'s editions was read');

  const byCity = new Map();
  editions.forEach((edition, i) => byCity.set(edition.city, [...(byCity.get(edition.city) || []), i]));
  const positions = new Map();
  for (const members of byCity.values()) {
    assert.ok(members.length <= 31, 'At most 31 editions per city (one bit each)');
    members.forEach((edition, bit) => positions.set(edition, bit));
  }
  const rowsByCity = new Map([...byCity.keys()].map(city => [city, []]));
  for (let i = 0; i < timed; i++) rowsByCity.get(editions[editionOf[i]].city).push(i);
  const pairs = [];
  for (const [city, members] of byCity) {
    if (members.length < 2) continue;
    // Each distinct tuple once, with the editions it appears in as a bit mask.
    const seen = new Map();
    for (const i of rowsByCity.get(city)) {
      const key = times.subarray(i * 9, i * 9 + 9).join(',');
      seen.set(key, (seen.get(key) || 0) | (1 << positions.get(editionOf[i])));
    }
    const shared = members.map(() => new Uint32Array(members.length));
    for (const mask of seen.values()) {
      if (!(mask & (mask - 1))) continue;
      for (let a = 0; a < members.length; a++) if (mask & (1 << a)) for (let b = a + 1; b < members.length; b++) if (mask & (1 << b)) shared[a][b]++;
    }
    for (let a = 0; a < members.length; a++) for (let b = a + 1; b < members.length; b++) {
      const [first, second] = [members[a], members[b]].sort((x, y) => editions[x].year - editions[y].year);
      pairs.push({ city, years: [editions[first].year, editions[second].year], records: [records[first], records[second]], shared: shared[a][b] });
    }
    rowsByCity.set(city, null);
  }
  return { raw, timed, files: editions.length, cities: byCity.size, pairs };
}

/** The screen's coverage of the flagged pairs: a list of problems, empty when the screen and the data agree. */
function checkScreen(source, pairs, screen) {
  const problems = [];
  const editions = new Set(source.editions.map(edition => editionKey(edition.city, edition.year)));
  const listed = new Map();
  for (const entry of screen) {
    const name = `${entry.city} ${entry.year}`;
    if (typeof entry.city !== 'string' || !Number.isSafeInteger(entry.year) || !Number.isSafeInteger(entry.duplicate_of) || entry.duplicate_of === entry.year) problems.push(`${name}: not a usable screen entry`);
    else if (listed.has(editionKey(entry.city, entry.year))) problems.push(`${name}: listed twice`);
    if (!editions.has(editionKey(entry.city, entry.year))) problems.push(`${name} is listed in the duplicate-edition screen but is not an edition of the cohort`);
    if (!editions.has(editionKey(entry.city, entry.duplicate_of))) problems.push(`${name}: its source, ${entry.city} ${entry.duplicate_of}, is not an edition of the cohort`);
    listed.set(editionKey(entry.city, entry.year), entry);
  }
  const covered = (city, a, b) => {
    const first = listed.get(editionKey(city, a)), second = listed.get(editionKey(city, b));
    return first?.duplicate_of === b || second?.duplicate_of === a || (!!first && !!second && first.duplicate_of === second.duplicate_of);
  };
  const flagged = pairs.filter(pair => pair.shared >= threshold(...pair.records));
  for (const { city, years: [a, b], records, shared } of flagged) {
    if (!covered(city, a, b)) problems.push(`${city} ${a} and ${b} share ${count(shared)} nine-time tuples (${(100 * shared / Math.min(...records)).toFixed(1)}% of the smaller edition) but are not covered by the duplicate-edition screen`);
  }
  for (const entry of screen) {
    const pair = pairs.find(({ city, years }) => city === entry.city && years.includes(entry.year) && years.includes(entry.duplicate_of));
    if (pair && !flagged.includes(pair)) problems.push(`${entry.city} ${entry.year}: listed as a copy of ${entry.duplicate_of}, but the two share only ${count(pair.shared)} nine-time tuples (stale entry)`);
  }
  return { flagged, problems };
}

/**
 * Check the screen of the story manifest (`insights`, bound to the cohort manifest by its digest `cohortSha`) against
 * the cohort's records (`source`, see scanEditions).
 */
function verify(source, cohortSha, insights) {
  assert.equal(insights.cohort_manifest_sha256, cohortSha, 'The story manifest is bound to this cohort manifest');
  assert.equal(insights.release_tag, source.release_tag, 'The story manifest uses the cohort release');
  const scan = scanEditions(source);
  return { ...scan, ...checkScreen(source, scan.pairs, insights.duplicate_edition_screen ?? []) };
}

/** The cohort's editions with a file (counted and own-record) and all their records, from scripts/lib/cohort.cjs. */
function cohortSource() {
  const cohort = require('./lib/cohort.cjs');
  const { manifest, sha256 } = cohort.verifiedManifest(JSON.parse(fs.readFileSync(path.join(root, 'analysis/release.json'), 'utf8')));
  const editions = manifest.editions.map(entry => ({ city: entry.city, year: entry.year }));
  const records = manifest.editions.reduce((sum, entry) => sum + entry.raw, 0);
  const eachRecord = visit => cohort.forEachEdition((edition, entry, i) => {
    assert.equal(edition.ids.length + edition.otherIds.length, entry.raw, `${entry.city} ${entry.year}: every written record is in the file`);
    for (const values of edition.times) visit(i, values);
    for (const values of edition.otherTimes) visit(i, values);
  });
  return { source: { release_tag: manifest.release_tag, editions, records, eachRecord }, sha256 };
}

// Self-tests on synthetic fixtures: no runner data, names or real counts.
function selfTest() {
  const RELEASE = 'fixture-release', points = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
  const times = (pace, offset) => points.map(km => km * pace + offset);
  // n distinct nine-time tuples at one pace; different paces never share a tuple.
  const field = (n, pace, from = 0) => Array.from({ length: n }, (_, i) => times(pace, from + i));
  /** A data root in memory: { 'City year': [nine times, or null for a record with a missing time] } and a screen. */
  const fixture = (spec, screen) => {
    const editions = Object.keys(spec).map(name => { const [, city, year] = /^(.*) (\d{4})$/.exec(name); return { city, year: Number(year) }; });
    const rows = Object.values(spec).flatMap((list, edition) => list.map((t, i) => [edition, t ?? [null, ...times(300, i).slice(1)]]));
    const data = { source: { release_tag: RELEASE, editions, records: rows.length, eachRecord: visit => rows.forEach(([e, t]) => visit(e, t)) },
      sha: 'c'.repeat(64), insights: { release_tag: RELEASE, cohort_manifest_sha256: 'c'.repeat(64), duplicate_edition_screen: screen } };
    return { ...data, verify: () => verify(data.source, data.sha, data.insights) };
  };
  const copy = (city, year, of) => ({ city, year, duplicate_of: of, reason: 'Fixture.', eligible_removed: 1, identical_nine_time_twins: 1 });
  const flagged = result => result.flagged.map(pair => `${pair.city} ${pair.years.join('-')}`).sort();
  // Two copies of a 2024 field, with ten finishes of their own, as in the adopted release; another city has the same times.
  const base = field(300, 300);
  const lakeside = { 'Lakeside 2018': [...base.slice(0, 290), ...field(10, 290)], 'Lakeside 2019': [...base.slice(0, 290), ...field(10, 290)], 'Lakeside 2024': base, 'Lakeside 2025': field(300, 280), 'Hilltown 2024': base };
  const listed = [copy('Lakeside', 2018, 2024), copy('Lakeside', 2019, 2024)];
  const bayview = (shared, size, missing = 0) => fixture({ 'Bayview 2020': [...field(size - missing, 300), ...Array(missing).fill(null)], 'Bayview 2021': [...field(shared, 300), ...field(size - shared, 330)] }, []).verify();

  const cases = [
    ['listed copies: three pairs flagged and covered, no pair across cities', () => {
      const result = fixture(lakeside, listed).verify();
      assert.deepEqual(flagged(result), ['Lakeside 2018-2019', 'Lakeside 2018-2024', 'Lakeside 2019-2024']);
      assert.deepEqual(result.problems, []);
      assert.equal(result.pairs.find(pair => pair.years.join() === '2018,2019').shared, 300, 'The copies also share their ten finishes of their own');
    }],
    ['an injected unlisted twin pair fails', () => {
      const result = fixture({ ...lakeside, 'Riverside 2020': field(500, 310), 'Riverside 2021': [...field(150, 310), ...field(350, 320)] }, listed).verify();
      assert.deepEqual(result.problems, ['Riverside 2020 and 2021 share 150 nine-time tuples (30.0% of the smaller edition) but are not covered by the duplicate-edition screen']);
    }],
    ['a copy left off the screen fails', () => {
      assert.match(fixture(lakeside, [copy('Lakeside', 2018, 2024)]).verify().problems.join('\n'), /^Lakeside 2019 and 2024 share 290 nine-time tuples .* not covered/m);
    }],
    ['an injected stale entry fails', () => {
      const result = fixture({ ...lakeside, 'Riverside 2020': field(500, 310), 'Riverside 2021': [...field(99, 310), ...field(401, 320)] }, [...listed, copy('Riverside', 2021, 2020)]).verify();
      assert.deepEqual(result.problems, ['Riverside 2021: listed as a copy of 2020, but the two share only 99 nine-time tuples (stale entry)']);
    }],
    ['a listed edition or source missing from the runner manifest fails', () => {
      assert.deepEqual(fixture(lakeside, [...listed, copy('Lakeside', 2016, 2024), copy('Lakeside', 2025, 2030)]).verify().problems, [
        'Lakeside 2016 is listed in the duplicate-edition screen but is not an edition of the cohort',
        'Lakeside 2025: its source, Lakeside 2030, is not an edition of the cohort',
      ]);
    }],
    ['the floor: 100 shared tuples', () => {
      assert.deepEqual(bayview(99, 500).flagged, []);
      assert.deepEqual(flagged(bayview(100, 500)), ['Bayview 2020-2021']);
    }],
    ['1% of the smaller edition, whose records include those without nine times', () => {
      assert.deepEqual(bayview(199, 20000).flagged, []);
      const flaggedPair = bayview(200, 20000);
      assert.deepEqual(flagged(flaggedPair), ['Bayview 2020-2021']);
      assert.equal(flaggedPair.problems.length, 1, 'An unlisted flagged pair is a problem');
      const wider = bayview(200, 20100, 100);
      assert.deepEqual([wider.flagged, wider.problems], [[], []], 'Records with a missing time count toward the edition size, not the shared tuples');
    }],
    ['a small edition repeated inside a large one: 1% of the smaller, not the larger', () => {
      // 150 shared tuples are 75% of the 200-record edition and under 1% of the 20,000-record one.
      const result = fixture({ 'Bayview 2020': field(200, 300), 'Bayview 2021': [...field(150, 300), ...field(19850, 330)] }, []).verify();
      assert.deepEqual(flagged(result), ['Bayview 2020-2021']);
    }],
    ['a listed copy covers only the pair with its own source', () => {
      // A new twin of the 2024 field also twins both listed copies; none of the three new pairs is covered.
      const result = fixture({ ...lakeside, 'Lakeside 2025': [...base.slice(0, 150), ...field(150, 280)] }, listed).verify();
      assert.deepEqual(result.problems, ['2018', '2019', '2024'].map(year => `Lakeside ${year} and 2025 share 150 nine-time tuples (50.0% of the smaller edition) but are not covered by the duplicate-edition screen`));
    }],
    ['a copy later than its source is covered', () => {
      const result = fixture({ 'Riverside 2020': field(500, 310), 'Riverside 2021': [...field(150, 310), ...field(350, 320)] }, [copy('Riverside', 2021, 2020)]).verify();
      assert.deepEqual([flagged(result), result.problems], [['Riverside 2020-2021'], []]);
    }],
    ['no copies and an empty screen: nothing to report', () => {
      const result = fixture({ 'Bayview 2020': field(300, 300), 'Bayview 2021': field(300, 330) }, []).verify();
      assert.deepEqual([result.flagged, result.problems], [[], []]);
    }],
    ['a story manifest bound to another cohort manifest, or more records than declared, fails', () => {
      const data = fixture(lakeside, listed);
      data.insights.cohort_manifest_sha256 = '0'.repeat(64);
      assert.throws(() => data.verify(), /bound to this cohort manifest/);
      const short = fixture(lakeside, listed);
      short.source.records -= 1;
      assert.throws(() => short.verify(), /No more records than the cohort manifest declares/);
    }],
  ];
  for (const [name, test] of cases) {
    try { test(); } catch (error) { throw new Error(`Self-test failed: ${name}\n${error.message}`, { cause: error }); }
  }
  return cases.length;
}

const selfTests = selfTest();
if (args.includes('--self-test')) {
  console.log(`Duplicate-edition self-tests passed (${selfTests} cases, ${((Date.now() - started) / 1000).toFixed(1)} s).`);
  process.exit(0);
}
const { source, sha256: cohortSha } = cohortSource();
const result = verify(source, cohortSha, JSON.parse(fs.readFileSync(path.join(root, 'public/data/insights/manifest.json'), 'utf8')));
const describe = ({ city, years, records, shared }) => `${city} ${years.join('–')} (${count(shared)} shared, ${(100 * shared / Math.min(...records)).toFixed(1)}% of the smaller edition)`;
if (result.problems.length) {
  console.error(`Duplicate-edition check failed:\n- ${result.problems.join('\n- ')}`);
  process.exit(1);
}
// The unflagged pair nearest its threshold, so a reader sees how far the other editions are from being flagged.
const nearest = result.pairs.filter(pair => !result.flagged.includes(pair)).sort((a, b) => b.shared / threshold(...b.records) - a.shared / threshold(...a.records))[0];
console.log(`Duplicate-edition check passed: ${count(result.files)} cohort editions read, ${count(result.raw)} records (${count(result.timed)} with nine times) in ${count(result.pairs.length)} same-city edition pairs across ${result.cities} cities; flagged and covered by the screen: ${result.flagged.map(describe).join('; ') || 'none'}; nearest unflagged: ${nearest ? `${describe(nearest)} against a threshold of ${count(Math.ceil(threshold(...nearest.records)))}` : 'none'}; ${selfTests} self-tests; ${((Date.now() - started) / 1000).toFixed(1)} s.`);
