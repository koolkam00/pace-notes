import InfoNext from '@/components/InfoNext';
import RailBeats from '@/components/RailBeats.client';
import MethodsAnalyses from '@/components/methods/MethodsAnalyses';
import MethodsData from '@/components/methods/MethodsData';
import MethodsDefinitions from '@/components/methods/MethodsDefinitions';
import MethodsDownloads, { STORY_FILE_TOPICS } from '@/components/methods/MethodsDownloads';
import MethodsHash from '@/components/methods/MethodsHash.client';
import MethodsPages from '@/components/methods/MethodsPages';
import MethodsStories from '@/components/methods/MethodsStories';
import MethodsTools from '@/components/methods/MethodsTools';
import { Part, Topic } from '@/components/methods/shared';
import { readingAttrs } from '@/lib/chapters';
import { getInsightsManifest } from '@/lib/insights-server';
import { STORIES, courseSpan } from '@/lib/stories';
import { JsonLd, absoluteUrl, pageMetadata } from '@/lib/seo';
import { dataDate } from '@/lib/seo-routes';

export const metadata = pageMetadata({
  title: 'Methods & Sources: How Pace Notes Studies Marathon Splits',
  description: 'Where the Pace Notes marathon data comes from, what sustained slowdown and the other terms mean, how each number is worked out, and what it cannot show.',
  path: '/methodology',
});

/** The five parts, for the "Jump to" row (phones and tablets; from 1180 px the rail lists them, RailBeats). */
const PARTS: { id: string; label: string }[] = [
  { id: 'data', label: 'Data' }, { id: 'definitions', label: 'Definitions' }, { id: 'calculations', label: 'Calculations' },
  { id: 'limits', label: 'Limits' }, { id: 'downloads', label: 'Downloads' },
];

/**
 * schema.org Dataset for the aggregate story summaries (Dataset Search only). Every number is read from the
 * verified story data; the distribution lists only the aggregate story files this page lists under Downloads.
 * No licence is given because the repository does not state one.
 */
function storyDataset() {
  const manifest = getInsightsManifest();
  const span = courseSpan();
  const files = STORIES.filter((s) => manifest.files[s.file] && STORY_FILE_TOPICS[s.file]).map((s) => s.file);
  if (!span || !files.length) return null;
  const topics = new Intl.ListFormat('en-US', { style: 'long', type: 'conjunction' }).format(files.map((f) => STORY_FILE_TOPICS[f]));
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Pace Notes marathon pacing summaries',
    description: `Aggregate marathon pacing summaries behind the Pace Notes data stories, drawn from ${new Intl.NumberFormat('en-US').format(manifest.analysis_n)} screened finishes with recorded 5 km checkpoint splits at ${manifest.cohort.cities} marathons, ${span.first}–${span.last}. Files cover ${topics}. Counts are finishes, not unique runners; each file states its own cohort, screens and method.`,
    url: absoluteUrl('/methodology'),
    creator: { '@type': 'Person', name: 'Andrew Kam' },
    isAccessibleForFree: true,
    temporalCoverage: `${span.first}/${span.last}`,
    dateModified: dataDate('insights'),
    variableMeasured: [
      '5 km checkpoint split times', 'Finish time', 'Section pace relative to the same finish’s own pace',
      'Sustained slowdown (25% or more slower than the 5–20 km pace for at least 5 km after 20 km)',
      'Recorded gender', 'Age group', 'Modeled race-morning temperature',
    ],
    distribution: files.map((f) => ({ '@type': 'DataDownload', name: f, encodingFormat: 'application/json', contentUrl: absoluteUrl(`/data/insights/${f}`) })),
  };
}

const additions = [
  { name: 'Hourly weather', fields: 'Temperature, dew point, humidity, rain, wind, cloud cover, and solar radiation.', benefit: 'Match conditions to the time each runner reaches a segment. Use a consistent historical model across years.', href: 'https://open-meteo.com/en/docs/historical-weather-api', source: 'Open-Meteo historical weather', coverage: 'Broad historical coverage; modeled grid estimates, not conditions measured at the runner.' },
  { name: 'Weather-station observations', fields: 'Observed temperature, dew point, wind, and precipitation, with station location and quality flags.', benefit: 'Check unusual weather days against observations near the course.', href: 'https://www.ncei.noaa.gov/products/global-historical-climatology-network-hourly', source: 'NOAA GHCN hourly', coverage: 'Station and year coverage vary. The newer GHCN hourly archive replaces ISD.' },
  { name: 'The route for each race edition', fields: 'Course geometry, checkpoint locations, certification ID, route changes, and separate start routes.', benefit: 'Calculate section distance, turns, road direction, and the route actually used that year.', href: 'https://certifiedroadraces.com/search/', source: 'USATF course certification database', coverage: 'US courses; use each organizer’s dated maps elsewhere. Older routes often need manual recovery.' },
  { name: 'Elevation and slope by section', fields: 'Climb, descent, net elevation change, and grade along the route.', benefit: 'Separate terrain-related pacing patterns from a runner’s unusual slowdown.', href: 'https://www.opentopodata.org/datasets/srtm/', source: 'Open Topo Data / SRTM', coverage: 'Available for route coordinates. Check bridges and tunnels separately: terrain height may differ from the road deck.' },
  { name: 'Waves, corrals, and actual start times', fields: 'Wave schedule, runner corral, chip start, gun finish, and timing conventions.', benefit: 'Estimate time-of-day exposure and establish who was together at a checkpoint.', href: 'https://www.chicagomarathon.com/event-info/participant-information/', source: 'Official participant information', coverage: 'Schedules are commonly published; individual start timestamps depend on the timing provider. A wave start is not an individual start.' },
  { name: 'Aid stations and course amenities', fields: 'Water and fuel locations, supplied products, medical stations, toilets, and station changes by year.', benefit: 'Compare local pacing patterns with where runners can stop or refuel.', href: 'https://www.chicagomarathon.com/event-info/participant-information/course/', source: 'Official course and aid-station guide', coverage: 'Often available in participant guides. Product availability does not reveal what any runner consumed.' },
  { name: 'Qualifying rules and entry routes', fields: 'Published time standards, eligible age, qualifying window, acceptance cutoff, and entry category where public.', benefit: 'Study goal incentives and account for differences in who enters each race.', href: 'https://www.baa.org/races/boston-marathon/qualify/', source: 'Boston Athletic Association', coverage: 'Use dated rules and announcements. Historical records need an edition-by-edition audit.' },
  { name: 'Air quality', fields: 'Particle pollution, ozone, and other pollutants at the race location and time.', benefit: 'Explore whether poor-air-quality editions have different pacing patterns.', href: 'https://ads.atmosphere.copernicus.eu/datasets/cams-global-reanalysis-eac4', source: 'Copernicus CAMS reanalysis', coverage: 'Historical modeled coverage from 2003; spatial resolution is too coarse to represent every street.' },
];

