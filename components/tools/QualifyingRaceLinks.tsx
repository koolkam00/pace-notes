/**
 * A compact list of the per-race qualifying pages, used on the qualifying checker and on each race page.
 * Names and years come from lib/tools/qualifying.ts; links keep the reader's units (UnitLink).
 */
import { UnitLink as Link } from '@/components/UnitsProvider';
import { capital, program, racePath, raceYear, shortName } from '@/components/tools/QualifyingRaceText';
import type { Standard } from '@/lib/tools/qualifying';
import '@/app/tools/qualifying/[race]/race.css';

/** Cards with the entry route under each name; `compact` gives one row of pills (the checker's header). */
export function QualifyingRaceLinks({ races, label, compact = false }: { races: Standard[]; label?: string; compact?: boolean }) {
  return (
    <ul className={`qrace-links${compact ? ' is-compact' : ''}`} aria-label={label}>
      {races.map((s) => (
        <li key={s.key}>
          <Link href={racePath(s)}>
            <b>{shortName(s)} {raceYear(s)}</b>
            {compact ? null : <span>{capital(program(s) ?? 'qualifying')} standards</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
