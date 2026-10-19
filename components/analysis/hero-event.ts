import type { ReactNode } from 'react';

/**
 * What an explorer sends when the visitor's selection should take over the page's answer card (`pn:hero`, read by
 * HeroSwap): the selection's kicker, its chart drawn in the answer's own grammar, and its "All numbers" for the paper
 * under the card. null puts the example back. Its own module, so an explorer does not bundle HeroSwap to send it.
 */
export type HeroDetail = { kicker: string; chart: ReactNode; values?: ReactNode } | null;
export const HERO_EVENT = 'pn:hero';

/** Send the selection to the answer card (or null for the page's own example). */
export function sendHero(detail: HeroDetail) {
  window.dispatchEvent(new CustomEvent(HERO_EVENT, { detail }));
}
