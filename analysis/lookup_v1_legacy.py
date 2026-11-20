"""Publish all raw records in deterministic, independently verifiable search shards."""
import csv
import gzip
import hashlib
import json
from pathlib import Path

from build_pacing import FIELDS, POINTS
from build_public_explorer import encode, normalize_name


def write_shard(output, relative, payload, shards):
    data = gzip.compress(encode(payload), compresslevel=6, mtime=0)
    path = output / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    shards[relative] = dict(sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))


def build_lookup(db, source, output, provenance):
    output.mkdir(parents=True, exist_ok=True)
    tag = provenance['release_tag']
    assert db.execute('SELECT min(id)>0 AND max(id)<9007199254740991 FROM canonical_raw').fetchone()[0]
    editions = [dict(city=c, year=y, race=r) for c, y, r in db.execute(
        'SELECT DISTINCT city,year,race FROM canonical_raw ORDER BY city,year,race').fetchall()]
    db.execute('CREATE TEMP TABLE lookup_editions (city VARCHAR,year BIGINT,race VARCHAR,edition INTEGER)')
    db.executemany('INSERT INTO lookup_editions VALUES (?,?,?,?)',
                   [(e['city'], e['year'], e['race'], i) for i, e in enumerate(editions)])
    times = '[' + ','.join(f'seconds(r.{field})' for field in FIELDS) + ']'
    raw_times = '[' + ','.join(f'r.{field}' for field in FIELDS) + ']'
    # Source IDs are candidate links only; ambiguous/conflicting candidates are
    # singletons. Never merge records using a name match.
    # A record keyed by a preliminary link build (features.link_preliminary, adapter version 2: New York 2026 in
    # master-20261103b) is marked, so a profile it joins to other races can say so (November 5, 2026).
    feature_columns = {c[0] for c in db.execute('DESCRIBE features').fetchall()}
    prelim = 'coalesce(f.link_preliminary,false)' if 'link_preliminary' in feature_columns else 'false'
    db.execute(f'''CREATE TEMP TABLE lookup AS WITH classified AS (
      SELECT r.id,r.runner AS name,r.sex,r.age,d.edition,r.year,r.city,
        CASE WHEN s.runner_id IS NOT NULL AND NOT f.is_ambiguous
          THEN 'u:'||f.runner_id ELSE 'r:'||r.id::VARCHAR END AS identity_key,
        CASE WHEN s.runner_id IS NOT NULL AND NOT f.is_ambiguous THEN {prelim} ELSE false END AS prelim,
        {times} AS times,CASE WHEN e.rid IS NULL THEN {raw_times} END AS raw_times,
        e.rid IS NOT NULL AS eligible,
        CASE WHEN e.rid IS NOT NULL THEN NULL
          WHEN q.reason IS NOT NULL THEN q.reason
          WHEN p.rid IS NULL THEN 'Duplicate of another recorded race; excluded from analysis.'
          WHEN p.t0 IS NULL OR p.t1 IS NULL OR p.t2 IS NULL OR p.t3 IS NULL OR p.t4 IS NULL OR p.t5 IS NULL OR p.t6 IS NULL OR p.t7 IS NULL OR p.t8 IS NULL
            THEN 'One or more checkpoint times are missing or could not be parsed.'
          WHEN NOT (p.t0>0 AND p.t1>p.t0 AND p.t2>p.t1 AND p.t3>p.t2 AND p.t4>p.t3 AND p.t5>p.t4 AND p.t6>p.t5 AND p.t7>p.t6 AND p.t8>p.t7)
            THEN 'Checkpoint times are not strictly increasing.'
          ELSE 'Finish or section pace falls outside the study quality bounds.' END AS reason
      FROM canonical_raw r JOIN features f ON r.id=f.record_id
      JOIN lookup_editions d ON r.city IS NOT DISTINCT FROM d.city AND r.year IS NOT DISTINCT FROM d.year AND r.race IS NOT DISTINCT FROM d.race
      LEFT JOIN safe_ids s ON f.runner_id=s.runner_id
      LEFT JOIN eligible e ON r.id=e.rid LEFT JOIN parsed p ON r.id=p.rid
      LEFT JOIN source_quality_editions q ON r.city=q.city AND r.year=q.year
    ) SELECT *,min(id) OVER(PARTITION BY identity_key) AS profile_id FROM classified''')
    raw, eligible = db.execute('SELECT count(*),sum(eligible::INTEGER) FROM lookup').fetchone()
    assert raw == provenance['cohort']['raw'] and eligible == provenance['cohort']['eligible']
    print(json.dumps(dict(lookup_records=raw, eligible_records=int(eligible))), flush=True)
    # The supporting study has already been written. Release bulky calculation
    # tables before the external sorts used to stream lookup shards.
    for table in ['slowdown', 'slowdown_runs', 'slowdown_ratios', 'history', 'pairs', 'prior', 'linked', 'candidate_links', 'eligible', 'timing_eligible', 'paced', 'parsed', 'unique_records']:
        db.execute(f'DROP TABLE IF EXISTS {table}')
    # Normalize distinct names in batches outside a scalar SQL/Python callback.
    # This avoids millions of interpreter/module-import transitions while keeping
    # exactly the same Unicode algorithm as the browser.
    names_file = output.parent/'normalized-names.csv'
    cursor = db.execute("SELECT DISTINCT coalesce(name,'') AS name FROM lookup")
    with names_file.open('w', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['name', 'normalized'])
        while batch := cursor.fetchmany(10000):
            writer.writerows((name, normalize_name(name)) for (name,) in batch)
    db.execute("""CREATE TEMP TABLE lookup_names AS SELECT * FROM read_csv(?,
      header=true, delim=',', quote='"', escape='"',
      columns={'name':'VARCHAR','normalized':'VARCHAR'}, force_not_null=['name','normalized'])""", [str(names_file)])
    names_file.unlink()
    print('Normalized all distinct recorded names', flush=True)
    db.execute('''CREATE TEMP TABLE lookup_stats AS SELECT profile_id,count(*) AS n,
      min(year) AS first_year,max(year) AS last_year,first(city ORDER BY year DESC,id) AS city,
      count(*)>1 AND bool_or(prelim) AS preliminary
      FROM lookup GROUP BY profile_id''')
    preliminary_profiles = db.execute('SELECT count(*) FROM lookup_stats WHERE preliminary').fetchone()[0]
    preliminary_editions = [[c, y] for c, y in db.execute('''SELECT DISTINCT l.city,l.year FROM lookup l
      JOIN lookup_stats s USING(profile_id) WHERE s.preliminary AND l.prelim ORDER BY 1,2''').fetchall()]
    named = db.execute("SELECT count(*) FROM lookup l JOIN lookup_names n ON coalesce(l.name,'')=n.name WHERE n.normalized<>''").fetchone()[0]
    profiles = db.execute('SELECT count(*) FROM lookup_stats').fetchone()[0]
    shards = {}
    query = '''SELECT substr(sha256(l.profile_id::VARCHAR),1,3) AS bucket,
      l.profile_id,l.id,l.name,l.sex,l.age,l.edition,l.times,l.raw_times,l.eligible,l.reason,s.preliminary,l.prelim
      FROM lookup l JOIN lookup_stats s USING(profile_id) ORDER BY bucket,l.profile_id,l.year,l.id'''
    cursor = db.execute(query)
    current_bucket = None
    payload = []
    profile = None
    written_records = 0
    written_profiles = 0
    while True:
        batch = cursor.fetchmany(10000)
        if not batch:
            break
        for shard, pid, rid, name, sex, age, edition, elapsed, recorded, valid, reason, preliminary, linked_prelim in batch:
            if shard != current_bucket:
                if current_bucket is not None:
                    write_shard(output, f'profiles/{current_bucket}.json.gz', dict(release_tag=tag, profiles=payload), shards)
                current_bucket, payload, profile = shard, [], None
            if profile is None or profile['id'] != pid:
                profile = dict(id=pid, names=[], races=[])
                if preliminary:
                    profile['preliminary'] = True
                payload.append(profile)
                written_profiles += 1
            if name and name not in profile['names']:
                profile['names'].append(name)
            row = dict(id=rid, edition=edition, name=name or '', sex=sex, age=age,
                       times=elapsed, eligible=valid, reason=reason)
            if recorded is not None:
                row['raw_times'] = recorded
            if preliminary and linked_prelim:
                row['link'] = 'preliminary'
            profile['races'].append(row)
            written_records += 1
    if current_bucket is not None:
        write_shard(output, f'profiles/{current_bucket}.json.gz', dict(release_tag=tag, profiles=payload), shards)
    assert written_records == raw and written_profiles == profiles
    print(json.dumps(dict(profile_records=written_records, profiles=profiles)), flush=True)
    cursor = db.execute('''WITH aliases AS (
      SELECT DISTINCT l.profile_id,l.name,n.normalized FROM lookup l JOIN lookup_names n ON l.name=n.name WHERE n.normalized<>''
    ), prefixes AS (
      SELECT DISTINCT profile_id,name,substr(token,1,3) AS prefix FROM aliases,unnest(string_split(normalized,' ')) AS t(token)
    ) SELECT substr(sha256(prefix),1,3) AS bucket,p.name,p.profile_id,s.n,s.first_year,s.last_year,s.city,s.preliminary::INTEGER
      FROM prefixes p JOIN lookup_stats s USING(profile_id) ORDER BY bucket,p.name,p.profile_id''')
    current_bucket, rows, index_rows = None, [], 0
    while True:
        batch = cursor.fetchmany(10000)
        if not batch:
            break
        for shard, *row in batch:
            if shard != current_bucket:
                if current_bucket is not None:
                    write_shard(output, f'index/{current_bucket}.json.gz', dict(release_tag=tag, rows=rows), shards)
                current_bucket, rows = shard, []
            rows.append(row)
            index_rows += 1
    if current_bucket is not None:
        write_shard(output, f'index/{current_bucket}.json.gz', dict(release_tag=tag, rows=rows), shards)
    manifest = dict(**provenance, raw_records=raw, eligible_records=int(eligible), named_records=named,
                    unnamed_records=raw-named, profiles=profiles, index_rows=index_rows,
                    points_km=POINTS, editions=editions, shards=shards,
                    normalization='NFKD; remove Unicode marks; lowercase; keep letters/numbers; collapse spaces',
                    identity='The producer\'s person links (person_id under the adapter\'s frozen rule) passing gender, birth-year and duplicate-edition checks; otherwise one record per link. The producer links records by recorded name, sex and age or birth year; they are not verified people, and Pace Notes adds no name matching of its own.',
                    preliminary_links=dict(profiles=preliminary_profiles, editions=preliminary_editions,
                                           rule='A profile is preliminary when it joins more than one record and at least one of them is keyed by a preliminary link build; those races carry link "preliminary".'))
    (output/'manifest.json').write_bytes(encode(manifest))
    print(json.dumps(dict(raw_records=raw, named_records=named, profiles=profiles,
                          shards=len(shards), compressed_bytes=sum(v['bytes'] for v in shards.values()))), flush=True)
