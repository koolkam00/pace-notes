/** Registry of the data stories. A story is published only when its data file is in the verified manifest. */

export interface StoryDefinition {
  slug: string;
  file: string;
  number: string;
  kicker: string;
  title: string;
  dek: string;
  accent: string;
}

export const STORIES: StoryDefinition[] = [
  { slug: 'pacing-types', file: 'archetypes.json', number: '01', kicker: 'The shape of a marathon', title: 'Six ways to run the same race',
    dek: 'Every finish has a shape. Grouping millions of them reveals six recurring pacing types, and the habits that follow runners to their next race.', accent: '#17A673' },
  { slug: 'round-numbers', file: 'finish-times.json', number: '02', kicker: 'Round numbers', title: 'The 3:59 effect',
    dek: 'Finish times pile up just before every hour and half-hour. See how the bunching forms, second by second, and how many races are rescued in the final 2.2 km.', accent: '#FF5B2E' },
  { slug: 'race-replay', file: 'replay.json', number: '03', kicker: 'On the race clock', title: 'Watch a marathon unfold',
    dek: 'Replay eight big-city races from their recorded splits and watch a field of tens of thousands stretch across the course.', accent: '#F4B23E' },
  { slug: 'places', file: 'positions.json', number: '04', kicker: 'Places on the clock', title: 'Pass or be passed',
    dek: 'How much the order of a field changes after 20 km, who moves up late and which section reshuffles the race the most.', accent: '#2F5BFF' },
  { slug: 'final-kick', file: 'kick.json', number: '05', kicker: 'The second half', title: 'The finish-line magnet',
    dek: 'Three in four finishes speed up over the final 2.195 km, yet a final kick rarely undoes a sustained slowdown. Where the field breaks, what a fast start costs and what follows you to your next race.', accent: '#E2416B' },
  { slug: 'who-holds-pace', file: 'demographics.json', number: '06', kicker: 'Gender and age', title: 'Who holds their pace',
    dek: 'At the same finish times, recorded women and men pace their races differently, and so do runners of different ages.', accent: '#7A4DFF' },
  { slug: 'courses', file: 'courses.json', number: '07', kicker: 'Courses, weather and years', title: 'Every course has a fingerprint',
    dek: 'Route maps, elevation and pacing shapes for each marathon, with the weather on race morning and two decades of finish times.', accent: '#0FA3A3' },
];

export function storyHref(story: StoryDefinition) {
  return `/stories/${story.slug}`;
}
