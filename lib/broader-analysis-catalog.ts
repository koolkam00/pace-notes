/** Broader single-race views supplement, rather than redefine, prior-result questions. */
export const BROADER_ARCHIVE: Record<string, { kind: 'weather-profile' | 'course-consistency' | 'course-profile' | 'race-day' | 'opening'; title: string; description: string; opening?: string }> = {
  r02_recover_slow_start: { kind: 'opening', title: 'What follows a slower opening?', description: 'Compare a slower first section with the pace that follows, including finishes with no earlier results.', opening: 'slow5' },
  r01_banking_time: { kind: 'opening', title: 'What follows a faster opening?', description: 'Trace quick first sections through the later stages and finish.', opening: 'fast10' },
  r34_pacing_risk_reward: { kind: 'opening', title: 'Which openings have more variable outcomes?', description: 'Compare late time differences and their observed ranges across opening groups.', opening: 'steady' },
  r13_great_day_vs_consistency: { kind: 'course-consistency', title: 'Where is late-race pacing more consistent?', description: 'Compare the spread of late slowing within race editions, without needing an earlier marathon.' },
  r35_course_adaptation: { kind: 'course-profile', title: 'How does pacing unfold on different courses?', description: 'Follow how pace changed section by section on each course.' },
  r15_weather_penalty_who: { kind: 'weather-profile', title: 'How does pacing vary with temperature?', description: 'Compare the full race pattern across cooler and warmer editions, including runners without recorded history.' },
  s5_pacing_vs_difficult_day: { kind: 'race-day', title: 'How did pacing compare on the same race day?', description: 'Compare race-edition pacing summaries, then use Find a runner for your own same-edition peer comparison.' },
};
const aliases: Record<string, string> = {
  ext_slow_start_responses: 'r02_recover_slow_start', ext_opening_tradeoffs: 'r01_banking_time', s1_banking_time: 'r01_banking_time',
  ext_strategy_outcome_spread: 'r34_pacing_risk_reward', ext_course_outcome_spread: 'r13_great_day_vs_consistency',
  ext_course_response_profiles: 'r35_course_adaptation', ext_weather_pacing_patterns: 'r15_weather_penalty_who',
  s9_weather_penalty: 'r15_weather_penalty_who', rn3_heat_curves: 'r15_weather_penalty_who', ext_race_day_context: 's5_pacing_vs_difficult_day',
};
export function broaderArchive(id: string) { return BROADER_ARCHIVE[aliases[id] || id]; }
export const BROADER_GUIDE: Record<string, { href: string; label: string }> = {
  opening: { href: '/analyses/starting-pace', label: 'Explore opening pace without an earlier race' },
  downhill: { href: '/analyses/downhill-start', label: 'Explore downhill openings without an earlier race' },
  courses: { href: '/analyses/course-comparison', label: 'Compare courses without an earlier race' },
  weather: { href: '/analyses/race-day-weather', label: 'Explore weather without an earlier race' },
};
