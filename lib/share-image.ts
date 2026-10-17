/**
 * The 4:5 share card (spec section 3.5): 1080 × 1350, drawn on a canvas that is never added to the page or uploaded.
 * A night surface; the marker and chapter kicker (Inter caps) on the left and PACE NOTES on the right; the figure in Bricolage at
 * 280 px; the claim in Fraunces 64 px with its italic accent in the night signal colour; a simplified micro-chart; the
 * address. Colours are read from the design tokens (app/styles/tokens.css) when it starts, with the same values as
 * fallbacks. Fonts are the site's own, loaded with document.fonts.load() first, so nothing is requested from another
 * host. ShareButton loads this module with import() on the first tap, so no page carries it in its initial JavaScript.
 *
 * The card carries the page's words and numbers only (from lib/nuggets/ through the page), and the visitor's goal only
 * when they tick "Add my goal to the card". Shares are not counted (owner decision 13).
 */

export type ShareMicro =
  | { kind: 'bars'; values: number[]; highlight?: number }
  | { kind: 'dots'; lit: number }
  | { kind: 'line'; values: number[] };

export type ShareCard = {
  kicker: string;          // "CHAPTER 06 · THE FINISH LINE"
  marker?: string;         // "FINISH"
  figure: string;          // "1.73"
  unit?: string;           // "×"
  claim: string;           // one *…* accent span
  path: string;            // "/stories/round-numbers"
  micro?: ShareMicro;
  goal?: string;           // "Goal 4:00", only when the visitor asks for it
};

const W = 1080;
const H = 1350;
const M = 84;
const HOST = 'splithappens.run';

const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Inter Variable", Arial, sans-serif';
const BIB = '"Bricolage Grotesque Variable", Arial, sans-serif';

function tokens() {
  const css = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
  const t = (name: string, fallback: string) => (css?.getPropertyValue(name).trim() || fallback);
  return {
    night: t('--night', '#0E1116'), night2: t('--night-2', '#171B22'), night3: t('--night-3', '#252B36'),
    ink: t('--night-ink', '#F5F0E6'), ink2: t('--night-ink-2', '#B9B3A6'), ink3: t('--night-ink-3', '#8E897E'),
    quiet: t('--night-mark-quiet', '#6B7180'), fillQuiet: t('--night-fill-quiet', '#2A303B'),
    signal: t('--night-signal', '#FF6A3D'), signalInk: t('--night-signal-ink', '#FF7A50'),
  };
}

type Run = { text: string; em: boolean };
/** The claim split into runs at its one *…* span. */
function runs(claim: string): Run[] {
  const m = /^([\s\S]*?)\*([^*]+)\*([\s\S]*)$/.exec(claim);
  if (!m) return [{ text: claim, em: false }];
  return [{ text: m[1], em: false }, { text: m[2], em: true }, { text: m[3], em: false }].filter((r) => r.text);
}

