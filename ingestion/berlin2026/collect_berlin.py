#!/usr/bin/env python3
"""Collect public Berlin 2026 results; never work around a source access block.

HTML selectors/labels follow the September 27 browser reconnaissance. Live HTTP
access is currently blocked, so parser tests are synthetic and not a completed
scrape certification. Cached successful responses make interrupted runs resumable.
"""
import argparse
import datetime as dt
import gzip
import hashlib
import html as html_module
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from bs4 import BeautifulSoup

BASE = "https://berlin.r.mikatiming.com/2026/"
EVENT = "BML_HCH3C0OH37C"
# The observed all-gender field had >50,000 entries; refuse an accidentally
# filtered or truncated page set even when its links look self-consistent.
MIN_EXPECTED_LISTED = 50000
SPLITS = {f"{km} km": f"split_{km}km" for km in (5, 10, 15, 20, 25, 30, 35, 40)}
SPLITS.update({"Finish": "split_42_2km", "Halb": "halfway", "Half": "halfway"})


class SourceError(RuntimeError):
    pass


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def clean(value):
    return re.sub(r"\s+", " ", value).strip()


def nullable(value):
    value = clean(value)
    return None if value in ("", "-", "–", "—") else value


def atomic_json(path, value):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    tmp.replace(path)


def checked_url(url, detail=False):
    parsed = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qs(parsed.query)
    if parsed.scheme != "https" or parsed.netloc != "berlin.r.mikatiming.com" or parsed.path != "/2026/":
        raise SourceError("Unexpected source URL")
    if query.get("event") != [EVENT]:
        raise SourceError("Unexpected running event")
    if query.get("lang") not in (None, ["EN_CAP"]):
        raise SourceError("Unsupported source language")
    if detail and not re.fullmatch(r"[A-Za-z0-9_-]+", query.get("idp", [""])[0]):
        raise SourceError("Missing source result ID")
    return query


def listing_url(page, sex="%"):
    if sex not in ("%", "M", "W", "X"):
        raise SourceError("Unexpected listing gender filter")
    return BASE + "?" + urllib.parse.urlencode({
        "page": page, "event": EVENT, "num_results": 100,
        "pid": "search" if sex == "%" else "list", "lang": "EN_CAP",
        "search[sex]": sex, "search[age_class]": "%", "search[nation]": "%",
        "search_sort": "place_nosex",
    })


def pagination_href(link):
    """Decode the public numeric pagination attribute observed in the UI.

    Mika's normal links use href="#" plus comma-separated character codes in
    data-silver. This is text decoding only, never execution of page code.
    """
    href = link.get("href", "")
    if href == "#" and link.has_attr("data-silver"):
        value = link["data-silver"]
        if len(value) > 20000 or not re.fullmatch(r"\d+(?:,\d+)*", value):
            raise SourceError("Unrecognized public pagination encoding")
        codes = [int(code) for code in value.split(",")]
        if any(code < 32 or code > 126 for code in codes):
            raise SourceError("Unexpected characters in public pagination URL")
        href = html_module.unescape("".join(chr(code) for code in codes))
    return href


