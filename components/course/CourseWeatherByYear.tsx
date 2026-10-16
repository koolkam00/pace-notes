import { UnitLink as Link } from '@/components/UnitsProvider';
import { CourseWeather } from '@/components/story/CourseInsights';
import { PerDegree, Temperature } from '@/components/story/Units';
import { count, pct, yearList, type CoursePageData } from '@/lib/course-page';
import { CourseSection, Fact } from './Fact';
import { Wind } from './CourseUnits';

/** r with a true minus sign and two decimals. */
const r = (value: number) => `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}`;

/**
 * "Race-morning weather by year": only for courses with at least one weather row. The coolest-against-warmest sentence
 * appears only when the two starts are at least the screen's gap apart (hotCoolShown), and the within-course slope only
 * for the courses the story data fits one for.
 */
export default function CourseWeatherByYear({ page }: { page: CoursePageData }) {
  const { weather, weatherMissing, hotCool, slope, city, display, scopes } = page;
  if (!weather.length) return null;
  return (
    <CourseSection id="weather" track="chapter-7" kicker="Weather" title="Race-morning weather by year"
      dek={<>The supplied modelled weather for the hour of each edition’s scheduled start: one point in the city, not what any runner felt. Context only, not an adjustment.</>}>
      <div className="tool-table-wrap course-table-wrap">
        <table className="tool-table course-table">
          <caption className="sr-only">{display} race-morning weather by edition</caption>
          <thead><tr><th scope="col">Year</th><th scope="col">Scheduled start</th><th scope="col">Temperature</th><th scope="col">Dew point</th><th scope="col">Humidity</th><th scope="col">Wind</th></tr></thead>
          <tbody>
            {weather.map((w) => (
              <tr key={w.year}>
                <th scope="row">{w.year}</th>
                <td>{w.start ? <Fact k={`w.start@${w.year}`} v={w.start}>{w.start}</Fact> : '—'}</td>
                <td><Fact k={`w.temp@${w.year}`} v={w.temp}><Temperature c={w.temp} /></Fact></td>
                <td><Fact k={`w.dew@${w.year}`} v={w.dew}><Temperature c={w.dew} /></Fact></td>
                <td><Fact k={`w.rh@${w.year}`} v={w.humidity}>{Math.round(w.humidity)}%</Fact></td>
                <td><Fact k={`w.wind@${w.year}`} v={w.wind}><Wind mps={w.wind} /></Fact></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="course-note">Modelled hourly weather at the scheduled start, one row per edition with a weather record.{weatherMissing.length ? ` No weather row for ${yearList(weatherMissing.map((w) => w.year))}.` : ''}</p>
      {hotCool ? (
        <p className="course-hotcool"><Fact k="hc.cool.year" v={hotCool.cool.year}>{hotCool.cool.year}</Fact> started coolest, at <Fact k="hc.cool.temp" v={hotCool.cool.temp}><Temperature c={hotCool.cool.temp} /></Fact>, and <Fact k="hc.cool.sd" v={hotCool.cool.slowdown}>{pct(hotCool.cool.slowdown)}</Fact> of its finishes had a sustained slowdown; <Fact k="hc.hot.year" v={hotCool.hot.year}>{hotCool.hot.year}</Fact> started warmest, at <Fact k="hc.hot.temp" v={hotCool.hot.temp}><Temperature c={hotCool.hot.temp} /></Fact>, with <Fact k="hc.hot.sd" v={hotCool.hot.slowdown}>{pct(hotCool.hot.slowdown)}</Fact>. Other things changed between those years too.</p>
      ) : null}
      {slope ? (
        <p className="course-slope">Across <Fact k="slope.editions" v={slope.editions}>{count(slope.editions)}</Fact> {display} editions, the share of finishes with a sustained slowdown changed by <Fact k="slope" v={slope.slope}><PerDegree perC={slope.slope} unit="percentage points" /></Fact> of start temperature (r = <Fact k="slope.r" v={slope.pearson_r}>{r(slope.pearson_r)}</Fact>). An association across a few editions, not a measured effect of heat.</p>
      ) : null}
      {weather.length >= 2 ? <CourseWeather city={city} editions={weather} /> : null}
      <p className="course-note">{scopes.weather ? <><Link href={`/tools/weather-match?course=${page.slug}`}>Weather match</Link>: past race mornings at your forecast temperature, and how finishes at your pace held up.</> : <><Link href="/tools/weather-match">Weather match</Link>: past race mornings at your forecast temperature on every course.</>}</p>
    </CourseSection>
  );
}
