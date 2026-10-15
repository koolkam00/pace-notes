# What we've learned about Pace Notes visitors

Each entry is dated, says what kind of evidence it rests on, and gives a sample size. The autopilot reads this every run and adds to it after every evaluation. Delete nothing: when a learning turns out wrong, strike it through and add the correction under it.

## Starting point (2026-10-14 diagnosis; 30 days of PostHog data, about 510 visits)
- **Who arrives and how.** Visits come 78% from phones, 22% from desktop and very few from tablets. 83% land on the home page. Sources: about 63% direct and 33% social, nearly all of the social from Instagram (`l.instagram.com`); search brings almost nothing yet. Traffic is spiky: Instagram posts (9/17–18 and 10/09) dominate. Compare windows by source before trusting a before/after change.
- **The redesign widened use but buried the personal path.** Measured on visits, old design (9/17–10/7, 382) vs new design (10/8 onward, 128):
  - Applying analysis filters fell from 31.9% to 12.5%.
  - Home landings going straight to an analysis fell from 45% to 9%.
  - Tools (23%) and stories (20%) went from nothing to real use.
  - Page views per visit rose from 2.5 to 3.5.

  The old home's main button went straight to `/analyses/pacing-pattern`. The likely lesson: a direct "how do runners like me pace?" entry on the first phone screen matters a lot. `home-hero-v1` tests exactly this.
- **People who stay on the new home page read it.** The median time before a second page rose from 6.5 s to 46.5 s, and visits whose second page was `/stories` averaged 9.4 page views. The story isn't failing; the first screen is.
- **Runner search** fails to find a name 23.6% of the time (29 of 123), and before the setup a failed search led nowhere.
- **Quick exits were invisible.** About 52% of visits had one page and no action. Replays start after a delay, so they never show quick exits. Since the setup, `$pageleave` duration and `section_viewed` give the missing picture; use them before guessing.
- **Older iPhones** (iOS < 16.4) crashed on 79 of 115 pages until the setup's fix, and crashed pages sent no analytics at all. So historical device data under-counts old iOS. Watch `site_error` by `$os_version` after the fix.
- **Statistics at this size.** About 18 visits a day means two-week before/after windows can only detect jumps of about 12 points or more. An A/B test needs about 150–400 exposed visits per arm. Prefer bold changes, run few experiments, and write "inconclusive" without embarrassment.

## Log
<!-- Add new entries below, newest last: "- YYYY-MM-DD (source, n): learning." -->
