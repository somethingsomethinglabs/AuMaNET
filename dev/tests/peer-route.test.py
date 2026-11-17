from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'setup'))
from peer_route import update


class PeerRoute(unittest.TestCase):
    def setUp(self):
        self.calls=[];self.started=False;self.commit=True;self.lost=False;self.revoked=True
        self.value=dict(schema='aumanet.gateway-admission.v1',type='gateway_admission',hardwareNode='1cdbd47539c0',state='ready',groupId='a'*32,
                        epoch=1,nodeId='d'*32,peerId='e'*32,peerMac='7ce8b1a777ec',ownerSpkiSha256='b'*64,run='c'*32,
                        privateKeyExported=False,controlIngressReady=True,controlIngressStorageFailed=False,controlIngress='d'*32)
    def wire(self,port,command,kind):
        self.calls.append(command)
        if command=='status':return dict(schema='aumanet.bench.v1',node=self.value['hardwareNode'],radio_started=self.started),b''
        if command=='gw-provision-status':return dict(self.value),b''
        if command=='gw-status':return dict(schema='aumanet.gateway.v1',run=self.value['run'],provisioned=True,storage_failed=False,
                                          field_autostart=not self.revoked,acquisition_configured=not self.revoked),b''
        if command.startswith('gw-peer-route '):
            if self.commit:self.value['peerMac']=command.split()[-1]
            if self.lost:raise RuntimeError('Lost receipt')
            return dict(accepted=self.commit),b''
        raise AssertionError(command)
    def invoke(self,old='7ce8b1a777ec',new='7ee8b1a777ec'):
        return update('COM99','1cdbd47539c0','a'*32,1,'d'*32,'e'*32,'b'*64,old,new,self.wire)
    def test_cas_then_idempotent_observation(self):
        self.assertTrue(self.invoke()['changed']);self.assertFalse(self.invoke()['changed'])
        self.assertEqual(len([c for c in self.calls if c.startswith('gw-peer-route ')]),1)
    def test_lost_receipt_reconciles_once_without_replay(self):
        self.lost=True;self.assertTrue(self.invoke()['confirmed'])
        self.assertEqual(len([c for c in self.calls if c.startswith('gw-peer-route ')]),1)
    def test_wrong_expected_mac_and_running_radio_reject_before_write(self):
        with self.assertRaises(ValueError):self.invoke(old='72e8b1a777ec')
        self.started=True
        with self.assertRaises(ValueError):self.invoke()
        self.assertFalse(any(c.startswith('gw-peer-route ') for c in self.calls))
    def test_bad_logical_peer_or_ingress_never_mutate(self):
        self.value['peerId']='f'*32
        with self.assertRaises(ValueError):self.invoke()
        self.value['peerId']='e'*32;self.value['controlIngressReady']=False
        with self.assertRaises(ValueError):self.invoke()
        self.assertFalse(any(c.startswith('gw-peer-route ') for c in self.calls))
    def test_uncertain_commit_and_missing_revocation_never_report_success(self):
        self.commit=False;self.lost=True
        with self.assertRaises(RuntimeError):self.invoke()
        self.assertEqual(len([c for c in self.calls if c.startswith('gw-peer-route ')]),1)
        self.setUp();self.revoked=False
        with self.assertRaisesRegex(RuntimeError,'revocation'):self.invoke()
    def test_multicast_zero_and_same_node_peer_reject(self):
        for mac in ['7de8b1a777ec','000000000000']:
            with self.subTest(mac=mac),self.assertRaises(ValueError):self.invoke(new=mac)
        self.assertEqual(self.calls,[])


if __name__=='__main__':unittest.main()
