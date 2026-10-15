/** Display units only. Source measurements and analysis thresholds stay metric. */
export type UnitSystem = 'mi' | 'km';
export const DEFAULT_UNITS: UnitSystem = 'mi';
export const KM_PER_MILE = 1.609344;
export const METRES_PER_FOOT = 0.3048;

const number = (value: number, precision: number) => Number.isFinite(value)
  ? new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: precision }).format(value)
  : '—';

export const distanceValue = (km: number, units: UnitSystem) => units === 'mi' ? km / KM_PER_MILE : km;
export function distanceLabel(km: number, units: UnitSystem, precision = 2): string {
  return `${number(distanceValue(km, units), units === 'km' ? Math.max(3, precision) : precision)} ${units}`;
}

/** Accepts minutes per kilometre and returns minutes per selected distance unit. */
export const paceValue = (minutesPerKm: number, units: UnitSystem) => units === 'mi' ? minutesPerKm * KM_PER_MILE : minutesPerKm;
/** Round the converted total seconds once, so a displayed pace never ends in :60. */
export function paceLabel(secondsPerKm: number, units: UnitSystem, includeUnit = true): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm < 0) return '—';
  const seconds = Math.round(paceValue(secondsPerKm, units));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}${includeUnit ? `/${units}` : ''}`;
}

// Pace axis grids, in seconds per displayed unit, finest first.
const PACE_STEPS: Record<UnitSystem, readonly number[]> = { mi: [30, 60, 120, 300, 600], km: [15, 30, 60, 120, 300, 600] };
/**
 * Ticks for a pace axis, in seconds per displayed unit, on a round minutes:seconds grid in the units shown: every 0:30
 * per mile (or a whole minute or more for a wide range), every 0:15 or more per kilometre. A kilometre grid converted
 * to miles reads 8:15, 8:48, 9:21/mi. The domain runs from the first tick to the last, which covers every value;
 * null when there is no value to cover.
 */
export function paceTicks(minSeconds: number, maxSeconds: number, units: UnitSystem, maxTicks = 6): { ticks: number[]; domain: [number, number] } | null {
  if (!Number.isFinite(minSeconds) || !Number.isFinite(maxSeconds) || minSeconds > maxSeconds) return null;
  const steps = PACE_STEPS[units];
  const grid = (step: number) => {
    // A value a rounding error past a grid line stays on it rather than adding a tick.
    const lo = Math.floor(minSeconds / step + 1e-9) * step;
    const hi = Math.max(lo + step, Math.ceil(maxSeconds / step - 1e-9) * step);
    return { step, lo, hi, count: Math.round((hi - lo) / step) + 1 };
  };
  // Past the widest listed grid, whole multiples of it.
  const widest = steps[steps.length - 1];
  const { step, lo, hi, count } = steps.map(grid).find(g => g.count <= maxTicks) ?? grid(Math.ceil((maxSeconds - minSeconds) / Math.max(1, maxTicks - 2) / widest) * widest);
  return { ticks: Array.from({ length: count }, (_, i) => lo + i * step), domain: [lo, hi] };
}

export const elevationValue = (metres: number, units: UnitSystem) => units === 'mi' ? metres / METRES_PER_FOOT : metres;
export function elevationLabel(metres: number, units: UnitSystem): string {
  return `${number(elevationValue(metres, units), 1)} ${units === 'mi' ? 'ft' : 'm'}`;
}

// Only explicitly unit-bearing prose is converted. This preserves times, sample
// counts, temperatures and percentages without trying to infer their meaning.
const NUMBER = '(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
const SIGNED_NUMBER = `[+−-]?${NUMBER}`;
const SEPARATOR = '(?:[–—-]|\\bto\\b|,\\s*(?:or\\b|and\\b)?|\\bor\\b|\\band\\b)';
const NUMBER_PHRASE = `${SIGNED_NUMBER}(?:\\s*${SEPARATOR}\\s*${SIGNED_NUMBER})*`;
const KM_UNIT = '(?:km|kilomet(?:re|er)s?)';
const numeric = (value: string) => Number(value.replaceAll(',', '').replace('−', '-'));
const convertPhrase = (phrase: string, factor: number, precision: number) => phrase.replace(
  new RegExp(NUMBER, 'g'), value => number(numeric(value) * factor, precision),
);

// No lookbehind: Safari before 16.4 cannot build one, and every page showing converted prose would crash there. The
// character before a number (or the start of the text) is matched as the first group and written back unchanged, so a
// number glued to a word character, colon or dot is still left alone. Every pattern below ends in a word character, so
// a match never takes the character the next match needs as its start.
const START = '(^|[^\\w:.])';

function metricProseToMiles(text: string): string {
  return text
    .replace(new RegExp(`${START}([0-9]+):([0-5][0-9])\\s*(?:/|per\\s+)\\s*${KM_UNIT}\\b`, 'gi'),
      (_match, start: string, minutes: string, seconds: string) => start + paceLabel(Number(minutes) * 60 + Number(seconds), 'mi'))
    .replace(new RegExp(`${START}(${NUMBER_PHRASE})\\s*(min(?:utes?)?|sec(?:onds?)?)\\s*(?:/|per\\s+)\\s*${KM_UNIT}\\b`, 'gi'),
      (_match, start: string, value: string, label: string) => `${start}${convertPhrase(value, KM_PER_MILE, 2)} ${label}/mi`)
    // "37.0 seconds gained per km": a rate with one or two words before "per km" converts its number too.
    .replace(new RegExp(`${START}(${NUMBER_PHRASE})\\s*(min(?:utes?)?|sec(?:onds?)?)((?:\\s+[a-z]+){1,2})\\s+per\\s+${KM_UNIT}\\b`, 'gi'),
      (_match, start: string, value: string, label: string, words: string) => `${start}${convertPhrase(value, KM_PER_MILE, 2)} ${label}${words} per mile`)
    .replace(new RegExp(`${START}(${NUMBER_PHRASE})(\\s*-\\s*|\\s*)(${KM_UNIT})\\b`, 'gi'),
      (_match, start: string, values: string, separator: string, unit: string) => {
        const converted = convertPhrase(values, 1 / KM_PER_MILE, 2);
        const hyphenated = separator.includes('-');
        const name = unit.toLowerCase() === 'km' ? 'mi' : hyphenated || converted === '1' ? 'mile' : 'miles';
        return `${start}${converted}${hyphenated ? '-' : ' '}${name}`;
      })
    .replace(new RegExp(`${START}(${NUMBER_PHRASE})(\\s*-\\s*|\\s*)(?:m|metres?|meters?)\\b(?!/)`, 'gi'),
      (_match, start: string, values: string, separator: string) => `${start}${convertPhrase(values, 1 / METRES_PER_FOOT, 1)}${separator.includes('-') ? '-' : ' '}ft`)
    .replace(/\bkilomet(?:re|er)s\b/gi, 'miles')
    .replace(/\bkilomet(?:re|er)\b/gi, 'mile')
    .replace(/\bmet(?:re|er)s\b/gi, 'feet')
    .replace(/\bmet(?:re|er)\b/gi, 'foot')
    .replace(/\bper\s+km\b/gi, 'per mile')
    .replace(/\bkm\b/gi, 'mi');
}

/** Convert canonical metric display prose, leaving source URLs untouched. */
export function unitText(text: string, units: UnitSystem): string {
  if (units === 'km') return text;
  return text.split(/((?:https?:\/\/|www\.)[^\s<>"'`]+)/gi)
    .map(part => /^(?:https?:\/\/|www\.)/i.test(part) ? part : metricProseToMiles(part)).join('');
}
