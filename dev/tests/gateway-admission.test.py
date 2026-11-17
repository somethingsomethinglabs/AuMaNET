import base64
import hashlib
from pathlib import Path
import sys
import unittest
from cryptography.hazmat.primitives.asymmetric.ec import generate_private_key,SECP256R1
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'setup'))
from gateway_admission import plan,apply


class Admission(unittest.TestCase):
    def setUp(self):
        der=generate_private_key(SECP256R1()).public_key().public_bytes(Encoding.DER,PublicFormat.SubjectPublicKeyInfo)
        self.authority={'schema':'aumanet.gateway-authority.v1','source':'device','privateKeyExported':False,
                        'publicKeyDerBase64':base64.b64encode(der).decode(),'publicKeySha256':hashlib.sha256(der).hexdigest(),
                        'scope':dict(processId='12345678-1234-1234-1234-123456789abc',groupId='a'*32,epoch=1,ownerPin='B'*64,sourceRun=1)}
        self.observation={'schema':'aumanet.usb-admission-observation.v1','hardwareNode':'1cdbd47539c0','radioStarted':False,'observedAtMs':1000,
                          'gateway':dict(schema='aumanet.gateway.v1',type='status',provisioned=False,storage_failed=False,run='c'*32),
                          'admission':dict(schema='aumanet.gateway-admission.v1',type='gateway_admission',hardwareNode='1cdbd47539c0',run='c'*32,
                                           state='unprovisioned',controlIngressStorageFailed=False)}

    def make(self,**override):
        args=dict(authority=self.authority,observation=self.observation,expected_hardware='1cdbd47539c0',expected_group='a'*32,
                  expected_owner='B'*64,node_id='d'*32,peer_id='e'*32,peer_mac='7ce8b1a777ec',now_ms=1001,control_ingress='d'*32)
        args.update(override);return plan(**args)

    def test_native_export_becomes_public_boot_scoped_plan_only(self):
        result=self.make();self.assertFalse(result['executed']);self.assertFalse(result['privateKeyExported'])
        self.assertIn('gw-enroll 1cdbd47539c0 '+'c'*32,result['publicCommand'])
        self.assertIn(self.authority['publicKeySha256'],result['publicCommand'])

    def test_existing_uncertain_running_and_stale_nodes_reject(self):
        for field in ['provisioned','storage_failed']:
            self.observation['gateway'][field]=True
            with self.assertRaises(ValueError): self.make()
            self.observation['gateway'][field]=False
        self.observation['radioStarted']=True
        with self.assertRaises(ValueError): self.make()
        self.observation['radioStarted']=False
        with self.assertRaises(ValueError): self.make(now_ms=31001)

    def test_wrong_group_owner_target_key_and_peer_reject(self):
        for override in [dict(expected_group='f'*32),dict(expected_owner='C'*64),dict(expected_hardware='7ce8b1a777ec'),dict(peer_id='d'*32),dict(peer_mac='7de8b1a777ec')]:
            with self.subTest(override=override),self.assertRaises(ValueError): self.make(**override)
        self.authority['publicKeySha256']='0'*64
        with self.assertRaisesRegex(ValueError,'SPKI'): self.make()

    def test_private_export_cannot_be_used(self):
        self.authority['privateKeyExported']=True
        with self.assertRaises(ValueError): self.make()

    def wire(self,p,commit=True,lost=False,reject=False):
        calls=[]
        state=dict(self.observation['admission'],privateKeyExported=False,controlIngressReady=False)
        def transport(port,command,kind):
            calls.append(command)
            if command=='status':return dict(schema='aumanet.bench.v1',node=p['hardwareNode'],radio_started=False),b''
            if command=='gw-provision-status':return dict(state),b''
            if command.startswith('gw-enroll '):
                if commit and not reject:state.update(p['expectedAdmission'],state='ready',controlIngressReady=True)
                if lost:raise RuntimeError('Lost reply')
                return dict(state,accepted=not reject),b''
            raise AssertionError('Unexpected operation '+command)
        return transport,calls,state

    def test_explicit_application_and_lost_ack_confirm_by_complete_readback(self):
        for lost in [False,True]:
            p=self.make();wire,calls,state=self.wire(p,lost=lost)
            result=apply(p,'COM99',wire,1001)
            self.assertTrue(result['confirmed']);self.assertTrue(result['changed'])
            self.assertEqual(len([c for c in calls if c.startswith('gw-enroll ')]),1)
            result=apply(p,'COM99',wire,1001);self.assertFalse(result['changed'])
            self.assertEqual(len([c for c in calls if c.startswith('gw-enroll ')]),1)

    def test_missing_commit_rejected_and_wrong_readback_never_confirm(self):
        for config in [dict(commit=False,lost=True),dict(reject=True)]:
            p=self.make();wire,calls,state=self.wire(p,**config)
            with self.assertRaises((RuntimeError,ValueError)):apply(p,'COM99',wire,1001)
            self.assertEqual(len([c for c in calls if c.startswith('gw-enroll ')]),1)
        p=self.make();wire,calls,state=self.wire(p);state.update(p['expectedAdmission'],state='ready',controlIngressReady=True,epoch=2)
        with self.assertRaises(ValueError):apply(p,'COM99',wire,1001)
        self.assertFalse(any(c.startswith('gw-enroll ') for c in calls))

    def test_review_command_is_never_executed_and_expired_plan_rejects(self):
        p=self.make();p['publicCommand']='erase_flash';wire,calls,state=self.wire(p)
        apply(p,'COM99',wire,1001);self.assertNotIn('erase_flash',calls)
        with self.assertRaises(ValueError):apply(p,'COM99',wire,31000)

    def test_changed_review_identity_rejects_before_device_access(self):
        p=self.make();p['groupId']='f'*32;wire,calls,state=self.wire(p)
        with self.assertRaisesRegex(ValueError,'Reviewed'):apply(p,'COM99',wire,1001)
        self.assertEqual(calls,[])


if __name__=='__main__': unittest.main()
