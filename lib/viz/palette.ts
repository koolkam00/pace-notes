/**
 * The pacing-type palette (the redesign spec, section 3.1): the categorical colours, for pacing types only and always
 * with the type's glyph and a direct label. Order matches the published archetypes: Metronome, Gentle fader, Late fader,
 * Early drifter, Cliff, Fast-start fader. The fast-start fader moved off orange (owner decision 8), so orange only ever
 * means the reading.
 *
 * Both sets pass the dataviz validator (CVD ΔE ≥ 13.1 on paper; on night one adjacent pair, fast-start fader and Cliff,
 * sits at 7.8, legal because every row is labelled and carries its glyph). Server components need the values, so they
 * live here rather than in CSS; SVG marks take both through `typeStyle()` and components/viz CSS picks the night set
 * inside .night and under the dark theme, so no chart chooses colours by theme in JavaScript.
 */
export const ARCHETYPE_COLOURS = ['#0F8F62', '#2F5BFF', '#B07A0C', '#7A4DFF', '#E2416B', '#8E4512'] as const;
export const ARCHETYPE_COLOURS_NIGHT = ['#139C6C', '#5A7CFF', '#C08A1C', '#8D6CF5', '#E0507A', '#B57A2E'] as const;

/** Inline custom properties for a pacing-type mark: `--type` on paper, `--type-night` on night and in dark mode. */
export function typeStyle(index: number): Record<string, string> {
  const i = ((index % ARCHETYPE_COLOURS.length) + ARCHETYPE_COLOURS.length) % ARCHETYPE_COLOURS.length;
  return { '--type': ARCHETYPE_COLOURS[i], '--type-night': ARCHETYPE_COLOURS_NIGHT[i] };
}
