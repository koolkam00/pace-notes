export type ThemeId = 'strategy' | 'courses' | 'goals' | 'differences' | 'learning';
export type QuestionDefinition = { number: number; id: string; title: string; theme: ThemeId; aliases?: string[] };

export const THEMES: { id: ThemeId; title: string }[] = [
  { id: 'strategy', title: 'Race strategy' },
  { id: 'courses', title: 'Courses & conditions' },
  { id: 'goals', title: 'Goals & finishing' },
  { id: 'differences', title: 'Runner differences' },
  { id: 'learning', title: 'Learning over time' },
];

// Question numbers follow the five themes. Existing route IDs and anchors stay stable.
const definitions: Omit<QuestionDefinition, 'number'>[] = [
  { theme: 'strategy', id: 'r10_unravel_typology', title: 'How do people actually pace a marathon?' },
  { theme: 'strategy', id: 'r05_exceptional_vs_prior', title: 'What does an unusually good race look like?' },
  { theme: 'strategy', id: 'r01_banking_time', title: 'What are the rewards and risks of an aggressive start?', aliases: ['s1_banking_time'] },
  { theme: 'strategy', id: 'r02_recover_slow_start', title: 'How do runners successfully respond to a slow start?' },
  { theme: 'strategy', id: 'r03_accel_vs_decel_20k', title: 'Can two runners reach 20 km together but have different prospects?' },
  { theme: 'strategy', id: 'r08_early_blowup_signal', title: 'How early can the splits reveal how the race will finish?' },
  { theme: 'strategy', id: 'r09_bad_patch_recoverable', title: 'When can runners regain their rhythm after a bad patch?', aliases: ['s11_recover_bad_patch'] },
  { theme: 'strategy', id: 'r30_negative_split_success', title: 'Is a negative split always associated with a better performance?' },
  { theme: 'strategy', id: 'r31_multiple_good_strategies', title: 'Is there one good pacing strategy, or several?' },
  { theme: 'strategy', id: 'r34_pacing_risk_reward', title: 'Which pacing approaches offer consistency, and which are more variable?' },
  { theme: 'courses', id: 's3_course_breaks', title: 'What is each course’s pacing fingerprint?' },
  { theme: 'courses', id: 'r11_course_section_traps', title: 'How do runners adjust their pace to climbs and descents?' },
  { theme: 'courses', id: 'r12_fastest_by_ability', title: 'How do the same runners’ times compare across courses?', aliases: ['s4_time_translation'] },
  { theme: 'courses', id: 'r13_great_day_vs_consistency', title: 'How do finish times and consistency vary across marathons?' },
  { theme: 'courses', id: 'r14_knowing_course', title: 'Does late pacing differ with course experience?' },
  { theme: 'courses', id: 'r15_weather_penalty_who', title: 'How does marathon pacing vary with the weather?', aliases: ['s9_weather_penalty'] },
  { theme: 'courses', id: 's5_pacing_vs_difficult_day', title: 'Was it my pacing or a difficult race day?' },
  { theme: 'courses', id: 'r16_groups_hold_or_fall', title: 'How does running in a group relate to later pace?' },
  { theme: 'courses', id: 'r33_start_congestion', title: 'How does a crowded start relate to later pace?' },
  { theme: 'courses', id: 'r35_course_adaptation', title: 'Are stronger performers better at adjusting their pace to the course?' },
  { theme: 'goals', id: 'r04_on_pace_goal_hits', title: 'Does being on pace mean you will hit your goal?', aliases: ['s2_target_odds'] },
  { theme: 'goals', id: 'r06_decided_after_30k', title: 'How much of a marathon is decided after 30 km?' },
  { theme: 'goals', id: 'r17_milestone_kick', title: 'How much finishing speed appears when a milestone is within reach?' },
  { theme: 'goals', id: 'r18_bq_rule_changes', title: 'Did near-qualifying finishes shift after new rules?' },
  { theme: 'goals', id: 's10_goal_slips', title: 'What happens when a goal slips away?' },
  { theme: 'goals', id: 'r25_huge_kick_next', title: 'Does a strong finish suggest unused capacity?' },
  { theme: 'differences', id: 'r07_wall_clock_vs_distance', title: 'Do pacing changes follow distance or elapsed time?', aliases: ['s6_wall_distance_vs_time'] },
  { theme: 'differences', id: 'r20_pacing_personalities', title: 'Do runners have persistent pacing habits?' },
  { theme: 'differences', id: 'r22_aging_changes', title: 'How do speed and pace retention vary by age?', aliases: ['s8_age_speed_vs_endurance'] },
  { theme: 'differences', id: 'r23_gender_pacing', title: 'How does pacing differ across recorded gender groups?' },
  { theme: 'learning', id: 'r19_near_miss_return', title: 'Is a near miss followed by a recorded return?' },
  { theme: 'learning', id: 'r21_learn_from_blowup', title: 'What changes as runners gain experience?', aliases: ['s7_learn_after_blowup'] },
  { theme: 'learning', id: 'r24_interval_after_pb', title: 'How does time between marathons relate to the next finish?' },
  { theme: 'learning', id: 'r26_pacing_over_20y', title: 'How have marathon speed and pacing changed over time?', aliases: ['s12_pacing_over_20y'] },
  { theme: 'learning', id: 'r32_where_pbs_are_gained', title: 'Where do runners gain the time that produces a personal best?' },
];

export const QUESTIONS: QuestionDefinition[] = definitions.map((question, index) => ({ ...question, number: index + 1 }));

export const EXTRA_TITLES: Record<string, string> = {
  smyth_htw: 'How often do marathon runners experience sustained slowdown?',
  rn1_wall_severity: 'How severe is late-race slowing?',
  rn3_heat_curves: 'How does pacing vary with temperature?',
  rn4_reference_dependence: 'Do runners bunch just before round-number finish times?',
  p1_pace_band_planner: 'How do comparable runners pace their marathons?',
  p2_halfway_calculator: 'What can your 20 km time tell you about your finish?',
  p3_race_week_weather: 'Are race-day weather forecasts available?',
  p4_even_effort_gap: 'How much does the pacing pattern change after course adjustment?',
};

export function questionForPack(id: string): QuestionDefinition | undefined {
  return QUESTIONS.find(question => question.id === id || question.aliases?.includes(id));
}
