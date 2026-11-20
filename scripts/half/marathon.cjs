'use strict';
// The marathon side of the half-marathon source recount (scripts/verify-half-source.cjs), from the checked-in marathon
// cohort (analysis/marathon-cohort, read through scripts/lib/cohort.cjs, which checks every edition file's size and
// SHA-256 against the manifest) and without the Python builders: every counted record of the adopted release (the
// eligible finishes), with its record id (the release's race_records.id of the marathon database, the id the person
// links use), edition, recorded sex, finish and sustained slowdown (a 5 km section after 20 km at least 25% slower than
// the 5–20 km pace), and each edition's race date from the cohort manifest. The cohort holds no name.
const fs = require('node:fs');
const path = require('node:path');
const cohort = require('../lib/cohort.cjs');

const POINTS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
const LENGTHS = POINTS.map((km, i) => km - (i ? POINTS[i - 1] : 0));
const need = (cond, message) => { if (!cond) throw new Error(`marathon side: ${message}`); };

/** The cohort's sex letters: 1 men, 2 women, 0 other or not recorded. */
function genderCode(sex) {
  return sex === 'M' ? 1 : sex === 'F' ? 2 : 0;
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

function loadMarathons(root, cohortRoot = path.join(root, 'analysis', 'marathon-cohort')) {
  const release = JSON.parse(fs.readFileSync(path.join(root, 'analysis/release.json'), 'utf8'));
  const { manifest, sha256: manifestSha } = cohort.readManifest(cohortRoot);
  need(manifest.release_tag === release.tag, 'the marathon cohort is not of the adopted release');
  const editions = manifest.editions;
  const n = manifest.eligible_records;
  const id = new Float64Array(n), edition = new Uint16Array(n), gender = new Uint8Array(n), finish = new Float64Array(n), sustained = new Uint8Array(n);
  const rawN = new Int32Array(editions.length);
  let k = 0;
  cohort.forEachEdition((values, entry, index) => {
    rawN[index] = entry.raw;
    if (entry.use !== 'counted') return;
    need(values.ids.length === entry.eligible, `${entry.city} ${entry.year}: the counted records are not the eligible ones`);
    for (let r = 0; r < values.ids.length; r++) {
      const t = values.times[r];
      need(k < n && Array.isArray(t) && t.length === 9 && t.every(Number.isFinite) && t[0] > 0 && t[8] >= 5400 && t[8] <= 43200, 'eligible timing contract');
      for (let j = 0; j < 9; j++) {
        if (j) need(t[j] > t[j - 1], 'eligible times increase');
        const pace = (t[j] - (j ? t[j - 1] : 0)) / LENGTHS[j];
        need(pace >= 120 - 1e-8 && pace <= 1200 + 1e-8, 'eligible section pace bounds');
      }
      const baseline = (t[3] - t[0]) / 15;
      let slow = 0;
      for (let j = 4; j < 8; j++) if ((t[j] - t[j - 1]) / LENGTHS[j] / baseline - 1 + 1e-12 >= 0.25) { slow = 1; break; }
      need(Number.isSafeInteger(values.ids[r]) && values.ids[r] > 0, 'record id');
      id[k] = values.ids[r]; edition[k] = index; gender[k] = genderCode(values.sex[r]); finish[k] = t[8]; sustained[k] = slow;
      k++;
    }
  }, cohortRoot);
  need(k === n, 'the counted records reconcile with the cohort manifest');
  const seen = Float64Array.from(id).sort();
  for (let i = 1; i < seen.length; i++) need(seen[i] !== seen[i - 1], 'unique record ids');

  const day = new Float64Array(editions.length).fill(NaN);
  const eligibleEditions = new Set(edition);
  const keys = new Set(), undated = [];
  for (const e of eligibleEditions) {
    const ed = editions[e];
    const key = `${ed.city}\u0000${ed.year}`;
    need(!keys.has(key), `two eligible editions share ${ed.city} ${ed.year}`);
    keys.add(key);
    const text = ed.race_date;
    // No race date in the cohort manifest: the edition keeps its finishes, supplies no pair (its day stays NaN) and is
    // returned in `undated` for the reviewed list; nothing is filled in.
    if (text === null || text === undefined) { undated.push([ed.city, ed.year]); continue; }
    need(typeof text === 'string' && Number(text.slice(0, 4)) === ed.year && dayNumber(text) !== null, `no race date for ${ed.city} ${ed.year}`);
    day[e] = dayNumber(text);
  }
  undated.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  let slowdowns = 0;
  for (let i = 0; i < n; i++) slowdowns += sustained[i];
  return {
    n, id, edition, gender, finish, sustained, editions, rawN, day, slowdowns, datedEditions: eligibleEditions.size - undated.length, undated,
    manifestSha, manifest, releaseTag: release.tag,
  };
}

module.exports = { loadMarathons, dayNumber, genderCode };
