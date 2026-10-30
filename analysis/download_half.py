"""Fetch and verify the half snapshot, its link build and the corrected edition metadata (docs/HALF_MARATHON.md).

    python3 -I analysis/download_half.py [--out DIR] [--links-work DIR] [--only half|links|correction]
    python3 -I analysis/download_half.py --from-dir DIR [--from-dir DIR] [--out DIR]

All three come from the owner's public CC BY 4.0 releases in the repository analysis/half-release.json names
(`repository`): the snapshot and the link build from `half.tag` and `links.tag` (one release, half-dataset-20261029-1202),
the corrected `csv-edition_meta.csv.zst` from `metadata_correction.tag` (half-dataset-20261029-2157). No account, token
or signed URL is needed: every request goes anonymously to
`https://github.com/{repository}/releases/download/{tag}/{asset}`, never to api.github.com, and carries no
Authorization header. Nothing is written under the repository or `public/`: the files go to `--out`, default
`$PACE_HALF_DIR` (itself defaulting to `~/data/half-1133`). The pages publish aggregates of these files only.

Each release's own `SHA256SUMS` is fetched first; every asset the pin lists must be in it with the pinned digest, so the
pin, the release and the downloaded bytes agree. Every downloaded file is checked against its digest as it streams.
`--from-dir DIR` takes a folder already filled from a release (`gh release download <tag> -R <repository>` or curl, with
its `SHA256SUMS`) instead; give it once per folder. Parts read from such a folder are never deleted.

Reassembly streams the parts in order into `zstd -d`, then runs `PRAGMA integrity_check` and compares the decompressed
SQLite's sha256 with the pin (`half.sqlite_sha256`). The links release has no pinned SQLite digest; its SQLite is cut at
once into `links-slim.sqlite` by analysis/half_links_extract.py, whose content digest must equal the pin
(`links.extract_content_sha256`); the 5.3 GB SQLite is written under `--links-work` (default `--out`, so a larger disk can
take it) and deleted unless `--keep-links-sqlite`. The corrected metadata lands at `<out>/<correction tag>/<asset>`, where
analysis/build_half.py and the source recount look for it. A file already in place with the pinned digest is kept.
`provenance.json` (local only, never committed) records what was checked. Needs the `zstd` command and about 10 GB of free
disk at the peak (3.7 GB half SQLite, 0.8 GB links part, 5.3 GB links SQLite).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
from datetime import date
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from half_common import PIN_PATH, ROOT, HalfError, fail, file_sha256, inside, load_pin  # noqa: E402

PART = re.compile(r'^(?P<stem>.+\.sqlite\.zst)\.part(?P<number>[0-9]{2})$')
LINKS_SQLITE = 'runner_links.sqlite'
# Rough decompressed sizes (bytes) for the free-disk check.
SIZES = {'half': 3_744_944_128, 'links': 5_270_000_000}
USER_AGENT = 'pace-notes-half-download'
DOWNLOAD_HOST = 'github.com'


def read_sums(path: Path) -> dict[str, str]:
    """A `sha256sum` file: {file name: digest}."""
    return parse_sums(path.read_text(), str(path))


def parse_sums(text: str, where: str = 'SHA256SUMS') -> dict[str, str]:
    listed = {}
    for line in text.splitlines():
        if not line.strip():
            continue
        parts = line.split(maxsplit=1)
        if len(parts) != 2:
            fail(f'{where}: malformed line')
        digest, name = parts[0], parts[1].strip().lstrip('*')
        if not re.fullmatch(r'[0-9a-f]{64}', digest) or '/' in name or name in listed:
            fail(f'{where}: malformed or repeated line for {name!r}')
        listed[name] = digest
    return listed


def releases(pin: dict) -> list[dict]:
    """The pinned half and links specs: their tags, pinned assets, parts in order, and what they decompress to."""
    out = []
    for key, target, sha in (('half', pin['half']['sqlite'], pin['half']['sqlite_sha256']), ('links', LINKS_SQLITE, None)):
        assets = dict(pin[key]['assets'])
        parts = sorted((n for n in assets if PART.match(n)), key=lambda n: int(PART.match(n)['number']))
        if not parts or [int(PART.match(n)['number']) for n in parts] != list(range(len(parts))):
            fail(f'the pinned {key} release must list its SQLite parts numbered from 00 without gaps')
        if len({PART.match(n)['stem'] for n in parts}) != 1:
            fail(f'the pinned {key} parts belong to more than one file')
        for name, digest in assets.items():
            if not re.fullmatch(r'[0-9a-f]{64}', digest) or '/' in name:
                fail(f'the pinned {key} release lists a malformed asset {name!r}')
        out.append({'key': key, 'tag': pin[key]['tag'], 'assets': assets, 'parts': parts, 'target': target, 'target_sha256': sha})
    return out


def correction_spec(pin: dict) -> dict:
    """The pinned metadata correction as a spec: its CSV and README, no parts."""
    mc = pin['metadata_correction']
    assets = {mc['asset']: mc['sha256'], 'README.md': mc['readme_sha256']}
    for name, digest in assets.items():
        if not re.fullmatch(r'[0-9a-f]{64}', digest) or '/' in name:
            fail(f'the pinned metadata correction lists a malformed asset {name!r}')
    return {'key': 'correction', 'tag': mc['tag'], 'assets': assets, 'parts': [], 'target': mc['asset'], 'target_sha256': mc['sha256']}


def all_specs(pin: dict) -> list[dict]:
    return releases(pin) + [correction_spec(pin)]


def check_folder(folder: Path, spec: dict) -> dict[str, Path]:
    """The pinned assets in a download folder, each checked against the folder's SHA256SUMS and the pin."""
    sums_path = folder / 'SHA256SUMS'
    if not sums_path.is_file():
        fail(f'{folder} has no SHA256SUMS')
    listed = read_sums(sums_path)
    for name, digest in spec['assets'].items():
        if listed.get(name) != digest:
            fail(f"{folder}/SHA256SUMS does not list {name} with the digest pinned for {spec['tag']}")
    found = {}
    for name, digest in listed.items():
        path = folder / name
        if not path.is_file():
            if name in spec['assets']:
                fail(f'{path} is missing')
            continue
        if name not in spec['assets']:
            continue
        if file_sha256(path) != digest:
            fail(f'{path} does not match SHA256SUMS')
        found[name] = path
    return found


