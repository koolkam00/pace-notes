import type { ReactNode } from 'react';

/**
 * What an explorer sends when the visitor's selection should take over the page's answer card (`pn:hero`, read by
 * HeroSwap): the selection's kicker, its chart drawn in the answer's own grammar, and its "All numbers" for the paper
 * under the card. null puts the example back. Its own module, so an explorer does not bundle HeroSwap to send it.
 */
export type HeroDetail = { kicker: string; chart: ReactNode; values?: ReactNode; scope?: string } | null;
export const HERO_EVENT = 'pn:hero';

/** Send the selection to the answer card (or null for the page's own example). */
export function sendHero(detail: HeroDetail) {
  window.dispatchEvent(new CustomEvent(HERO_EVENT, { detail }));
}

/**
 * After the visitor applies a selection, bring the answer card it redraws into view when its top has scrolled above the
 * header (round 6: the form left the reader below the card, looking at a sentence about a chart they could not see).
 */
export function showAnswerCard() {
  window.requestAnimationFrame(() => {
    const card = document.querySelector<HTMLElement>('#answer .answer-card');
    if (!card) return;
    const header = document.querySelector<HTMLElement>('.site-header')?.getBoundingClientRect().bottom ?? 0;
    if (card.getBoundingClientRect().top >= header) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  });
}
