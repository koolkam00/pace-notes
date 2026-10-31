# Autopilot backlog

The autopilot re-ranks this list every run against fresh evidence, adds what it learns, and moves items between sections. Each item says:
- what is wrong and the evidence (aggregates, dated);
- the hypothesis;
- the metric it should move;
- reach, effort and risk.

The first entries were seeded on 2026-10-14 from a full diagnosis of the live site and 30 days of PostHog data. In that window there were about 510 visits: 78% on phones, 83% landing on the home page, mostly direct or from Instagram.

Score = reach × expected effect × evidence ÷ effort, adjusted for risk. Don't let the backlog grow past about 25 items: merge duplicates and drop stale ones, giving the reason in the item.

## In flight
Nothing (2026-10-30). The two items that were here moved to Done, with the reason in each.

## Ready (ranked)

1. **Make the home page lighter on phones**
   - **Evidence (2026-10-14, lab, 390 px, 4× CPU, 1.6 Mbps):**
     - total blocking time 1.6–4.1 s;
     - FCP/LCP 1.9–3.3 s;
     - page weight 895 KB, of which 395 KB is fonts and 325 KB is JS;
     - home HTML 667 KB raw, about 300 KB of it inline SVG (2,152 rects);
     - 3,929 elements before interactive;
     - 27 phone screens long.
   - **Change:**
     - Draw the below-the-fold charts (PacingBarcode, FinishHistogram, SecondsLens, GapGauge, BreakEven, GhostRace, Untangle) only when they come within about one screen, using fixed-height placeholders. Keep the text server-rendered.
     - Subset or trim the Fraunces "full" fonts (119 + 147 KB). Load the italic only where it is used.
   - **Metric:** quick_exit_rate, phone LCP p75, home_continuation_rate.
   - Reach: very high. Effort: M–L. Risk: medium (visual), so check screenshots carefully.
   - **Needs re-measure (2026-10-30):** the charts named above no longer exist after the October redesign (0 references in `app/`, `components/` and `lib/`), and the font files changed with it (`app/styles/fonts.css`). Measure the current home page before choosing this.
2. **Cut idle animation cost**
   - **Evidence:** with the page idle at 4× CPU, main-thread work per 10 s was 2.6 s on `/stories` and `/tools` (RunnerLane redraws 50×/s via React state in `components/art/useTicker.ts`) and 4.0 s on the home page with the replay playing.
   - **Change:** move RunnerLane to CSS or Web Animations transforms. Cap the replay at 30 fps and update its stats panel at 4 Hz or less. Pause animations that are off screen.
   - **Metric:** INP p75 and battery-friendliness; lab total blocking time.
   - Reach: high. Effort: S–M. Risk: low.
   - **Needs re-measure (2026-10-30):** `RunnerLane` no longer exists (0 references); `components/art/useTicker.ts` is still used by `components/viz/RaceReplay.tsx`, `components/SiteHeader.tsx` and `components/MotionToggle.tsx`. Measure idle main-thread work on the current pages first.
