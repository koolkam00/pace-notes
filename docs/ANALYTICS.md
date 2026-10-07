# Website analytics

Implemented September 17, 2026. Account configuration and production ingestion must be verified separately before claiming analytics is live.

The site uses PostHog Cloud through `posthog-js`, loaded after hydration by `SiteAnalytics`. It supports the existing Next.js 14 static export; no server, database, instrumentation-client upgrade or proxy is required. Production capture is restricted to `splithappens.run`, `www.splithappens.run` and the original `htw-live-study.vercel.app` domain. Preview deployments and local development send nothing.

## Configuration and launch

1. Create a free PostHog project for splithappens.run. Do not add a card or enable paid products for this setup.
2. In PostHog Project Settings > Web analytics, enable **Cookieless server hash mode**. This is required: PostHog ignores cookieless events otherwise. Keep session replay, autocapture, surveys and other products disabled.
3. Set these build environment variables on the Vercel project's Production environment:
   - `NEXT_PUBLIC_POSTHOG_KEY`: the project's public ingestion token, never a personal/admin API key.
   - `NEXT_PUBLIC_POSTHOG_HOST`: `https://us.i.posthog.com` for the US region, or `https://eu.i.posthog.com` for EU.
4. Redeploy after setting the variables; Next.js embeds them at build time. Neither value is obtained from the runner data. Keep tokens out of repository files.
5. Confirm the exact deployed commit and check PostHog's live events after visiting the canonical domain, submitting a search and opening a comparison. Inspect event properties: no search query, names, selected record IDs or filter values may appear. Verify `/privacy` opt-out suppresses new events. Existing captured events may already be in flight when a preference changes.

The project can remain on PostHog's free plan without a card. Collection is limited by the plan's allowance; inspect current PostHog billing usage rather than assuming unlimited capture. Ad blockers, browser privacy preferences and explicit opt-out reduce measured traffic.

Cookieless mode strips IPs before enrichment, so the geographic map and IP-based bot detection are unavailable. Unique visitor estimates can overcount across days and undercount people sharing an IP/browser combination. Do not present them as verified individuals.

## Events and starter dashboard

| Event | Meaning | Allowed custom properties |
| --- | --- | --- |
| `$pageview` | Initial load or navigation to another page; query-only filter changes do not add views | None |
| `runner_search_submitted` | A non-empty search starts, including opening/restoring a shared search link | None |
| `runner_search_completed` | The latest non-aborted search returns or fails | `outcome`: matches, no_matches, error |
| `runner_profile_opened` | A result group's race records finish loading | None |
| `race_comparison_opened` | Visitor presses View selected races | `selection`: one/multiple; `availability`: eligible/mixed/limited |
| `analysis_filters_applied` | Main, fast-start or weather filters are explicitly applied | Analysis ID and all/single course scope |
| `data_download_clicked` | Click on a project Release link or site data file; does not prove download completed | `destination`: release/site_data |
| `units_changed` | Visitor chooses miles or kilometres | `units`: mi/km |

Use Web Analytics for visitors, page views, referrers and devices. A starter product dashboard should include daily unique `$pageview` visitors; top pages by `$pathname`; searches by `outcome`; race comparisons; download clicks; and a same-day funnel from `runner_search_submitted` to `runner_profile_opened` to `race_comparison_opened`. Cookieless identity cannot support reliable return-visitor/retention analysis across days. Courses, story and archive detail URLs are grouped at their section path (`/courses`, `/stories`, `/packs`); main analysis pages and the runner tools (`/tools/<slug>` from `lib/tools/registry.ts`) retain their registered public slug. Tool inputs live in the query string and are always removed, so goals, splits and birth dates never reach analytics.

## Data collection boundary

`lib/analytics-policy.ts` is the shared final event/property allowlist, applied by the SDK's `before_send` hook. It removes all query strings/fragments, unknown paths, full referrers, nested person properties and undeclared events/properties. No DOM text, free-form form values, names or runner IDs are recorded. The SDK runs without browser persistence or person profiles; session replay, autocapture, errors, heatmaps, performance capture and optional products are disabled. PostHog processes incoming connection information to generate cookieless visitor estimates on its servers.

The allowlist must retain the SDK-generated `$raw_user_agent` string and canonical `$host`. PostHog needs these fields, a current timestamp and the connection IP to calculate its rotating cookieless identity. A successful HTTP capture response alone does not prove ingestion: omitting the user agent causes the downstream pipeline to drop the event. See [PostHog's cookieless ingestion diagnostics](https://github.com/PostHog/posthog/blob/master/products/ingestion/skills/resolving-ingestion-warnings/references/fixing-cookieless-warnings.md). The analytics verifier guards this requirement alongside redaction.

Do Not Track, Global Privacy Control and the `/privacy` opt-out are checked before loading the SDK and before every capture. The site's only analytics preference storage is the local boolean `marathon-analytics-disabled`. Analytics failures must never block the site. Account access is needed to see the dashboard; visitor analytics is separate from the public research downloads.

Run `npm run verify:analytics`, `npm run verify:data` and `npm run build`. The analytics verifier covers sensitive URL/property redaction, undeclared event suppression, SDK configuration, production gating, duplicate pageviews, browser preferences and failures. It uses an in-memory SDK stub, so it does not replace production ingestion verification.

References: [PostHog configuration](https://posthog.com/docs/libraries/js/config), [cookieless data collection](https://posthog.com/docs/privacy/data-collection#cookieless-tracking), [pricing](https://posthog.com/pricing).
