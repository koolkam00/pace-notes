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
 * "1:12:55.3"), and a later comma shows a dot. Text that already has letters ("3.5h" or "9.14 am" pasted whole) is left
 * alone. Typed key by key, the dot becomes a colon before the next key arrives, so the readers read the colons the keypad
 * makes as the dots they were where only a dot makes sense: before a unit letter ("3.5h" shows "3:5h", still 3.5 hours)
 * and before a single last digit ("45.5" shows "45:5", still 45.5 minutes); see parseDuration. Readers of short times
 * (the predictor, the split check, the projector) read "25:50:12" as 25 minutes 50.12 seconds where hours cannot be meant.
 * Pace fields ('pace') are never changed while typing, because "8.5" there is 8.5 minutes: they show m:ss when the visitor
 * leaves the field. Never for a field that takes a list of times separated by commas.
 */
export function keypadColons(text: string, mode: DurationMode = 'race'): string {
  if (mode !== 'race' || !/[.,]/.test(text) || /[a-z]/i.test(text)) return text;
  let colons = 0;
  let out = '';
  for (const ch of text) {
    if (ch === ':') colons += 1;
    if (ch !== '.' && ch !== ',') out += ch;
    else if (colons < 2) { out += ':'; colons += 1; } else out += '.';
  }
  return out;
}

/** A touch screen's keypad has no colon; a keyboard has one, so there a typed dot stays a dot. */
const keypadOnly = () => typeof matchMedia !== 'function' || matchMedia('(pointer: coarse)').matches;

/**
 * For a field's change (React's onChange, with e.nativeEvent) or input event: on a touch screen, turns the dot or comma key
 * just pressed into a colon (or, after two group separators, a dot), in the field itself with the caret where it was (the
 * text keeps its length), and returns the field's text. Only that key changes: text already in the field, such as a pasted
 * "25:50.12", keeps its dots when it is edited later, and pasting, dropping, deleting or a keyboard's whole-word insert
 * (a clipboard suggestion's "2:05:31.4") changes nothing. Separators already in the field count, colons or not: a pasted
 * "1.12" has one, so a third group's dot typed after it is the second and last. Without an event that says what was typed,
 * the whole text is read as keypadColons reads it.
 */
export function keypadInput(field: HTMLInputElement, event?: Event, mode: DurationMode = 'race'): string {
  const input = event as InputEvent | undefined;
  const value = field.value;
  if (mode !== 'race' || !keypadOnly()) return value;
  if (!input?.inputType) return place(field, keypadColons(value, mode));
  if (!/^insert(?:Text|CompositionText)$/.test(input.inputType) || (input.data !== '.' && input.data !== ',') || /[a-z]/i.test(value)) return value;
  const at = (field.selectionStart ?? value.length) - 1;
  if (at < 0 || value[at] !== input.data) return value;
  const rest = value.slice(0, at) + value.slice(at + 1);
  const separator = (rest.match(/[:.,]/g)?.length ?? 0) < 2 ? ':' : '.';
  return place(field, value.slice(0, at) + separator + value.slice(at + 1));
}

function place(field: HTMLInputElement, next: string): string {
  if (next !== field.value) {
    const [start, end] = [field.selectionStart, field.selectionEnd];
    field.value = next;
    try { if (start !== null && end !== null) field.setSelectionRange(start, end); } catch { /* not a text field */ }
  }
  return next;
}
