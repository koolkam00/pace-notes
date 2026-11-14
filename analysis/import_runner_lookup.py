"""Verify a runner lookup v2 build and put it in public/data/runners.

    python3 -I analysis/import_runner_lookup.py --input <dir that holds runners/> [--pipeline <dir of the pipeline's files>]
        [--never-shown <file from analysis/lookup_audit.py>] [--output public/data]

The build is copied, file by file from its own chain, into a staging folder beside the destination; the complete
verifier (scripts/verify-lookup.cjs) then runs on the copy, so what it passes is byte for byte what is published; only
then does the copy replace public/data/runners. A provisional build (one whose manifest lists stand-in inputs), a build
of another release than the pin, or a build made by other scripts than the checked-in ones is refused by the verifier.
Nothing else under public/data is touched: the supporting study, the cohort and live.json have their own importers.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from lookup_format import PAGE_SIZE, PROFILE_SHARDS, index_page_path, leaf_path, profile_page_path, shard_path  # noqa: E402


def members(manifest):
    """Every file of the chain, from the manifest's own counts: nothing beside a build is ever copied."""
    leaves = manifest['index']['leaves']
    names = ['manifest.json', manifest['editions']['file']]
    names += [index_page_path(number) for number in range(len(manifest['index']['pages']))]
    names += [leaf_path(number) for number in range(leaves)]
    names += [profile_page_path(number) for number in range(PROFILE_SHARDS // PAGE_SIZE)]
    names += [shard_path(number) for number in range(PROFILE_SHARDS)]
    return names


def run(source, destination, pipeline=None, never_shown=None):
    repository = Path(__file__).resolve().parent.parent
    manifest = json.loads((source / 'runners/manifest.json').read_text())
    if manifest.get('schema_version') != 2:
        raise SystemExit('import_runner_lookup: not a version 2 lookup')
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.lookup-import-', dir=destination) as temp:
        staged = Path(temp)
        for name in members(manifest):
            (staged / 'runners' / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source / 'runners' / name, staged / 'runners' / name)
        command = ['node', str(repository / 'scripts/verify-lookup.cjs'), '--data-root', str(staged)]
        if manifest.get('cohort'):
            command += ['--cohort', str(destination / 'cohort/manifest.json')]
        if pipeline:
            command += ['--pipeline', str(pipeline.resolve())]
        if never_shown:
            command += ['--never-shown', str(never_shown.resolve())]
        subprocess.run(command, cwd=repository, check=True)
        target = destination / 'runners'
        if target.exists():
            os.replace(target, staged / 'runners-previous')
        os.replace(staged / 'runners', target)
    print(f"Imported the runner lookup of {manifest['release_tag']} ({manifest['counts']['results']:,} results, {manifest['counts']['profiles']:,} profiles)")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--input', type=Path, required=True, help='the folder that holds the build’s runners folder')
    parser.add_argument('--pipeline', type=Path, help='the folder of record-status.parquet.json and identity.parquet.json')
    parser.add_argument('--never-shown', type=Path, help='the keys that must not appear, from analysis/lookup_audit.py')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'public/data')
    args = parser.parse_args()
    run(args.input, args.output, args.pipeline, args.never_shown)
