/**
 * The race report as a 1080 × 1350 PNG (a portrait card for sharing), drawn like the site's share card
 * (lib/share-image.ts): a night surface, the race in Fraunces, the finish in Bricolage, then the lap list (each mat's
 * split and pace, and a bar from the race's own 5–20K pace, the sustained-slowdown sections in the night signal), the
 * reading, and the Pace Notes data lines under their label. Drawn on a canvas that is never added to the page, after
 * document.fonts.ready, in the site's own self-hosted fonts, so nothing is requested from another host and no library
 * is added. ReportActions loads this module with import() on the first Save image or Share press, so no page carries it
 * in its initial JavaScript.
 *
 * It draws reportLines() (lib/report.ts), the same words and numbers as the alternative text. Never a name, rank or
 * percentile, and nothing only a runner record has; the definition and its citation are on /methodology.
 */
import { REPORT_DATA_LABEL, REPORT_IMAGE_NAME, reportLines, type ReportModel } from './report';
import type { UnitSystem } from './units';

const W = 1080;
const H = 1350;
const M = 84;
const HOST = 'splithappens.run';

const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Inter Variable", Arial, sans-serif';
const BIB = '"Bricolage Grotesque Variable", Arial, sans-serif';
const FONTS = [`440 72px ${SERIF}`, `660 200px ${BIB}`, `600 28px ${SANS}`, `500 28px ${SANS}`, `400 26px ${SANS}`];

/** The night colours, read from the design tokens (app/styles/tokens.css) with the same values as fallbacks. */
function tokens() {
  const css = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
  const t = (name: string, fallback: string) => (css?.getPropertyValue(name).trim() || fallback);
  return {
    night: t('--night', '#0E1116'), rule: t('--night-3', '#252B36'),
    ink: t('--night-ink', '#F5F0E6'), ink2: t('--night-ink-2', '#B9B3A6'), ink3: t('--night-ink-3', '#8E897E'),
    quiet: t('--night-mark-quiet', '#6B7180'), signal: t('--night-signal', '#FF6A3D'), signalInk: t('--night-signal-ink', '#FF7A50'),
  };
}

