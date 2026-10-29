import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { STORIES, halfManifest, storyHref, storyPublished } from '@/lib/stories';
import { Detail, Topic, and, dataHref, editionList, n } from './shared';
import { HalfStoryDetail } from './MethodsHalf';

type Edition = { city: string; year: number };
type Screened = Edition & { reason: string };
type StoryFile = { method: string };

/**
 * What each story's own data file adds to its method line, read from that file so counts and edition lists follow the
 * adopted release. The method paragraph itself is the file's `method`, as the story pages showed it before
 * October 16, 2026.
 */
function storyNotes(file: string, slug: string): ReactNode[] {
  switch (file) {
    case 'archetypes.json': return [
      'In the six-runner race, each runner follows one type’s average profile scaled to the same finish time, so any time a profile gains early is given back later.',
      <>“Extra time after 20 km” is the median of each finish’s <a href="#baselines">time after 20 km</a>.</>,
      'Only runners who raced again appear in the repeat pairs.',
      'Gender is as recorded: “Other / not recorded” finishes count in totals but not in the gender comparison. The gender shares are standardized to the same mix of 30-minute finish bands, so they hold finish time constant but not course, age or conditions.',
      'Course shares weight each race edition equally and describe each course’s finishes, not a ranking of courses.',
      <>Type definitions and the F, E and S letters are under <a href="#pacing-types">Pacing types</a>.</>,
    ];
    case 'finish-times.json': {
      const data = readInsight<StoryFile & { total_excess_hour_half_hour: number }>(file);
      return [
        'Quarter-hour marks such as 2:45 and 3:45 sit inside neighbouring marks’ windows, so their smooth curves are less reliable.',
        'The 40 km comparison is a reference, not a forecast or a measure of intent.',
        'Goals, pacers, pace bands and watches are not recorded. Bunching is consistent with round-number targets but cannot prove why anyone sped up.',
        'The smooth curve and the late-race comparison are fitted from the data, not outcomes any runner would have had.',
        'Elapsed times are as published by the timing sources; wave and start offsets are not recorded.',
        `Across hours and half-hours from 2:30 to 6:00, about ${n(Math.round(data.total_excess_hour_half_hour / 1000) * 1000)} finishes sit in the five minutes before a mark beyond the curve. That total is sensitive to the fitting window.`,
      ];
    }
    case 'replay.json': {
      const data = readInsight<StoryFile & { editions: { finishes: number }[]; stretch: { editions: unknown[] } }>(file);
      const sizes = data.editions.map((edition) => edition.finishes);
      return [
        `The replayed fields hold ${n(Math.min(...sizes))} to ${n(Math.max(...sizes))} eligible finishes. Real fields start over many minutes.`,
        'Changes inside a 5 km section cannot be seen.',
        'Only eligible finishes are drawn: runners who did not finish, or whose records were incomplete, are absent.',
        'Route maps are the current supplied course files; historical routes may differ.',
        'In the snapshots, finished runners count at the finish line. “Ahead” and “moves past” are clock ranks among eligible finishes, not passes on the road.',
        'The even-pace ghost’s typical 20 km time is the median share of finish time reached at 20 km by real finishes within 2.5 minutes of its target, not anyone’s plan.',
        'A clock pack is the finishes that passed 10 km within the same 30 seconds of race time. They share elapsed times, not necessarily the same stretch of road.',
        `The stretch compares how far the slowest tenth trails the fastest tenth from 20 to 40 km with the first 20 km (1.00× means no change). It uses the ${n(data.stretch.editions.length)} race editions with at least 1,000 eligible finishes and a usable first 5 km, leaving out the editions whose first 5 km looks inflated by start delays. These are percentiles at each block, not the same runners.`,
        'The field-spread fan pools every eligible finish from every race.',
      ];
    }
    case 'positions.json': {
      const data = readInsight<StoryFile & { cohort_n: number; editions_n: number; gender_editions: unknown[] }>(file);
      return [
        `${n(data.cohort_n)} finishes in ${n(data.editions_n)} editions are ranked. Pair rates come from sampled pairs with a fixed seed.`,
        'Section reshuffles compare per kilometer, so the short final section compares fairly. A swap means the pair’s clock order at the end of the section differs from the start.',
        'Clock ranks compare elapsed times within an edition. Because of wave starts, a clock pass is not necessarily an overtake on the road.',
        'Only eligible finishes are ranked: runners who did not finish or whose records were incomplete are absent.',
        'Slowing and places gained both use the late kilometers, so part of their link is built into the measures. It describes; it does not predict.',
        'The median runner after 30 km is the finishes ranked between the 49th and 51st percentile at 30 km. Its passes compare elapsed times at the 30 km and finish mats, so swaps between mats are invisible. Each median is taken separately, so the rows do not divide into each other.',
        `The women-and-men comparison uses the ${n(data.gender_editions.length)} editions with at least 100 recorded women and men, and measures mean percentile points gained on the mixed-gender clock. On a shared clock one group’s gains are the other’s losses. Gender is as published, and the comparison says nothing about why.`,
      ];
    }
    case 'kick.json': {
      const data = readInsight<StoryFile & { grid_screen: Screened[]; start_offset_editions: Edition[] }>(file);
      return [
        'A faster final section means faster than the runner’s own 35–40 km, not faster than the early pace.',
        'The final section is only 2.195 km, so finish-mat placement and the route’s layout matter more there than in a 5 km section: 50 m shifts its pace by about 2%.',
        'Recorded 5 km sections cannot show walking breaks, stops or recoveries inside a section, and runners who did not finish are absent.',
        `${n(data.grid_screen.length + data.start_offset_editions.length)} editions are left out of the section statistics: ${and([...data.grid_screen.map((g) => `${g.city} ${g.year} (${g.reason.charAt(0).toLowerCase()}${g.reason.slice(1)})`), `the ${n(data.start_offset_editions.length)} start-offset editions`])}. These are inferences from the timing data.`,
        'Recovery means a later section back within 10% of the runner’s 5–20 km pace. The recovery shares for recorded women and men are not matched on pace, age or course.',
        'The 5–10, 10–15 and 15–20 km sections sit inside the baseline itself, so their narrow spread is partly by construction.',
        'Pace bands use the 5–20 km pace expressed as a marathon time, set before the second half is run.',
        'The warning light is a conditional frequency and partly mechanical: a section already 20% slower needs little more to reach 25%.',
        'Same-race comparisons hold the race and the early pace fixed, not fitness, goals, experience or conditions. The 5–20 km pace is measured after the opening, so it can already reflect it.',
        'In the twin runners, part of the gap is built into the definition, since a section 25% slower adds minutes by itself. Each runner is drawn with a straight line to its median finish, and the within-race gap compares strata of one race, recorded gender and 5 s/km band.',
        'Repeat pairs link screened candidate profiles, not verified people, one to three years apart, compared with what was typical in the later race at the same 5–20 km pace. Only runners who raced again appear.',
        'Gender is as recorded, and the groups differ in age, course and field.',
      ];
    }
    case 'demographics.json': {
      const data = readInsight<StoryFile & { granular_age_n: number; granular_age_cities: string[]; composition_flagged: unknown[] }>(file);
      return [
        'Matching on finish time conditions on the result: a man in a given band is more often someone who started faster and slowed into it, so the same finish does not mean the same fitness.',
        'Gender is as recorded by the source, and “Other / not recorded” finishes are left out of two-group comparisons.',
        'In the ghost race each runner follows the matched average for one group, so it is not a real pair, and “ahead” means on the clock, not on the road.',
        `Exact ages cover ${n(data.granular_age_n)} finishes from ${and(data.granular_age_cities)}.`,
        'The age ladder compares each group’s sustained-slowdown share with the same race’s same-minute field (both genders), in percentage points. Age comparisons are cross-sectional: different people at different ages, not the same runners getting older.',
        `${n(data.composition_flagged.length)} editions with incomplete gender or result coverage are left out of the composition charts.`,
      ];
    }
    case 'courses.json': {
      const data = readInsight<StoryFile & {
        identification: { variants: Record<string, number> };
        shape_cohort: { start_offset_editions: Edition[] };
        weather: { excluded: Edition[] };
        years: { eras: { high_coverage_courses: unknown[]; coverage_rule: number } };
      }>(file);
      const variants = Object.entries(data.identification.variants).map(([name, share]) => `${name.charAt(0).toLowerCase()}${name.slice(1)} ${Math.round(share * 100)}%`);
      // Two stories read courses.json: the course fingerprints, and race-morning weather (split out on October 17, 2026).
      if (slug === 'race-morning') return [
        `Weather is never personal or wave exposure, and other things also changed between years.${data.weather.excluded.length
          ? ` ${editionList(data.weather.excluded)} ${data.weather.excluded.length > 1 ? 'have' : 'has'} no valid weather row and ${data.weather.excluded.length > 1 ? 'are' : 'is'} left out of the weather charts.` : ''}`,
        'Same-course pairs need starts at least 5 °C apart, and pairs share editions, so they are not independent tests.',
        <>Within-course slopes are simple descriptive slopes. The prespecified <a href="#weather">weather screen</a> remains the adjusted analysis.</>,
        'In the untangled view each course’s dots are moved so its own averages sit at the center; the pooled view mixes field, terrain and climate.',
        'The heat signature is an average within-course association, drawn as a straight line from the typical curve at the average start. Its finish and slowdown readouts use a separate curved fit, compared with a 10 °C start on the same course. Hottest and coolest mornings use courses with three or more editions.',
        'Race-morning temperatures are modeled for the hour near the scheduled start at one point in the city (see Weather and elevation sources).',
      ];
      return [
        'Late fade fits each edition curve as a distance-weighted multiple of the typical curve; 1.00× is typical, and the signature is what remains.',
        `Name that course matches each edition’s fade-removed signature to the nearest course average, built without that edition. That variant was chosen among four, all reported in the data file: ${variants.join('; ')}.`,
        'Course means the supplied city label, not a verified historical route. Route maps and elevation are the current supplied course files, and the elevation model misses bridge decks; in New York it reads them as water level.',
        'Relative pace mixes terrain, field ability, weather and race behavior.',
        'The same-early-pace comparison weights each edition equally and draws only courses with at least 3 editions and 1,000 finishes in the band. Matching on early pace balances speed, not ability, goals or weather.',
        `The editions whose first 5 km looks inflated (${and([...new Set(data.shape_cohort.start_offset_editions.map((e) => e.city))])}) are left out of every shape statistic.`,
        `Field size counts eligible finishes with all nine splits, not official finishers, and missing years include coverage gaps as well as cancellations.${getInsightsManifest().duplicate_edition_screen.length ? ' Copy editions are left out.' : ''}`,
        `The before-and-after comparison weights each edition equally within 2015–2019 and 2022–2026 and uses the ${n(data.years.eras.high_coverage_courses.length)} courses whose editions in each period average at least ${Math.round(data.years.eras.coverage_rule * 100)}% of raw records eligible. Only the editions the source policy keeps count, so a course can rest on one or two race days in a period. Course mix, entry rules and eligibility shares changed too, so it describes the fields, not why they changed.`,
        'Recorded-gender gaps and changing eligibility shares affect some courses and years.',
        'The course pages use the same fingerprint and race-morning charts.',
      ];
    }
    default: return [];
  }
}

