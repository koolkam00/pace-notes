import kept from './kept-holds.json';

/**
 * Producer-held editions kept after review, by adopted release (lib/kept-holds.json). The edition policy
 * (analysis/source_quality.py) leaves out every other hold; /methodology names these as the exception. Owner decision,
 * October 21, 2026, verbatim: "Keep London 2025–26" (their records fall 2.8% and 0.5% short of the official finisher
 * counts). A release with no entry keeps none. scripts/verify-insights.cjs reads the same JSON and checks each is in the
 * release and outside the policy.
 */
export const KEPT_HOLDS: Record<string, readonly { city: string; year: number }[]> = kept;

export const keptHolds = (tag: string) => KEPT_HOLDS[tag] ?? [];
