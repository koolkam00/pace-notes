# Autopilot backlog

The autopilot re-ranks this list every run against fresh evidence, adds what it learns, and moves items between sections. Each item says:
- what is wrong and the evidence (aggregates, dated);
- the hypothesis;
- the metric it should move;
- reach, effort and risk.

The first entries were seeded on 2026-10-14 from a full diagnosis of the live site and 30 days of PostHog data. In that window there were about 510 visits: 78% on phones, 83% landing on the home page, mostly direct or from Instagram.

**Re-measured (2026-11-09, PostHog):** the 78% and 83% above no longer hold. Over 2026-10-21..2026-11-08 (19 days, from the first day of the present home page) there were 411 visits: 210 on desktop (51.1%), 201 on phones (48.9%) and none on tablets; 259 (63.0%) landed on the home page. The dated entry is in `autopilot/LEARNINGS.md`.

Score = reach × expected effect × evidence ÷ effort, adjusted for risk. Don't let the backlog grow past about 25 items: merge duplicates and drop stale ones, giving the reason in the item.

## In flight
Nothing (2026-10-30). The two items that were here moved to Done, with the reason in each.

## Ready (ranked)

1. **Bring error visits back under the guardrail**
   - **Evidence (2026-11-09, PostHog):**
     - the guardrail `error_visit_rate@v1` must stay at 1% or less and must not double (`autopilot/metrics.md`);
     - 12 of 582 visits (2.06%) had at least one `site_error` over 2026-10-12..2026-11-08, and 11 of 411 (2.68%) over 2026-10-21..2026-11-08;
     - 1% of 582 visits is 5.82, so six visits with an error in 28 days are already past it;
     - the 17 `site_error` events from 2026-10-12 to 2026-11-09, by `category`: `chunk_load` 6, `js_error` 4, `unhandled_rejection` 3, `data_fetch` 2, `render` 2.
   - **Change:** find the cause of the largest kind first. A guess, not a finding: a tab opened before a deploy asks for a script file the new build no longer has, and the one-time reload then repairs it. A run may fix a cause in page or component code that is not protected. The files that count, catch and reload on errors are protected (`lib/analytics.*`, `lib/data-fetch.*`, `lib/chunk-reload.*`, `components/SiteAnalytics.*`, `app/**/error.*`, `app/**/global-error.*`), so any change to how errors are counted, caught or reloaded needs the owner (see Needs the owner).
   - **Metric:** error_visit_rate@v1.
   - Reach: every visit, because this guardrail judges every other change. Effort: S–M. Risk: low.
   - Until the rate is back at 1% or less, each new entry's decision rule says in advance, with the numbers, that this guardrail is already past its threshold, and names the part of its rule the entry will be judged on (skill, step 5.3).
2. **Give desktop visits an answer on the first screen**
   - **Evidence (2026-11-09, PostHog, 2026-10-21..2026-11-08, 411 visits):**
     - desktop was 210 of the visits (51.1%), and 20 of them were answered (9.5%, `answered_visit_rate@v2`), against 65 of 201 on phones (32.3%);
     - 179 desktop visits (85.2%) were one page with no answer signal, against 113 on phones (56.2%);
     - 23 of 128 desktop home landings continued (18.0%, `home_continuation_rate@v2`), against 73 of 131 on phones (55.7%);
     - desktop LCP p75 was 2,178 ms over 2026-10-12..2026-11-08, against 804.5 ms on phones; by page on desktop: the home page 2,380 ms (107 samples), `/runners` 3,770 ms (23) and `/finish-times` 3,937 ms (18). The guardrail `web_vitals_p75@v1` reads phones only;
     - 29 of the 210 desktop visits were direct, one-page landings on `/finish-times` (15) and `/runners` (14) on the same six days between 2026-10-21 and 2026-11-02, so they may share one source. Who made them is not known: read desktop figures with and without them (`autopilot/LEARNINGS.md`, 2026-11-09).
   - **Change:** look at desktop recordings of the home page and at `home_depth@v2` by device first, then choose one change to the first screen a desktop visit sees.
   - **Metric:** answered_visit_rate@v2 on desktop, home_continuation_rate@v2.
   - Reach: very high. Effort: S–M. Risk: medium (visual), so check screenshots carefully.