/**
 * Methods & sources ("How we know"): the one page that explains how Pace Notes works (owner decision, October 16,
 * 2026). Every other page shows its insights only and links here for the definitions, data sources, coverage,
 * calculations and limits. Five parts, each a list of topics that open on request (the redesign spec, sections 7.15
 * and 00): with every topic closed the page is a few screens, and a link to any id on it opens what holds that id
 * (MethodsHash). Every id is a stable anchor: verify-seo fails when a link on any page names an id this page lacks.
 */
export default function MethodologyPage() {
  const dataset = storyDataset();
  return <div className="methods-page with-rail" {...readingAttrs('/methodology', 'How we know')}>
    <aside className="rail methods-rail">
      <nav aria-label="On this page">
        <p className="rail-title">On this page</p>
        <RailBeats />
      </nav>
    </aside>
    <article className="methods-flow">
      <header className="methods-hero">
        <p className="t-kicker">Methods and sources</p>
        <h1 className="t-title">How we know</h1>
        <p className="methods-dek">Where the numbers come from, what each term means, how each one is worked out, and what none of them can show.</p>
      </header>
      <nav className="methods-jump" aria-label="Jump to a part">
        <ol>{PARTS.map((part) => <li key={part.id}><a className="methods-jump-link" href={`#${part.id}`}>{part.label}</a></li>)}</ol>
      </nav>

      <MethodsData />
      <MethodsDefinitions />
      <Part id="calculations" n={3} short="Calculations" title="Calculations" lead="How each part of the site works out its numbers.">
        <MethodsStories />
        <MethodsAnalyses />
        <MethodsTools />
        <MethodsPages />
      </Part>

      <Part id="limits" n={4} short="Limits" title="Limits" lead="What these numbers cannot show.">
        <Topic id="interpretation" title="What these comparisons can show">
          <p>They describe associations. Runners who choose different strategies can also differ in fitness, experience, goals or conditions. A fast opening and a fast finish can go together because a runner is fitter; that does not mean the faster start caused the result. Comparisons should account for these differences and report sample sizes and uncertainty.</p>
          <p>Each analysis shows its actual comparison group, and names any broader comparison it used when a narrow selection had too few records. Missing ages, splits and route history stay missing; nothing is filled in.</p>
          <p>Predictions must use only what is known at the checkpoint being studied and be tested on unseen race editions. Declared goals are kept apart from inferred time landmarks. An absence from the database does not show that a runner stopped racing.</p>
          <p>Splits measure time and pace. Effort, fuelling, intentions and training need other evidence. Terrain-adjusted pace is an estimated proxy, especially when a 5 km section has both climbs and descents.</p>
        </Topic>
        <Topic id="follow-up" title="Return and missing follow-up">
          <p>The near-miss analysis includes runners who have no later observed race. It needs two later years of observed editions in the original city and leaves out the latest two years as index races. Return means an eligible linked appearance anywhere in the export in the next two calendar years. Missing follow-up is never called retirement.</p>
        </Topic>
        <Topic id="additional-data" title="Data that could strengthen the study">
          <p>Start with dated course routes, hourly weather and start times. These are proposed sources for extending and checking the dataset; listing one here does not mean it has already been joined.</p>
          {additions.map((item) => <section key={item.name}>
            <h4>{item.name}</h4>
            <p>{item.fields} {item.benefit}</p>
            <p className="methods-note">{item.coverage} <a href={item.href}>{item.source}</a>.</p>
          </section>)}
          <h4>More fields to keep from official results</h4>
          <p>Keep all published timing points, including halfway and the finish; bib and provider IDs; reported age and category; gun and chip times; official finish, withdrawal, disqualification and non-start statuses; and result corrections. Availability varies by organizer and year.</p>
          <p>Do not infer a withdrawal from one missing timing read, or a debut marathon from a runner’s first appearance in this database.</p>
          <h4>Preserve the evidence</h4>
          <p>For every added field, keep its source URL, race edition, retrieval date, original unit, and whether it was observed, modeled or inferred. Keep one weather record per place and time, then join it to estimated segment exposure. Between timing mats, a runner’s exact location is an estimate.</p>
          <p>Hourly wind plus route direction can estimate headwind exposure. Route geometry can estimate turn counts. Crowd density, shade, training, shoes and individual fuelling are harder to reconstruct consistently over 20 years and should not be assumed.</p>
        </Topic>
      </Part>

      <MethodsDownloads />
      <InfoNext />
      <MethodsHash />
    </article>
    {dataset ? <JsonLd data={dataset} /> : null}
  </div>;
}
