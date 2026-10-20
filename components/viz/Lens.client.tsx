'use client';

import { useRef } from 'react';
import Chips from '@/components/ui/Chips.client';
import Segmented from '@/components/ui/Segmented.client';
import { applyLens } from './lens-layer';

/**
 * A figure's one lens (the redesign spec, section 3.5, Chart frame): a Segmented control (up to five options) or Chips,
 * whose choice is written on the figure as data-k. Every layer of the figure is drawn on the server; CSS shows the one
 * the choice names ([data-layer] elements other than the chosen one carry is-off and fade out), and charts that morph
 * read data-k for their transitions. The figure opens on `defaultValue`, the state its headline names.
 */
export default function Lens({ label, options, defaultValue, chips = false }: {
  label: string;
  options: { value: string; label: string }[];
  defaultValue: string;
  chips?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const choose = (value: string) => {
    const figure = ref.current?.closest<HTMLElement>('.viz');
    if (figure) applyLens(figure, value);
  };
  return (
    <span ref={ref} className="viz-lens-control">
      {chips ? <Chips label={label} options={options} defaultValue={defaultValue} onChange={choose} />
        : <Segmented label={label} options={options} defaultValue={defaultValue} onChange={choose} block={options.length <= 2} />}
    </span>
  );
}
