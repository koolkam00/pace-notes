"""Fetch and verify the release files the half-marathon builders read (docs/HALF_MARATHON.md).

    python3 -I analysis/download_half.py [--out DIR] [--only core|links] [--replace]
    python3 -I analysis/download_half.py --from-dir DIR [--from-dir DIR] [--out DIR]

The half rows, the edition tiers and the person links are assets of the combined release the site adopts
(analysis/half-release.json, schema 4: `half.tag`), the owner's public CC BY 4.0 release in `repository`. No account,
token or signed URL is needed: every request goes anonymously to
`https://github.com/{repository}/releases/download/{tag}/{asset}`, never to api.github.com, and carries no
Authorization header. Nothing is written under the repository or `public/`: the files go to `--out`, default
`$PACE_HALF_DIR` (itself defaulting to `~/data/half-20261113-1113`). The pages publish aggregates of these files only.

The release's own checksum file (`half.checksums`) is fetched first; its sha256 must equal the pin's (a release is not
immutable on GitHub, so a replaced file fails here), and every asset this script takes must be listed in it with the
pinned digest, so the pin, the release and the downloaded bytes agree. Every downloaded file is checked against its
digest as it streams. `--from-dir DIR` takes a folder already filled from the release (analysis/download_release.py's
folder, `gh release download`, or curl) instead of the network; give it once per folder. Files read from such a folder
are never deleted.

What lands under `--out`:

- `core/`: the CORE members the builders read (`half.core.members`: the rows, the registry, the flags, the release's
  row exclusions and the tier table), taken out of the CORE archive one by one, each checked against its pinned sha256.
  Nothing else in the archive is written, and a member under another folder or name is not a member.
- `release/`: the two person-link parquet files (`links.assets`), by their pinned sha256.
- `provenance.json` (local only, never committed): what was checked, and when.

The identity file is not a download. The pipeline writes it from the same release (analysis/adapt_combined.py, then
analysis/build_identity.py), and the half builders read the one the marathon cohort was built on: pass it with
`--identity`, or put it at `<out>/identity.parquet`. The frozen never-stamp list is carried in the policy file; its
source (`stamps.never_stamp.reference`) is provenance and is not fetched. After this, cut the extract for the Node
recount with `python3 -I analysis/half_extract.py` and build with `python3 -I analysis/build_half.py`.

Download about 1.3 GB (the CORE archive and the two link files); the unpacked members need about 0.5 GB more.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tarfile
from datetime import date
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from half_common import CORE_MEMBERS, ROOT, HalfError, bytes_sha256, fail, file_sha256, inside, load_pin  # noqa: E402

USER_AGENT = 'pace-notes-half-download'
DOWNLOAD_HOST = 'github.com'
LINK_FILES = ('person-ids-v5.1-race_results_linked.parquet', 'person-ids-v5.1-persons.parquet')
MARGIN = 1 << 28


def half_dir() -> Path:
    return Path(os.environ.get('PACE_HALF_DIR') or Path.home() / 'data' / 'half-20261113-1113').expanduser()


def parse_sums(text: str, where: str = 'SHA256SUMS') -> dict[str, str]:
    """A `sha256sum` file: {file name: digest}. A name with a folder, a repeated name or a malformed line fails."""
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


def spec(pin: dict, only: str | None = None) -> dict:
    """What this script takes from the adopted release: the checksum file, the CORE archive and the two link files."""
    half, links = pin['half'], pin['links']
    core = half['core']
    if core['asset'] not in half['assets']:
        fail('the pin does not list the CORE archive among the release assets')
    missing = [name for name in LINK_FILES if name not in links['assets']]
    if missing:
        fail(f'the pin does not list the person-link files {missing}')
    assets = {}
    if only in (None, 'core'):
        assets[core['asset']] = half['assets'][core['asset']]
    if only in (None, 'links'):
        assets.update({name: links['assets'][name] for name in LINK_FILES})
    return {'repository': pin['repository'], 'tag': half['tag'], 'sums': dict(half['checksums']), 'assets': assets,
            'core': {'asset': core['asset'], 'folder': core['folder'], 'members': dict(core['members'])}}


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


def check_sums(data: bytes, what: dict, where: str) -> dict[str, str]:
    """The release's checksum file against the pin: its own sha256, then every asset taken, by the pinned digest."""
    if bytes_sha256(data) != what['sums']['sha256']:
        fail(f"release {what['tag']}: its {what['sums']['asset']} is not the pinned one (the release changed after the pin)")
    sums = parse_sums(data.decode('utf-8'), where)
    for name, digest in what['assets'].items():
        if sums.get(name) != digest:
            fail(f"release {what['tag']}: its {what['sums']['asset']} does not list {name} with the pinned digest")
    return sums


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


def fetch(what: dict, folder: Path) -> dict[str, Path]:
    """The checksum file, then every asset taken, anonymously, into `folder`. A file already there with the pinned
    digest is kept."""
    url = public_url(what['repository'], what['tag'], what['sums']['asset'])
    with _opener().open(public_request(url), timeout=60) as response:
        check_sums(response.read(), what, url)
    folder.mkdir(parents=True, exist_ok=True)
    found = {}
    for name, digest in what['assets'].items():
        path = folder / name
        if not (path.is_file() and file_sha256(path) == digest):
            download(public_url(what['repository'], what['tag'], name), path, digest)
        found[name] = path
    return found


