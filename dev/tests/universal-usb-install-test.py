import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('installer',Path(__file__).with_name('universal-usb-install.py'))
installer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class Guards(unittest.TestCase):
    def test_exact_backup_and_wrong_target(self):
        with tempfile.TemporaryDirectory(prefix='aumanet-install-') as d:
            path=Path(d); data=bytes(8388608); (path/'flash.bin').write_bytes(data)
            manifest={'node':'1cdbd47539c0','bytes':len(data),'double_read_verified':True,'sha256':installer.sha(data)}
            (path/'manifest.json').write_text(json.dumps(manifest))
            self.assertEqual(installer.checked_backup(path/'manifest.json',manifest['node']),data)
            with self.assertRaisesRegex(RuntimeError,'exact node'): installer.checked_backup(path/'manifest.json','7ce8b1a777ec')
            manifest['double_read_verified']=False;(path/'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(RuntimeError,'verified backup'): installer.checked_backup(path/'manifest.json',manifest['node'])

    def test_corrupt_backup(self):
        with tempfile.TemporaryDirectory(prefix='aumanet-install-') as d:
            path=Path(d);data=bytes(8388608);(path/'flash.bin').write_bytes(data)
            manifest={'node':'1cdbd47539c0','bytes':len(data),'double_read_verified':True,'sha256':'0'*64}
            (path/'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(RuntimeError,'digest'): installer.checked_backup(path/'manifest.json',manifest['node'])

if __name__=='__main__': unittest.main()
