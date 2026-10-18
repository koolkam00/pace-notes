export type PackStatus = 'ready' | 'enrichment' | 'coming-soon';

export interface PackInfo {
  id: string;
  title: string;
  status: PackStatus;
  group: 'S' | 'R' | 'RN' | 'P' | 'paper';
  enrichment?: boolean;
  parked?: boolean;
}

// Registry of the research packs (ids and titles) whose data files stay published under public/data/packs. Their pages
// closed with the research archive (the redesign spec, section 00): verify-research checks every id here against the
// question catalog, and each former /packs/<id> address keeps a moved stub (lib/seo-routes.ts movedPackIds).
export const PACKS: PackInfo[] = [
  { id: 'smyth_htw', title: 'Sustained slowdown', status: 'ready', group: 'paper' },
  { id: 'rn1_wall_severity', title: 'RN1 — Slowdown severity spectrum', status: 'ready', group: 'RN' },
  { id: 'rn3_heat_curves', title: 'RN3 — Heat curves', status: 'ready', group: 'RN' },
  { id: 'rn4_reference_dependence', title: 'RN4 — Reference dependence', status: 'ready', group: 'RN' },
  { id: 'p4_even_effort_gap', title: 'P4 — Even-effort GAP splits', status: 'ready', group: 'P' },
  { id: 'p1_pace_band_planner', title: 'P1 — Pace band planner', status: 'ready', group: 'P' },
  { id: 'p2_halfway_calculator', title: 'P2 — Halfway calculator', status: 'ready', group: 'P' },
  { id: 'p3_race_week_weather', title: 'P3 — Race-week weather advisory', status: 'ready', group: 'P' },
  { id: 's1_banking_time', title: 'S1 — The price of banking time', status: 'ready', group: 'S' },
  { id: 's2_target_odds', title: 'S2 — Odds of breaking a target time', status: 'ready', group: 'S' },
  { id: 's3_course_breaks', title: 'S3 — Where each marathon breaks people', status: 'enrichment', group: 'S', enrichment: true },
  { id: 's4_time_translation', title: 'S4 — Translate your time to another course', status: 'enrichment', group: 'S', enrichment: true },
  { id: 's5_pacing_vs_difficult_day', title: 'S5 — Pacing vs. difficult race day', status: 'enrichment', group: 'S', enrichment: true },
  { id: 's6_wall_distance_vs_time', title: 'S6 — Slowdown: distance vs elapsed time', status: 'enrichment', group: 'S', enrichment: true },
  { id: 's7_learn_after_blowup', title: 'S7 — Do runners learn after blowing up?', status: 'ready', group: 'S' },
  { id: 's8_age_speed_vs_endurance', title: 'S8 — Age: speed or endurance?', status: 'ready', group: 'S' },
  { id: 's9_weather_penalty', title: 'S9 — Weather penalty for different runners', status: 'enrichment', group: 'S', enrichment: true },
  { id: 's10_goal_slips', title: 'S10 — What happens when a goal slips away?', status: 'ready', group: 'S' },
  { id: 's11_recover_bad_patch', title: 'S11 — Can runners recover from a bad patch?', status: 'ready', group: 'S' },
  { id: 's12_pacing_over_20y', title: 'S12 — 20 years of pacing changes', status: 'enrichment', group: 'S', enrichment: true },
  { id: 'r01_banking_time', title: 'R1 — Banking time cost', status: 'ready', group: 'R' },
  { id: 'r02_recover_slow_start', title: 'R2 — Recover slow start', status: 'ready', group: 'R' },
  { id: 'r03_accel_vs_decel_20k', title: 'R3 — Accel vs decel at 20k', status: 'ready', group: 'R' },
  { id: 'r04_on_pace_goal_hits', title: 'R4 — On-pace goal hits', status: 'ready', group: 'R' },
  { id: 'r05_exceptional_vs_prior', title: 'R5 — Exceptional vs prior', status: 'ready', group: 'R' },
  { id: 'r06_decided_after_30k', title: 'R6 — Decided after 30k', status: 'ready', group: 'R' },
  { id: 'r07_wall_clock_vs_distance', title: 'R7 — Slowdown timing vs distance', status: 'ready', group: 'R' },
  { id: 'r08_early_blowup_signal', title: 'R8 — How early blowup shows', status: 'ready', group: 'R' },
  { id: 'r09_bad_patch_recoverable', title: 'R9 — Bad patch recoverable', status: 'ready', group: 'R' },
  { id: 'r10_unravel_typology', title: 'R10 — Unravel typology', status: 'ready', group: 'R' },
  { id: 'r11_course_section_traps', title: 'R11 — Course section traps', status: 'enrichment', group: 'R', enrichment: true },
  { id: 'r12_fastest_by_ability', title: 'R12 — Fastest by ability', status: 'ready', group: 'R' },
  { id: 'r13_great_day_vs_consistency', title: 'R13 — Great day vs consistency', status: 'ready', group: 'R' },
  { id: 'r14_knowing_course', title: 'R14 — Knowing course', status: 'ready', group: 'R' },
  { id: 'r15_weather_penalty_who', title: 'R15 — Weather penalty (who)', status: 'enrichment', group: 'R', enrichment: true },
  { id: 'r16_groups_hold_or_fall', title: 'R16 — Groups (hold or fall)', status: 'coming-soon', group: 'R', parked: true },
  { id: 'r17_milestone_kick', title: 'R17 — Milestone kick', status: 'ready', group: 'R' },
  { id: 'r18_bq_rule_changes', title: 'R18 — BQ rule changes', status: 'coming-soon', group: 'R', parked: true },
  { id: 'r19_near_miss_return', title: 'R19 — Near miss return', status: 'ready', group: 'R' },
  { id: 'r20_pacing_personalities', title: 'R20 — Pacing personalities', status: 'ready', group: 'R' },
  { id: 'r21_learn_from_blowup', title: 'R21 — Learn from blowup', status: 'ready', group: 'R' },
  { id: 'r22_aging_changes', title: 'R22 — Aging changes', status: 'ready', group: 'R' },
  { id: 'r23_gender_pacing', title: 'R23 — Gender pacing', status: 'ready', group: 'R' },
  { id: 'r24_interval_after_pb', title: 'R24 — Interval after PB', status: 'ready', group: 'R' },
  { id: 'r25_huge_kick_next', title: 'R25 — Huge kick (next)', status: 'ready', group: 'R' },
  { id: 'r26_pacing_over_20y', title: 'R26 — 20y pacing', status: 'enrichment', group: 'R', enrichment: true },
];

export const PACK_IDS: string[] = PACKS.map((p) => p.id);