/** Lays out mixed upright and italic words in lines of at most `width`. */
function layout(ctx: CanvasRenderingContext2D, parts: Run[], width: number, size: number) {
  const font = (em: boolean) => `${em ? 'italic ' : ''}440 ${size}px ${SERIF}`;
  const words: { text: string; em: boolean; w: number }[] = [];
  for (const p of parts) {
    for (const word of p.text.split(/(\s+)/)) {
      if (!word) continue;
      ctx.font = font(p.em);
      if (/^\s+$/.test(word)) { words.push({ text: ' ', em: p.em, w: ctx.measureText(' ').width }); continue; }
      words.push({ text: word, em: p.em, w: ctx.measureText(word).width });
    }
  }
  const lines: { text: string; em: boolean; w: number }[][] = [[]];
  let x = 0;
  for (const w of words) {
    const line = lines[lines.length - 1];
    if (w.text === ' ') { if (line.length) { line.push(w); x += w.w; } continue; }
    if (x + w.w > width && line.length) {
      while (line.length && line[line.length - 1].text === ' ') line.pop();
      lines.push([w]); x = w.w;
    } else { line.push(w); x += w.w; }
  }
  return { lines, font };
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function micro(ctx: CanvasRenderingContext2D, m: ShareMicro, x: number, y: number, w: number, h: number, c: ReturnType<typeof tokens>) {
  if (m.kind === 'bars' && m.values.length) {
    const max = Math.max(...m.values, 1e-9);
    const gap = 6, bw = (w - gap * (m.values.length - 1)) / m.values.length;
    m.values.forEach((v, i) => {
      const bh = Math.max(4, (v / max) * h);
      ctx.fillStyle = i === m.highlight ? c.signal : c.quiet;
      rounded(ctx, x + i * (bw + gap), y + h - bh, bw, bh, Math.min(6, bw / 2));
      ctx.fill();
    });
  } else if (m.kind === 'line' && m.values.length > 1) {
    const min = Math.min(...m.values), max = Math.max(...m.values), span = max - min || 1;
    ctx.strokeStyle = c.ink; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    m.values.forEach((v, i) => {
      const px = x + (i / (m.values.length - 1)) * w, py = y + h - ((v - min) / span) * h;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    });
    ctx.stroke();
  } else if (m.kind === 'dots') {
    const r = 9, gap = 14, cols = 25;
    for (let i = 0; i < 100; i++) {
      const cx = x + r + (i % cols) * (2 * r + gap), cy = y + r + Math.floor(i / cols) * (2 * r + gap);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = i < Math.round(m.lit) ? c.signal : c.fillQuiet;
      ctx.fill();
    }
  }
}

/** Draws the card and returns it as a PNG. */
export async function renderShareCard(card: ShareCard): Promise<Blob> {
  const fonts = [`660 280px ${BIB}`, `440 64px ${SERIF}`, `italic 440 64px ${SERIF}`, `600 26px ${SANS}`, `500 30px ${SANS}`];
  if (typeof document !== 'undefined' && document.fonts) {
    await Promise.all(fonts.map((f) => document.fonts.load(f, `${card.figure}${card.unit ?? ''} Pace Notes`).catch(() => [])));
    await document.fonts.ready;
  }
  const c = tokens();
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the image.');

  ctx.fillStyle = c.night;
  ctx.fillRect(0, 0, W, H);

  // Kicker row: the marker plate and chapter on the left, the brand on the right.
  ctx.textBaseline = 'middle';
  let kx = M;
  const ky = M + 22;
  if (card.marker) {
    ctx.font = `600 26px ${SANS}`;
    const mw = ctx.measureText(card.marker).width + 32;
    ctx.fillStyle = c.ink;
    rounded(ctx, kx, ky - 22, mw, 44, 8); ctx.fill();
    ctx.fillStyle = c.night;
    ctx.fillText(card.marker, kx + 16, ky + 1);
    kx += mw + 22;
  }
  ctx.font = `600 26px ${SANS}`;
  ctx.fillStyle = c.ink2;
  ctx.fillText(card.kicker.toUpperCase(), kx, ky + 1);
  ctx.textAlign = 'right';
  ctx.fillStyle = c.ink;
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText('PACE NOTES', W - M, ky + 1);
  ctx.textAlign = 'left';

  // The figure, with its unit at 0.36 em.
  ctx.textBaseline = 'alphabetic';
  let size = 280;
  ctx.font = `660 ${size}px ${BIB}`;
  const unitSize = () => Math.round(size * 0.36);
  const total = () => { ctx.font = `660 ${size}px ${BIB}`; const fw = ctx.measureText(card.figure).width; ctx.font = `500 ${unitSize()}px ${SANS}`; return fw + (card.unit ? ctx.measureText(card.unit).width + 12 : 0); };
  while (total() > W - 2 * M && size > 120) size -= 10;
  const fy = 470;
  ctx.font = `660 ${size}px ${BIB}`;
  ctx.fillStyle = c.ink;
  ctx.fillText(card.figure, M - 6, fy);
  if (card.unit) {
    const fw = ctx.measureText(card.figure).width;
    ctx.font = `500 ${unitSize()}px ${SANS}`;
    ctx.fillStyle = c.ink3;
    ctx.fillText(card.unit, M + fw + 6, fy);
  }

  // The claim.
  let claimSize = 64;
  let laid = layout(ctx, runs(card.claim), W - 2 * M, claimSize);
  while (laid.lines.length > 5 && claimSize > 44) { claimSize -= 4; laid = layout(ctx, runs(card.claim), W - 2 * M, claimSize); }
  let cy = fy + 110;
  for (const line of laid.lines.slice(0, 5)) {
    let x = M;
    for (const w of line) {
      ctx.font = laid.font(w.em);
      ctx.fillStyle = w.em ? c.signalInk : c.ink;
      ctx.fillText(w.text, x, cy);
      x += w.w;
    }
    cy += Math.round(claimSize * 1.22);
  }

  // The micro-chart, then the goal and the address.
  // The micro-chart sits under the claim, filling the room above the address line.
  if (card.micro) { const top = cy + 30; micro(ctx, card.micro, M, top, W - 2 * M, Math.max(120, Math.min(260, H - M - 100 - top)), c); }
  ctx.strokeStyle = c.night3; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(M, H - M - 56); ctx.lineTo(W - M, H - M - 56); ctx.stroke();
  ctx.font = `500 30px ${SANS}`;
  ctx.fillStyle = c.ink2;
  ctx.textBaseline = 'middle';
  ctx.fillText(`${HOST}${card.path === '/' ? '' : card.path}`, M, H - M - 12);
  if (card.goal) {
    ctx.textAlign = 'right';
    ctx.fillStyle = c.ink;
    ctx.fillText(card.goal, W - M, H - M - 12);
    ctx.textAlign = 'left';
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('This browser cannot save the image.'))), 'image/png');
  });
}
