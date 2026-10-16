'use client';

import { useEffect, useRef } from 'react';
import { useUnits } from '@/components/UnitsProvider';

/**
 * The home page's course-and-goal form is a plain GET form to /tools/plan, so it works before (and without) the page's
 * JavaScript. Once this has run it adds the two things only the browser knows: the visitor's units, as `units=km` when
 * kilometres are chosen (a disabled field is not sent, so miles, the default, add nothing), and an empty goal left out,
 * so the planner opens at its 4:00 example, as the field's placeholder shows. Before then, or without JavaScript, an
 * empty goal is sent as `goal=`, which the planner reads as a cleared goal and asks for one (S1 checks both).
 * Nothing is read or sent anywhere else: the form submits as it would without this.
 */
export default function PlanFormUnits() {
  const { units, resolved } = useUnits();
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = field.current?.form;
    if (!form) return;
    const dropEmptyGoal = (event: FormDataEvent) => { if (!String(event.formData.get('goal') ?? '').trim()) event.formData.delete('goal'); };
    form.addEventListener('formdata', dropEmptyGoal);
    return () => form.removeEventListener('formdata', dropEmptyGoal);
  }, []);
  return <input ref={field} type="hidden" name="units" value="km" disabled={!(resolved && units === 'km')} />;
}