def parse_listing(html, page):
    soup = BeautifulSoup(html, "html.parser")
    if not soup.select("li.list-group-item.row h4.type-fullname a"):
        raise SourceError("No result rows; access/challenge or changed source markup")
    records = []
    for item in soup.select("li.list-group-item.row"):
        link = item.select_one("h4.type-fullname a[href]")
        if link is None:
            continue
        url = urllib.parse.urljoin(BASE, link["href"])
        query = checked_url(url, detail=True)
        # Request the observed English labels, preserving the source identity.
        query["lang"] = ["EN_CAP"]
        url = BASE + "?" + urllib.parse.urlencode(query, doseq=True)
        source_list_fields = {"name": clean(link.get_text(" "))}
        for field in item.select(".type-field"):
            label = field.select_one(".list-label")
            if label is not None:
                label_text = clean(label.get_text(" "))
                value = clean(field.get_text(" "))
                if value.startswith(label_text):
                    source_list_fields[label_text.lower()] = nullable(value[len(label_text):])
        records.append({"source_result_id": query["idp"][0], "runner": source_list_fields["name"],
                        "source_url": url, "source_list_fields": source_list_fields})
    ids = [r["source_result_id"] for r in records]
    if len(set(ids)) != len(ids) or not all(r["runner"] for r in records):
        raise SourceError("Duplicate source IDs or empty names on a list page")
    pages = {page}
    for link in soup.select("a[href]"):
        # Favorite links also use data-silver; only numeric page controls matter.
        if not clean(link.get_text(" ")).isdigit():
            continue
        href = pagination_href(link)
        if href == "#":
            if int(clean(link.get_text(" "))) != page:
                raise SourceError("Pagination destination unavailable")
            continue
        url = urllib.parse.urljoin(BASE, href)
        parsed = urllib.parse.urlsplit(url)
        query = urllib.parse.parse_qs(parsed.query)
        if parsed.netloc == "berlin.r.mikatiming.com" and parsed.path == "/2026/" and query.get("event") == [EVENT]:
            value = query.get("page", [""])[0]
            if value.isdigit():
                pages.add(int(value))
    return records, max(pages)


def check_response_identity(requested_url, response_url):
    requested = checked_url(requested_url)
    returned = checked_url(response_url)
    if requested.get("idp") != returned.get("idp"):
        raise SourceError("Source response redirected to a different result identity")
    if "idp" not in requested:
        for key in ("page", "num_results", "search[sex]"):
            if requested.get(key) != returned.get(key):
                raise SourceError("Source response changed the requested listing filters")


def recorded_sex(value):
    if value is None:
        return None
    normalized = {"men": "M", "male": "M", "m": "M", "women": "F", "female": "F",
                  "w": "F", "f": "F", "divers": "X", "x": "X"}
    if value.lower() not in normalized:
        raise SourceError("Unrecognized recorded gender; review source mapping")
    return normalized[value.lower()]


