/**
 * Cool-to-hot colour for a start temperature in °C, for the course pages' weather by year (components/story/
 * CourseInsights.tsx). It moved here from the legacy WeatherStory when the weather story was rebuilt on the shared
 * chart forms (/stories/race-morning, October 17, 2026).
 */
export function tempColour(c: number) {
  const stops: [number, [number, number, number]][] = [[0, [29, 63, 216]], [6, [79, 121, 247]], [11, [239, 232, 218]], [16, [255, 150, 100]], [22, [232, 70, 40]], [27, [170, 20, 40]]];
  if (c <= stops[0][0]) return `rgb(${stops[0][1].join(',')})`;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (c <= b) {
      const f = (c - a) / (b - a);
      return `rgb(${ca.map((v, k) => Math.round(v + f * (cb[k] - v))).join(',')})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(',')})`;
}