def identify(folder: Path, specs: list[dict]) -> list[dict]:
    """The pinned specs a folder holds (one release can hold the half and the links), from its SHA256SUMS."""
    sums = folder / 'SHA256SUMS'
    if not sums.is_file():
        fail(f'{folder} has no SHA256SUMS')
    listed = read_sums(sums)
    hits = [s for s in specs if all(listed.get(n) == d for n, d in s['assets'].items())]
    if not hits:
        fail(f'{folder} holds no pinned release (its SHA256SUMS lists {sorted(listed)[:6]})')
    return hits


def integrity_ok(path: Path) -> bool:
    con = sqlite3.connect(f'file:{path.as_posix()}?mode=ro', uri=True)
    try:
        return con.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
    finally:
        con.close()


def remove_sidecars(path: Path) -> None:
    """The -wal and -shm files a read of a WAL-mode SQLite leaves beside it (the links release is one)."""
    for suffix in ('-wal', '-shm'):
        path.with_name(path.name + suffix).unlink(missing_ok=True)


def reassemble(parts: list[Path], target: Path, expected_sha256: str | None) -> str:
    """Stream the parts in order through `zstd -d` into `target`, check integrity and the digest; return the digest."""
    if shutil.which('zstd') is None:
        fail('the zstd command is required to reassemble the SQLite parts')
    tmp = target.with_name(target.name + '.part-tmp')
    tmp.unlink(missing_ok=True)
    try:
        with subprocess.Popen(['zstd', '-d', '-q', '-o', str(tmp)], stdin=subprocess.PIPE) as proc:
            assert proc.stdin is not None
            try:
                for part in parts:
                    with part.open('rb') as handle:
                        shutil.copyfileobj(handle, proc.stdin, 1 << 20)
            finally:
                proc.stdin.close()
        if proc.returncode != 0:
            fail(f'zstd could not decompress the parts of {target.name}')
        if not integrity_ok(tmp):
            fail(f'{target.name}: PRAGMA integrity_check failed')
        digest = file_sha256(tmp)
        if expected_sha256 is not None and digest != expected_sha256:
            fail(f'{target.name}: the decompressed file is not the pinned one (sha256 {digest})')
        remove_sidecars(tmp)
        os.replace(tmp, target)
        return digest
    finally:
        tmp.unlink(missing_ok=True)
        remove_sidecars(tmp)


