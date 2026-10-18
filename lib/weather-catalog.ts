import type { WeatherDefinition } from './weather-types';

export const WEATHER_QUESTIONS: WeatherDefinition[] = [
  { id: 'humidity', slug: 'humidity-and-pacing', shortTitle: 'Humidity and pacing', title: 'Do runners slow down more on humid days?', description: 'Compare moisture and late-race pacing at similar temperatures.', purpose: 'Moisture and temperature belong together when comparing race conditions.' },
  { id: 'warming', slug: 'warming-and-pacing', shortTitle: 'When the race gets warmer', title: 'What happens when the race gets warmer?', description: 'See how a rising temperature relates to holding pace later in the race.', purpose: 'The temperature at the start is only part of the day. Compare how much conditions warm during the first four hours with pacing later in the race.' },
  { id: 'wind', slug: 'wind-and-pacing', shortTitle: 'Wind and holding pace', title: 'How do windy and calm races compare?', description: 'Understand what typical wind differences can tell us about late-race slowing.', purpose: 'Wind can change the feel of a race. Here, we ask a narrower question: whether typical differences in start-hour wind speed line up with more slowing later.' },
];
/** Where a weather question is answered: its tab of race-day weather (the old /analyses/<slug> addresses forward there,
 * lib/seo-routes.ts movedTo). A question without a tab of its own opens the first, start temperature. */
export const WEATHER_TABS: Readonly<Record<string, string>> = { warming: 'warming', wind: 'wind' };
export const weatherHref = (item: WeatherDefinition) => `/analyses/race-day-weather#${WEATHER_TABS[item.id] ?? 'temperature'}`;