/** The data stories: their shared cohort, then each story's method and limits (#story-<slug>). */
export default function MethodsStories() {
  const manifest = getInsightsManifest();
  const copies = manifest.duplicate_edition_screen;
  // The marathon stories read their method from their insights file; a half story's method is its own (below).
  const stories = STORIES.filter((story) => story.source !== 'half' && storyPublished(story));
  const half = halfManifest();
  const halfStories = half ? STORIES.filter((story) => story.source === 'half' && storyPublished(story)) : [];
  return <Topic id="stories" title="Data stories">
    <p>The data stories use {n(manifest.analysis_n)} eligible finishes. These are every record in the adopted release with all nine checkpoints present and increasing, a finish between 1:30 and 12:00 and every section between 2 and 20 minutes per kilometer, after the reviewed source-quality exclusions. {copies.length ? `${and(copies.map((c) => `${c.city} ${c.year}`))} ${copies.length > 1 ? 'are' : 'is'} also left out, because ${copies.length > 1 ? 'their' : 'its'} records duplicate the ${copies[0].city} ${copies[0].duplicate_of} field. ` : ''}Counts are race finishes, not unique runners. Associations describe what went together; they do not explain why.</p>
    {stories.map((story) => {
      const data = readInsight<StoryFile>(story.file);
      const notes = storyNotes(story.file, story.slug);
      return <Detail key={story.slug} id={`story-${story.slug}`} title={story.title}>
        <p>{data.method}</p>
        {notes.length > 0 && <ul>{notes.map((note, i) => <li key={i}>{note}</li>)}</ul>}
        <p className="methods-links"><Link href={storyHref(story)}>Read the story</Link><a href={dataHref(`insights/${story.file}`)}>{story.file}</a></p>
      </Detail>;
    })}
    {half && halfStories.some((story) => story.slug === 'half-to-full') ? <HalfStoryDetail /> : null}
  </Topic>;
}
