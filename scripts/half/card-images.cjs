'use strict';
// The four unnumbered "From the half" cards (spec 3.5) as a card set of scripts/build-chart-cards.cjs (`--set half`):
// public/charts/cards/<slug>.png (the slugs start with "half-"), drawn by the Top 100 ChartCard at the same size and
// with the same stamp scheme. The words come from lib/charts/text/half.ts (halfCardWords), the plots and values from
// public/data/half/cards.json, both read through the verified half manifest (lib/half-server.ts). Differences from a
// numbered card: the kicker reads "From the half" and a theme, not "No. N of 100"; the footer names the page that
// carries the finding (/half or /stories/half-to-full); a card of records linked by name prints the scope chip,
// "Includes unverified half results", in its footer stamp line. A stamp binds the card set's code, cards.json and the
// family file the card's values and guard come from, its title and its takeaway.
//
// This module is kept out of the Top 100 code list, so a change here re-stamps the four half cards only.

const fs = require('node:fs'), path = require('node:path');

/** The files a half card's drawing depends on besides the Top 100 card code (scripts/build-chart-cards.cjs CODE). */
const CODE = ['lib/charts/text/half.ts', 'lib/nuggets/half.ts', 'lib/nuggets/format.ts', 'lib/tools/half-to-full.ts', 'scripts/half/card-images.cjs'];

// The footer stamp line of a linked card: the chip over the page address, at the right, as quiet as the address. The
// address keeps proportional hyphens (the foot's tabular figures would space out "half-to-full").
const STYLE = `
  .chart-card-url{font-variant-numeric:normal}
  .chart-card-stamp{display:flex;flex-direction:column;align-items:flex-end;gap:6px;text-align:right}
  .chart-card-chip{display:inline-flex;align-items:center;padding:1px 9px;border:1px solid var(--rule-strong);border-radius:var(--r-pill);
    font-size:.75rem;line-height:1.35;font-weight:500;color:var(--ink-2);white-space:nowrap}`;

module.exports = function halfCardSet(kit) {
  const { React, renderToStaticMarkup, ChartCard, accent, frame, root, sha, topCode } = kit;
  const { readHalf, getHalfManifest, halfPublished } = require('../../lib/half-server.ts');
  const { halfCardWords, HALF_CARD_CHIP } = require('../../lib/charts/text/half.ts');
  const { typeset } = require('../../lib/charts/typo.ts');

  // The chip's words are the site's (components/tools/EvidenceTag.tsx SCOPE_CHIP); a card never words it differently.
  const tag = fs.readFileSync(path.join(root, 'components/tools/EvidenceTag.tsx'), 'utf8');
  if (!tag.includes(`SCOPE_CHIP = '${HALF_CARD_CHIP}'`)) throw new Error('The half cards’ chip differs from SCOPE_CHIP in components/tools/EvidenceTag.tsx.');

  const code = () => sha(topCode() + CODE.map((f) => sha(fs.readFileSync(path.join(root, f), 'utf8'))).join(''));

  function items() {
    if (!halfPublished('cards.json')) return [];
    const docs = { field: readHalf('field.json'), women: readHalf('women.json'), linked: readHalf('linked.json') };
    return readHalf('cards.json').cards.map((card) => ({ id: card.slug, file: `${card.slug}.png`, inputs: { card, words: halfCardWords(card, docs) } }));
  }

  function html({ card, words }, fit) {
    const mark = React.createElement('span', { className: 'chart-mark', 'aria-hidden': 'true' }, React.createElement('i'), React.createElement('i'), React.createElement('i'));
    const address = `splithappens.run${words.page}`;
    const url = React.createElement('span', { className: 'chart-card-url' }, address);
    const stampLine = words.chip
      ? React.createElement('span', { className: 'chart-card-stamp' }, React.createElement('span', { className: 'chart-card-chip' }, words.chip), url)
      : url;
    const foot = React.createElement(React.Fragment, null, React.createElement('b', null, mark, 'Pace Notes'), stampLine);
    const markup = renderToStaticMarkup(React.createElement(ChartCard, {
      number: 0, theme: words.theme, title: words.title, takeaway: accent(words.headline), label: words.plain,
      spec: typeset(card.plot), units: 'mi', heading: 'h2', foot, fit,
    }));
    // ChartCard's kicker names a number of 100; the half cards are outside the hundred.
    const KICKER = /<p class="chart-card-kicker">[\s\S]*?<\/p>/g;
    const found = markup.match(KICKER) || [];
    if (found.length !== 1) throw new Error(`${card.slug}: ChartCard's kicker markup changed (${found.length} matches); update scripts/half/card-images.cjs.`);
    const kicker = renderToStaticMarkup(React.createElement('p', { className: 'chart-card-kicker' },
      React.createElement('span', null, React.createElement('b', null, words.kicker)), React.createElement('span', null, words.theme)));
    const body = markup.replace(KICKER, kicker).replace(' data-chart="0"', ` data-card="${card.slug}"`);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${frame}${STYLE}</style></head><body><div class="chart-image">${body}</div></body></html>`;
  }

  function stamp({ card, words }, setCode) {
    const files = getHalfManifest().files;
    const data = sha(files['cards.json'].sha256 + files[card.source.file].sha256);
    return { card: card.slug, title: words.title, hash: sha([setCode, data, words.title, words.headline, words.page, words.chip || ''].join('\n')).slice(0, 20) };
  }

  /** The captions of the half cards, appended to docs/CHARTS_INSTAGRAM.md under their own heading. */
  function captions() {
    const list = items();
    if (!list.length) return [];
    const lines = ['## From the half (not numbered)', '', 'Four cards outside the hundred, from the half-marathon pages. Each is `public/charts/cards/<slug>.png` (1080 × 1350), drawn by `node scripts/build-chart-cards.cjs --set half`.', ''];
    for (const { inputs: { card, words } } of list) {
      lines.push(`### ${words.title}`, '', `\`${card.slug}.png\``, '', words.plain, '');
      const where = words.page === '/half' ? 'The half marathon on Pace Notes' : 'From the half to the marathon, on Pace Notes';
      lines.push(`${words.chip ? `${words.chip}. ` : ''}${where}: splithappens.run${words.page}`, '');
    }
    return lines;
  }

  return { name: 'half', owns: (f) => f.startsWith('half-'), items, html, stamp, code, captions };
};
