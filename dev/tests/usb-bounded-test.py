import sys
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import subprocess

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'setup'))
import usb_bounded as usb

class Bounded(unittest.TestCase):
    def test_private_credentials_never_become_subprocess_arguments(self):
        with patch.object(usb.subprocess,'run') as run:
            with self.assertRaises(ValueError): usb.command('COM99','node-link-init secret','node_link')
            run.assert_not_called()

    def test_schema_only_response(self):
        with patch.object(usb.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout='{"schema":"fixture"}')) as run:
            value,_=usb.command('COM99','gw-update-status',None)
            self.assertEqual(value,{'schema':'fixture'})
            self.assertEqual(run.call_args.args[0][-2],'__any__')

    def test_timeout_has_no_replay(self):
        with patch.object(usb.subprocess,'run',side_effect=subprocess.TimeoutExpired('fixture',1)) as run:
            with self.assertRaisesRegex(RuntimeError,'reconcile'): usb.command('COM99','status','status')
            self.assertEqual(run.call_count,1)

    def test_reset_has_no_pending_read_and_requires_fresh_boot_proof(self):
        events=[]
        class Serial:
            def __init__(self,*a,**kw): pass
            def open(self): events.append('open')
            def write(self,data): events.append(data)
            def flush(self): events.append('flush')
            def close(self): events.append('close')
            def read(self,*a): raise AssertionError('Reset must not leave a read pending')
        def run(args,**kw):
            with patch.object(sys,'argv',['fixture',args[-1]]),patch.dict(sys.modules,{'serial':SimpleNamespace(Serial=Serial)}):
                exec(args[2],{})
            return SimpleNamespace(returncode=0)
        with patch.object(usb.subprocess,'run',side_effect=run):
            with self.assertRaisesRegex(RuntimeError,'verify a new device boot'): usb.command('COM99','reboot','status')
        self.assertEqual(events,['open',b'reboot\n','flush','close'])

if __name__=='__main__': unittest.main()