def from_folders(what: dict, folders: list[Path]) -> dict[str, Path]:
    """The same assets from folders already filled from the release: the checksum file must be in one of them and be
    the pinned one, and each asset must have the pinned digest. Nothing is fetched and nothing there is changed."""
    sums = next((f / what['sums']['asset'] for f in folders if (f / what['sums']['asset']).is_file()), None)
    if sums is None:
        fail(f"no {what['sums']['asset']} in {', '.join(map(str, folders))}: the release's checksum file must come with its assets")
    check_sums(sums.read_bytes(), what, str(sums))
    found = {}
    for name, digest in what['assets'].items():
        path = next((f / name for f in folders if (f / name).is_file()), None)
        if path is None:
            fail(f'no {name} in {", ".join(map(str, folders))}')
        if file_sha256(path) != digest:
            fail(f'{path} is not the pinned {name}')
        found[name] = path
    return found


def unpack_core(archive: Path, core: dict, target: Path, *, replace: bool = False) -> dict[str, str]:
    """The pinned members of the CORE archive into `target`, each checked against its pinned sha256 as it is written.
    Only `<folder>/<member>` regular files are read; nothing else in the archive is written anywhere."""
    wanted = {f"{core['folder']}/{name}": name for name in core['members']}
    target.mkdir(parents=True, exist_ok=True)
    done = {}
    for name, digest in core['members'].items():
        path = target / name
        if path.is_file() and not replace and file_sha256(path) == digest:
            done[name] = digest
    if len(done) == len(core['members']):
        return done
    with tarfile.open(archive, 'r:*') as tar:
        for member in tar:
            name = wanted.get(member.name)
            if name is None or name in done:
                continue
            if not member.isfile():
                fail(f'{archive.name}: {member.name} is not a regular file')
            source = tar.extractfile(member)
            digest = hashlib.sha256()
            tmp = target / (name + '.unpack')
            try:
                with tmp.open('wb') as out:
                    while chunk := source.read(1 << 20):
                        out.write(chunk)
                        digest.update(chunk)
                if digest.hexdigest() != core['members'][name]:
                    fail(f'{archive.name}: {member.name} is not the pinned member (sha256 {digest.hexdigest()})')
                os.replace(tmp, target / name)
            finally:
                tmp.unlink(missing_ok=True)
            done[name] = digest.hexdigest()
    missing = sorted(set(core['members']) - set(done))
    if missing:
        fail(f"{archive.name} holds no {core['folder']}/{missing[0]}" + (f' (and {len(missing) - 1} more)' if len(missing) > 1 else ''))
    return done


def place(what: dict, assets: dict[str, Path], out: Path, *, replace: bool = False) -> dict:
    """Unpack the CORE members into `<out>/core` and put the link files into `<out>/release`."""
    record = {}
    core = what['core']
    if core['asset'] in assets:
        if set(core['members']) != set(CORE_MEMBERS):
            fail('the pin does not name the CORE members the builders read')
        record['core'] = unpack_core(assets[core['asset']], core, out / 'core', replace=replace)
    release = out / 'release'
    for name in LINK_FILES:
        if name not in assets:
            continue
        release.mkdir(parents=True, exist_ok=True)
        target = release / name
        if assets[name].resolve() != target.resolve() and not (target.is_file() and not replace and file_sha256(target) == what['assets'][name]):
            shutil.copyfile(assets[name], target)
        if file_sha256(target) != what['assets'][name]:
            fail(f'{target} is not the pinned {name}')
        record.setdefault('release', {})[name] = what['assets'][name]
    return record


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--out', type=Path, default=None, help='where the files go (default $PACE_HALF_DIR, else ~/data/half-20261113-1113)')
    parser.add_argument('--from-dir', type=Path, action='append', default=[], help='a folder already filled from the release; repeatable')
    parser.add_argument('--only', choices=('core', 'links'), default=None)
    parser.add_argument('--replace', action='store_true', help='write a file again even if one with the pinned digest is in place')
    args = parser.parse_args(argv)
    try:
        pin = load_pin()
        out = (args.out or half_dir()).expanduser().resolve()
        if inside(out, ROOT):
            fail(f'{out} is inside the repository; record-level sources stay outside it')
        what = spec(pin, args.only)
        out.mkdir(parents=True, exist_ok=True)
        free = shutil.disk_usage(out).free
        if free < MARGIN:
            fail(f'{out}: {free >> 20} MB free; the download and the unpacked members need about 2 GB')
        if args.from_dir:
            assets = from_folders(what, [f.expanduser().resolve() for f in args.from_dir])
        else:
            assets = fetch(what, out / 'downloads')
        record = place(what, assets, out, replace=args.replace)
        (out / 'provenance.json').write_text(json.dumps({
            'checked': date.today().isoformat(), 'repository': what['repository'], 'tag': what['tag'],
            'checksums': what['sums'], 'assets': what['assets'], **record,
            'identity': 'not a download: analysis/build_identity.py writes identity.parquet from the same release'}, indent=2) + '\n')
    except HalfError as error:
        print(f'download_half: {error}', file=sys.stderr)
        return 1
    print(json.dumps({'out': str(out), 'core': sorted(record.get('core', {})), 'release': sorted(record.get('release', {}))}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
