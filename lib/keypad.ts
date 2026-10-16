/**
 * The dot key types a colon in clock-style time fields. Those fields open the numeric keypad (inputMode="decimal"), which on
 * an iPhone has a dot (a comma in some locales) but no colon, and no inputmode offers digits with a colon. A module of its
 * own and tiny, so pages that load the tools' time reader only when it is needed (the runner search, the home page's plan
 * form) do not carry it; lib/tools/time.ts re-exports keypadColons for the tools.
 */
import type { DurationMode } from '@/lib/tools/time';

/**
 * A single race time (h:mm or h:mm:ss) as the keypad types it: every dot or comma becomes a colon, so "3.30" reads 3:30
 * and "1.12.55" reads 1:12:55. At most two colons are made; a later dot stays a dot (tenths of a second, as trackers print
 * "1:12:55.3"). Text that already has letters ("3.5h" or "9.14 am" pasted whole) is left alone. Typed key by key, the dot
 * becomes a colon before a unit letter arrives ("3.5h" shows "3:5h"); parseDuration reads a race time's colon before a
 * unit as that dot, so it is still 3.5 hours. Pace fields ('pace') are never changed while typing,
 * because "8.5" there is 8.5 minutes: they show m:ss when the visitor leaves the field. Never for a field that takes a list
 * of times separated by commas.
 */
export function keypadColons(text: string, mode: DurationMode = 'race'): string {
  if (mode !== 'race' || !/[.,]/.test(text) || /[a-z]/i.test(text)) return text;
  let colons = (text.match(/:/g) ?? []).length;
  let out = '';
  for (const ch of text) {
    if ((ch === '.' || ch === ',') && colons < 2) { out += ':'; colons += 1; } else out += ch;
  }
  return out;
}

/**
 * For a field's change (React's onChange, with e.nativeEvent) or input event: puts keypadColons into the field itself, the
 * caret where it was (the text keeps its length), and returns the field's text. Pasted or dropped text stays as it is,
 * since every time reader accepts dots and commas and a pasted "25:50.12" keeps its tenths.
 */
export function keypadInput(field: HTMLInputElement, event?: Event, mode: DurationMode = 'race'): string {
  const kind = (event as InputEvent | undefined)?.inputType ?? '';
  if (/^insertFrom(?:Paste|Drop)/.test(kind)) return field.value;
  const next = keypadColons(field.value, mode);
  if (next !== field.value) {
    const [start, end] = [field.selectionStart, field.selectionEnd];
    field.value = next;
    try { if (start !== null && end !== null) field.setSelectionRange(start, end); } catch { /* not a text field */ }
  }
  return next;
}
