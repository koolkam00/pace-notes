/**
 * Producer-held editions kept after review, by adopted release. The edition policy (analysis/source_quality.py) leaves
 * out every other hold; /methodology names these as the exception. Owner decision, October 21, 2026, verbatim: "Keep
 * London 2025–26" (their records fall 2.8% and 0.5% short of the official finisher counts). A release with no entry
 * keeps none. scripts/verify-insights.cjs checks each is in the release and outside the policy.
 */
export const KEPT_HOLDS: Record<string, readonly { city: string; year: number }[]> = {
  'private-export-20261021-1050': [{ city: 'London', year: 2025 }, { city: 'London', year: 2026 }],
};

export const keptHolds = (tag: string) => KEPT_HOLDS[tag] ?? [];
