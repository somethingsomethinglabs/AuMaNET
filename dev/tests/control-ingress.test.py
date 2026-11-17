from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'setup'))
from control_ingress import migrate


class Ingress(unittest.TestCase):
    def setUp(self):
        self.calls=[];self.started=False;self.commit=True;self.lost=False
        self.value=dict(schema='aumanet.gateway-admission.v1',type='gateway_admission',hardwareNode='1cdbd47539c0',state='ready',groupId='a'*32,
                        epoch=1,nodeId='d'*32,peerId='e'*32,peerMac='7ce8b1a777ec',ownerSpkiSha256='b'*64,run='c'*32,
                        privateKeyExported=False,controlIngressReady=False,controlIngressStorageFailed=False,controlIngress='')
    def wire(self,port,command,kind):
        self.calls.append(command)
        if command=='status':return dict(schema='aumanet.bench.v1',node=self.value['hardwareNode'],radio_started=self.started),b''
        if command=='gw-provision-status':return dict(self.value),b''
        if command.startswith('gw-control-ingress '):
            if self.commit:self.value.update(controlIngressReady=True,controlIngress=command.split()[-1])
            if self.lost:raise RuntimeError('Lost reply')
            return dict(self.value,accepted=self.commit),b''
        raise AssertionError(command)
    def invoke(self):return migrate('COM99','1cdbd47539c0','a'*32,1,'d'*32,'b'*64,'d'*32,self.wire)
    def test_create_then_idempotent_readback(self):
        self.assertTrue(self.invoke()['changed']);self.assertFalse(self.invoke()['changed'])
        self.assertEqual(len([c for c in self.calls if c.startswith('gw-control-ingress ')]),1)
    def test_lost_ack_is_confirmed_without_replay(self):
        self.lost=True;self.assertTrue(self.invoke()['confirmed'])
        self.assertEqual(len([c for c in self.calls if c.startswith('gw-control-ingress ')]),1)
    def test_existing_conflict_uncertain_authority_and_running_radio_reject(self):
        self.value.update(controlIngressReady=True,controlIngress='e'*32)
        with self.assertRaises(ValueError):self.invoke()
        self.value.update(controlIngressReady=False,controlIngress='',controlIngressStorageFailed=True)
        with self.assertRaises(ValueError):self.invoke()
        self.value['controlIngressStorageFailed']=False;self.started=True
        with self.assertRaises(ValueError):self.invoke()
        self.assertFalse(any(c.startswith('gw-control-ingress ') for c in self.calls))
    def test_missing_commit_never_confirms(self):
        self.commit=False;self.lost=True
        with self.assertRaises(RuntimeError):self.invoke()
        self.assertEqual(len([c for c in self.calls if c.startswith('gw-control-ingress ')]),1)


if __name__=='__main__':unittest.main()