3. **Shorten or restructure the 27-screen home story for phones**
   - **Evidence:** in recordings, the deepest home scroll was 2,063–5,389 px out of 22.8k on phones. People who stay do read: before the redesign the median time before a second page was 6.5 s, after it 46.5 s.
   - **Change ideas** (pick one per run):
     - a sticky chapter index;
     - collapse each chapter to a "key finding" card with "read the full chapter";
     - move the strongest chapter first.
   - Use `home_depth@v1` and `section_viewed` to see where readers stop before choosing.
   - **Metric:** home_depth, answered_visit_rate.
   - Reach: very high. Effort: M. Risk: medium. Best run as an experiment after `home-hero-v1` concludes.
   - **Correction (2026-10-30):** `home-hero-v1` never ran (see Done). The 27-screen home described here was replaced by the StoryBrand home (#65, `b7a675c`, 2026-10-16), so re-measure first. `home_depth@v1` counts `chapter-*` sections, which that home no longer sends, so this item waits for the owner's `@v2` decision on the metrics (`docs/AUTOPILOT.md`, setup and prerequisites).
4. **Explain why totals differ**
   - **Evidence (refreshed October 17, 2026, release `htw-db-2026-10-16-1652`, from the built pages):** pages print different group totals without saying why: the home hero says "3.9 million"; `/research` and `/slowdown` print 3,871,767 finishes; `/stories/pacing-types` prints 3,733,382 (the pacing-type group); `/stories/final-kick` prints 3,710,359 (the final-kick group). The 0934-era figures (3,414,116, 3,517,336, 4.46 million, 3.26 million) are gone, and the tools page no longer prints a total. Since October 16 the explanation of each total lives only on `/methodology` (insights-only rule).
   - **Change:** link the first figure on each page that prints a group total to the matching /methodology anchor, so the difference is one tap away. No popover or method text on the page itself (insights-only rule), and no new calculations.
   - **Metric:** feedback `numbers_look_wrong` share, trust (qualitative).
   - Reach: medium. Effort: S. Risk: low.
   - **Update (2026-10-30):** the adopted release is now `private-export-20261021-1050`, whose eligible total is 4,108,749 (`/data/live.json`, `corpus.eligible_finishes`); the totals above are 1652's. Re-read which totals the pages print before choosing this.
5. **Lighten `/runners` (UI part only)**
   - **Evidence:**
     - it downloads a 326.7 KB `manifest.json` before search works, about 1 MB in total;
     - phone CLS is 0.078;
     - 23.6% of searches find nothing.
   - **Change:** reserve space for the coverage panel and show the search box immediately, with a clear "loading names…" state. Splitting the manifest touches the data export, so it needs the owner.
   - **Metric:** no_match_search_rate, `/runners` quick exits, CLS.
   - Reach: medium. Effort: S. Risk: low.
   - **Update (2026-10-30):** under 1050 the committed `public/data/runners/manifest.json` is 926,117 B (uncompressed). Re-measure what the page downloads before choosing this.
6. **Investigate rage clicks on tool steppers**
   - **Evidence:** one phone recording (2026-10) had 50 rage clicks across `/courses` and then the tools. They may come from repeated taps on stepper buttons.
   - **Change:** check whether stepper buttons need press-and-hold or larger steps on phones. Fix this only if recordings show frustration rather than deliberate repeated taps.
   - Reach: low–medium. Effort: S.
7. **Story pages: a clear "what next" at the end**
   - **Evidence:** 18 `/stories` → `/stories` moves were hidden before per-story paths existed. Story completion is now measurable (`story_completion_rate@v1`).
   - **Change:** at the end of each story, add one strong next step that matches the story: the related tool prefilled, or the next story. Consider a reading-progress cue.
   - **Metric:** story_completion_rate, answered_visit_rate.
   - Reach: medium. Effort: S.
8. **Predictor page as a landing page**
   - **Evidence:** the predictor is the most-opened tool (19 visits in 30 days) and the most common exit page after the home page. All 4 visits that landed on it left after one page.
   - **Change:** after a result, offer the two most useful next steps prominently: the pace band and "how did finishers near this time pace?". The tool handoffs in the setup bundle start this; evaluate them first.
   - Reach: medium. Effort: S.

## Needs the owner (open an `autopilot:needs-owner` issue once; don't duplicate)
- **Point each Instagram post at the story it previews**, with `utm_source=instagram&utm_medium=social&utm_content=post` (or `story`, `reel`, `bio`, `highlight`, `dm`). Instagram brings about a third of visits and they all land on the home page. This is owner-side: it changes the post links.
- **Start recording replays earlier** (protected: `lib/replay-policy.ts`). Recording starts at least 3 s after load plus an idle moment, so quick exits are never recorded.
- **Move the event sanitizer into the lazily loaded SDK chunk** (protected). This is an estimated 0.8–1.2 KB gzip saving on every page.
- **Split the runner-search manifest** (data export).
- **Verify the site in Google Search Console and submit the sitemap; import into Bing Webmaster Tools.**

## Done
- 2026-10-15: experiment `home-hero-v1` was dropped before merge and never ran; the home page shipped without it in PR #60, and its box is in git history at `03cc05b` (moved from In flight on 2026-10-30).
- 2026-10-15: the first improvement bundle (no-match search path, phone header, home-chapter links to tools, round mile ticks, hero copy, tool handoffs, the desktop font-swap fix) shipped in PR #60 (`cbd59f8`) without a ledger line, so it has no pre-registered evaluation; the home page it changed was replaced on 2026-10-16 (moved from In flight on 2026-10-30).
- 2026-10-14: old-Safari crash fix (79 of 115 pages crashed on iOS < 16.4), error pages with one-time reload, privacy-safe visit signals, experiments framework, browser privacy test in CI. This was the setup, shipped by the owner's session.
