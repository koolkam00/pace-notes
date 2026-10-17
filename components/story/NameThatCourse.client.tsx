'use client';
import { useState } from 'react';
import Arrow from '@/components/ui/Arrow';

/**
 * Name that course (the redesign spec, section 7.10, #name): one edition's pacing shape against the typical race, three
 * courses to choose from, then the answer, the course's own shape over it and the model's pick. The score lives in
 * component state only. Every round is chosen on the server, from the data.
 */
export type Round = { year: number; answer: string; model: string; options: string[]; signature: number[] };

const W = 320, H = 120, PAD = 14;

function path(values: number[], lo: number, hi: number) {
  return values.map((v, i) => `${i ? 'L' : 'M'}${(PAD + ((W - 2 * PAD) * i) / (values.length - 1)).toFixed(1)} ${(PAD + (H - 2 * PAD) * (1 - (v - lo) / (hi - lo || 1))).toFixed(1)}`).join('');
}

export default function NameThatCourse({ rounds, shapes, sections }: { rounds: Round[]; shapes: Record<string, number[]>; sections: string[] }) {
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [score, setScore] = useState({ you: 0, model: 0, played: 0 });
  const round = rounds[i];
  if (!round) return null;
  const answered = pick !== null;
  const own = shapes[round.answer];
  const all = [...round.signature, ...(own ?? []), 0];
  const lo = Math.min(...all) - 0.5, hi = Math.max(...all) + 0.5;
  const zero = PAD + (H - 2 * PAD) * (1 - (0 - lo) / (hi - lo || 1));
  const choose = (city: string) => {
    if (answered) return;
    setPick(city);
    setScore((s) => ({ you: s.you + (city === round.answer ? 1 : 0), model: s.model + (round.model === round.answer ? 1 : 0), played: s.played + 1 }));
  };
  const next = () => {
    setPick(null);
    if (i + 1 < rounds.length) setI(i + 1);
    else { setI(0); setScore({ you: 0, model: 0, played: 0 }); }
  };
  const right = pick === round.answer;
  return (
    <div className="ntc">
      <figure className="viz viz-frame ntc-figure">
        <svg className="ntc-plot" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
          aria-label={`One edition's pacing shape, section by section, against the typical course${answered && own ? `, with ${round.answer}'s own shape over it` : ''}`}>
          <line className="ntc-zero" x1={PAD} x2={W - PAD} y1={zero} y2={zero} />
          {answered && own ? <path className="ntc-own" d={path(own, lo, hi)} /> : null}
          <path className="ntc-line" d={path(round.signature, lo, hi)} />
        </svg>
        <div className="ntc-axis" aria-hidden="true"><span>{sections[0]}</span><span>{sections[sections.length - 1]}</span></div>
        <figcaption className="ntc-caption">Above the line: slower than the typical course in that section.{answered && own ? <> The pale line is {round.answer} across its editions.</> : null}</figcaption>
      </figure>
      <p className="ntc-q" id={`ntc-q-${i}`}>Which course ran this shape in {round.year}?</p>
      <div className="ntc-options" role="group" aria-labelledby={`ntc-q-${i}`}>
        {round.options.map((city) => (
          <button key={city} type="button" className={`chip ntc-option${answered && city === round.answer ? ' is-answer' : ''}${answered && city === pick && !right ? ' is-miss' : ''}`}
            aria-pressed={pick === city} disabled={answered && city !== pick && city !== round.answer} onClick={() => choose(city)}>{city}</button>
        ))}
      </div>
      <p className="ntc-verdict" aria-live="polite">
        {answered ? <>{right ? 'Yes: ' : `It was ${round.answer}. `}the model picked {round.model}{round.model === round.answer ? ', right too.' : '.'} <span className="ntc-score">You {score.you}/{score.played} · Model {score.model}/{score.played}</span></> : null}
      </p>
      {answered ? <button type="button" className="btn btn-secondary is-compact ntc-next" onClick={next}>{i + 1 < rounds.length ? 'Next race' : 'Play again'}<Arrow /></button> : null}
    </div>
  );
}
