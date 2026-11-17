"""Nested SDK modifications must match the declared patch targets and hashes."""
import difflib
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'firmware/tools'))
import prepare_upstream as adapter


class NestedAdmission(unittest.TestCase):
    def test_nested_target_and_repository_checks(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            outer = base / 'outer'
            inner = outer / 'halow/components/mm-iot-sdk'
            def git(repo, *args):
                return subprocess.check_output(['git', '-C', str(repo), *args], text=True, stderr=subprocess.DEVNULL).strip()
            for repo in (inner, outer):
                repo.mkdir(parents=True, exist_ok=True)
                git(repo, 'init', '-q')
                git(repo, 'config', 'user.name', 'Fixture')
                git(repo, 'config', 'user.email', 'fixture@example.invalid')
                (repo / 'source.c').write_text('original\n')
                (repo / 'other.c').write_text('untouched\n')
                git(repo, 'add', '.')
                git(repo, 'commit', '-qm', 'Baseline')
            old_root, old_lock = adapter.ROOT, adapter.LOCK
            adapter.ROOT = base
            patches = []
            for key, repo in [('esp_halow', outer), ('mm_iot_sdk', inner)]:
                patch = base / (key + '.patch')
                patch.write_text(''.join(difflib.unified_diff(['original\n'], ['reviewed\n'], fromfile='a/source.c', tofile='b/source.c')))
                patches.append({'repository': key, 'file': patch.name, 'target': 'source.c',
                    'sha256': hashlib.sha256(patch.read_bytes()).hexdigest(),
                    'before_sha256': hashlib.sha256(b'original\n').hexdigest(),
                    'after_sha256': hashlib.sha256(b'reviewed\n').hexdigest()})
            adapter.LOCK = {key: {'commit': git(repo, 'rev-parse', 'HEAD')} for key, repo in [('esp_halow', outer), ('mm_iot_sdk', inner)]}
            adapter.LOCK['adapter_patches'] = patches
            try:
                adapter.prepare(outer)
                adapter.prepare(outer)
                (inner / 'other.c').write_text('undeclared tracked modification\n')
                with self.assertRaises(SystemExit): adapter.prepare(outer)
                (inner / 'other.c').write_text('untouched\n')
                (inner / 'injected.h').write_text('undeclared file\n')
                with self.assertRaises(SystemExit): adapter.prepare(outer)
                (inner / 'injected.h').unlink()
                (inner / 'source.c').write_text('tampered declared target\n')
                with self.assertRaises(SystemExit): adapter.prepare(outer)
                (inner / 'source.c').write_text('reviewed\n')
                adapter.LOCK['mm_iot_sdk']['commit'] = '0' * 40
                with self.assertRaises(SystemExit): adapter.prepare(outer)
            finally:
                adapter.ROOT, adapter.LOCK = old_root, old_lock


if __name__ == '__main__': unittest.main()
