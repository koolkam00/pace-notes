'use client';

import { useEffect, useRef } from 'react';
import { useUnits } from '@/components/UnitsProvider';
import { keypadInput } from '@/lib/keypad';

/**
 * The home page's course-and-goal form is a plain GET form to /tools/plan, so it works before (and without) the page's
 * JavaScript. Once this has run it adds the two things only the browser knows: the visitor's units, as `units=km` when
 * kilometres are chosen (a disabled field is not sent, so miles, the default, add nothing), and an empty goal left out,
 * so the planner opens at its 4:00 example, as the field's placeholder shows. Before then, or without JavaScript, an
 * empty goal is sent as `goal=`, which the planner reads as a cleared goal and asks for one (S1 checks both). It also
 * makes the goal's dot key type a colon (lib/keypad.ts: the numeric keypad has no colon); without it a typed "3.30" is
 * sent as it is, and the planner reads it as 3:30 too.
 * Nothing is read or sent anywhere else: the form submits as it would without this.
 */
export default function PlanFormUnits() {
  const { units, resolved } = useUnits();
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = field.current?.form;
    if (!form) return;
    const dropEmptyGoal = (event: FormDataEvent) => { if (!String(event.formData.get('goal') ?? '').trim()) event.formData.delete('goal'); };
    const goal = form.elements.namedItem('goal');
    const colons = (event: Event) => { if (event.target instanceof HTMLInputElement) keypadInput(event.target, event); };
    form.addEventListener('formdata', dropEmptyGoal);
    if (goal instanceof HTMLInputElement) goal.addEventListener('input', colons);
    return () => {
      form.removeEventListener('formdata', dropEmptyGoal);
      if (goal instanceof HTMLInputElement) goal.removeEventListener('input', colons);
    };
  }, []);
  return <input ref={field} type="hidden" name="units" value="km" disabled={!(resolved && units === 'km')} />;
}
