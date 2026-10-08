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

function metricProseToMiles(text: string): string {
  return text
    .replace(new RegExp(`(?<![\\w:.])([0-9]+):([0-5][0-9])\\s*(?:/|per\\s+)\\s*${KM_UNIT}\\b`, 'gi'),
      (_match, minutes: string, seconds: string) => paceLabel(Number(minutes) * 60 + Number(seconds), 'mi'))
    .replace(new RegExp(`(?<![\\w:.])(${NUMBER_PHRASE})\\s*(min(?:utes?)?|sec(?:onds?)?)\\s*(?:/|per\\s+)\\s*${KM_UNIT}\\b`, 'gi'),
      (_match, value: string, label: string) => `${convertPhrase(value, KM_PER_MILE, 2)} ${label}/mi`)
    // "37.0 seconds gained per km": a rate with one or two words before "per km" converts its number too.
    .replace(new RegExp(`(?<![\\w:.])(${NUMBER_PHRASE})\\s*(min(?:utes?)?|sec(?:onds?)?)((?:\\s+[a-z]+){1,2})\\s+per\\s+${KM_UNIT}\\b`, 'gi'),
      (_match, value: string, label: string, words: string) => `${convertPhrase(value, KM_PER_MILE, 2)} ${label}${words} per mile`)
    .replace(new RegExp(`(?<![\\w:.])(${NUMBER_PHRASE})(\\s*-\\s*|\\s*)(${KM_UNIT})\\b`, 'gi'),
      (_match, values: string, separator: string, unit: string) => {
        const converted = convertPhrase(values, 1 / KM_PER_MILE, 2);
        const hyphenated = separator.includes('-');
        const name = unit.toLowerCase() === 'km' ? 'mi' : hyphenated || converted === '1' ? 'mile' : 'miles';
        return `${converted}${hyphenated ? '-' : ' '}${name}`;
      })
    .replace(new RegExp(`(?<![\\w:.])(${NUMBER_PHRASE})(\\s*-\\s*|\\s*)(?:m|metres?|meters?)\\b(?!/)`, 'gi'),
      (_match, values: string, separator: string) => `${convertPhrase(values, 1 / METRES_PER_FOOT, 1)}${separator.includes('-') ? '-' : ' '}ft`)
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
