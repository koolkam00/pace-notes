import type { GuideAnswer } from '@/lib/personalized';

/**
 * What an explorer sends when the visitor's selection should take over the page's answer card (`pn:hero`, read by
 * HeroSwap); null puts the example back. Its own module, so every explorer page does not bundle HeroSwap to send it.
 */
export type HeroDetail = { id: string; answer: GuideAnswer; goal: number; kicker: string } | null;
export const HERO_EVENT = 'pn:hero';
