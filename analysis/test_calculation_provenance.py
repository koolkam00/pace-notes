"""Prevent valid-looking hashes from admitting untraceable calculations."""
import hashlib
import unittest
from pathlib import Path
from calculation_provenance import validate_calculation_provenance


class CalculationProvenanceTests(unittest.TestCase):
    def test_all_published_builders_identify_their_actual_code(self):
        for export_id in ['private-20260911-1107', 'private-20260912-0934', 'htw-db-2026-10-16-1652']:
            self.check_builders(export_id)

    def check_builders(self, export_id):
        for version, presentation, scripts in [
            (1, None, ['build_pacing.py']),
            (2, None, ['build_extended.py', 'build_pacing.py']),
            (None, 'personalized-guide', ['build_personalized.py', 'build_extended.py', 'build_pacing.py']),
        ]:
            meta = {'input_export_id': export_id, 'analysis_version': version, 'presentation': presentation}
            for key, name in zip(['analysis_script_sha256', 'supporting_script_sha256', 'pacing_script_sha256'], scripts):
                meta[key] = hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
            validate_calculation_provenance(meta)
            for key in [key for key in meta if key.endswith('_sha256')]:
                for invalid in [hashlib.sha256(b'').hexdigest(), 'a' * 64, None]:
                    with self.subTest(version=version, key=key, invalid=invalid), self.assertRaises(AssertionError):
                        validate_calculation_provenance({**meta, key: invalid})

    def test_historical_artifacts_keep_their_historical_code_identity(self):
        validate_calculation_provenance({'input_export_id': 'private-20260907-1318'})
