"""Synthetic contract fixtures, not captured or verified 2026 HTML."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.parse

import collect_berlin as c


def listed(key="SYNTHETIC1"):
    return {"source_result_id": key, "runner": "Fixture, Runner (ETH)",
            "source_list_fields": {"name": "Fixture, Runner (ETH)", "gender": "W"},
            "source_url": c.BASE + f"?event={c.EVENT}&content=detail&idp={key}&lang=EN_CAP"}


def detail():
    return '''<div id="detail-box-general"><table>
      <tr><th>Name</th><td>Fixture, Runner (ETH)</td></tr>
      <tr><th>Bib Number</th><td>123</td></tr>
      <tr><th>Age Group</th><td>35</td></tr></table></div>
      <div id="detail-box-totals"><table><tr><th>Time (Gun)</th><td>04:05:00</td></tr></table></div>
      <div id="detail-box-state"><table><tr><th>Race State</th><td>Finished</td></tr></table></div>
      <div id="detail-box-splits"><table>
      <tr><th>Split</th><th>Time Of Day</th><th>Time</th><th>Diff</th></tr>
      <tr><td>5 km</td><td>09:15:00</td><td>00:30:00</td><td>30:00</td></tr>
      <tr><td>20 km</td><td>10:45:00</td><td>02:00:00</td><td>30:00</td></tr>
      <tr><td>Halb</td><td>10:51:00</td><td>02:06:00</td><td>06:00</td></tr>
      <tr><td>25 km</td><td>11:15:00</td><td>02:30:00</td><td>24:00</td></tr>
      <tr><td>30 km</td><td>-</td><td>-</td><td>-</td></tr>
      <tr><td>Finish</td><td>12:45:00</td><td>04:00:00</td><td>12:00</td></tr>
      </table></div>'''


def listing(keys, last=1):
    rows = ''.join(f'<li class="list-group-item row"><h4 class="type-fullname"><a href="{listed(key)["source_url"]}">Fixture, Runner (ETH)</a></h4></li>' for key in keys)
    return rows + f'<a href="?event={c.EVENT}&page={last}">{last}</a>'


class ParserTests(unittest.TestCase):
    def test_elapsed_not_clock_or_previous_segment(self):
        row = c.parse_detail(detail(), listed(), "2026-09-27T20:00:00Z")
        self.assertEqual(row['split_5km'], '00:30:00')
        self.assertEqual(row['split_25km'], '02:30:00')
        self.assertEqual(row['split_20km'], '02:00:00')
        self.assertEqual(row['halfway'], '02:06:00')
        self.assertEqual(row['split_42_2km'], '04:00:00')
        self.assertEqual(row['finish_gun'], '04:05:00')
        self.assertIsNone(row['split_30km'])
        self.assertIsNone(row['split_10km'])
        self.assertIsNone(row['age'])
        self.assertEqual(row['age_group'], '35')
        self.assertEqual(row['sex'], 'F')
        self.assertEqual(row['source_fields']['list']['gender'], 'W')
        self.assertEqual(row['nationality'], 'ETH')
        self.assertTrue(row['provisional'])

    def test_detail_does_not_infer_missing_gender(self):
        entry = listed()
        entry['source_list_fields'].pop('gender')
        self.assertIsNone(c.parse_detail(detail(), entry, 'x')['sex'])

    def test_challenge_and_ambiguous_headers_fail(self):
        with self.assertRaises(c.SourceError):
            c.parse_detail('<h1>Access denied</h1>', listed(), 'x')
        with self.assertRaises(c.SourceError):
            c.parse_detail(detail().replace('<th>Time</th>', '<th>Time Of Day</th>'), listed(), 'x')

    def test_source_identity_and_event(self):
        for url in ('https://example.com/2026/?event=' + c.EVENT,
                    c.BASE + '?event=SKATING&idp=1'):
            with self.assertRaises(c.SourceError):
                c.checked_url(url, detail=True)
        wrong = dict(listed(), source_result_id='DIFFERENT')
        with self.assertRaises(c.SourceError):
            c.parse_detail(detail(), wrong, 'x')
        with self.assertRaises(c.SourceError):
            c.parse_detail(detail().replace('Fixture, Runner (ETH)', 'Other, Athlete (ETH)'), listed(), 'x')
        with self.assertRaises(c.SourceError):
            c.check_response_identity(listed('A')['source_url'], listed('B')['source_url'])
        with self.assertRaises(c.SourceError):
            c.check_response_identity(c.listing_url(1, 'M'), c.listing_url(1, 'W'))

    def test_pagination_and_duplicate_ids(self):
        rows, last = c.parse_listing(listing(['A','B'], 501), 1)
        self.assertEqual(last,501)
        self.assertEqual([r['source_result_id'] for r in rows], ['A','B'])
        with self.assertRaises(c.SourceError):
            c.parse_listing(listing(['A','A']),1)

    def test_observed_public_pagination_encoding(self):
        # Exact non-personal pagination anchor transcribed from the observed UI.
        anchor = '<a href="#" data-silver="63,112,97,103,101,61,49,50,56,52,38,97,109,112,59,101,118,101,110,116,61,66,77,76,95,72,67,72,51,67,48,79,72,51,55,67,38,97,109,112,59,112,105,100,61,108,105,115,116,38,97,109,112,59,115,101,97,114,99,104,37,53,66,115,101,120,37,53,68,61,77,38,97,109,112,59,115,101,97,114,99,104,37,53,66,97,103,101,95,99,108,97,115,115,37,53,68,61,37,50,53" class="silver-link">1284</a>'
        rows, last = c.parse_listing(listing(['A']) + anchor, 1)
        self.assertEqual(last, 1284)
        self.assertEqual(len(rows), 1)
        with self.assertRaises(c.SourceError):
            c.parse_listing(listing(['A']) + '<a href="#" data-silver="javascript:bad">2</a>', 1)

    def test_short_nonfinal_page_is_not_complete(self):
        class FakeFetcher:
            def get(self, *args, **kwargs): return listing(['A'], 2), 'x'
        with self.assertRaises(c.SourceError):
            c.enumerate_listing(FakeFetcher())

    def test_http403_stops_after_one_request(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(c.urllib.request,'urlopen',side_effect=urllib.error.HTTPError(c.listing_url(1),403,'Forbidden',{},None)) as request:
                status=c.collect(Path(tmp),1,1)
            self.assertEqual(status,2)
            self.assertEqual(request.call_count,1)
            audit=json.loads((Path(tmp)/'collection-audit.json').read_text())
            self.assertEqual(audit['status'],'blocked')
            self.assertEqual(audit['fetched_count'],0)
            self.assertFalse((Path(tmp)/'normalized.jsonl').exists())

    def test_resume_budget_counts_new_details_only(self):
        class FakeFetcher:
            def __init__(self,*args): pass
            def cached(self,url): return urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get('idp', [''])[0] in ('A', 'B')
            def get(self,url,fresh=False):
                query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
                if 'idp' not in query:
                    keys = {'%': ['A', 'B', 'C'], 'M': ['A'], 'W': ['B'], 'X': ['C']}[query['search[sex]'][0]]
                    return listing(keys), '2026-09-27T20:00:00Z'
                return detail(), '2026-09-27T20:00:00Z'
        with tempfile.TemporaryDirectory() as tmp, patch.object(c,'Fetcher',FakeFetcher), patch.object(c,'MIN_EXPECTED_LISTED',2):
            self.assertEqual(c.collect(Path(tmp),1,1),0)
            audit=json.loads((Path(tmp)/'collection-audit.json').read_text())
            self.assertEqual(audit['listed_count'],3)
            self.assertEqual(audit['fetched_count'],3)
            self.assertEqual(audit['missing_details'],0)
            self.assertTrue(audit['gender_mapping_complete'])
            self.assertEqual(audit['source_gender_counts'], {'M': 1, 'W': 1, 'X': 1})
            payload=(Path(tmp)/'normalized.jsonl').read_bytes()
            self.assertEqual(audit['normalized_sha256'],hashlib.sha256(payload).hexdigest())
            rows = [json.loads(line) for line in payload.splitlines()]
            self.assertEqual([row['sex'] for row in rows], ['M', 'F', 'X'])

    def test_gender_mapping_failure_blocks_publication(self):
        class FakeFetcher:
            def __init__(self, *args): pass
            def get(self, url, fresh=False): return listing(['A']), '2026-09-27T20:00:00Z'
        with tempfile.TemporaryDirectory() as tmp, patch.object(c, 'Fetcher', FakeFetcher), patch.object(c, 'MIN_EXPECTED_LISTED', 1):
            self.assertEqual(c.collect(Path(tmp), 1, 1), 2)
            audit = json.loads((Path(tmp) / 'collection-audit.json').read_text())
            self.assertEqual(audit['status'], 'blocked')
            self.assertFalse(audit['gender_mapping_complete'])
            self.assertFalse((Path(tmp) / 'normalized.jsonl').exists())


if __name__ == '__main__':
    unittest.main()
