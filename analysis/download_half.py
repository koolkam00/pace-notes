"""Fetch and verify the half snapshot, its person links and the stamp reference (docs/HALF_MARATHON.md).

    python3 -I analysis/download_half.py [--out DIR] [--work DIR] [--only half|links|stamps] [--keep-v4] [--replace]
    python3 -I analysis/download_half.py --from-dir DIR [--from-dir DIR] [--out DIR] [--work DIR]

All three come from the owner's public CC BY 4.0 releases in the repository analysis/half-release.json names
(`repository`, pin schema 3): the snapshot and its edition_meta CSV from `half.tag`, the v4 person links (two parquet files
and their documents) from `links.tag` (one release, half-dataset-20261030-1904), and the stamp reference, the 2157
`csv-edition_meta.csv.zst` and its README, from `stamps.reference.tag` (half-dataset-20261029-2157). No account, token or
signed URL is needed: every request goes anonymously to `https://github.com/{repository}/releases/download/{tag}/{asset}`,
never to api.github.com, and carries no Authorization header. Nothing is written under the repository or `public/`: the
files go to `--out`, default `$PACE_HALF_DIR` (itself defaulting to `~/data/half-1904`). The pages publish aggregates of
these files only.

Each release's own `SHA256SUMS` is fetched first; its sha256 must equal the pin's `sha256sums_sha256` for that tag (the
releases are not immutable on GitHub, so a replaced file fails here), and every asset the pin lists must be in it with the
pinned digest, so the pin, the release and the downloaded bytes agree. Every downloaded file is checked against its digest
as it streams. `--from-dir DIR` takes a folder already filled from a release (`gh release download <tag> -R <repository>`
or curl, with its `SHA256SUMS`) instead; give it once per folder. Files read from such a folder are never deleted.

Reassembly streams the zstd parts in order into `zstd -d`, then runs `PRAGMA integrity_check` and compares the
decompressed SQLite's sha256 with the pin (`half.sqlite_sha256`); a snapshot already in place is kept when its sha256
matches, and refused when a non-empty `-wal` sits beside it (the builders refuse it too). The v4 parquet files go to
`--work` (default `<out>/v4`) and are cut at once into `links-v4.sqlite` beside the snapshot by
analysis/half_links_extract.py (`--v4-dir --half --out`), whose content digest must equal the pin
(`links.extract_content_sha256`); they are deleted afterwards unless `--keep-v4`. The stamp reference lands at
`<out>/<reference tag>/<asset>`, where analysis/build_half.py and the source recount look for it, and this release's
`csv-edition_meta.csv.zst` beside the snapshot. A file already in place with the pinned digest is kept.
`provenance.json` (local only, never committed) records what was checked.

Download about 1.3 GB (the 0.48 GB snapshot part, 0.81 GB of v4 parquet files and a few small files). Needs the `zstd`
command and about 5.5 GB of free disk at the peak: the 4.5 GB SQLite while the part is still on disk, then the parquet
files, the extract and DuckDB's spill (`--work`).
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

from half_common import PIN_PATH, ROOT, HalfError, bytes_sha256, fail, file_sha256, inside, load_pin  # noqa: E402

PART = re.compile(r'^(?P<stem>.+\.sqlite\.zst)\.part(?P<number>[0-9]{2})$')
# Decompressed and downloaded sizes (bytes) for the free-disk checks.
SIZES = {'half': 4_474_351_616, 'v4': 677_175_967 + 131_547_990}
MARGIN = 1 << 28
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


def _check_assets(key: str, assets: dict) -> None:
    for name, digest in assets.items():
        if not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest) or '/' in name:
            fail(f'the pinned {key} release lists a malformed asset {name!r}')


def sums_digests(pin: dict) -> dict[str, str]:
    """The pinned sha256 of each release's SHA256SUMS, by tag (the snapshot's covers the links when they share a tag)."""
    out = {}
    for tag, digest in ((pin['half']['tag'], pin['half'].get('sha256sums_sha256')),
                        (pin['links']['tag'], pin['links'].get('sha256sums_sha256')),
                        (pin['stamps']['reference']['tag'], pin['stamps']['reference'].get('sha256sums_sha256'))):
        if digest is None:
            continue
        if not re.fullmatch(r'[0-9a-f]{64}', digest) or out.get(tag, digest) != digest:
            fail(f'the pin names two SHA256SUMS digests, or a malformed one, for {tag}')
        out[tag] = digest
    for tag in (pin['half']['tag'], pin['links']['tag'], pin['stamps']['reference']['tag']):
        if tag not in out:
            fail(f'the pin names no SHA256SUMS digest for release {tag}')
    return out


def releases(pin: dict) -> list[dict]:
    """The pinned half and links specs: their tags, pinned assets, parts in order, and what they decompress to."""
    out = []
    half = dict(pin['half']['assets'])
    _check_assets('half', half)
    parts = sorted((n for n in half if PART.match(n)), key=lambda n: int(PART.match(n)['number']))
    if not parts or [int(PART.match(n)['number']) for n in parts] != list(range(len(parts))):
        fail('the pinned half release must list its SQLite parts numbered from 00 without gaps')
    if len({PART.match(n)['stem'] for n in parts}) != 1:
        fail('the pinned half parts belong to more than one file')
    out.append({'key': 'half', 'tag': pin['half']['tag'], 'assets': half, 'parts': parts, 'target': pin['half']['sqlite'],
                'target_sha256': pin['half']['sqlite_sha256']})
    links = dict(pin['links']['assets'])
    _check_assets('links', links)
    if any(PART.match(n) for n in links) or not {'race_results_linked.parquet', 'persons.parquet'} <= set(links):
        fail('the pinned links release must list race_results_linked.parquet and persons.parquet, and no SQLite parts')
    out.append({'key': 'links', 'tag': pin['links']['tag'], 'assets': links, 'parts': [], 'target': pin['links']['extract'],
                'target_sha256': None})
    return out


def stamps_spec(pin: dict) -> dict:
    """The pinned stamp reference as a spec: its CSV and README, no parts."""
    ref = pin['stamps']['reference']
    assets = {ref['asset']: ref['sha256'], 'README.md': ref['readme_sha256']}
    _check_assets('stamp reference', assets)
    return {'key': 'stamps', 'tag': ref['tag'], 'assets': assets, 'parts': [], 'target': ref['asset'], 'target_sha256': ref['sha256']}


def all_specs(pin: dict) -> list[dict]:
    return releases(pin) + [stamps_spec(pin)]


def check_folder(folder: Path, spec: dict, sums_sha256: str | None = None) -> dict[str, Path]:
    """The pinned assets in a download folder, each checked against the folder's SHA256SUMS (itself checked against the
    pin's digest of it, when given) and the pin."""
    sums_path = folder / 'SHA256SUMS'
    if not sums_path.is_file():
        fail(f'{folder} has no SHA256SUMS')
    if sums_sha256 is not None and file_sha256(sums_path) != sums_sha256:
        fail(f"{sums_path} is not the pinned SHA256SUMS of {spec['tag']}")
    listed = read_sums(sums_path)
    for name, digest in spec['assets'].items():
        if listed.get(name) != digest:
            fail(f"{folder}/SHA256SUMS does not list {name} with the digest pinned for {spec['tag']}")
    found = {}
    for name, digest in spec['assets'].items():
        path = folder / name
        if not path.is_file():
            fail(f'{path} is missing')
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
    """The -wal and -shm files a read of a WAL-mode SQLite leaves beside it (the snapshot is one)."""
    for suffix in ('-wal', '-shm'):
        path.with_name(path.name + suffix).unlink(missing_ok=True)


