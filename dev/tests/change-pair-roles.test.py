from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'setup'))
from change_pair_roles import PairChange,checked_config


class PairRoles(unittest.TestCase):
    def setUp(self):
        self.config={'schema':'aumanet.usb-pair-role-change.v1','nodes':[
            dict(port='COM90',hardware='1cdbd47539c0',group='a'*32,epoch=4,node='d'*32,peer='e'*32,ownerSpki='b'*64,phoneMac='de5973dd5d5e'),
            dict(port='COM91',hardware='7ce8b1a777ec',group='a'*32,epoch=4,node='e'*32,peer='d'*32,ownerSpki='b'*64,phoneMac='f6033e786c49')]}
        self.calls=[];self.lost_profile=False;self.profile_commit=True;self.lost_peer=False;self.reboot_fail=False;self.field_fail=False;self.different_image=False;self.association_wait=0;self.link_received=10
        self.states={}
        for i,n in enumerate(self.config['nodes']):
            self.states[n['port']]=dict(role='A' if i==0 else 'B',runtime='A' if i==0 else 'B',pending=False,auto=True,started=True,
                run=i+1,field=True,acq=True,peerMac='3c1acc4c83a7' if i==0 else '3e1acc4c8496',
                macs={'A':'3e1acc4c8496','B':'3c1acc4c8496'} if i==0 else {'A':'3e1acc4c83a7','B':'3c1acc4c83a7'})

    def wire(self,port,command,kind):
        self.calls.append((port,command));n=next(n for n in self.config['nodes'] if n['port']==port);s=self.states[port];run=f"{s['run']:032x}"
        if command=='status':return dict(schema='aumanet.bench.v1',node=n['hardware'],radio_started=s['started'],radio_autostart=s['auto'],message_storage_ready=True),b''
        if command=='gw-provision-status':return dict(schema='aumanet.gateway-admission.v1',type='gateway_admission',state='ready',hardwareNode=n['hardware'],groupId=n['group'],epoch=n['epoch'],nodeId=n['node'],peerId=n['peer'],ownerSpkiSha256=n['ownerSpki'],controlIngressReady=True,controlIngressStorageFailed=False,controlIngress='d'*32,run=run,peerMac=s['peerMac'],privateKeyExported=False),b''
        if command=='node-profile':return dict(schema='aumanet.node-profile.v1',type='node_profile',state='ready',node=n['hardware'],role=s['role'],runtime_role=s['runtime'],pending_reboot=s['pending'],universal=True),b''
        if command=='gw-status':return dict(schema='aumanet.gateway.v1',run=run,node=n['node'],lease_ip=0x0a4d000a if port=='COM90' else 0x0a4d000b,provisioned=True,storage_failed=False,mesh_mac=s['macs'][s['runtime']],field_autostart=s['field'],acquisition_configured=s['acq'],acquisition_storage_failed=False),b''
        if command=='gw-update-status':return dict(schema='aumanet.node-update-status.v1',imageSha256=('2' if self.different_image and port=='COM91' else '1')*64,privateBootstrap=False,pendingVerification=False),b''
        if command.startswith('radio-autostart '):s['auto']=command.endswith('on');return {},b''
        if command=='reboot':
            if not self.reboot_fail:s['run']+=10;s['runtime']=s['role'];s['pending']=False;s['started']=s['auto']
            raise RuntimeError('USB reboot acknowledgement lost')
        if command.startswith('node-profile-set '):
            if self.profile_commit:s['role']=command.split()[-1];s['pending']=True
            if self.lost_profile:raise RuntimeError('Lost profile acknowledgement')
            return dict(schema='aumanet.node-profile.v1',type='node_profile',state='ready',node=n['hardware'],role=s['role'],runtime_role=s['runtime'],pending_reboot=s['pending'],universal=True,accepted=self.profile_commit),b''
        if command.startswith('gw-peer-route '):
            self.assertFalse(s['started']);self.assertEqual(command.split()[-2],s['peerMac']);s['peerMac']=command.split()[-1];s['field']=s['acq']=False
            if self.lost_peer:raise RuntimeError('Lost route acknowledgement')
            return {'accepted':True},b''
        if command.startswith('gw-acquisition '):s['acq']=True;return {},b''
        if command.startswith('gw-field '):s['field']=not self.field_fail;return {'accepted':s['field']},b''
        if command=='radio-status':
            waiting=self.association_wait>0
            if waiting:self.association_wait-=1
            return {'started':s['started'],'interface_up':s['started'] and not waiting},b''
        if command=='link-test':return {'sent':10,'received':self.link_received},b''
        raise AssertionError(command)

    def run_pair(self):return PairChange(self.config,['B','A'],self.wire,sleep=lambda _:None).run()

    def test_swap_learns_actual_mac_preserves_image_and_rearms(self):
        result=self.run_pair();self.assertTrue(result['complete']);self.assertEqual(result['observedVifMacs'],['3c1acc4c8496','3e1acc4c83a7'])
        self.assertEqual(self.states['COM90']['peerMac'],'3e1acc4c83a7');self.assertEqual(self.states['COM91']['peerMac'],'3c1acc4c8496')
        self.assertTrue(all(s['started'] and s['field'] and s['acq'] for s in self.states.values()))
        self.assertFalse(result['signedApplicationAcceptance']);self.assertEqual(result['imageSha256'],'1'*64)

    def test_lost_writes_reconcile_without_repeat(self):
        self.lost_profile=self.lost_peer=True;self.assertTrue(self.run_pair()['complete'])
        self.assertEqual(sum(c.startswith('node-profile-set ') for _,c in self.calls),2)
        self.assertEqual(sum(c.startswith('gw-peer-route ') for _,c in self.calls),2)

    def test_uncommitted_profile_stops_pair_with_radios_off(self):
        self.lost_profile=True;self.profile_commit=False;result=self.run_pair();self.assertFalse(result['complete']);self.assertTrue(result['safeRadioOff'])
        self.assertEqual(sum(c.startswith('node-profile-set ') for _,c in self.calls),1)
        self.assertFalse(any(c.startswith('gw-peer-route ') for _,c in self.calls))

    def test_reboot_is_never_retried(self):
        self.reboot_fail=True;result=self.run_pair();self.assertFalse(result['complete']);self.assertFalse(result['safeRadioOff'])
        self.assertEqual(sum(c=='reboot' for _,c in self.calls),1)

    def test_image_mismatch_never_mutates(self):
        self.different_image=True;self.assertFalse(self.run_pair()['complete'])
        self.assertFalse(any(c.startswith(('radio-autostart ','node-profile-set ','gw-peer-route ')) or c=='reboot' for _,c in self.calls))

    def test_failed_rearm_leaves_stopped_radios_without_replay(self):
        self.field_fail=True;result=self.run_pair();self.assertFalse(result['complete']);self.assertTrue(result['safeRadioOff'])
        self.assertEqual(sum(c.startswith('gw-field ') for _,c in self.calls),1)

    def test_invalid_pair_scope_rejected(self):
        for field,value in [('peer','f'*32),('group','f'*32),('phoneMac','000000000000'),('hardware','0'*12)]:
            with self.subTest(field=field):
                original=self.config['nodes'][1][field];self.config['nodes'][1][field]=value
                with self.assertRaises(ValueError):checked_config(self.config)
                self.config['nodes'][1][field]=original

    def test_delayed_association_is_observed_without_extra_reboots(self):
        self.association_wait=10;result=self.run_pair();self.assertTrue(result['complete'])
        self.assertEqual(len(result['pathChecks'][0]['radioSamples']),11)
        self.assertEqual(sum(c=='reboot' for _,c in self.calls),8)

    def test_association_timeout_retains_samples_without_restarting(self):
        self.association_wait=100;result=self.run_pair();self.assertFalse(result['complete'])
        self.assertEqual(result['failureCode'],'RADIO_ASSOCIATION_UNCONFIRMED')
        self.assertEqual(len(result['pathChecks'][0]['radioSamples']),24)
        self.assertFalse(any(c=='link-test' for _,c in self.calls))
        self.assertEqual(sum(c=='reboot' for _,c in self.calls),8)

    def test_echo_loss_records_both_directions_and_named_failure(self):
        self.link_received=0;result=self.run_pair();self.assertFalse(result['complete'])
        self.assertEqual(result['failureCode'],'DIRECT_IP_ECHO_LOSS')
        self.assertEqual([row['link']['received'] for row in result['pathChecks']],[0,0])


if __name__=='__main__':unittest.main()
