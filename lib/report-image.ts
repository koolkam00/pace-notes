/**
 * The race report as a 1080 × 1350 PNG (a portrait card for sharing). Drawn on a canvas that is never added to the
 * page, after document.fonts.ready, in the site's own self-hosted fonts, so nothing is requested from another host and
 * no library is added. ReportActions loads this module with import() on the first Save image or Share press, so no
 * page carries it in its initial JavaScript.
 *
 * It draws reportLines() (lib/report.ts), the same words and numbers as the alternative text: the brand, the race,
 * finish and average pace, the nine sections, the sustained-slowdown reading, the pacing type, one comparison line with
 * its finishes, the citation and the address. Never a name, rank or percentile, and nothing only a runner record has.
 */
import { TONE, reportLines, type ReportModel } from './report';
import type { UnitSystem } from './units';

const W = 1080;
const H = 1350;
const M = 72;
const PAPER = '#F5F0E6';
const CARD = '#FFFDF8';
const INK = '#15171C';
const INK_2 = '#3A3D45';
const INK_3 = '#66625A';
const LINE = '#DCD3C2';
const ORANGE = '#FF5B2E';
const ORANGE_INK = '#B4380D';
const GREEN_INK = '#0B7A52';

const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Inter Variable", Arial, sans-serif';
const MONO = '"JetBrains Mono Variable", "Courier New", monospace';
const BIB = '"Bricolage Grotesque Variable", Arial, sans-serif';
const FONTS = [`680 92px ${SERIF}`, `600 34px ${SERIF}`, `650 150px ${BIB}`, `400 28px ${SANS}`, `650 28px ${SANS}`, `600 22px ${MONO}`];

/** Words wrapped to a width, at most `max` lines (the last one ends in an ellipsis when cut). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max = 4): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > max) { lines.length = max; lines[max - 1] = `${lines[max - 1].replace(/\s+\S*$/, '')} …`; }
  return lines;
}
function block(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, max?: number): number {
  for (const line of wrap(ctx, text, width, max)) { ctx.fillText(line, x, y); y += lineHeight; }
  return y;
}
/** A rectangle with rounded corners (arcTo, which every browser that shares files has; roundRect is newer). */
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

/** Draws the report and resolves with the PNG; rejects when the browser cannot draw or encode it. */
export async function renderReportImage(model: ReportModel, units: UnitSystem): Promise<Blob> {
  const l = reportLines(model, units);
  // Each face is loaded before drawing (a font the page has not used yet may not be loaded), then everything settles.
  await Promise.all(FONTS.map((font) => document.fonts.load(font, 'Race report 0123456789:–/%').catch(() => [])));
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the image.');
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = CARD;
  rounded(ctx, 40, 40, W - 80, H - 80, 36);
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = ORANGE;
  ctx.fillRect(40 + 36, 40, W - 80 - 72, 8);

  // Brand, title and race.
  ctx.fillStyle = INK;
  ctx.font = `600 34px ${SERIF}`;
  ctx.fillText('Pace Notes', M, 128);
  ctx.textAlign = 'right';
  ctx.fillStyle = INK_3;
  ctx.font = `600 22px ${MONO}`;
  ctx.fillText((l.race ?? 'Marathon').toUpperCase(), W - M, 126);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `680 92px ${SERIF}`;
  ctx.fillText('Race report', M, 236);

  // Finish and pace.
  ctx.font = `650 150px ${BIB}`;
  ctx.fillText(l.finish, M - 4, 398);
  ctx.font = `650 28px ${SANS}`;
  ctx.fillStyle = INK_2;
  ctx.fillText(`Finish · ${l.pace}`, M, 446);
  ctx.font = `400 26px ${SANS}`;
  ctx.fillText(l.baseline, M, 486);

  // Nine sections, as bars from the 5–20 km pace: right is slower, left quicker; the dashed line is 25% slower.
  const top = 560;
  const row = 42;
  const nameW = 190;
  const valueW = 220;
  const x0 = M + nameW;
  const x1 = W - M - valueW;
  const values = l.sections.map((s) => s.vs);
  const lo = Math.min(-0.06, ...values);
  const hi = Math.max(0.3, ...values);
  const at = (v: number) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  ctx.fillStyle = INK_3;
  ctx.font = `600 20px ${MONO}`;
  ctx.fillText('EACH SECTION AGAINST THE 5–20 KM PACE', M, top - 16);
  l.sections.forEach((s, i) => {
    const y = top + i * row;
    ctx.fillStyle = INK_2;
    ctx.font = `600 22px ${MONO}`;
    ctx.fillText(s.label, M, y + 28);
    const a = at(0);
    const b = at(s.vs);
    ctx.fillStyle = TONE[s.tone].fill;
    ctx.fillRect(Math.min(a, b), y + 8, Math.max(3, Math.abs(b - a)), 26);
    ctx.fillStyle = TONE[s.tone].stroke;
    ctx.fillRect(b - 1.5, y + 6, 3, 30);
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.font = `650 26px ${SANS}`;
    ctx.fillText(s.pace, W - M - 92, y + 29);
    ctx.fillStyle = s.tone === 'qualify' ? ORANGE_INK : INK_3;
    ctx.font = `400 22px ${SANS}`;
    ctx.fillText(s.change, W - M, y + 29);
    ctx.textAlign = 'left';
  });
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(at(0), top);
  ctx.lineTo(at(0), top + 9 * row);
  ctx.stroke();
  ctx.strokeStyle = ORANGE_INK;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(at(0.25), top + 4 * row);
  ctx.lineTo(at(0.25), top + 9 * row);
  ctx.stroke();
  ctx.setLineDash([]);

  // The reading, the type and the comparison.
  let y = top + 9 * row + 54;
  ctx.fillStyle = model.slowdown.yes ? ORANGE_INK : GREEN_INK;
  ctx.font = `650 32px ${SANS}`;
  ctx.fillText(l.slowdown, M, y);
  y += 46;
  ctx.fillStyle = INK;
  ctx.font = `400 27px ${SANS}`;
  if (l.type) y = block(ctx, l.type, M, y, W - 2 * M, 34, 2) + 8;
  if (l.comparison) block(ctx, l.comparison, M, y, W - 2 * M, 34, 3);

  // Source and address.
  ctx.fillStyle = INK_3;
  ctx.font = `400 19px ${SANS}`;
  block(ctx, l.citation, M, H - 132, W - 2 * M, 26, 2);
  ctx.fillStyle = INK;
  ctx.font = `600 22px ${MONO}`;
  ctx.fillText('SPLITHAPPENS.RUN', M, H - 68);
  ctx.textAlign = 'right';
  ctx.fillStyle = INK_3;
  ctx.fillText('PACE NOTES DATA · NOT A PREDICTION', W - M, H - 68);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('This browser cannot save the image.'))), 'image/png');
  });
}
