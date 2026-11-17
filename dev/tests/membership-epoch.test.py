"""Host transport fault tests; firmware policy has extracted-C coverage."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'setup'))
from membership_epoch import migrate

class Transport:
    def __init__(self):self.epoch=4;self.calls=[];self.failure=False;self.wrong=False;self.started=False
    def __call__(self,port,operation,kind):
        self.calls.append(operation)
        if operation=='status':return {'node':'1'*12,'radio_started':self.started},b''
        if operation=='gw-provision-status':return dict(hardwareNode='1'*12,state='ready',groupId='2'*32,nodeId='3'*32,ownerSpkiSha256=('9' if self.wrong else '4')*64,controlIngressReady=True,controlIngressStorageFailed=False,controlIngress='3'*32,epoch=self.epoch,run='5'*32,peerId='6'*32,peerMac='7'*12),b''
        if operation.startswith('gw-membership-epoch '):
            self.epoch=6
            if self.failure:raise RuntimeError('lost acknowledgement')
            return {},b''
        if operation=='gw-status':return dict(acquisition_configured=False,field_autostart=False),b''
        raise AssertionError(operation)

class Tests(unittest.TestCase):
    def run_case(self,t,apply=True):return migrate('COM4','1'*12,'2'*32,'3'*32,'4'*64,4,6,apply,t)
    def test_plan_reads_only(self):
        t=Transport();self.assertFalse(self.run_case(t,False)['confirmed']);self.assertFalse(any(c.startswith('gw-membership-epoch ') for c in t.calls))
    def test_lost_ack_reads_back_without_replay(self):
        t=Transport();t.failure=True;self.assertTrue(self.run_case(t)['confirmed']);self.assertEqual(sum(c.startswith('gw-membership-epoch ') for c in t.calls),1)
    def test_already_committed_is_read_only(self):
        t=Transport();t.epoch=6;self.assertFalse(self.run_case(t)['changed']);self.assertEqual(len(t.calls),2)
    def test_wrong_authority_and_active_radio_rejected(self):
        for field in ('wrong','started'):
            t=Transport();setattr(t,field,True)
            with self.assertRaises(RuntimeError):self.run_case(t)
            self.assertFalse(any(c.startswith('gw-membership-epoch ') for c in t.calls))
    def test_unconfirmed_write_is_not_replayed(self):
        t=Transport();original=t.__class__.__call__
        def unchanged(port,operation,kind):
            if operation.startswith('gw-membership-epoch '):t.calls.append(operation);raise RuntimeError('unknown')
            return original(t,port,operation,kind)
        with self.assertRaises(RuntimeError):migrate('COM4','1'*12,'2'*32,'3'*32,'4'*64,4,6,True,unchanged)
        self.assertEqual(sum(c.startswith('gw-membership-epoch ') for c in t.calls),1)

if __name__=='__main__':unittest.main()
