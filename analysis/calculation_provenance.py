"""Require current-release artifacts to identify the reviewed calculation code."""
import hashlib
from pathlib import Path


def validate_calculation_provenance(meta):
    # Historical outputs identify their original code, not today's builders.
    if meta['input_export_id'] not in ('private-20260911-1107', 'private-20260912-0934', 'htw-db-2026-10-16-1652', 'private-20261021-1050'):
        return
    if meta.get('presentation') == 'personalized-guide':
        scripts = {'analysis_script_sha256': 'build_personalized.py',
                   'supporting_script_sha256': 'build_extended.py',
                   'pacing_script_sha256': 'build_pacing.py'}
    else:
        version = meta['analysis_version']
        assert version in (1, 2), 'Unknown calculation version'
        scripts = {'analysis_script_sha256': 'build_pacing.py' if version == 1 else 'build_extended.py'}
        if version == 2:
            scripts['supporting_script_sha256'] = 'build_pacing.py'
    if 'narrative_script_sha256' in meta:
        scripts['narrative_script_sha256'] = 'write_findings.py'
    for key, name in scripts.items():
        content = Path(__file__).with_name(name).read_bytes()
        assert content, f'Cannot verify an empty calculation file: {name}'
        expected = hashlib.sha256(content).hexdigest()
        assert meta.get(key) == expected, f'{meta.get("id")}: {key} must identify the reviewed {name}'