3. **Make the home page lighter on phones**
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
4. **Cut idle animation cost**
   - **Evidence:** with the page idle at 4× CPU, main-thread work per 10 s was 2.6 s on `/stories` and `/tools` (RunnerLane redraws 50×/s via React state in `components/art/useTicker.ts`) and 4.0 s on the home page with the replay playing.
   - **Change:** move RunnerLane to CSS or Web Animations transforms. Cap the replay at 30 fps and update its stats panel at 4 Hz or less. Pause animations that are off screen.
   - **Metric:** INP p75 and battery-friendliness; lab total blocking time.
   - Reach: high. Effort: S–M. Risk: low.
   - **Needs re-measure (2026-10-30):** `RunnerLane` no longer exists (0 references); `components/art/useTicker.ts` is still used by `components/viz/RaceReplay.tsx`, `components/SiteHeader.tsx` and `components/MotionToggle.tsx`. Measure idle main-thread work on the current pages first.
5. **Shorten or restructure the 27-screen home story for phones**
   - **Evidence:** in recordings, the deepest home scroll was 2,063–5,389 px out of 22.8k on phones. People who stay do read: before the redesign the median time before a second page was 6.5 s, after it 46.5 s.
   - **Change ideas** (pick one per run):
     - a sticky chapter index;
     - collapse each chapter to a "key finding" card with "read the full chapter";
     - move the strongest chapter first.
   - Use `home_depth@v1` and `section_viewed` to see where readers stop before choosing.
   - **Metric:** home_depth, answered_visit_rate.
   - Reach: very high. Effort: M. Risk: medium. Best run as an experiment after `home-hero-v1` concludes.
   - **Correction (2026-10-30):** `home-hero-v1` never ran (see Done). The 27-screen home described here was replaced by the StoryBrand home (#65, `b7a675c`, 2026-10-16), so re-measure first. `home_depth@v1` counts `chapter-*` sections, which that home no longer sends, so this item waits for the owner's `@v2` decision on the metrics (`docs/AUTOPILOT.md`, setup and prerequisites).
   - **Update (2026-11-09):** `autopilot/metrics.md` now has `@v2` definitions, written 2026-11-09 (pull request #92) and in force once the owner merges it. `home_depth@v2` counts how many of the home sections `stakes`, `guide` and `cta` a home landing saw (0 to 3), so the present home page can be measured. Over 2026-10-21..2026-11-08, of 259 home landings, 176 saw none of the three, 20 saw one, 21 two and 42 all three.
   - **Update (2026-11-11):** pull request #92 merged on 2026-11-11 at 01:17 UTC (`dc89b65c`), so the `@v2` definitions are in force. The owner lifted the autopilot's pause the same day; no full run has happened yet.
6. **Explain why totals differ**
   - **Evidence (refreshed October 17, 2026, release `htw-db-2026-10-16-1652`, from the built pages):** pages print different group totals without saying why: the home hero says "3.9 million"; `/research` and `/slowdown` print 3,871,767 finishes; `/stories/pacing-types` prints 3,733,382 (the pacing-type group); `/stories/final-kick` prints 3,710,359 (the final-kick group). The 0934-era figures (3,414,116, 3,517,336, 4.46 million, 3.26 million) are gone, and the tools page no longer prints a total. Since October 16 the explanation of each total lives only on `/methodology` (insights-only rule).
   - **Change:** link the first figure on each page that prints a group total to the matching /methodology anchor, so the difference is one tap away. No popover or method text on the page itself (insights-only rule), and no new calculations.
   - **Metric:** feedback `numbers_look_wrong` share, trust (qualitative).
   - Reach: medium. Effort: S. Risk: low.
   - **Update (2026-10-30):** the adopted release is now `private-export-20261021-1050`, whose eligible total is 4,108,749 (`/data/live.json`, `corpus.eligible_finishes`); the totals above are 1652's. Re-read which totals the pages print before choosing this.
   - **Update (2026-11-09):** the adopted release is now `master-20261103b`, whose eligible total is 4,222,246 (`/data/live.json`, `corpus.eligible_finishes`, read from production 2026-11-09 22:53 UTC); the 4,108,749 above is 1050's. Re-read which totals the pages print before choosing this.
7. **Lighten `/runners` (UI part only)**
   - **Evidence:**
     - it downloads a 326.7 KB `manifest.json` before search works, about 1 MB in total;
     - phone CLS is 0.078;
     - 23.6% of searches find nothing.
   - **Change:** reserve space for the coverage panel and show the search box immediately, with a clear "loading names…" state. Splitting the manifest touches the data export, so it needs the owner.
   - **Metric:** no_match_search_rate, `/runners` quick exits, CLS.
   - Reach: medium. Effort: S. Risk: low.
   - **Update (2026-10-30):** under 1050 the committed `public/data/runners/manifest.json` is 926,117 B (uncompressed). Re-measure what the page downloads before choosing this.
8. **Investigate rage clicks on tool steppers**
   - **Evidence:** one phone recording (2026-10) had 50 rage clicks across `/courses` and then the tools. They may come from repeated taps on stepper buttons.
   - **Change:** check whether stepper buttons need press-and-hold or larger steps on phones. Fix this only if recordings show frustration rather than deliberate repeated taps.
   - Reach: low–medium. Effort: S.
9. **Story pages: a clear "what next" at the end**
   - **Evidence:** 18 `/stories` → `/stories` moves were hidden before per-story paths existed. Story completion is now measurable (`story_completion_rate@v1`).
   - **Change:** at the end of each story, add one strong next step that matches the story: the related tool prefilled, or the next story. Consider a reading-progress cue.
   - **Metric:** story_completion_rate, answered_visit_rate.
   - Reach: medium. Effort: S.
10. **Predictor page as a landing page**
   - **Evidence:** the predictor is the most-opened tool (19 visits in 30 days) and the most common exit page after the home page. All 4 visits that landed on it left after one page.
   - **Change:** after a result, offer the two most useful next steps prominently: the pace band and "how did finishers near this time pace?". The tool handoffs in the setup bundle start this; evaluate them first.
   - Reach: medium. Effort: S.

## Needs the owner (open an `autopilot:needs-owner` issue once; don't duplicate)
- **Point each Instagram post at the story it previews**, with `utm_source=instagram&utm_medium=social&utm_content=post` (or `story`, `reel`, `bio`, `highlight`, `dm`). Instagram brings about a third of visits and they all land on the home page. This is owner-side: it changes the post links.
  - **Correction (2026-11-09):** `dm` is not a value the site accepts: `CAMPAIGN` in `lib/analytics-policy.ts` allows `utm_content` only as `bio`, `story`, `highlight`, `reel` or `post`, and a link sent in a direct message should carry no tags (`docs/ANALYTICS.md`, campaign tags). When read on 2026-11-09, PostHog had no page view with a campaign tag.
- **Start recording replays earlier** (protected: `lib/replay-policy.ts`). Recording starts at least 3 s after load plus an idle moment, so quick exits are never recorded.
- **Move the event sanitizer into the lazily loaded SDK chunk** (protected). This is an estimated 0.8–1.2 KB gzip saving on every page.
- **Split the runner-search manifest** (data export).
- **Verify the site in Google Search Console and submit the sitemap; import into Bing Webmaster Tools.**
- **Any change to how errors are counted, caught or reloaded** (added 2026-11-09; protected: `lib/analytics.*`, `lib/data-fetch.*`, `lib/chunk-reload.*`, `components/SiteAnalytics.*`, `app/**/error.*`, `app/**/global-error.*`; a custom error boundary is an owner-only action). The error guardrail is past its threshold (Ready: "Bring error visits back under the guardrail"). A run fixes causes in page or component code that is not protected; a fix that has to change these files is the owner's.

## Done
- 2026-10-15: experiment `home-hero-v1` was dropped before merge and never ran; the home page shipped without it in PR #60, and its box is in git history at `03cc05b` (moved from In flight on 2026-10-30).
- 2026-10-15: the first improvement bundle (no-match search path, phone header, home-chapter links to tools, round mile ticks, hero copy, tool handoffs, the desktop font-swap fix) shipped in PR #60 (`cbd59f8`) without a ledger line, so it has no pre-registered evaluation; the home page it changed was replaced on 2026-10-16 (moved from In flight on 2026-10-30).
- 2026-10-14: old-Safari crash fix (79 of 115 pages crashed on iOS < 16.4), error pages with one-time reload, privacy-safe visit signals, experiments framework, browser privacy test in CI. This was the setup, shipped by the owner's session.