# ---------------------------------------------------------------------------------------------------------------
# Anonymous public downloads: github.com release URLs only, no Authorization header, ever.
# ---------------------------------------------------------------------------------------------------------------

def public_url(repo: str, tag: str, name: str) -> str:
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo) or not re.fullmatch(r'[A-Za-z0-9_.-]+', tag):
        fail(f'not a public release address: {repo} {tag}')
    return f'https://{DOWNLOAD_HOST}/{repo}/releases/download/{tag}/{quote(name)}'


def public_request(url: str) -> Request:
    parts = urlsplit(url)
    if parts.scheme != 'https' or parts.hostname != DOWNLOAD_HOST or '/releases/download/' not in parts.path:
        fail(f'{url}: downloads go to public github.com release URLs only')
    return Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/octet-stream'})


def _opener():
    return build_opener()


def fetch_sums(repo: str, tag: str) -> dict[str, str]:
    """A release's own SHA256SUMS, fetched anonymously."""
    url = public_url(repo, tag, 'SHA256SUMS')
    with _opener().open(public_request(url), timeout=60) as response:
        return parse_sums(response.read().decode('utf-8'), url)


def download(url: str, destination: Path, expected_sha256: str) -> None:
    """Stream one public asset to `destination`, checking its sha256; nothing is left behind on a mismatch."""
    digest = hashlib.sha256()
    tmp = destination.with_name(destination.name + '.download')
    try:
        with _opener().open(public_request(url), timeout=120) as response, tmp.open('wb') as out:
            while chunk := response.read(1 << 20):
                out.write(chunk)
                digest.update(chunk)
        if digest.hexdigest() != expected_sha256:
            fail(f'{destination.name}: the downloaded bytes differ from the pinned sha256')
        os.replace(tmp, destination)
    finally:
        tmp.unlink(missing_ok=True)


def fetch_release(spec: dict, repo: str, folder: Path, sums: dict[str, str]) -> dict[str, Path]:
    """Every pinned asset of one spec, downloaded into `folder` after the release's SHA256SUMS agreed with the pin."""
    for name, digest in spec['assets'].items():
        if sums.get(name) != digest:
            fail(f"release {spec['tag']}: its SHA256SUMS does not list {name} with the pinned digest")
    folder.mkdir(parents=True, exist_ok=True)
    found = {}
    for name, digest in spec['assets'].items():
        path = folder / name
        if path.is_file() and file_sha256(path) == digest:
            found[name] = path
            continue
        download(public_url(repo, spec['tag'], name), path, digest)
        found[name] = path
    return found


# ---------------------------------------------------------------------------------------------------------------

