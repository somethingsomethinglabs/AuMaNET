"""Fault tests for private USB backup; no device access."""
import contextlib
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'firmware/tools'))
import backup_nodes as backup


class BackupTest(unittest.TestCase):
    def exercise(self, mode):
        with tempfile.TemporaryDirectory(prefix='aumanet-backup-test-') as folder:
            target=Path(folder)
            status={'node':'1cdbd47539c0','firmware':'fixture','radio_started':True}
            calls=[]
            def read(port, action, offset, length, path):
                self.assertEqual((port,action,offset,length),('COM99','read_flash','0','0x800000'))
                calls.append(path)
                path.write_bytes(bytes([len(calls) if mode=='mismatch' else 7]) * (32 if mode=='partial' else 8388608))
            with patch.object(backup,'ARTIFACTS',target), patch.object(backup,'command',return_value=(status,b'')), \
                 patch.object(backup,'identify',return_value=status['node']), patch.object(backup,'esptool',side_effect=read), \
                 patch.object(backup.time,'sleep'), patch.object(sys,'argv',['backup','--port','COM99','--expect-node',status['node']]), \
                 contextlib.redirect_stdout(io.StringIO()):
                if mode=='ok':
                    backup.main()
                    self.assertEqual(len(list(target.rglob('manifest.json'))),1)
                    self.assertEqual(len(list(target.rglob('*.bin'))),1)
                else:
                    with self.assertRaisesRegex(RuntimeError,'Incomplete' if mode=='partial' else 'changed between reads'):
                        backup.main()
                    self.assertEqual(list(target.rglob('manifest.json')),[])
                    self.assertEqual(len(calls),1 if mode=='partial' else 2)

    def test_verified_duplicate_is_removed_and_manifest_published(self): self.exercise('ok')
    def test_mismatched_reads_retained_without_success_manifest(self): self.exercise('mismatch')
    def test_short_read_stops_before_verification(self): self.exercise('partial')

    def test_wrong_firmware_identity_never_enters_rom(self):
        with patch.object(backup,'command',return_value=({'node':'wrong'},b'')), \
             patch.object(backup,'identify') as identify, \
             patch.object(sys,'argv',['backup','--port','COM99','--expect-node','1cdbd47539c0']):
            with self.assertRaisesRegex(RuntimeError,'identity does not match'): backup.main()
            identify.assert_not_called()


if __name__=='__main__': unittest.main()
