"""Fetch and verify the private half snapshot and its link build (docs/HALF_MARATHON.md; spec 1.2).

    python3 -I analysis/download_half.py --from-dir DIR [--from-dir DIR] [--out DIR]
    python3 -I analysis/download_half.py --token-env HALF_SOURCE_TOKEN [--out DIR]

Both sources live in a private repository (analysis/half-release.json `repository`), so this is not the public
downloader: analysis/download_release.py stays anonymous and public-only. Nothing here writes under the repository or
`public/`: the files go to `--out`, default `$PACE_HALF_DIR` (itself defaulting to `~/data/half-1133`).

`--from-dir DIR` takes a folder the owner filled with `gh release download <tag> -R <repository>`, once per release
(give `--from-dir` once per folder). The folder's own `SHA256SUMS` names its release: every asset the pin lists must be
in it with the pinned digest, and every listed file that is present must match its line. Parts are read in place and
never deleted (they are the owner's files).

`--token-env NAME` reads a fine-grained, read-only token from the environment variable NAME (owner question Q2; no such
secret is stored by default). It asks `https://api.github.com/repos/{repository}/releases/tags/{tag}` for each release
and fetches every pinned asset from its API URL with `Accept: application/octet-stream`. The `Authorization` header
goes to api.github.com only: it is an unredirected header, so the redirect to the asset host carries no credential
(the rule of analysis/download_release.py). The token is never printed, logged or written. Downloaded parts are
deleted once their decompressed file is verified.

Reassembly streams the parts in order into `zstd -d`, then runs `PRAGMA integrity_check` and compares the
decompressed SQLite's sha256 with the pin (`half.sqlite_sha256`). The links release has no pinned SQLite digest; its
SQLite is cut at once into `links-slim.sqlite` by analysis/half_links_extract.py, whose content digest must equal the
pin (`links.extract_content_sha256`), and the 5.3 GB SQLite is then deleted unless `--keep-links-sqlite`. A file
already in place with the pinned digest is kept as it is. `provenance.json` (local only, never committed) records what
was checked. Needs the `zstd` command and about 9 GB of free disk for both sources (3.7 GB half, 5.3 GB links).
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
from urllib.parse import urlsplit
from urllib.request import Request

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from half_common import PIN_PATH, ROOT, HalfError, fail, file_sha256, inside, load_pin  # noqa: E402

PART = re.compile(r'^(?P<stem>.+\.sqlite\.zst)\.part(?P<number>[0-9]{2})$')
LINKS_SQLITE = 'runner_links.sqlite'
# Rough decompressed sizes (bytes) for the free-disk check.
SIZES = {'half': 3_744_944_128, 'links': 5_270_000_000}
USER_AGENT = 'pace-notes-half-download'


def read_sums(path: Path) -> dict[str, str]:
    """A `sha256sum` file: {file name: digest}."""
    listed = {}
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        parts = line.split(maxsplit=1)
        if len(parts) != 2:
            fail(f'{path}: malformed line')
        digest, name = parts[0], parts[1].strip().lstrip('*')
        if not re.fullmatch(r'[0-9a-f]{64}', digest) or '/' in name or name in listed:
            fail(f'{path}: malformed or repeated line for {name!r}')
        listed[name] = digest
    return listed


def releases(pin: dict) -> list[dict]:
    """The two pinned releases: their tags, pinned assets, parts in order, and what they decompress to."""
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
                fail(f'the pin lists a malformed {key} asset {name!r}')
        out.append({'key': key, 'tag': pin[key]['tag'], 'assets': assets, 'parts': parts, 'target': target, 'target_sha256': sha})
    return out


def check_folder(folder: Path, spec: dict) -> dict[str, Path]:
    """The pinned assets in an owner's download folder, each checked against the folder's SHA256SUMS and the pin."""
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
        got = file_sha256(path)
        if got != digest:
            fail(f'{path} does not match SHA256SUMS')
        if name in spec['assets']:
            found[name] = path
    return found


def identify(folder: Path, specs: list[dict]) -> dict:
    """The pinned release a folder holds, from the asset names its SHA256SUMS lists."""
    sums = folder / 'SHA256SUMS'
    if not sums.is_file():
        fail(f'{folder} has no SHA256SUMS')
    listed = set(read_sums(sums))
    hits = [s for s in specs if set(s['parts']) <= listed]
    if len(hits) != 1:
        fail(f'{folder} does not hold exactly one pinned release (its SHA256SUMS lists {sorted(listed)[:6]})')
    return hits[0]


def integrity_ok(path: Path) -> bool:
    con = sqlite3.connect(f'file:{path.as_posix()}?mode=ro', uri=True)
    try:
        return con.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
    finally:
        con.close()


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
        os.replace(tmp, target)
        return digest
    finally:
        tmp.unlink(missing_ok=True)


# ---------------------------------------------------------------------------------------------------------------
# The API (owner question Q2): a token only on api.github.com, never on the asset host.
# ---------------------------------------------------------------------------------------------------------------

def _opener():
    from download_release import _OPENER
    return _OPENER


def api_request(url: str, token: str, accept: str) -> Request:
    request = Request(url, headers={'Accept': accept, 'User-Agent': USER_AGENT})
    # Unredirected: urllib does not copy it onto a redirect, and download_release.GitHubApiRedirect re-adds it only
    # while the redirect stays on https://api.github.com.
    request.add_unredirected_header('Authorization', f'Bearer {token}')
    return request


def api_release(repo: str, tag: str, token: str) -> dict:
    url = f'https://api.github.com/repos/{repo}/releases/tags/{tag}'
    with _opener().open(api_request(url, token, 'application/vnd.github+json'), timeout=60) as response:
        return json.load(response)


def download_api_asset(asset: dict, token: str, destination: Path, expected_sha256: str) -> None:
    url = asset['url']
    if urlsplit(url).scheme != 'https' or urlsplit(url).hostname != 'api.github.com':
        fail(f"{asset['name']}: expected an api.github.com asset URL")
    digest, size = hashlib.sha256(), 0
    tmp = destination.with_name(destination.name + '.download')
    try:
        with _opener().open(api_request(url, token, 'application/octet-stream'), timeout=120) as response, tmp.open('wb') as out:
            while chunk := response.read(1 << 20):
                out.write(chunk)
                digest.update(chunk)
                size += len(chunk)
        published = asset.get('digest') or ''
        if size != asset.get('size') or digest.hexdigest() != expected_sha256 or (published.startswith('sha256:') and published[7:] != expected_sha256):
            fail(f"{asset['name']}: size or checksum differs from the pin")
        os.replace(tmp, destination)
    finally:
        tmp.unlink(missing_ok=True)


def fetch_release(spec: dict, repo: str, token: str, folder: Path) -> dict[str, Path]:
    release = api_release(repo, spec['tag'], token)
    by_name = {a['name']: a for a in release.get('assets', [])}
    found = {}
    for name, digest in spec['assets'].items():
        if name not in by_name:
            fail(f"release {spec['tag']} has no asset {name}")
        path = folder / name
        download_api_asset(by_name[name], token, path, digest)
        found[name] = path
    return found


# ---------------------------------------------------------------------------------------------------------------

def place(spec: dict, assets: dict[str, Path], out: Path, *, downloaded: bool, keep_links_sqlite: bool, replace: bool) -> dict:
    """Decompress one release's SQLite into `out` (or keep a verified copy already there) and, for the links, cut the
    extract. Returns its provenance."""
    record = {'tag': spec['tag'], 'assets': {name: spec['assets'][name] for name in sorted(spec['assets'])}}
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
        target = out / spec['target']
        if shutil.disk_usage(out).free < SIZES['links'] + (1 << 28) and not target.exists():
            fail(f'{out} has too little free disk for the {SIZES["links"] / 1e9:.1f} GB links SQLite')
        if not target.exists() or replace:
            reassemble(parts, target, None)
        import half_links_extract
        code = half_links_extract.main(['--links-sqlite', str(target), '--out', str(out / 'links-slim.sqlite')])
        if code:
            fail('the links extract differs from the pin')
        record['extract'] = {'file': 'links-slim.sqlite', 'extract_content_sha256': load_pin()['links']['extract_content_sha256']}
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
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--from-dir', type=Path, action='append', help='an owner `gh release download` folder (once per release)')
    source.add_argument('--token-env', metavar='NAME', help='the environment variable that holds a read-only token')
    parser.add_argument('--out', type=Path, default=Path(os.environ.get('PACE_HALF_DIR') or Path.home() / 'data' / 'half-1133'))
    parser.add_argument('--only', choices=['half', 'links'], help='fetch one release only')
    parser.add_argument('--keep-links-sqlite', action='store_true', help='keep the 5.3 GB runner_links.sqlite after the extract')
    parser.add_argument('--replace', action='store_true', help='replace a file already in --out')
    args = parser.parse_args(argv)
    try:
        pin = load_pin()
        out = args.out.expanduser().resolve()
        if inside(out, ROOT):
            fail(f'{out} is inside the repository; the half sources are private and stay outside it')
        out.mkdir(parents=True, exist_ok=True)
        specs = [s for s in releases(pin) if args.only in (None, s['key'])]
        provenance = {'written_by': 'analysis/download_half.py', 'date': date.today().isoformat(),
                      'pin_sha256': file_sha256(PIN_PATH), 'repository': pin['repository']}
        if args.from_dir:
            folders = {}
            for folder in args.from_dir:
                folder = folder.expanduser().resolve()
                spec = identify(folder, releases(pin))
                if spec['key'] in folders:
                    fail(f"two folders hold {spec['tag']}")
                folders[spec['key']] = folder
            for spec in specs:
                if spec['key'] not in folders:
                    fail(f"no --from-dir folder holds {spec['tag']}")
                assets = check_folder(folders[spec['key']], spec)
                provenance[spec['key']] = place(spec, assets, out, downloaded=False, keep_links_sqlite=args.keep_links_sqlite, replace=args.replace)
                print(f"{spec['tag']}: verified from {folders[spec['key']]}")
            provenance['source'] = 'from-dir'
        else:
            token = os.environ.get(args.token_env or '')
            if not token:
                fail(f'the environment variable {args.token_env} is empty')
            for spec in specs:
                assets = fetch_release(spec, pin['repository'], token, out)
                provenance[spec['key']] = place(spec, assets, out, downloaded=True, keep_links_sqlite=args.keep_links_sqlite, replace=args.replace)
                print(f"{spec['tag']}: downloaded and verified")
            provenance['source'] = 'api'
        (out / 'provenance.json').write_text(json.dumps(provenance, indent=2, sort_keys=True) + '\n')
        print(f'wrote {out / "provenance.json"}')
    except HalfError as error:
        print(f'download_half: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
