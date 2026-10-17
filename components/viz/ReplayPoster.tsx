import { FIELD_BOX, fieldX, fieldY, MARATHON, type ReplayPosterData } from './replay-geometry';

/**
 * The replay's poster (the redesign spec, section 3.6): the flag frame drawn on the server, a 40-point quantile ribbon
 * of the field's positions when the first runner finished, in the same rank-lane geometry the canvas uses. The canvas
 * fades in over it, so a replay never opens on an empty start line, and it is all there is under reduced motion
 * until play is pressed. About 1 KB.
 */
export default function ReplayPoster({ data }: { data: ReplayPosterData }) {
  const d = data.ribbon.map(([f, km], i) => `${i ? 'L' : 'M'}${(fieldX(km) * 1000).toFixed(1)} ${(fieldY(f) * 1000).toFixed(1)}`).join('');
  const finish = (fieldX(MARATHON) * 1000).toFixed(1);
  const half = (fieldX(20) * 1000).toFixed(1);
  return (
    <svg className="replay-poster" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <line className="replay-poster-mat" x1={half} x2={half} y1={FIELD_BOX.top * 1000} y2={(1 - FIELD_BOX.bottom) * 1000} />
      <line className="replay-poster-finish" x1={finish} x2={finish} y1={FIELD_BOX.top * 1000} y2={(1 - FIELD_BOX.bottom) * 1000} />
      <path className="replay-poster-field" d={d} />
    </svg>
  );
}
