"""Build current-source race-day peer comparisons and environmental context."""
import argparse
import gzip
import hashlib
import json
import tarfile
from datetime import datetime, timezone
from pathlib import Path

import duckdb
from build_pacing import prepare
from runner_environment import build_environment
from runner_peers import build_peer_editions
from source_quality import source_quality_report

FILES = ['race_records.parquet', 'race_conditions.parquet', 'course_profiles.parquet', 'course_segments.parquet']
SCRIPTS = ['build_runner_context.py', 'runner_peers.py', 'runner_environment.py', 'build_pacing.py', 'build_weather.py', 'source_quality.py']


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def encode(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))+'\n').encode()


def verified_inputs(source, provenance):
    # An adapted input (analysis/adapt_master.py; analysis/adapt_combined.py for a combined release, whose pinned asset is
    # the CORE archive) has no FULL archive of its own: its members are checked against the adapter's manifest.
    if provenance.get('layout') in ('master', 'combined'):
        return verified_master_inputs(source, provenance)
    archive = source/'full.tar.gz'
    assert digest(archive) == provenance['asset_sha256'], 'FULL archive checksum mismatch'
    assert digest(source/'MANIFEST.json') == provenance['manifest_sha256'], 'Source manifest checksum mismatch'
    hashes = {name: digest(source/name) for name in FILES}
    found = set()
    with tarfile.open(archive, 'r:gz') as bundle:
        for member in bundle:
            name = Path(member.name).name
            if name not in FILES:
                continue
            assert member.isfile() and name not in found, 'Invalid or duplicate source member'
            with bundle.extractfile(member) as stream:
                assert hashlib.file_digest(stream, 'sha256').hexdigest() == hashes[name], f'Extracted {name} differs from the verified archive'
            found.add(name)
            if found == set(FILES):
                break
    assert found == set(FILES), 'Missing analysis inputs'
    return hashes


def verified_master_inputs(source, provenance):
    """An adapted input has no FULL archive: the pinned source file the provenance names (the master results file, or a
    combined release's CORE archive) is re-hashed against provenance.asset_sha256, and each analysis member against the
    adapter's MANIFEST.json and SHA256SUMS.txt, whose manifest is the one provenance names."""
    assert digest(source/provenance['asset_path']) == provenance['asset_sha256'], 'Master results file checksum mismatch'
    assert digest(source/'MANIFEST.json') == provenance['manifest_sha256'], 'Source manifest checksum mismatch'
    manifest = json.loads((source/'MANIFEST.json').read_text())
    listed = {}
    for line in (source/'SHA256SUMS.txt').read_text().splitlines():
        if line.strip():
            value, name = line.split(maxsplit=1)
            listed[name.strip()] = value
    hashes = {name: digest(source/name) for name in FILES}
    for name, value in hashes.items():
        assert manifest['files'][name]['sha256'] == value == listed.get(name), f'{name} differs from the adapted manifest'
    return hashes


