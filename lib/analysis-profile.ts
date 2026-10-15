import { AGE_OPTIONS, GOAL_MIN, GOAL_MAX, type Profile } from './personalized-catalog';
import type { PersonalSummary } from './personalized-types';

export const EXAMPLE_PROFILE: Profile = { city: 'All courses', age: 'all', gender: 'all', goal: 240, previous: null, focus: 'prepare' };

export { GOAL_MIN, GOAL_MAX };
/** Whether a `goal` (whole minutes) is one the analyses read from the address; any other value shows the 4:00 example. */
export const isAnalysisGoal = (goal: number) => Number.isInteger(goal) && goal >= GOAL_MIN && goal <= GOAL_MAX;

export function readAnalysisProfile(search: string, summary: PersonalSummary): Profile {
  const params = new URLSearchParams(search);
  const requestedCity = params.get('race') === 'NYC' ? 'New York' : params.get('race');
  const goal = Number(params.get('goal')), previous = Number(params.get('previous'));
  return {
    ...EXAMPLE_PROFILE,
    city: summary.cities.some(row => row.city === requestedCity) ? requestedCity! : EXAMPLE_PROFILE.city,
    age: AGE_OPTIONS.includes(params.get('age') || '') ? params.get('age')! : 'all',
    gender: ['Men', 'Women'].includes(params.get('gender') || '') ? params.get('gender')! : 'all',
    goal: params.has('goal') && isAnalysisGoal(goal) ? goal : 240,
    previous: params.has('previous') && Number.isInteger(previous) && previous >= 90 && previous <= 720 ? previous : null,
  };
}

export function profileSearch(profile: Profile): string {
  const params = new URLSearchParams({ race: profile.city, goal: String(profile.goal), age: profile.age, gender: profile.gender });
  if (profile.previous !== null) params.set('previous', String(profile.previous));
  return '?' + params.toString();
}

export function sameProfile(left: Profile, right: Profile) {
  return left.city === right.city && left.goal === right.goal && left.age === right.age && left.gender === right.gender && left.previous === right.previous;
}
