import { $, $$, h, s, initHeader, initMenu, initReveals, initDeck, onUnits, marathonDistance, clock, hm, ms, pct, inWords, int, keypad, reduced, tween, whenVisible, loadJSON } from './core.js';
import { N, data, buildRoute, CHAPTERS, argmax } from './nuggets.js';
import { createReplay } from './replay.js';
import { runnerLane } from './runner.js';

initHeader({ chapter: 'Start line', title: 'Pace Notes', minutes: 4 });
initMenu((list) => buildRoute(list, { current: 0, compact: true }));
initReveals();

const setDistance = () => $$('[data-u="marathon"]').forEach((el) => { el.textContent = marathonDistance(); });
setDistance();
onUnits(setDistance);

// ---------- Hero: scale, course list, goal field ----------
(async () => {
  const sc = await N.scale();
  $('[data-n="kicker"]').textContent = `${sc.races} races · ${sc.cities} cities · ${sc.first}–${sc.last}`;
  $('[data-n="millions"]').textContent = `${(sc.eligible / 1e6).toFixed(1)} million`;
  const courses = await data.courses();
  const sel = $('#home-plan-course');
  courses.courses.map((c) => c.city).sort().forEach((city) => sel.append(h('option', { value: city.toLowerCase().replace(/\s+/g, '-') }, city)));
})();
keypad($('#home-plan-goal'));
$('.home-plan').addEventListener('submit', (e) => e.preventDefault());

// ---------- Hero replay: the edition where the field was most spread when the first finisher crossed ----------
(async () => {
  const meta = await data.replay();
  const ed = argmax(meta.editions, (e) => e.moments.not_past_20_at_first / e.finishes);
  const rows = (await loadJSON(`data/${ed.file}`)).rows;
  const root = $('.hero-replay');
  $('[data-hud="race"]').textContent = `${ed.city} ${ed.year}`;
  const share20 = ed.moments.not_past_20_at_first / ed.finishes;
  const desktop = () => innerWidth >= 1000;
  const hud = { clock: $('[data-hud="clock"]'), done: $('[data-hud="done"]'), before20: $('[data-hud="before20"]') };
  createReplay(root, {
    rows,
    start: 62 * 60,
    speed: 540,
    height: (w) => (desktop() ? Math.min(600, Math.max(460, w * 0.78)) : Math.round(Math.min(230, Math.max(150, innerHeight * 0.26)))),
    pad: desktop() ? { top: 92, bottom: 34, left: 26, right: 74 } : { top: 52, bottom: 26, left: 16, right: 32 },
    onFrame: (f) => { hud.clock.textContent = clock(f.t); hud.done.textContent = pct(f.done); hud.before20.textContent = pct(f.before20); },
    moments: [{
      t: ed.moments.first_finish_s,
      hold: 1500,
      show: (flag) => {
        flag.replaceChildren(h('b', {}, clock(ed.moments.first_finish_s)), ' First finish. ', h('b', {}, pct(share20)), ` of the field had not reached 20K.`);
      },
    }],
  });
})();

// ---------- Stakes: guess first (negative split) ----------
(async () => {
  const neg = await N.negativeSplit();
  const truth = Math.round(neg.share * 100);
  const grid = $('#neg-dots');
  const dots = Array.from({ length: 100 }, (_, i) => { const d = document.createElement('i'); d.style.setProperty('--i', String(i % 10 + Math.floor(i / 10))); return d; });
  grid.append(...dots);
  const range = $('#neg-range');
  const out = $('#neg-guess');
  const paint = () => {
    const g = Number(range.value);
    out.textContent = String(g);
    range.style.setProperty('--v', String(g / Number(range.max)));
    dots.forEach((d, i) => d.classList.toggle('g-ring', i < g));
  };
  range.addEventListener('input', paint);
  paint();
  $('#neg-reveal').addEventListener('click', async () => {
    const card = $('#guess-negative');
    const g = Number(range.value);
    card.classList.add('is-revealed');
    range.disabled = true;
    const lightUp = (n) => dots.forEach((d, i) => d.classList.toggle('lit-faster', i < n));
    if (reduced()) lightUp(truth);
    else { for (let k = 1; k <= truth; k += 1) { lightUp(k); await new Promise((r) => setTimeout(r, 120)); } }
    const off = g - truth;
    $('#neg-verdict').textContent = Math.abs(off) <= 2 ? 'Spot on' : off > 0 ? `You guessed ${g}. The answer is lower.` : `You guessed ${g}. The answer is higher.`;
    const claim = $('#neg-claim');
    claim.replaceChildren(`Only about `, h('em', {}, inWords(neg.share)), ` ran the second 20K faster.`);
    const more = $('#neg-more');
    const st = await N.slowdownRate();
    more.replaceChildren(`${pct(neg.share, 1)} of ${(neg.total / 1e6).toFixed(1)} million finishes. Most marathons get slower, and ${inWords(st.share)} finishes had a `, h('a', { class: 'term', href: '#' }, 'sustained slowdown'), '.');
  });
})();

