'use strict';
// The marathon side of the half-marathon source recount (scripts/verify-half-source.cjs), from public files only and
// without the Python builders: every eligible finish of the adopted release from the checksum-verified runner shards
// (public/data/runners), with its canonical record id (the id the link build uses for marathon records), edition,
// recorded sex, finish and sustained slowdown (a 5 km section after 20 km at least 25% slower than the 5–20 km pace),
// and each edition's race date from the weather evidence (public/data/weather/evidence.json, its own pin). Names are
// never read.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
const LENGTHS = POINTS.map((km, i) => km - (i ? POINTS[i - 1] : 0));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const need = (cond, message) => { if (!cond) throw new Error(`marathon side: ${message}`); };

/** build_fast_start.gender_code: 1 men, 2 women, 0 other or not recorded. */
function genderCode(sex) {
  const value = (sex || '').trim().toLowerCase();
  return ['m', 'male', 'man', 'men'].includes(value) ? 1 : ['f', 'female', 'woman', 'women'].includes(value) ? 2 : 0;
}

/** Days since 1970-01-01 of a YYYY-MM-DD date, or null. */
function dayNumber(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || '');
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return t / 86400000;
}

function loadMarathons(root) {
  const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
  const release = read('analysis/release.json');
  const manifestBytes = fs.readFileSync(path.join(root, 'public/data/runners/manifest.json'));
  const runners = JSON.parse(manifestBytes);
  need(runners.release_tag === release.tag, 'the runner manifest is not the adopted release');
  const editions = runners.editions;
  const n = runners.eligible_records;
  const id = new Float64Array(n), edition = new Uint16Array(n), gender = new Uint8Array(n), finish = new Float64Array(n), sustained = new Uint8Array(n);
  const rawN = new Int32Array(editions.length);
  let raw = 0, k = 0;
  const seen = new Float64Array(runners.raw_records);
  for (const file of Object.keys(runners.shards).sort()) {
    need(/^(profiles|index)\/[0-9a-f]{3}\.json\.gz$/.test(file), `unexpected shard ${file}`);
    const bytes = fs.readFileSync(path.join(root, 'public/data/runners', file));
    need(bytes.length === runners.shards[file].bytes && sha(bytes) === runners.shards[file].sha256, `${file}: size or checksum`);
    if (!file.startsWith('profiles/')) continue;
    const shard = JSON.parse(zlib.gunzipSync(bytes));
    need(shard.release_tag === release.tag, `${file}: shard release`);
    for (const p of shard.profiles) {
      for (const race of p.races) {
        need(Number.isSafeInteger(race.id) && race.id > 0 && Number.isInteger(race.edition) && race.edition >= 0 && race.edition < editions.length, 'record id and edition');
        seen[raw++] = race.id;
        rawN[race.edition]++;
        if (!race.eligible) continue;
        const t = race.times;
        need(k < n && Array.isArray(t) && t.length === 9 && t.every(Number.isFinite) && t[0] > 0 && t[8] >= 5400 && t[8] <= 43200, 'eligible timing contract');
        for (let j = 0; j < 9; j++) {
          if (j) need(t[j] > t[j - 1], 'eligible times increase');
          const pace = (t[j] - (j ? t[j - 1] : 0)) / LENGTHS[j];
          need(pace >= 120 - 1e-8 && pace <= 1200 + 1e-8, 'eligible section pace bounds');
        }
        const baseline = (t[3] - t[0]) / 15;
        let slow = 0;
        for (let j = 4; j < 8; j++) if ((t[j] - t[j - 1]) / LENGTHS[j] / baseline - 1 + 1e-12 >= 0.25) { slow = 1; break; }
        id[k] = race.id; edition[k] = race.edition; gender[k] = genderCode(race.sex); finish[k] = t[8]; sustained[k] = slow;
        k++;
      }
    }
  }
  need(raw === runners.raw_records && k === n, 'record counts reconcile with the runner manifest');
  seen.sort();
  for (let i = 1; i < seen.length; i++) need(seen[i] !== seen[i - 1], 'unique record ids');

  const weatherPin = read('analysis/weather-release.json');
  const weatherBytes = fs.readFileSync(path.join(root, 'public/data/weather/evidence.json'));
  const weather = JSON.parse(weatherBytes);
  need(weather.input.release_tag === weatherPin.tag, 'the weather evidence does not match its pin');
  const dateOf = new Map();
  for (const row of weather.editions) {
    const key = `${row.city}\u0000${row.year}`;
    need(!dateOf.has(key) || dateOf.get(key) === row.date, `two dates for ${row.city} ${row.year}`);
    dateOf.set(key, row.date);
  }
  const day = new Float64Array(editions.length).fill(NaN);
  const eligibleEditions = new Set(edition);
  const keys = new Set();
  for (const e of eligibleEditions) {
    const ed = editions[e];
    const key = `${ed.city}\u0000${ed.year}`;
    need(!keys.has(key), `two eligible editions share ${ed.city} ${ed.year}`);
    keys.add(key);
    const text = dateOf.get(key);
    need(typeof text === 'string' && Number(text.slice(0, 4)) === ed.year && dayNumber(text) !== null, `no race date for ${ed.city} ${ed.year}`);
    day[e] = dayNumber(text);
  }
  let slowdowns = 0;
  for (let i = 0; i < n; i++) slowdowns += sustained[i];
  return {
    n, id, edition, gender, finish, sustained, editions, rawN, day, slowdowns, datedEditions: eligibleEditions.size,
    manifestSha: sha(manifestBytes), weatherSha: sha(weatherBytes), releaseTag: release.tag,
  };
}

module.exports = { loadMarathons, dayNumber, genderCode };
