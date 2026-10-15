// The finish times the analyses read from a `goal` in the address: whole minutes from 1:30 to 12:00. A module of its
// own, so code that only checks a goal does not load the analysis catalog with it.
export const GOAL_MIN = 90;
export const GOAL_MAX = 720;

/** Whether a `goal` (whole minutes) is one the analyses read from the address; any other value shows the 4:00 example. */
export const isAnalysisGoal = (goal: number) => Number.isInteger(goal) && goal >= GOAL_MIN && goal <= GOAL_MAX;