def run(source, output, runner_root):
    repository = Path(__file__).resolve().parent.parent
    pin = json.loads((repository/'analysis/release.json').read_text())
    origin = json.loads((source/'provenance.json').read_text())
    runners = json.loads((runner_root/'manifest.json').read_text())
    from source_quality import REVIEWED_POLICIES
    assert origin['release_tag'] == runners['release_tag'] == pin['tag']
    assert pin['tag'] in REVIEWED_POLICIES, 'Review the source and edition policy before adoption'
    assert origin['asset_sha256'] == runners['input_asset_sha256'] and origin['manifest_sha256'] == runners['input_manifest_sha256']
    files = verified_inputs(source, origin)
    db = duckdb.connect()
    db.execute("SET memory_limit='3GB'")
    db.execute('SET threads=2')
    scratch = output.parent/'runner-context-temp'
    scratch.mkdir(parents=True, exist_ok=True)
    db.execute('SET temp_directory=?', [str(scratch)])
    cohort = prepare(db, source, keep_record_id=True)
    quality = source_quality_report(db, source)
    assert cohort == runners['cohort'] and quality == runners['source_quality']
    editions = runners['editions']
    actual = db.execute('SELECT DISTINCT city,year,race FROM read_parquet(?) ORDER BY city,year,race', [str(source/'race_records.parquet')]).fetchall()
    assert actual == [(e['city'], e['year'], e['race']) for e in editions], 'Runner edition mapping changed'
    peers = build_peer_editions(db)
    print(json.dumps({'peer_editions':len(peers), 'eligible':cohort['eligible']}), flush=True)
    environment = build_environment(db, source, editions)
    output.mkdir(parents=True, exist_ok=True)
    (output/'editions').mkdir(exist_ok=True)
    transport = {}
    totals = dict(eligible=0, groups=0, pace_cells=0, cdf_cells=0, weather_editions=0, terrain_editions=0)
    for index, edition in enumerate(editions):
        key = (edition['city'], edition['year'], edition['race'])
        peer = peers.get(key, dict(eligible_n=0, age_n=0, gender_n=0, groups={}))
        context = environment[key]
        payload = dict(schema_version=1, release_tag=pin['tag'], edition=dict(index=index, **edition), **peer, **context)
        relative = f'editions/{index:03}.json.gz'
        compressed = gzip.compress(encode(payload), compresslevel=6, mtime=0)
        (output/relative).write_bytes(compressed)
        transport[str(index)] = dict(file=relative, bytes=len(compressed), sha256=hashlib.sha256(compressed).hexdigest())
        totals['eligible'] += peer['eligible_n']
        totals['groups'] += len(peer['groups'])
        totals['pace_cells'] += sum(len(g['pace']) for g in peer['groups'].values())
        totals['cdf_cells'] += sum(len(g['finish']) for g in peer['groups'].values())
        totals['weather_editions'] += context['weather'] is not None
        totals['terrain_editions'] += context['terrain'] is not None
    assert totals['eligible'] == cohort['eligible']
    manifest = dict(schema_version=1, release_tag=pin['tag'], input_as_of=runners['input_as_of'],
                    as_of=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z'),
                    runner_manifest_as_of=runners['as_of'], runner_manifest_sha256=digest(runner_root/'manifest.json'),
                    input_asset_sha256=origin['asset_sha256'], input_manifest_sha256=origin['manifest_sha256'],
                    input_files=files, scripts={name:digest(Path(__file__).with_name(name)) for name in SCRIPTS},
                    cohort=cohort, source_quality=quality, totals=totals, editions=transport,
                    methodology=[
                        'Peer groups contain eligible finishes from the exact same city, year and recorded race. These are the database eligible field, not official overall or age-group standings.',
                        'Exact ages 18–24 then five-year bands through 85–89; recorded Men/Women are preserved without inference. Unknown values can use the overall comparison.',
                        'A peer group requires at least 101 finishes. Finish rank uses exact recorded finish times rounded to milliseconds, excludes the selected result, and gives other ties half weight in the percentile. Higher percentiles mean a faster finish.',
                        'Pacing peers fall in a half-open 15-minute achieved-time interval centered on the nearest 15-minute time, with at least 101 finishes. Their section and late-change quartiles include the selected finish. These are outcome-defined comparisons, not earlier ability or a recommended pacing plan.',
                        'Section paces use all nine original intervals. Late change compares 30 km–finish pace with 5–20 km pace. Quantile bands show the middle half of observed finishes, not confidence intervals.',
                        'Weather is modeled scheduled-start context, not each runner’s measured exposure. Supplied course geometry has no verified historical validity; terrain is contextual and is never used to calculate an adjusted finish time.',
                        'Between-race differences are descriptive. Identity selection, field composition, age bands, route changes, training and conditions can differ. No effect of weather, terrain or aging is identified.'
                    ])
    (output/'manifest.json').write_bytes(encode(manifest))
    print(json.dumps(dict(**totals, compressed_bytes=sum(x['bytes'] for x in transport.values()))), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--runners', type=Path, default=Path(__file__).resolve().parent.parent/'public/data/runners')
    args = parser.parse_args()
    run(args.input, args.output, args.runners)
