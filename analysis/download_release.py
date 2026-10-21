"""Download and verify a public CORE or FULL GitHub release export.

No GitHub CLI or token is required. GH_TOKEN or GITHUB_TOKEN optionally raises
the API rate limit; asset downloads always use their public browser URL.
"""
import argparse
import hashlib
import json
import os
import shutil
import tarfile
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

EXPECTED = {
    "race_records.parquet", "race_conditions.parquet", "course_profiles.parquet",
    "course_segments.parquet", "sources.parquet", "races_summary.json",
    "MANIFEST.json", "README.md",
}

# htw-db-* releases also carry the producer's per-edition counts, change report, checksums and contracts.
HTW_DB_DOCS = {"EDITIONS.json", "CHANGE-REPORT.md", "SHA256SUMS.txt", "ID-CONTRACT.md"}
# FULL also carries the producer's notes on which feature fields are known before a race.
HTW_DB_FULL_DOCS = {"FEATURE-FIELD-NOTES.md"}
# pace-notes-* archives (first in private-export-20261021-0829): the producer's documents (the feature notes now in CORE
# too), per-edition row checksums, sparse per-record flags and per-edition metadata, in CORE and FULL alike.
PACE_NOTES_DOCS = {
    "EDITIONS.json", "EDITION-CHECKSUMS.csv", "CHANGE-REPORT.md", "SHA256SUMS.txt", "ID-CONTRACT.md",
    "FEATURE-FIELD-NOTES.md", "edition_meta.parquet", "record_flags.parquet",
}


def expected_members(tag, asset_name, bundle):
    """The exact files an archive must hold: its layout follows the asset's name, then the tag."""
    base = EXPECTED | ({"features.parquet"} if bundle == "FULL" else set())
    if asset_name.startswith("pace-notes-"):
        return base | PACE_NOTES_DOCS
    if tag.startswith("htw-db-"):
        return base | HTW_DB_DOCS | (HTW_DB_FULL_DOCS if bundle == "FULL" else set())
    return base


def release_checksums(release, root):
    """The release's own SHA256SUMS asset (name to digest), when it publishes one; downloaded and verified like any asset."""
    sums = [a for a in release["assets"] if a["name"].startswith("RELEASE-SHA256SUMS") and a["name"].endswith(".txt")]
    if not sums:
        return None, None
    if len(sums) != 1:
        raise ValueError("Expected at most one release checksum file.")
    path = root / sums[0]["name"]
    download_asset(sums[0], path)
    listed = {}
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        digest, name = line.split(maxsplit=1)
        name = name.lstrip("*")
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest) or name in listed:
            raise ValueError("Malformed release checksum file.")
        listed[name] = digest
    return sums[0]["name"], listed


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


class GitHubApiRedirect(HTTPRedirectHandler):
    """Follow redirects, keeping the API token only while they stay on api.github.com.

    A renamed repository answers its old API URL with a redirect to the new one. Without the
    token that second request is anonymous and shares the runners' small hourly limit. Asset
    downloads, and any redirect to another host, still never carry credentials.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        token = req.unredirected_hdrs.get("Authorization")
        target = urlsplit(newurl)
        if new is not None and token and target.scheme == "https" and target.hostname == "api.github.com":
            new.add_unredirected_header("Authorization", token)
        return new


_OPENER = build_opener(GitHubApiRedirect)


def urlopen(request, timeout):
    return _OPENER.open(request, timeout=timeout)


def read_release(repo, tag):
    request = Request(
        f"https://api.github.com/repos/{repo}/releases/tags/{tag}",
        headers={"Accept": "application/vnd.github+json", "User-Agent": "marathon-pacing-study"},
    )
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        # Credentials belong only on GitHub API requests, never on asset or off-host redirects.
        request.add_unredirected_header("Authorization", f"Bearer {token}")
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def download_asset(asset, destination):
    url = asset["browser_download_url"]
    if urlsplit(url).scheme != "https" or urlsplit(url).hostname != "github.com":
        raise ValueError("Expected a public GitHub release download URL.")
    request = Request(url, headers={"User-Agent": "marathon-pacing-study"})
    with urlopen(request, timeout=60) as response, destination.open("wb") as stream:
        shutil.copyfileobj(response, stream)
    digest = asset.get("digest", "")
    if not digest.startswith("sha256:"):
        raise ValueError("The release asset must have a GitHub SHA-256 digest.")
    if destination.stat().st_size != asset["size"] or sha256(destination) != digest[7:]:
        destination.unlink()
        raise ValueError("Release asset checksum or size mismatch.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tag")
    parser.add_argument("--bundle", choices=["CORE", "FULL"], default="CORE")
    args = parser.parse_args(argv)
    config = json.loads(Path(__file__).with_name("release.json").read_text())
    repo, tag = config["repository"], args.tag or config["tag"]
    if not tag.startswith(("private-export-", "htw-db-")) or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_." for c in tag):
        raise ValueError("Expected a private-export- or htw-db- release tag.")
    root = args.output.resolve()
    root.mkdir(parents=True, exist_ok=True)
    release = read_release(repo, tag)
    assets = [a for a in release["assets"] if f"-{args.bundle}-" in a["name"] and a["name"].endswith(".tar.gz")]
    if len(assets) != 1:
        raise ValueError(f"Expected exactly one {args.bundle} archive in the release.")
    asset = assets[0]
    expected = expected_members(tag, asset["name"], args.bundle)
    sums_name, listed = release_checksums(release, root)
    if listed is not None and listed.get(asset["name"]) != asset["digest"][7:]:
        raise ValueError(f"{asset['name']} is missing from, or differs from, the release checksum file.")
    archive = root / f"{args.bundle.lower()}.tar.gz"
    download_asset(asset, archive)
    seen = set()
    with tarfile.open(archive, "r:gz") as tar:
        total = 0
        for member in tar:
            name = Path(member.name).name
            if member.isdir():
                continue
            if not member.isfile() or Path(member.name).is_absolute() or ".." in Path(member.name).parts:
                raise ValueError("Archive contains an unsafe member.")
            if name not in expected or name in seen:
                raise ValueError(f"Unexpected or duplicate export file: {name}")
            total += member.size
            if total > 8 * 1024 ** 3:
                raise ValueError("Archive exceeds the extraction size limit.")
            with tar.extractfile(member) as source, (root / name).open("wb") as target:
                shutil.copyfileobj(source, target)
            seen.add(name)
    if seen != expected:
        raise ValueError(f"Missing {args.bundle} files: {sorted(expected - seen)}")
    brief = next((a for a in release["assets"] if a["name"] == "OUTSIDE-AGENT-PASTE-BRIEF.md"), None)
    if brief:
        download_asset(brief, root / brief["name"])
    provenance = {
        "repository": repo, "release_tag": tag, "release_published_at": release["published_at"],
        "asset": asset["name"], "asset_sha256": asset["digest"][7:],
        "bundle": args.bundle,
        "manifest_sha256": sha256(root / "MANIFEST.json"),
    }
    if sums_name:
        provenance["release_checksums"] = {"asset": sums_name, "sha256": sha256(root / sums_name)}
    (root / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(f"Verified {args.bundle} export {tag}; extracted {len(seen)} files to {root}.")


if __name__ == "__main__":
    main()