def place(spec: dict, assets: dict[str, Path], out: Path, *, downloaded: bool, keep_links_sqlite: bool, replace: bool,
          links_work: Path | None = None) -> dict:
    """Put one spec's file in place in `out`: decompress a SQLite (or keep a verified copy already there), cut the links
    extract, or put the corrected metadata in its folder. Returns its provenance."""
    record = {'tag': spec['tag'], 'assets': {name: spec['assets'][name] for name in sorted(spec['assets'])}}
    if spec['key'] == 'correction':
        folder = out / spec['tag']
        folder.mkdir(parents=True, exist_ok=True)
        for name, path in assets.items():
            target = folder / name
            if path.resolve() != target.resolve():
                shutil.copyfile(path, target)
            if file_sha256(target) != spec['assets'][name]:
                fail(f'{target} is not the pinned {name}')
        record['file'] = f"{spec['tag']}/{spec['target']}"
        return record
    parts = [assets[name] for name in spec['parts']]
    if spec['key'] == 'half':
        target = out / spec['target']
        if target.exists() and not replace:
            digest = file_sha256(target)
            if digest != spec['target_sha256']:
                fail(f'{target} exists and is not the pinned snapshot; move it away or pass --replace')
            record['sqlite'] = {'file': target.name, 'sha256': digest, 'kept': True}
        else:
            need = SIZES['half'] + (1 << 28)
            if shutil.disk_usage(out).free < need:
                fail(f'{out} has under {need / 1e9:.1f} GB free')
            digest = reassemble(parts, target, spec['target_sha256'])
            record['sqlite'] = {'file': target.name, 'sha256': digest, 'integrity_check': 'ok'}
    else:
        work = links_work or out
        work.mkdir(parents=True, exist_ok=True)
        target = work / spec['target']
        if shutil.disk_usage(work).free < SIZES['links'] + (1 << 28) and not target.exists():
            fail(f'{work} has too little free disk for the {SIZES["links"] / 1e9:.1f} GB links SQLite (use --links-work)')
        if not target.exists() or replace:
            reassemble(parts, target, None)
        import half_links_extract
        code = half_links_extract.main(['--links-sqlite', str(target), '--out', str(out / 'links-slim.sqlite')])
        if code:
            fail('the links extract differs from the pin')
        record['extract'] = {'file': 'links-slim.sqlite', 'extract_content_sha256': load_pin()['links']['extract_content_sha256']}
        remove_sidecars(target)
        if not keep_links_sqlite:
            target.unlink()
            record['links_sqlite'] = 'deleted after the extract was cut'
    if downloaded:
        for part in parts:
            part.unlink(missing_ok=True)
        record['parts'] = 'downloaded, verified and deleted'
    else:
        record['parts'] = 'read in place'
    return record


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--from-dir', type=Path, action='append', help='a folder filled from a pinned release, with its SHA256SUMS (once per folder)')
    parser.add_argument('--out', type=Path, default=Path(os.environ.get('PACE_HALF_DIR') or Path.home() / 'data' / 'half-1133'))
    parser.add_argument('--links-work', type=Path, default=None, help='where the 5.3 GB links SQLite is decompressed and deleted (default --out)')
    parser.add_argument('--only', choices=['half', 'links', 'correction'], help='fetch one of the three only')
    parser.add_argument('--keep-links-sqlite', action='store_true', help='keep the 5.3 GB runner_links.sqlite after the extract')
    parser.add_argument('--replace', action='store_true', help='replace a file already in --out')
    args = parser.parse_args(argv)
    try:
        pin = load_pin()
        out = args.out.expanduser().resolve()
        if inside(out, ROOT):
            fail(f'{out} is inside the repository; record-level files stay outside it (pages publish aggregates)')
        links_work = args.links_work.expanduser().resolve() if args.links_work else None
        if links_work is not None and inside(links_work, ROOT):
            fail(f'{links_work} is inside the repository')
        out.mkdir(parents=True, exist_ok=True)
        specs = [s for s in all_specs(pin) if args.only in (None, s['key'])]
        provenance = {'written_by': 'analysis/download_half.py', 'date': date.today().isoformat(),
                      'pin_sha256': file_sha256(PIN_PATH), 'repository': pin['repository'], 'access': pin['access']}
        kw = {'keep_links_sqlite': args.keep_links_sqlite, 'replace': args.replace, 'links_work': links_work}
        if args.from_dir:
            folders = {}
            for folder in args.from_dir:
                folder = folder.expanduser().resolve()
                for spec in identify(folder, all_specs(pin)):
                    folders.setdefault(spec['key'], folder)
            for spec in specs:
                if spec['key'] not in folders:
                    fail(f"no --from-dir folder holds the pinned {spec['key']} assets of {spec['tag']}")
                assets = check_folder(folders[spec['key']], spec)
                provenance[spec['key']] = place(spec, assets, out, downloaded=False, **kw)
                print(f"{spec['key']} ({spec['tag']}): verified from {folders[spec['key']]}")
            provenance['source'] = 'from-dir'
        else:
            sums = {}
            for spec in specs:
                if spec['tag'] not in sums:
                    sums[spec['tag']] = fetch_sums(pin['repository'], spec['tag'])
                    print(f"{spec['tag']}: SHA256SUMS fetched anonymously from {DOWNLOAD_HOST}")
                folder = out / spec['tag'] if spec['key'] == 'correction' else out
                assets = fetch_release(spec, pin['repository'], folder, sums[spec['tag']])
                provenance[spec['key']] = place(spec, assets, out, downloaded=spec['key'] != 'correction', **kw)
                print(f"{spec['key']} ({spec['tag']}): downloaded anonymously and verified")
            provenance['source'] = 'public release download (anonymous)'
        (out / 'provenance.json').write_text(json.dumps(provenance, indent=2, sort_keys=True) + '\n')
        print(f'wrote {out / "provenance.json"}')
    except HalfError as error:
        print(f'download_half: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