def check_sidecars(path: Path) -> None:
    """A snapshot in place may carry the empty -wal and the -shm of an earlier read (removed here); a non-empty -wal holds
    pages the pinned file does not, so it is refused."""
    # Beside the path and beside the file a symlink resolves to, where SQLite reads it (verify round 2, October 31, 2026).
    for wal in dict.fromkeys([path.with_name(path.name + '-wal'), Path(f'{path.resolve()}-wal')]):
        if wal.exists() and wal.stat().st_size > 0:
            fail(f'{wal} is not empty: the snapshot beside it is not the pinned one; move both away or pass --replace')
    remove_sidecars(path)


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
        remove_sidecars(target)
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


def fetch_sums(repo: str, tag: str, expected_sha256: str | None = None) -> dict[str, str]:
    """A release's own SHA256SUMS, fetched anonymously and checked against the pin's digest of it."""
    url = public_url(repo, tag, 'SHA256SUMS')
    with _opener().open(public_request(url), timeout=60) as response:
        data = response.read()
    if expected_sha256 is not None and bytes_sha256(data) != expected_sha256:
        fail(f'release {tag}: its SHA256SUMS is not the pinned one (the release changed after the pin)')
    return parse_sums(data.decode('utf-8'), url)


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

def cut_extract(v4_dir: Path, half: Path, out: Path) -> None:
    """Cut links-v4.sqlite from the v4 parquet files and the snapshot (analysis/half_links_extract.py); its content digest
    must equal the pin."""
    import half_links_extract
    try:
        code = half_links_extract.main(['--v4-dir', str(v4_dir), '--half', str(half), '--out', str(out)])
    except SystemExit as error:   # argparse or a refusal inside the extract
        code = error.code if isinstance(error.code, int) else 1
    if code:
        fail(f'the links extract could not be cut, or differs from the pin (exit {code})')