/** Words wrapped to a width, at most `max` lines (the last one ends in an ellipsis when cut). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
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
  const c = tokens();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the image.');

  ctx.fillStyle = c.night;
  ctx.fillRect(0, 0, W, H);

  // Kicker row, then the race and the finish.
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 26px ${SANS}`;
  ctx.fillStyle = c.ink2;
  ctx.fillText('RACE REPORT', M, 118);
  ctx.textAlign = 'right';
  ctx.fillStyle = c.ink;
  ctx.fillText('PACE NOTES', W - M, 118);
  ctx.textAlign = 'left';
  ctx.fillStyle = c.ink;
  ctx.font = `440 72px ${SERIF}`;
  ctx.fillText(wrap(ctx, l.race ?? 'Marathon', W - 2 * M, 1)[0], M, 214);
  let size = 200;
  ctx.font = `660 ${size}px ${BIB}`;
  while (ctx.measureText(l.finish).width > W - 2 * M && size > 120) { size -= 10; ctx.font = `660 ${size}px ${BIB}`; }
  ctx.fillText(l.finish, M - 6, 400);
  ctx.font = `500 28px ${SANS}`;
  ctx.fillStyle = c.ink2;
  ctx.fillText(`${l.pace[0].toUpperCase()}${l.pace.slice(1)} · ${l.baseline}`, M, 456);

  // The lap list: each mat, its split, its pace, and a bar from the 5–20K pace (right is slower, left quicker).
  const top = 500;
  const row = 44;
  const x0 = M + 440;
  const x1 = W - M;
  const values = l.sections.map((s) => s.vs);
  // The lap list's own scale (components/report/LapList.tsx): 5% quicker to 15% slower at least, so the longest bar
  // reaches the card's right padding.
  const lo = Math.min(-0.05, ...values);
  const hi = Math.max(0.15, ...values);
  const at = (v: number) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  l.sections.forEach((s, i) => {
    const y = top + i * row;
    const lit = s.tone === 'qualify';
    ctx.font = `600 28px ${SANS}`;
    ctx.fillStyle = c.ink;
    ctx.fillText(s.mat, M, y + 31);
    ctx.fillText(s.split, M + 150, y + 31);
    ctx.font = `500 26px ${SANS}`;
    ctx.fillStyle = lit ? c.signalInk : c.ink3;
    ctx.fillText(s.pace, M + 280, y + 31);
    const a = at(0);
    const b = at(s.vs);
    ctx.fillStyle = lit ? c.signal : c.quiet;
    rounded(ctx, Math.min(a, b), y + 13, Math.max(4, Math.abs(b - a)), 20, 4);
    ctx.fill();
  });
  ctx.strokeStyle = c.ink2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(at(0), top + 4);
  ctx.lineTo(at(0), top + 9 * row - 4);
  ctx.stroke();

  // The reading, then the data lines under their label.
  let y = top + 9 * row + 70;
  ctx.font = `600 34px ${SANS}`;
  ctx.fillStyle = model.slowdown.yes ? c.signalInk : c.ink;
  ctx.fillText(l.slowdown, M, y);
  y += 58;
  if (l.type || l.comparison) {
    ctx.fillStyle = c.ink3;
    ctx.beginPath();
    ctx.arc(M + 6, y - 8, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.font = `600 22px ${SANS}`;
    ctx.fillText(REPORT_DATA_LABEL.toUpperCase(), M + 22, y);
    y += 44;
  }
  ctx.font = `400 26px ${SANS}`;
  ctx.fillStyle = c.ink2;
  for (const text of [l.type, l.comparison]) {
    if (!text) continue;
    for (const line of wrap(ctx, text, W - 2 * M, 2)) { ctx.fillText(line, M, y); y += 34; }
    y += 8;
  }

  // The address and the reminder.
  ctx.strokeStyle = c.rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M, H - M - 52);
  ctx.lineTo(W - M, H - M - 52);
  ctx.stroke();
  ctx.font = `500 28px ${SANS}`;
  ctx.fillStyle = c.ink;
  ctx.fillText(HOST, M, H - M);
  ctx.textAlign = 'right';
  ctx.fillStyle = c.ink3;
  ctx.fillText('Not a prediction', W - M, H - M);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('This browser cannot save the image.'))), 'image/png');
  });
}

const cancelled = (error: unknown) => (error as { name?: unknown } | null)?.name === 'AbortError';

/**
 * The share sheet (components/report/ReportActions.tsx, Share): the image when the browser can share files (iOS Safari
 * 15 and later), else the report's link, else 'save' (the caller saves the image instead). 'cancelled' when the visitor
 * closes the sheet; 'ready' when drawing a fresh image outlasted the press a browser lets a share sheet open from, so the
 * image is ready for the next press. Throws when sharing fails otherwise.
 */
export async function shareReport(image: () => Promise<Blob>, url: string | null, fresh: boolean): Promise<'shared' | 'cancelled' | 'ready' | 'save'> {
  const probe = typeof File === 'function' ? new File([new Blob()], REPORT_IMAGE_NAME, { type: 'image/png' }) : null;
  try {
    if (probe && typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] })) {
      const file = new File([await image()], REPORT_IMAGE_NAME, { type: 'image/png' });
      try {
        await navigator.share({ files: [file], title: 'Race report' });
      } catch (error) {
        if (fresh && (error as { name?: unknown }).name === 'NotAllowedError') return 'ready';
        throw error;
      }
    } else if (typeof navigator.share === 'function' && url) {
      await navigator.share({ title: 'Race report', url });
    } else return 'save';
  } catch (error) {
    if (cancelled(error)) return 'cancelled';
    throw error;
  }
  return 'shared';
}
