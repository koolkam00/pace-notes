export type AnalysisId = 'profile' | 'opening' | 'checkpoint' | 'sections' | 'courses' | 'weather' | 'terrain' | 'ambition' | 'gains' | 'age';
/** One of the ten ranked analyses. `description` is the one-line card text; `dek` is the page's short opening line. Method lives on /methodology only. */
export type AnalysisDefinition = {
  id: AnalysisId; slug: string; rank: number; title: string; shortTitle: string;
  description: string; dek: string;
  category: 'Pace your race' | 'Know your course' | 'Understand your result';
  controls: { course: boolean; time: boolean; age: boolean; gender: boolean; previous: boolean };
};

const all = { course: true, time: true, age: true, gender: true, previous: true };
export const TEN_ANALYSES: AnalysisDefinition[] = [
  { id: 'profile', slug: 'pacing-pattern', rank: 1, title: 'How do runners near my time pace the race?', shortTitle: 'Your pacing pattern', category: 'Pace your race', description: 'See the rhythm of a marathon, from the first 5 km to the finish.', dek: 'A finish time says how long a race took. The splits show how it unfolded, section by section.', controls: all },
  { id: 'opening', slug: 'starting-pace', rank: 2, title: 'What happens after a very fast start?', shortTitle: 'Fast starts, late slowing', category: 'Pace your race', description: 'Follow a fast start through late slowing, its onset and the finish time.', dek: 'See how often a fast start was followed by a sustained slowdown, where it began and what it meant for the finish.', controls: { ...all, time: false } },
  { id: 'checkpoint', slug: 'checkpoint', rank: 3, title: 'What can my checkpoint time tell me?', shortTitle: 'From a checkpoint', category: 'Pace your race', description: 'Enter a time at 20, 30 or 35 km and explore the finishes that followed.', dek: 'See how runners who reached the same checkpoint at your time went on to finish.', controls: { ...all, previous: false } },
  { id: 'sections', slug: 'where-time-is-gained', rank: 4, title: 'Where is a target time won or lost?', shortTitle: 'The minutes that matter', category: 'Understand your result', description: 'Look section by section at runners just under and just over a target.', dek: 'Two close finish times can hide very different races. See the sections where they split apart.', controls: all },
  { id: 'courses', slug: 'course-comparison', rank: 5, title: 'How does pacing compare across courses?', shortTitle: 'Compare the courses', category: 'Know your course', description: 'Compare late slowing and pacing across courses, with an earlier-result option.', dek: 'See how race fields held their pace on each course.', controls: { ...all, course: false, time: false } },
  { id: 'weather', slug: 'race-day-weather', rank: 6, title: 'How does the weather change pacing?', shortTitle: 'Race-day weather', category: 'Know your course', description: 'Explore observed results across start-hour temperature bands.', dek: 'See how pacing held up in cooler and warmer races.', controls: { ...all, time: false } },
  { id: 'terrain', slug: 'hills-and-pacing', rank: 7, title: 'Where do hills and pace changes line up?', shortTitle: 'Hills and pacing', category: 'Know your course', description: 'Place a course’s elevation profile beside its section paces.', dek: 'Choose a course to see where its climbs and descents line up with changes in pace.', controls: all },
  { id: 'ambition', slug: 'finish-time-context', rank: 8, title: 'How does my target compare with the field?', shortTitle: 'Your target in context', category: 'Pace your race', description: 'See where a selected finish time falls among comparable results.', dek: 'A target means something different in every field. See where your time falls.', controls: all },
  { id: 'gains', slug: 'finding-improvement', rank: 9, title: 'Where do improving runners find time?', shortTitle: 'Where runners improve', category: 'Understand your result', description: 'Find the opening, middle and late-race minutes behind improved finishes.', dek: 'See where improving runners found their minutes: early, in the middle or late in the race.', controls: all },
  { id: 'age', slug: 'age-and-pacing', rank: 10, title: 'How does pacing differ across age groups?', shortTitle: 'Age and pace retention', category: 'Understand your result', description: 'Compare the ability to hold pace across ages and recorded genders.', dek: 'See how well each age group held its pace from the first 20 km to the next.', controls: { ...all, age: false } },
];

export const analysisHref = (item: AnalysisDefinition) => '/analyses/' + item.slug;
export function analysisBySlug(slug: string) { return TEN_ANALYSES.find(item => item.slug === slug); }
