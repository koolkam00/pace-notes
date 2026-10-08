/** Tolerant time parsing and formatting for the runner tools. Pure functions; seconds everywhere. */

export type DurationMode = 'race' | 'pace';

const NUM = /^\d+(?:\.\d+)?$/;

/**
 * Parse a duration typed the way runners type it.
 * - race mode: "3:30" = 3 h 30 min, "3:30:15", "1:45:00", "210" (minutes), "3h30", "3h 30m 15s", "45m", "45:00:00"
 * - pace mode: "8:05" = 8 min 5 s, "8" or "8.5" = minutes
 * Dots or commas between groups ("3.30.15", "8.05", keypads without a colon) are read as separators; "8.5" is 8.5 minutes.
 * Returns seconds or null.
 */
export function parseDuration(input: string, mode: DurationMode = 'race'): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text) return null;
  const units = text.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:utes?|s)?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?|s)?)?)?$/);
  if (units && (units[1] || units[2] || units[3])) {
    const total = Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
    return Number.isFinite(total) && total > 0 ? Math.round(total * 1000) / 1000 : null;
  }
  // "3h30" without a trailing unit
  const hm = text.match(/^(\d+)\s*h\s*(\d{1,2})$/);
  if (hm) return Number(hm[2]) < 60 ? Number(hm[1]) * 3600 + Number(hm[2]) * 60 : null;
  // A dot (or comma) followed by exactly two digits is a separator typed on a keypad without a colon:
  // "8.05" is 8:05 in pace mode and "3.30" is 3:30 (h:mm) in race mode. Other decimals are minutes ("8.5" = 8:30).
  const keypad = text.match(/^(\d+)[.,](\d{2})$/);
  if (keypad) {
    const [a, b] = [Number(keypad[1]), Number(keypad[2])];
    if (b >= 60) return null;
    return mode === 'race' ? a * 3600 + b * 60 : a * 60 + b;
  }
  if (NUM.test(text)) {
    const minutes = Number(text);
    return minutes > 0 ? Math.round(minutes * 60 * 1000) / 1000 : null;
  }
  let parts = text.split(':');
  if (parts.length === 1) {
    const dotted = text.split(/[.,]/);
    if ((dotted.length === 3) || (dotted.length === 2 && mode === 'pace')) parts = dotted;
    else return null;
  }
  if (parts.length > 3 || parts.some((p) => !/^\d+(?:\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 3) {
    const [h, m, s] = nums;
    if (m >= 60 || s >= 60) return null;
    return h * 3600 + m * 60 + s;
  }
  const [a, b] = nums;
  if (b >= 60) return null;
  return mode === 'race' ? a * 3600 + b * 60 : a * 60 + b;
}

/** "3:30:00", or "45:12" when under an hour (unless forceHours). Rounds to whole seconds once. */
export function formatDuration(seconds: number, forceHours = false): string {
  if (!Number.isFinite(seconds)) return '—';
  const sign = seconds < 0 ? '−' : '';
  const s = Math.round(Math.abs(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h || forceHours) return `${sign}${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${sign}${m}:${String(sec).padStart(2, '0')}`;
}

/** "3:30" style hours:minutes, rounding seconds to the nearest minute. */
export function formatHM(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Signed margin "+4:30" / "−1:05" (minutes:seconds, hours when needed). */
export function formatMargin(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  return `${s > 0 ? '+' : s < 0 ? '−' : '±'}${formatDuration(Math.abs(s))}`;
}

/** Time of day from seconds after midnight: "9:42 am". */
export function formatClock(secondsAfterMidnight: number): string {
  const s = ((Math.round(secondsAfterMidnight) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Parse a clock time of day ("8:05", "8:05 am", "20:05") to seconds after midnight. */
export function parseClock(input: string): number | null {
  const m = input.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const sec = Number(m[3] ?? 0);
  if (min >= 60 || sec >= 60) return null;
  const ap = m[4];
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
  } else if (h > 23) return null;
  return h * 3600 + min * 60 + sec;
}

export interface MatReading { km: number; elapsed: number }

/**
 * Read official tracker text such as "25K 2:05:31", "25 km 02:05:31 4:59/km" or "30k\t2:31:07".
 * Only the official 5 km mats (5–40 km) are accepted; halfway and mile splits are ignored.
 */
export function parseTrackerText(input: string): MatReading[] {
  const out: MatReading[] = [];
  for (const line of input.split(/[\n;]+/)) {
    const km = line.match(/\b(5|10|15|20|25|30|35|40)\s*(?:k\b|km\b|kilomet)/i);
    const time = line.match(/\b(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})\b/);
    if (!km || !time) continue;
    const seconds = parseDuration(time[1], time[1].split(':').length === 3 ? 'race' : 'pace');
    if (seconds !== null) out.push({ km: Number(km[1]), elapsed: seconds });
  }
  return out;
}