def place(spec: dict, assets: dict[str, Path], out: Path, *, downloaded: bool, replace: bool, keep_v4: bool = False,
          work: Path | None = None) -> dict:
    """Put one spec's files in place in `out`: decompress the snapshot (or keep a verified copy already there), cut the
    links extract, or put the stamp reference in its folder. Returns its provenance."""
    record = {'tag': spec['tag'], 'assets': {name: spec['assets'][name] for name in sorted(spec['assets'])}}
    if spec['key'] == 'stamps':
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
    if spec['key'] == 'half':
        for name, path in assets.items():   # the release's own small files (edition_meta CSV, README) beside the snapshot
            if name in spec['parts']:
                continue
            target = out / name
            if path.resolve() != target.resolve():
                shutil.copyfile(path, target)
            if file_sha256(target) != spec['assets'][name]:
                fail(f'{target} is not the pinned {name}')
        parts = [assets[name] for name in spec['parts']]
        target = out / spec['target']
        if target.exists() and not replace:
            check_sidecars(target)
            digest = file_sha256(target)
            if digest != spec['target_sha256']:
                fail(f'{target} exists and is not the pinned snapshot; move it away or pass --replace')
            record['sqlite'] = {'file': target.name, 'sha256': digest, 'kept': True}
        else:
            need = SIZES['half'] + MARGIN
            if shutil.disk_usage(out).free < need:
                fail(f'{out} has under {need / 1e9:.1f} GB free')
            digest = reassemble(parts, target, spec['target_sha256'])
            record['sqlite'] = {'file': target.name, 'sha256': digest, 'integrity_check': 'ok'}
        if downloaded:
            for part in parts:
                part.unlink(missing_ok=True)
            record['parts'] = 'downloaded, verified and deleted'
        else:
            record['parts'] = 'read in place'
        return record
    # links: the v4 parquet files (in `work`, or read in place) cut into the extract beside the snapshot
    v4_dir = {p.parent for p in assets.values()}
    if len(v4_dir) != 1:
        fail('the v4 files must sit in one folder')
    v4_dir = v4_dir.pop()
    half = out / load_pin()['half']['sqlite']
    if not half.is_file():
        fail(f'{half} is missing: the links extract reads the snapshot (fetch the half first)')
    cut_extract(v4_dir, half, out / spec['target'])
    record['extract'] = {'file': spec['target'], 'extract_content_sha256': load_pin()['links']['extract_content_sha256']}
    if downloaded and not keep_v4:
        for name in ('race_results_linked.parquet', 'persons.parquet'):
            assets[name].unlink(missing_ok=True)
        record['parquet'] = 'downloaded, verified, cut and deleted'
    else:
        record['parquet'] = 'kept' if downloaded else 'read in place'
    return record


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--from-dir', type=Path, action='append', help='a folder filled from a pinned release, with its SHA256SUMS (once per folder)')
    parser.add_argument('--out', type=Path, default=Path(os.environ.get('PACE_HALF_DIR') or Path.home() / 'data' / 'half-1904'))
    parser.add_argument('--work', type=Path, default=None, help='where the v4 parquet files are downloaded and cut (default <out>/v4)')
    parser.add_argument('--only', choices=['half', 'links', 'stamps'], help='fetch one of the three only')
    parser.add_argument('--keep-v4', action='store_true', help='keep the downloaded v4 parquet files after the extract')
    parser.add_argument('--replace', action='store_true', help='replace a snapshot already in --out')
    args = parser.parse_args(argv)
    try:
        pin = load_pin()
        out = args.out.expanduser().resolve()
        if inside(out, ROOT):
            fail(f'{out} is inside the repository; record-level files stay outside it (pages publish aggregates)')
        work = (args.work.expanduser().resolve() if args.work else out / 'v4')
        if inside(work, ROOT):
            fail(f'{work} is inside the repository')
        out.mkdir(parents=True, exist_ok=True)
        specs = [s for s in all_specs(pin) if args.only in (None, s['key'])]
        sums_pinned = sums_digests(pin)
        provenance = {'written_by': 'analysis/download_half.py', 'date': date.today().isoformat(),
                      'pin_sha256': file_sha256(PIN_PATH), 'repository': pin['repository'], 'access': pin['access']}
        if args.from_dir:
            folders = {}
            for folder in args.from_dir:
                folder = folder.expanduser().resolve()
                for spec in identify(folder, all_specs(pin)):
                    folders.setdefault(spec['key'], folder)
            for spec in specs:
                if spec['key'] not in folders:
                    fail(f"no --from-dir folder holds the pinned {spec['key']} assets of {spec['tag']}")
                assets = check_folder(folders[spec['key']], spec, sums_pinned[spec['tag']])
                provenance[spec['key']] = place(spec, assets, out, downloaded=False, replace=args.replace)
                print(f"{spec['key']} ({spec['tag']}): verified from {folders[spec['key']]}")
            provenance['source'] = 'from-dir'
        else:
            sums = {}
            for spec in specs:
                if spec['tag'] not in sums:
                    sums[spec['tag']] = fetch_sums(pin['repository'], spec['tag'], sums_pinned[spec['tag']])
                    print(f"{spec['tag']}: SHA256SUMS fetched anonymously from {DOWNLOAD_HOST} and matched to the pin")
                if spec['key'] == 'links':
                    work.mkdir(parents=True, exist_ok=True)
                    missing = any(not (work / n).is_file() for n in ('race_results_linked.parquet', 'persons.parquet'))
                    if missing and shutil.disk_usage(work).free < SIZES['v4'] + MARGIN:
                        fail(f'{work} has too little free disk for the {SIZES["v4"] / 1e9:.1f} GB of v4 parquet files (use --work)')
                folder = {'stamps': out / spec['tag'], 'links': work}.get(spec['key'], out)
                assets = fetch_release(spec, pin['repository'], folder, sums[spec['tag']])
                provenance[spec['key']] = place(spec, assets, out, downloaded=True, replace=args.replace, keep_v4=args.keep_v4, work=work)
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