// ---------- Guide: four nuggets, each pointing at its chapter ----------
function microDots(n, lit, cls = 'lit') {
  const g = h('div', { class: 'dots small row', style: { '--dots-max': '300px', '--dot-gap': '8px' }, 'aria-hidden': 'true' });
  for (let i = 0; i < n; i += 1) g.append(h('i', { class: i < lit ? cls : '' }));
  return g;
}
function sparkHistogram(hist, lo, hi, litMinute) {
  const rows = hist.filter((b) => b.minute >= lo && b.minute <= hi);
  const max = Math.max(...rows.map((b) => b.all));
  const W = 300; const H = 56; const bw = W / rows.length;
  const svg = s('svg', { class: 'spark', viewBox: `0 0 ${W} ${H + 16}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  rows.forEach((b, i) => {
    const hh = (b.all / max) * H;
    svg.append(s('rect', { x: (i * bw + 0.5).toFixed(1), y: (H - hh).toFixed(1), width: Math.max(1, bw - 1).toFixed(1), height: hh.toFixed(1), rx: 1, class: b.minute === litMinute ? 'mark-you' : 'mark-context', opacity: b.minute === litMinute ? 1 : 0.55 }));
  });
  return svg;
}
function miniLedger(banked, spent) {
  const max = Math.max(banked, spent);
  const wrap = h('div', { class: 'mini-ledger', 'aria-hidden': 'true' });
  const row = (label, v, cls) => h('div', { class: 'ml-row' }, h('span', {}, label), h('i', { class: cls, style: { width: `${(v / max) * 100}%` } }), h('b', {}, ms(v)));
  wrap.append(row('Banked', banked, 'faster'), row('Gave back', spent, 'you'));
  return wrap;
}
(async () => {
  const [rate, busiest, bank, ft, meta] = await Promise.all([N.slowdownRate(), N.busiestMinute(), N.bank(), data.finish(), data.replay()]);
  const ed = argmax(meta.editions, (e) => e.moments.not_past_20_at_first / e.finishes);
  const share20 = ed.moments.not_past_20_at_first / ed.finishes;
  const deck = $('#guide-deck');
  const card = (href, kicker, fig, small, claimParts, viz, go) => h('a', { class: 'nugget reveal', href },
    h('p', { class: 'n-kicker' }, h('b', {}, kicker[0]), kicker[1]),
    h('div', { class: 'n-fig' }, h('span', { class: 'figure' }, fig), small ? h('small', {}, small) : null),
    h('p', { class: 'n-claim' }, ...claimParts),
    h('div', { class: 'n-viz' }, viz),
    h('span', { class: 'n-go' }, go));
  deck.append(
    card('#', ['Ch 05', 'After 30K'], inWords(rate.share), 'finishes', ['had a ', h('em', {}, 'sustained slowdown'), ', usually after 30K.'], microDots(10, Math.round(rate.share * 10)), 'After 30K'),
    card('story-round-numbers.html', ['Ch 06', 'The finish line'], busiest.figure, 'on the clock', ['is the ', h('em', {}, 'busiest'), ` finishing minute${busiest.alike ? ', for recorded women and men alike.' : '.'}`], sparkHistogram(ft.histogram, 205, 275, busiest.minute), 'The 3:59 effect'),
    card('analysis-starting-pace.html', ['Ch 02', 'The first 5K'], ms(bank.net), 'behind', ['A first 5K over 10% fast banked ', h('em', {}, ms(bank.banked)), ', then lost more later.'], miniLedger(bank.banked, bank.spent), 'The first 5K'),
    card('#', ['Ch 01', 'The field'], pct(share20), `${ed.city} ${ed.year}`, ['of the field had not reached 20K when the ', h('em', {}, 'first finisher'), ' crossed.'], h('div', { class: 'mini-bar', 'aria-hidden': 'true' }, h('i', { style: { width: pct(share20) } })), 'Watch the race'),
  );
  initDeck(deck);
  initReveals();
})();

// ---------- Steps and stories ----------
buildRoute($('#route-part-1'), { parts: [1] });
(async () => {
  const grid = $('#story-grid');
  for (const ch of CHAPTERS.filter((c) => c.part > 1)) {
    const lead = await ch.lead();
    const wide = ch.n === 11;
    grid.append(h('a', { class: `story-card${wide ? ' wide' : ''}`, href: ch.href },
      h('div', { class: 'sc-top' }, h('span', { class: 'sc-n' }, String(ch.n).padStart(2, '0')), h('span', { class: 'sc-fig' }, lead.fig, h('small', {}, lead.small))),
      h('div', {}, h('p', { class: 'sc-title' }, ch.title), h('p', { class: 'sc-text' }, lead.text))));
  }
})();

// ---------- CTA lane: runners move at speeds proportional to their finish times ----------
runnerLane($('#cta-lane'), [
  { finishMinutes: 195, label: '3:15' }, { finishMinutes: 240, label: '4:00' }, { finishMinutes: 285, label: '4:45' }, { finishMinutes: 330, label: '5:30', effort: 0.4 },
]);
