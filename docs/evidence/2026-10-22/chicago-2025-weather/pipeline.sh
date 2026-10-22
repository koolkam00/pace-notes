#!/bin/bash
# Partial rebuild for private-export-20261021-1050 after accepting Chicago 2025's 07:00 weather hour (owner decision,
# October 22, 2026). Only the outputs that read the weather start-hour check run again: the weather screen, runner
# context, and what binds runner context (all-finisher context, stories and tool data). Packs, the supporting study and
# fast start read neither build_weather.py nor runner context, so they stay as built on October 21. Stops at the first failure.
set -euo pipefail
cd /home/user/wt/r0829
F=/home/user/data/1050-full
C=/home/user/data/1050-core
B=/home/user/data/out-1050
L=$B/logs-chi2025
mkdir -p $L
step() { local name=$1; shift; echo "$(date -u +%H:%M:%S) START $name"; local t0=$(date +%s); "$@" > $L/$name.log 2>&1 || { echo "$(date -u +%H:%M:%S) FAIL $name (see $L/$name.log)"; tail -5 $L/$name.log; exit 1; }; echo "$(date -u +%H:%M:%S) OK $name $(( $(date +%s)-t0 ))s"; }
step tests python -m unittest discover -s analysis -p 'test_*.py'
step weather python analysis/build_weather.py --input $F --output $B/weather/evidence.json
step weather-copy cp $B/weather/evidence.json public/data/weather/evidence.json
step context python analysis/build_runner_context.py --input $F --output $B/runner-context --runners public/data/runners
step context-check python analysis/import_runner_context.py --input $B/runner-context --check-only
step context-import python analysis/import_runner_context.py --input $B/runner-context
step afc python analysis/build_all_finisher_context.py --runners public/data/runners --context public/data/runner-context --output $B/all-finisher-context/evidence.json
step afc-verify node scripts/verify-all-finisher-context.cjs --input $B/all-finisher-context/evidence.json
step afc-copy cp $B/all-finisher-context/evidence.json public/data/all-finisher-context/evidence.json
rm -rf $B/insights && mkdir -p $B/insights
step insights python analysis/build_insights.py --output $B/insights
step geometry python analysis/build_course_geometry.py --profiles $C/course_profiles.parquet --output $B/insights/course-geometry.json
step insights-manifest python analysis/build_insights.py --output $B/insights --only manifest
step insights-verify node scripts/verify-insights.cjs --input $B/insights
step insights-copy bash -c "rm -rf public/data/insights && cp -a $B/insights public/data/insights && diff -rq public/data/insights $B/insights"
step context-verify node scripts/verify-runner-context.cjs
step weather-verify node scripts/verify-weather.cjs
echo "$(date -u +%H:%M:%S) PIPELINE DONE"
