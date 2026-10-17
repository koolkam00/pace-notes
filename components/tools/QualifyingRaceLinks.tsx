/**
 * A compact list of the per-race qualifying pages, used on the qualifying checker and on each race page.
 * Names and years come from lib/tools/qualifying.ts; links keep the reader's units (UnitLink).
 */
import { UnitLink as Link } from '@/components/UnitsProvider';
import { capital, program, racePath, raceYear, shortName } from '@/components/tools/QualifyingRaceText';
import type { Standard } from '@/lib/tools/qualifying';

/** One row per race: its name and year, and what its standards are called; `compact` gives a row of chips (race pages). */
export function QualifyingRaceLinks({ races, label, compact = false }: { races: Standard[]; label?: string; compact?: boolean }) {
  if (compact) {
    return (
      <ul className="tools-goal-links qrace-chips" aria-label={label}>
        {races.map((s) => <li key={s.key}><Link href={racePath(s)}>{shortName(s)} {raceYear(s)}</Link></li>)}
      </ul>
    );
  }
  return (
    <ul className="qrace-links" aria-label={label}>
      {races.map((s) => (
        <li key={s.key}>
          <Link href={racePath(s)}>
            <b>{shortName(s)} {raceYear(s)}</b>
            <span>{capital(program(s) ?? 'qualifying')} standards</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
