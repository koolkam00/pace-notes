'use strict';
// The runner pages' nugget recount (lib/nuggets/runners.ts; WP6), run by scripts/verify-nuggets.cjs. runner.yours is
// /runners' reading: no figure (a card never sets a word in figure type) and the key "nine mats, one race". The mats are recounted here from the published
// runner manifest's checkpoints with a second, plain implementation; the fixtures prove the fallback renders (a list
// that stops short of the finish, or runs out of order) and that a flipped guard is caught.
const fs = require('node:fs');
const path = require('node:path');

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

module.exports = function runnerRecounts({ ROOT, N, core, ok, eq, problems }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/runners/manifest.json'), 'utf8'));
  const points = manifest.points_km;
  let checks = 0;
  const step = (fn) => { fn(); checks++; };

  const recount = (n, km) => {
    const mats = km.length;
    let ordered = true;
    for (let i = 0; i < mats; i++) if (!(km[i] > (i ? km[i - 1] : 0))) ordered = false;
    const guard = mats > 1 && ordered && Math.abs(km[mats - 1] - 42.195) < 1e-9;
    const word = mats <= 12 ? WORDS[mats] : mats.toLocaleString('en-US');
    eq([n.values.mats, n.values.finish_km], [mats, km[mats - 1] ?? 0], 'runner.yours recounts the mats and the last one');
    eq(n.guard, guard, 'runner.yours: the guard holds only for mats in order up to the finish');
    eq(n.key, guard ? `${word} mats, one race` : 'mat by mat, one race', 'runner.yours: the key names the recounted mats');
    if (guard) ok(core.sentenceOf(n).includes(`*${word}*`) && core.sentenceOf(n).includes(`from ${km[0]}K`), 'runner.yours: the sentence names the mats and the first one');
    else eq(core.sentenceOf(n), 'A past race, read mat by mat.', 'runner.yours: the fallback renders');
    eq([n.figure, n.placeholder], [null, undefined], 'runner.yours: no figure (no word in figure type), and no placeholder');
  };

  const n = N.getNugget('runner.yours');
  step(() => recount(n, points));
  step(() => eq(n.guard, true, 'runner.yours: the published manifest runs from 5K to the finish'));

  // Fixtures: a list that stops short of the finish and one out of order fall back; a flipped guard is caught.
  const { runnerYoursFrom } = require(path.join(ROOT, 'lib/nuggets/runners.ts'));
  for (const km of [[5, 10, 21.0975], [10, 5, 42.195], []]) {
    const f = runnerYoursFrom(km);
    step(() => recount(f, km));
    step(() => eq(problems(f, { strict: true }), [], 'runner.yours fixture: the fallback follows the text rules'));
  }
  let caught = false;
  try { recount({ ...n, guard: !n.guard }, points); } catch { caught = true; }
  step(() => ok(caught, 'self-test: runner.yours with its guard flipped fails its recount'));
  return { checks };
};
