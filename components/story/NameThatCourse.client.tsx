'use client';
import { useState } from 'react';
import Arrow from '@/components/ui/Arrow';

/**
 * Name that course (the redesign spec, section 7.10, #name): one edition's pacing shape against the typical race, three
 * courses to choose from, then the answer, with the course's own shape across its editions drawn over the edition's.
 * The beat's H2 asks the question (`labelledBy` names it for the choices), so the round shows its year as a plain label.
 * Sections sit at their distance along the course (`x`, km) with the fingerprint chart's mats as ticks, so a dip can be
 * placed. Every round is chosen on the server, from the data; the pick lives in component state only.
 */
export type Round = { year: number; answer: string; model: string; options: string[]; signature: number[] };

const W = 320, H = 120, PAD = 14;

export default function NameThatCourse({ rounds, shapes, x, length, ticks, labelledBy }: {
  rounds: Round[]; shapes: Record<string, number[]>; x: number[]; length: number; ticks: { km: number; label: string }[]; labelledBy: string;
}) {
  const px = (km: number) => PAD + ((W - 2 * PAD) * km) / length;
  const path = (values: number[], lo: number, hi: number) =>
    values.map((v, i) => `${i ? 'L' : 'M'}${px(x[i]).toFixed(1)} ${(PAD + (H - 2 * PAD) * (1 - (v - lo) / (hi - lo || 1))).toFixed(1)}`).join('');
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const round = rounds[i];
  if (!round) return null;
  const answered = pick !== null;
  const own = shapes[round.answer];
  const all = [...round.signature, ...(own ?? []), 0];
  const lo = Math.min(...all) - 0.5, hi = Math.max(...all) + 0.5;
  const zero = PAD + (H - 2 * PAD) * (1 - (0 - lo) / (hi - lo || 1));
  const right = pick === round.answer;
  // Whether this edition's shape was nearest its own course's other years (the shape match named it), said as data.
  const typical = round.model === round.answer;
  const next = () => { setPick(null); setI(i + 1 < rounds.length ? i + 1 : 0); };
  return (
    <div className="ntc">
      <figure className="viz viz-frame ntc-figure">
        <p className="ntc-year">The {round.year} edition</p>
        <svg className="ntc-plot" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
          aria-label={`One edition's pacing shape, section by section, against the typical course${answered && own ? `, with ${round.answer}'s own shape across its editions over it` : ''}`}>
          <line className="ntc-zero" x1={PAD} x2={W - PAD} y1={zero} y2={zero} />
          {answered && own ? <path className="ntc-own" d={path(own, lo, hi)} /> : null}
          <path className="ntc-line" d={path(round.signature, lo, hi)} />
        </svg>
        <div className="ntc-axis" aria-hidden="true">
          {ticks.map((t, k) => (
            // The ends sit flush with the plot's edges; the mats between are centred on their distance.
            <span key={t.label} style={k === 0 ? { left: 0, transform: 'none' } : k === ticks.length - 1 ? { right: 0, transform: 'none' } : { left: `${((px(t.km) / W) * 100).toFixed(2)}%` }}>{t.label}</span>
          ))}
        </div>
        <figcaption className="ntc-caption">
          {answered && own ? <>Grey: {round.answer} across its editions.</> : <>Above the dashed line: slower than the typical course in that section.</>}
        </figcaption>
      </figure>
      <div className="ntc-options" role="group" aria-labelledby={labelledBy}>
        {round.options.map((city) => {
          const state = !answered ? '' : city === round.answer ? ' is-answer' : city === pick ? ' is-miss' : ' is-out';
          return (
            <button key={city} type="button" className={`chip ntc-option${state}`} aria-pressed={pick === city}
              disabled={answered && city !== pick && city !== round.answer} onClick={() => { if (!answered) setPick(city); }}>
              {answered && city === round.answer ? <svg className="ntc-check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" /></svg> : null}
              {city}
            </button>
          );
        })}
      </div>
      <p className="ntc-verdict" aria-live="polite">
        {answered ? <>{right ? `Yes, ${round.answer}.` : `It was ${round.answer}.`}{typical ? ' Its shape matched its other years.' : ''}</> : null}
      </p>
      {answered ? <button type="button" className="btn btn-secondary is-compact ntc-next" onClick={next}>{i + 1 < rounds.length ? 'Next race' : 'Play again'}<Arrow /></button> : null}
    </div>
  );
}
