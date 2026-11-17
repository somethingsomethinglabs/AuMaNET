"""USB profile and existing invitation guards; never access real devices."""
import base64
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'firmware/tools'))
from node_setup import Setup, invitation_summary, new_link_config

NODE = '1cdbd47539c0'


class Transport:
    def __init__(self):
        self.calls=[]
        self.started=False
        self.lost=False
        self.persist=True
        self.reject=False
        self.node=NODE
        self.profile={'schema':'aumanet.node-profile.v1','type':'node_profile','node':NODE,
                      'state':'unprovisioned','role':'unprovisioned','runtime_role':'unprovisioned',
                      'universal':True,'pending_reboot':False}

    def __call__(self,port,command,kind):
        self.calls.append(command)
        if command=='status':
            return {'schema':'aumanet.bench.v1','node':self.node,'radio_started':self.started},b''
        if command=='node-profile': return dict(self.profile),b''
        if command.startswith(('node-profile-init ','node-profile-set ')):
            self.assert_target=command.split()[1]
            if self.persist and not self.reject:
                self.profile.update(state='ready',role=command.split()[2],pending_reboot=True)
            if self.lost: raise RuntimeError('No fresh response')
            return dict(self.profile,accepted=not self.reject),b''
        raise AssertionError('Unexpected operation '+command)


class ProfileTest(unittest.TestCase):
    def test_fresh_profile_exact_target_and_readback(self):
        wire=Transport();result=Setup('COM99',NODE,wire).prepare('A')
        self.assertEqual(wire.assert_target,NODE)
        self.assertEqual(result['persistedRole'],'A')
        self.assertTrue(result['pendingReboot'])
        self.assertFalse(result['groupMembershipChanged'])
        self.assertEqual(wire.calls.count('node-profile-init '+NODE+' A'),1)

    def test_same_profile_is_idempotent_even_with_radio_active(self):
        wire=Transport();wire.profile.update(state='ready',role='B');wire.started=True
        result=Setup('COM99',NODE,wire).prepare('B')
        self.assertFalse(result['changed']);self.assertEqual(wire.calls,['status','node-profile'])

    def test_wrong_target_never_mutates(self):
        wire=Transport();wire.node='7ce8b1a777ec'
        with self.assertRaises(ValueError): Setup('COM99',NODE,wire).prepare('A')
        self.assertEqual(wire.calls,['status'])

    def test_uncertain_storage_and_running_radio_never_mutate(self):
        for state in ['invalid','unavailable','unprovisioned']:
            wire=Transport();wire.profile['state']=state;wire.started=state=='unprovisioned'
            with self.assertRaises(RuntimeError): Setup('COM99',NODE,wire).prepare('A')
            self.assertEqual(wire.calls,['status','node-profile'])

    def test_role_revision_requires_explicit_replace(self):
        wire=Transport();wire.profile.update(state='ready',role='B')
        with self.assertRaises(RuntimeError): Setup('COM99',NODE,wire).prepare('A')
        result=Setup('COM99',NODE,wire).prepare('A',replace=True)
        self.assertEqual(result['persistedRole'],'A')
        self.assertIn('node-profile-set '+NODE+' A',wire.calls)

    def test_lost_ack_is_reconciled_without_repeating_mutation(self):
        wire=Transport();wire.lost=True
        self.assertTrue(Setup('COM99',NODE,wire).prepare('B')['changed'])
        self.assertEqual(len([c for c in wire.calls if c.startswith('node-profile-init')]),1)

    def test_interrupted_noncommit_stays_unconfirmed(self):
        wire=Transport();wire.lost=True;wire.persist=False
        with self.assertRaisesRegex(RuntimeError,'unconfirmed'): Setup('COM99',NODE,wire).prepare('B')
        self.assertEqual(len([c for c in wire.calls if c.startswith('node-profile-init')]),1)

    def test_rejected_command_does_not_become_success(self):
        wire=Transport();wire.reject=True
        with self.assertRaisesRegex(ValueError,'rejected'): Setup('COM99',NODE,wire).prepare('B')


def invitation():
    return dict(schema='aumanet.invite.v2',groupId='a'*32,groupName='Trip',epoch=1,
                host='192.168.0.100',port=5000,pin='B'*64,token='c'*64,expiresAt=301000)


def encode(value):
    text=value if isinstance(value,str) else json.dumps(value)
    return 'aumanet://join/'+base64.urlsafe_b64encode(text.encode()).decode().rstrip('=')


