import QualifyingChecker from '@/components/tools/QualifyingChecker';
import { ToolHeader, ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import { BOSTON_CUTOFFS, STANDARDS, VERIFIED_AT } from '@/lib/tools/qualifying';
import './qualifying.css';

export const metadata = {
  title: 'Marathon qualifying checker: Boston, NYC, London, Chicago, Berlin, Sydney | Pace Notes',
  description: 'Check a marathon time against the Boston, New York, London Good For Age, Chicago, Berlin and Sydney standards, each with its own age rule and window. Boston includes the new downhill index and every past cut-off; nothing is forecast.',
};

/** Every official page the standards were transcribed from, plus the B.A.A. announcements behind the cut-off history. */
const SOURCES = [
  ...STANDARDS.flatMap((s) => s.sources),
  { label: 'B.A.A.: record field of qualifiers accepted into the 131st Boston Marathon', url: 'https://www.baa.org/news/record-field-of-qualifiers-accepted-into-the-131st-boston-marathon-presented-by-bank-of-america/' },
  { label: 'B.A.A.: 2026 and 2027 registration updates (downhill index)', url: 'https://www.baa.org/news/2026-and-2027-registration-updates-boston-marathon-presented-bank-america/' },
  { label: 'London Marathon Events: Championship entry', url: 'https://www.londonmarathonevents.co.uk/london-marathon/championship-entry' },
].filter((s, i, all) => all.findIndex((t) => t.url === s.url) === i);

const first = BOSTON_CUTOFFS[0].year;
const last = BOSTON_CUTOFFS[BOSTON_CUTOFFS.length - 1].year;

export default function QualifyingPage() {
  return (
    <div className="container tool-page">
      <ToolHeader slug="qualifying" />
      <QualifyingChecker />
      <ToolMethod sources={SOURCES}>
        <p><strong>Official rules only.</strong> Every standard, age rule, qualifying window and application date was transcribed from the race’s own pages and checked on {VERIFIED_AT}. Standards change every year, so each card links its source and shows that date; Pace Notes reviews them before every registration season. Meeting a standard is not entry: each race then applies its own cut-off, cap, review or lottery, and each card says which.</p>
        <p><strong>Age rules differ by race.</strong> Boston, New York, Chicago and Sydney use your age on their race day (Boston 2028 is expected on April 17, 2028, which the B.A.A. had not confirmed). London Good For Age uses your age on the day you ran the qualifying time. Berlin uses the age you reach during 2027, so it goes by birth year. The checker counts a February 29 birthday from March 1 in other years.</p>
        <p><strong>The margin.</strong> Margin = standard − counted time, so a positive margin is under the standard. Boston, New York, Chicago, Berlin and Sydney accept a time at or under the standard; London requires a time strictly under it, so an equal time misses. A result counts only if the race date falls inside the race’s qualifying window and, because proof goes in with the application, no later than the application deadline (this ends the Berlin and Sydney windows early). Boston 2028’s window runs through 2027 registration week, which the B.A.A. has not dated; the checker treats a time run after September 2027 as outside it and flags one run during September 2027. The checker uses your chip (net) time on a certified course; Sydney also accepts gun time.</p>
        <p><strong>London’s other routes.</strong> Good For Age is for UK residents. A runner whose only time is from the virtual TCS London Marathon MyWay also needs an in-person half marathon in the same window, and the card shows that half-marathon time for your age band. Championship entry is a separate route for members of a UK athletics body (non-residents included): marathon under 2:38:00 for men or 3:10:00 for women, same window, applications closing October 20, 2026.</p>
        <p><strong>Boston’s downhill index.</strong> From 2027 registration, a course’s net drop (start elevation minus finish elevation) adds 5:00 to the time for 1,500–2,999 ft, 10:00 for 3,000–5,999 ft, and 6,000 ft or more is not accepted. Metres convert at 1 m = 3.28084 ft. The B.A.A. does not list which courses are affected, so the drop is yours to enter. Its statements also differ on how long the index will last.</p>
        <p><strong>Past cut-offs, not a forecast.</strong> The B.A.A. accepts qualifiers fastest relative to their standard until the field is full, and announces the resulting cut-off after registration. The table shows every published cut-off from {first} to {last} and whether your margin is at least as large; it describes the past. The B.A.A. does not predict cut-offs and neither does Pace Notes; nothing here estimates whether anyone will be accepted. For {last}, about 1,000 qualifiers who missed the cut-off were also drawn at random; the “about 11%” is our own arithmetic on B.A.A. counts (1,000 ÷ (8,019 turned away + 1,000 drawn)), and the B.A.A. has not said whether the draw continues.</p>
        <p><strong>New York’s pool.</strong> A time from an NYRR race that meets the standard gives guaranteed entry. Other qualifying times enter a capped pool taken fastest first; for 2026 that pool reached 22:52 under the standard (NYRR). For 2025, secondary sources reported 13:20; NYRR published no figure, so the checker labels it unofficial. NYRR does not publish the next pool cut-off in advance. The NYRR qualifier page was read through NYRR’s own cache host.</p>
        <p><strong>Application badges.</strong> “Open now”, “upcoming” and “closed” come from the listed application dates and your device’s date, so they change on their own. Exact opening and closing times are in each card’s note. A race without listed dates shows “dates not announced”. Tokyo is not included because its standards could not be verified from an official page.</p>
        <p><strong>Targets.</strong> “Times to aim for” subtracts your chosen buffer (and Boston’s downhill index, if you entered a drop) from each standard and divides by 42.195 km for an even pace. A race that does not accept a course with the drop you entered (Boston at 6,000 ft or more, Sydney over 457 m) is left out. It is arithmetic on the official numbers, not advice about what buffer is enough.</p>
        <p><strong>Privacy.</strong> Your date of birth stays in this browser. It is never put in the page address, a copied link or analytics. If you tick “remember on this device” it is kept in this browser’s local storage until you untick it. The share link carries only your division and time.</p>
      </ToolMethod>
      <ToolNext current="qualifying" />
    </div>
  );
}
