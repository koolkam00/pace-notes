import { checkedDate, pageHeading, standardByKey } from '@/components/tools/QualifyingRaceText';
import { ToolHandoffs } from '@/components/tools/Handoffs';
import type { CoursePageData } from '@/lib/course-page';
import { planHref } from '@/lib/tools/links';
import { EVIDENCE_LABEL, toolBySlug } from '@/lib/tools/registry';
import { CourseSection } from './Fact';

const accent = (slug: string, fallback: string) => toolBySlug(slug)?.accent ?? fallback;

/**
 * "Plan your {race}": the tools that take this course, each link gated by the target's own published scopes (read from
 * its index file through the page data), then the official standards for the six qualifying races in a card of their own.
 */
export default function CoursePlan({ page }: { page: CoursePageData }) {
  const { city, slug, race, display, scopes, qualifyingKey } = page;
  const standard = qualifyingKey ? standardByKey(qualifyingKey) : undefined;
  const raceParam = encodeURIComponent(city);
  return (
    <CourseSection id="plan" track="cta" kicker="Plan" title={<>Plan your <em>{race}</em></>}
      dek={<>Start from this course. Your plan is a calculation from your own goal; the Pace Notes data beside it describes past finishes and never picks a pace for you.</>}>
      <div className="course-plan">
        <ToolHandoffs label="Before race day" links={[
          { href: planHref(city) ?? '/tools/plan', accent: accent('plan', 'var(--blue)'), title: 'Race planner', text: <>Your goal on this course: even-pace splits{page.goals.length ? ', how finishes at that pace held up here,' : ''} and a pace band to print.</> },
          ...(scopes.band ? [{ href: `/tools/pace-band?course=${slug}`, accent: accent('pace-band', 'var(--orange)'), title: 'Pace band', text: <>An even-pace wristband, beside what {display} finishes at your goal ran at every 5 km mat.</> }] : []),
          { href: '/tools/course-chooser', accent: accent('course-chooser', 'var(--teal)'), title: 'Course chooser', text: <>Your goal pace on every course, side by side, alphabetical.</> },
          { href: scopes.weather ? `/tools/weather-match?course=${slug}` : '/tools/weather-match', accent: accent('weather-match', 'var(--gold)'), title: 'Weather match', text: <>Past race mornings at your forecast temperature{scopes.weather ? `, with ${display}’s own mornings` : ''}.</> },
        ]} />
        <ToolHandoffs label="On race day" links={[
          { href: scopes.projector ? `/tools/projector?course=${slug}` : '/tools/projector', accent: accent('projector', 'var(--rose)'), title: 'Race-day projector', text: <>Type a tracker time from any mat for the finish range of past finishes that passed that mat at about the same time{scopes.projector ? ` in ${display}` : ''}.</> },
        ]} />
        <ToolHandoffs label="After the race" links={[
          { href: scopes.band ? `/tools/split-check?course=${slug}` : '/tools/split-check', accent: accent('split-check', 'var(--green)'), title: 'Split check', text: <>Paste your nine splits for a report you can print, save or share{scopes.band ? `, compared with ${display} finishes at your time` : ''}.</> },
        ]} />
        {scopes.analyses ? (
          <ToolHandoffs label="Analyses" links={[
            { href: `/analyses/course-comparison?race=${raceParam}`, accent: 'var(--blue)', title: 'Compare this course', text: <>{display} beside the other courses for finishes at the same early pace.</> },
            { href: `/analyses/hills-and-pacing?race=${raceParam}`, accent: 'var(--green)', title: 'Hills and pacing', text: <>The supplied elevation profile beside the section paces of finishes near a time.</> },
          ]} />
        ) : null}
        {standard ? (
          <ToolHandoffs label="Official standards" links={[
            { href: `/tools/qualifying/${standard.key}`, accent: accent('qualifying', 'var(--ink)'), title: pageHeading(standard),
              text: <><span className="evidence-badge evidence-official">{EVIDENCE_LABEL.official}</span> Each age group’s standard and the qualifying window, from the race’s own pages, checked {checkedDate()}. Kept apart from the data on this page.</> },
          ]} />
        ) : null}
      </div>
    </CourseSection>
  );
}