def table_fields(soup, selector):
    fields = {}
    for row in soup.select(selector + " tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if len(cells) == 2:
            key = clean(cells[0].get_text(" ")).lower().rstrip(":")
            fields[key] = nullable(cells[1].get_text(" "))
    return fields


def parse_detail(html, listed, observed_at):
    query = checked_url(listed["source_url"], detail=True)
    if query["idp"][0] != listed["source_result_id"]:
        raise SourceError("List identity and detail URL disagree")
    soup = BeautifulSoup(html, "html.parser")
    for selector in ("#detail-box-general table", "#detail-box-state table", "#detail-box-splits table"):
        if soup.select_one(selector) is None:
            raise SourceError("Required detail table absent; refusing partial or challenge HTML")
    general = table_fields(soup, "#detail-box-general table")
    totals = table_fields(soup, "#detail-box-totals table")
    state = table_fields(soup, "#detail-box-state table")
    if not general.get("name") or clean(general["name"]) != clean(listed["runner"]):
        raise SourceError("Detail name disagrees with listed result identity")
    bib = general.get("bib number", general.get("bib", general.get("start number")))
    if listed.get("source_list_fields", {}).get("bib number") not in (None, bib):
        raise SourceError("Detail bib disagrees with listed result identity")
    nation_suffix = re.search(r"\(([A-Z]{3})\)$", general["name"])
    nationality = general.get("nation", general.get("nationality"))
    if nation_suffix:
        if nationality not in (None, nation_suffix[1]):
            raise SourceError("Detail nationality fields disagree")
        nationality = nation_suffix[1]
    detail_sex = recorded_sex(general.get("gender", general.get("sex")))
    list_sex = recorded_sex(listed.get("source_list_fields", {}).get("gender"))
    if detail_sex is not None and list_sex is not None and detail_sex != list_sex:
        raise SourceError("Detail gender disagrees with the source category listing")
    row = dict(listed, event_id=EVENT, city="Berlin", race="Berlin Marathon", year=2026,
               observed_at=observed_at, provisional=True, age=None)
    row.update({key: None for key in set(SPLITS.values())})
    row.update(bib=bib,
               age_group=general.get("age group", general.get("age class")),
               nationality=nationality,
               sex=list_sex if list_sex is not None else detail_sex,
               status=state.get("race state", state.get("state", state.get("status"))),
               finish_gun=totals.get("time (gun)", totals.get("finish time (gun)")))
    split_table = soup.select_one("#detail-box-splits table")
    header_row = split_table.find("tr")
    headers = [clean(c.get_text(" ")) for c in header_row.find_all(["th", "td"])]
    if headers.count("Time") != 1 or "Split" not in headers:
        raise SourceError("Cumulative Time column not identified unambiguously")
    elapsed_index, split_index = headers.index("Time"), headers.index("Split")
    seen = set()
    for split in split_table.find_all("tr")[1:]:
        cells = split.find_all(["th", "td"], recursive=False)
        if len(cells) <= max(elapsed_index, split_index):
            continue
        label = clean(cells[split_index].get_text(" "))
        key = SPLITS.get(label)
        if key is None:
            continue
        if key in seen:
            raise SourceError("Duplicate checkpoint in detail page")
        seen.add(key)
        row[key] = nullable(cells[elapsed_index].get_text(" "))
    if not seen:
        raise SourceError("No recognized checkpoints")
    # Preserve source fields even when optional normalization has no known label.
    row["source_fields"] = {"general": general, "totals": totals, "state": state,
                            "list": listed.get("source_list_fields", {})}
    if row["status"] is None:
        raise SourceError("Result status unavailable; review source mapping")
    return row


class Fetcher:
    def __init__(self, cache, delay=1.0):
        self.cache, self.delay, self.last = cache, max(1.0, delay), 0.0
        cache.mkdir(parents=True, exist_ok=True)

    def cached(self, url):
        return (self.cache / (hashlib.sha256(url.encode()).hexdigest() + ".json.gz")).exists()

    def get(self, url, fresh=False):
        checked_url(url)
        path = self.cache / (hashlib.sha256(url.encode()).hexdigest() + ".json.gz")
        if path.exists() and not fresh:
            with gzip.open(path, "rt") as stream:
                saved = json.load(stream)
            if saved["url"] != url:
                raise SourceError("Cache URL mismatch")
            if "response_url" not in saved:
                raise SourceError("Legacy cache lacks response identity; use a new collection directory")
            check_response_identity(url, saved["response_url"])
            if hashlib.sha256(saved["html"].encode("utf-8")).hexdigest() != saved["sha256"]:
                raise SourceError("Cache content checksum mismatch")
            return saved["html"], saved["observed_at"]
        time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
        self.last = time.monotonic()
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                if response.status != 200:
                    raise SourceError(f"Unexpected source HTTP {response.status}")
                check_response_identity(url, response.url)
                body = response.read(5_000_001)
                if len(body) > 5_000_000:
                    raise SourceError("Unexpectedly large result page")
                html = body.decode("utf-8")
        except urllib.error.HTTPError as error:
            raise SourceError(f"Source HTTP {error.code}; stopped without retries or bypass") from error
        saved = {"url": url, "response_url": response.url, "observed_at": now(),
                 "sha256": hashlib.sha256(body).hexdigest(), "html": html}
        tmp = path.with_suffix(path.suffix + ".tmp")
        with gzip.open(tmp, "wt") as stream:
            json.dump(saved, stream, ensure_ascii=False)
        tmp.replace(path)
        return html, saved["observed_at"]


def enumerate_listing(fetcher, sex="%"):
    listed, last_page, page, first_ids, final_ids = {}, 1, 1, None, None
    while page <= last_page:
        html, _ = fetcher.get(listing_url(page, sex), fresh=True)
        rows, discovered_last = parse_listing(html, page)
        ids = [r["source_result_id"] for r in rows]
        if page == 1:
            first_ids = ids
        if set(ids) & set(listed):
            raise SourceError("Repeated result IDs across pages; unstable pagination")
        listed.update((r["source_result_id"], r) for r in rows)
        last_page = max(last_page, discovered_last)
        if last_page > 10000:
            raise SourceError("Unexpected page count")
        if len(rows) > 100 or (page < last_page and len(rows) != 100):
            raise SourceError("Unexpected result page length; refusing a truncated listing")
        final_ids = ids
        page += 1
    checks = [(listing_url(1, sex), first_ids, last_page)]
    if last_page != 1:
        checks.append((listing_url(last_page, sex), final_ids, last_page))
    return listed, last_page, checks


def collect(output, delay, max_details):
    output.mkdir(parents=True, exist_ok=True)
    audit = {"event_id": EVENT, "year": 2026, "status": "incomplete", "started_at": now(),
             "listing_complete": False, "listed_count": 0, "fetched_count": 0, "missing_details": None,
             "gender_mapping_complete": False,
             "provisional": True, "source_url": BASE, "final_official_field_verified": False}
    atomic_json(output / "collection-audit.json", audit)
    fetcher = Fetcher(output / "cache", delay)
    try:
        listed, last_page, snapshot_checks = enumerate_listing(fetcher)
        if len(listed) < MIN_EXPECTED_LISTED:
            raise SourceError("Listed field is smaller than the observed 50,000+ entries; review filters/pagination")
        genders, gender_counts = {}, {}
        # The verified detail General table has no gender. Read only the source's
        # three published gender lists and join by idp, never by a person's name.
        for sex in ("M", "W", "X"):
            category, _, checks = enumerate_listing(fetcher, sex)
            snapshot_checks.extend(checks)
            gender_counts[sex] = len(category)
            for key, entry in category.items():
                if key not in listed or key in genders or listed[key]["runner"] != entry["runner"]:
                    raise SourceError("Gender lists do not reconcile with the all-gender result identities")
                genders[key] = sex
        if set(genders) != set(listed):
            raise SourceError("Gender lists are missing all-gender result identities")
        for key, entry in listed.items():
            entry["source_list_fields"]["gender"] = genders[key]
        audit.update(gender_mapping_complete=True, source_gender_counts=gender_counts)
        audit.update(listing_complete=True, listed_count=len(listed), pages=last_page)
        atomic_json(output / "listing.json", list(listed.values()))
        records, new_requests = [], 0
        for entry in listed.values():
            if not fetcher.cached(entry["source_url"]):
                if max_details and new_requests >= max_details:
                    break
                new_requests += 1
            html, observed_at = fetcher.get(entry["source_url"])
            records.append(parse_detail(html, entry, observed_at))
            audit["fetched_count"] = len(records)
            if len(records) % 100 == 0:
                atomic_json(output / "collection-audit.json", audit)
        target = output / "normalized.jsonl"
        tmp = target.with_suffix(".jsonl.tmp")
        with tmp.open("w") as stream:
            for row in records:
                stream.write(json.dumps(row, ensure_ascii=False) + "\n")
        tmp.replace(target)
        audit["missing_details"] = len(listed) - len(records)
        audit["normalized_sha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
        if audit["missing_details"] == 0:
            # Ensure the listing's endpoints did not drift during detail collection.
            for url, expected, expected_last in snapshot_checks:
                check_page = int(urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["page"][0])
                html, _ = fetcher.get(url, fresh=True)
                after, after_last = parse_listing(html, check_page)
                if [r["source_result_id"] for r in after] != expected or after_last != expected_last:
                    raise SourceError("Listing changed during collection; re-run for a stable snapshot")
            audit["status"] = "complete"
    except (SourceError, OSError, ValueError) as error:
        audit.update(status="blocked", error=str(error))
    finally:
        audit["finished_at"] = now()
        atomic_json(output / "collection-audit.json", audit)
    print(json.dumps(audit, indent=2))
    return 0 if audit["status"] == "complete" else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--max-details", type=int, default=5000, help="0 for all; incomplete batches never qualify for publication")
    args = parser.parse_args()
    if args.max_details < 0:
        parser.error("max-details must be nonnegative")
    raise SystemExit(collect(args.output, args.delay, args.max_details))