class InviteTest(unittest.TestCase):
    def test_reads_native_invitation_but_redacts_bearer_token(self):
        result=invitation_summary(encode(invitation()),now_ms=1000)
        self.assertEqual(result['groupId'],'a'*32)
        self.assertNotIn('token',result);self.assertNotIn('c'*64,json.dumps(result))

    def test_expired_wrong_schema_unknown_duplicate_and_invalid_endpoint(self):
        for field,value in [('expiresAt',1000),('schema','new'),('host','8.8.8.8'),('port',0),('token','bad'),('extra','unknown')]:
            bad=invitation();bad[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError): invitation_summary(encode(bad),1000)
        duplicate=json.dumps(invitation())[:-1]+',"epoch":2}'
        with self.assertRaisesRegex(ValueError,'Duplicate'): invitation_summary(encode(duplicate),1000)


class LinkTransport(Transport):
    def __init__(self):
        super().__init__();self.config=None;self.secret_lost=False;self.secret_echo_failure=False
        self.link={'schema':'aumanet.node-link-profile.v1','type':'node_link_profile','node':NODE,
                   'state':'unprovisioned','enrollment':'','credentials_exported':False,'accepted':True}

    def __call__(self,port,command,kind):
        if command=='node-link-profile': self.calls.append(command);return dict(self.link),b''
        if command.startswith(('node-link-init ','node-link-check ')):
            self.calls.append(command)
            action,node,tag,ssid,password=command.split()
            value=(tag,ssid,password)
            if self.secret_echo_failure: raise RuntimeError('USB echo '+command)
            if action=='node-link-init':
                if self.config is not None: return dict(self.link,accepted=False),b''
                if self.persist:
                    self.config=value;self.link.update(state='ready',enrollment=tag)
                if self.secret_lost: raise RuntimeError('USB echo '+command)
                return dict(self.link,accepted=self.persist),b''
            return dict(self.link,accepted=value==self.config),b''
        return super().__call__(port,command,kind)


class LinkTest(unittest.TestCase):
    def test_fresh_link_commits_once_and_retries_compare_exact_bytes(self):
        config=new_link_config();wire=LinkTransport();setup=Setup('COM99',NODE,wire)
        result=setup.init_link(config);self.assertTrue(result['changed']);self.assertFalse(result['credentialsExported'])
        self.assertFalse(setup.init_link(config)['changed'])
        self.assertEqual(len([c for c in wire.calls if c.startswith('node-link-init')]),1)
        wrong=dict(config,password='wrongPassword')
        with self.assertRaisesRegex(RuntimeError,'does not match'): setup.init_link(wrong)
        self.assertEqual(len([c for c in wire.calls if c.startswith('node-link-init')]),1)

    def test_lost_link_ack_reconciles_without_second_write(self):
        wire=LinkTransport();wire.secret_lost=True
        self.assertTrue(Setup('COM99',NODE,wire).init_link(new_link_config())['changed'])
        self.assertEqual(len([c for c in wire.calls if c.startswith('node-link-init')]),1)

    def test_failed_write_does_not_report_ready(self):
        wire=LinkTransport();wire.secret_lost=True;wire.persist=False
        with self.assertRaisesRegex(RuntimeError,'does not match'): Setup('COM99',NODE,wire).init_link(new_link_config())
        self.assertEqual(len([c for c in wire.calls if c.startswith('node-link-init')]),1)

    def test_usb_exception_never_exposes_echoed_credential_command(self):
        config=new_link_config();wire=LinkTransport();wire.secret_echo_failure=True
        with self.assertRaises(RuntimeError) as error: Setup('COM99',NODE,wire).init_link(config)
        self.assertNotIn(config['password'],str(error.exception))
        self.assertNotIn(config['password'].encode().hex(),str(error.exception))
        self.assertTrue(error.exception.__suppress_context__)

    def test_wrong_target_and_uncertain_store_never_receive_secrets(self):
        for bad in ['target','invalid','unavailable']:
            wire=LinkTransport()
            if bad=='target': wire.node='7ce8b1a777ec'
            else: wire.link['state']=bad
            with self.subTest(bad=bad),self.assertRaises((ValueError,RuntimeError)):
                Setup('COM99',NODE,wire).init_link(new_link_config())
            self.assertFalse(any(c.startswith(('node-link-init ','node-link-check ')) for c in wire.calls))


if __name__=='__main__': unittest.main()
