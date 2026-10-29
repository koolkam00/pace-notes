"""The grade curve against a second published approximation of the same Strava curve (Fellrnr).

Committed October 29, 2026; it reproduces the cross-check of the October 23, 2026 design work (its `model.json` table,
which is not in the repository). The terrain splits use the third-party quadratic fit to Robb (2017),
f(g) = 1 + 0.02869556 g + 0.001520768 g^2 (sci-dani.com, "Mind the GAP"; g the grade in percent). Fellrnr's
Grade Adjusted Pace page (https://fellrnr.com/wiki/Grade_Adjusted_Pace) prints "15.14i2 - 2.896i" (i the grade as a
fraction) as an approximation of the same curve's relative cost; read with the linear term's sign as + (the minus
would make climbs cheaper than the flat), it is 1 + 2.896 i + 15.14 i^2. Nothing here enters any page figure or CI.

    python analysis/course_terrain/validation-2026-10-23/curve_crosscheck.py > curve_crosscheck.json

The table holds both curves at the whole grades the design work tabulated; the summary holds the largest gap on a
0.01% grid of the clamp range (−10% to +10%) and of −6% to +10%.
"""
import json

A1, A2 = 0.02869556, 0.001520768  # analysis/terrain_model.py


def strava_quadratic(g):
    return 1 + A1 * g + A2 * g * g


def fellrnr(g):
    i = g / 100
    return 1 + 2.896 * i + 15.14 * i * i


def largest_gap(lo, hi):
    grid = [round(lo + k * 0.01, 2) for k in range(int(round((hi - lo) / 0.01)) + 1)]
    g = max(grid, key=lambda x: (abs(strava_quadratic(x) - fellrnr(x)), -x))
    return {'from_pct': lo, 'to_pct': hi, 'grid_step_pct': 0.01, 'largest_abs_gap': round(abs(strava_quadratic(g) - fellrnr(g)), 6), 'at_pct': g}


def main():
    grades = [-10, -8, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 8, 10]
    table = [{'grade_pct': g, 'strava2017_quadratic': round(strava_quadratic(g), 6), 'fellrnr': round(fellrnr(g), 6),
              'gap': round(strava_quadratic(g) - fellrnr(g), 6)} for g in grades]
    out = {
        'purpose': 'Cross-check of the terrain splits grade curve against Fellrnr\'s approximation of the same Strava 2017 curve',
        'curves': {'strava2017_quadratic': '1 + 0.02869556 g + 0.001520768 g^2 (g percent; sci-dani.com fit)',
                   'fellrnr': '1 + 2.896 i + 15.14 i^2 (i = g / 100; Fellrnr prints the linear term with a minus sign)'},
        'table': table,
        'summary': [largest_gap(-10, 10), largest_gap(-6, 10)],
    }
    print(json.dumps(out, indent=1, sort_keys=True))


if __name__ == '__main__':
    main()
