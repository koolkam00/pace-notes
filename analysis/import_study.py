"""Verify and import the supporting study, and write public/data/live.json (adoption decision D26, 2026-11-14).

    python3 -s analysis/import_study.py --input <the builder's output dir> [--output public/data]

This importer is the only writer of live.json: the compatibility metadata of the adopted data (release tag, the two
timestamps, corpus counts, the study file and the marathon cohort manifest's digest); it carries no figure. It runs
scripts/verify-study.cjs on the input, then on the result, before it replaces anything else.
"""
import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


def live_metadata(study):
    return dict(schema_version=2, status='ready', as_of=study['as_of'], input_as_of=study['input_as_of'],
                release_tag=study['release_tag'],
                corpus=dict(n_records=study['cohort']['raw'], eligible_finishes=study['n']),
                supporting_study='study/evidence.json', cohort_manifest_sha256=study['cohort_manifest_sha256'])


def run(source, destination):
    repository = Path(__file__).resolve().parent.parent
    verifier = str(repository/'scripts/verify-study.cjs')
    subprocess.run(['node', verifier, '--data-root', str(source.resolve())], cwd=repository, check=True)
    study = json.loads((source/'study/evidence.json').read_text())
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.study-import-', dir=destination) as temp:
        staged = Path(temp)
        (staged/'study').mkdir()
        shutil.copyfile(source/'study/evidence.json', staged/'study/evidence.json')
        (staged/'live.json').write_text(json.dumps(live_metadata(study), indent=2)+'\n')
        target = destination/'study'
        if target.exists():
            os.replace(target, staged/'study-previous')
        os.replace(staged/'study', target)
        os.replace(staged/'live.json', destination/'live.json')
    subprocess.run(['node', verifier], cwd=repository, check=destination.resolve() == (repository/'public/data').resolve())
    print(f'Imported the supporting study and live.json for {study["release_tag"]}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent/'public/data')
    args = parser.parse_args()
    run(args.input, args.output)
