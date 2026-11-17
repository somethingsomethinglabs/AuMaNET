"""Signed public Java fixtures; no serial/ADB/network access."""
import argparse,copy,hashlib,importlib.util,json,unittest
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--fixtures',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];spec=importlib.util.spec_from_file_location('routed_setup',root/'dev/setup/routed_lan.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
der=(a.fixtures/'owner.der').read_bytes();pin=hashlib.sha256(der).hexdigest()
grant=lambda side:{'bodyHex':(a.fixtures/f'lan-{side}.bin').read_bytes().hex(),'signatureDerHex':(a.fixtures/f'lan-{side}.sig').read_bytes().hex(),'ownerPublicKeyDerHex':der.hex()}
config={'schema':'aumanet.routed-usb-migration.v1','hardware':'020000000001','groupId':'1'*32,'epoch':1,'nodeId':'a'*32,'peerId':'b'*32,'ownerSpkiSha256':pin,'local':grant('local'),'peer':grant('peer'),'ownerIp':'10.77.1.16','clients':[{'ipv4':'10.77.1.16','mac':'020000000001'},{'ipv4':'10.77.1.17','mac':'020000000002'}],'forbiddenNetworks':[]}
class SetupTest(unittest.TestCase):
 def test_real_signature_and_client_scope(self):
  self.assertEqual(str(m.checked(config)[0][0]),'10.77.1.0/24')
  for change in [{'clients':[config['clients'][0],config['clients'][0]]},{'ownerIp':'10.77.2.16'},{'epoch':2},{'forbiddenNetworks':['10.0.0.0/8']}]:
   with self.assertRaises(Exception):m.checked({**config,**change})
 def test_signature_tampering(self):
  c=copy.deepcopy(config);c['local']['bodyHex']=c['local']['bodyHex'][:194]+'02'+c['local']['bodyHex'][196:]
  with self.assertRaises(Exception):m.checked(c)
 def test_first_admission_requires_fresh_clock(self):
  m.checked(config,1500)
  for now in [999,301000]:
   with self.assertRaises(ValueError):m.checked(config,now)
 def test_isolation_gate_precedes_every_mutation(self):
  calls=[];m.time.time=lambda:1.5
  def rpc(port,operation,kind):
   calls.append(operation)
   if operation=='status':return {'node':config['hardware'],'radio_started':False},b''
   if operation=='gw-provision-status':return {'hardwareNode':config['hardware'],'nodeId':config['nodeId'],'peerId':config['peerId'],'groupId':config['groupId'],'epoch':1,'ownerSpkiSha256':pin,'run':'2'*32},b''
   if operation=='gw-status':return {'ap_started':False,'storage_failed':False,'trusted_time':True},b''
   if operation=='gw-lan-status':return {'present':False,'storageFailed':False,'sharedApIsolationVerified':False},b''
   self.fail('Mutation attempted before driver safety gate')
  with self.assertRaisesRegex(RuntimeError,'isolation'):m.migrate(config,'mock',rpc)
  self.assertEqual(len(calls),4)
 def test_uncertain_mutation_never_retried(self):
  calls=[];m.time.time=lambda:1.5
  def rpc(port,operation,kind):
   calls.append(operation)
   if operation=='status':return {'node':config['hardware'],'radio_started':False},b''
   if operation=='gw-provision-status':return {'hardwareNode':config['hardware'],'nodeId':config['nodeId'],'peerId':config['peerId'],'groupId':config['groupId'],'epoch':1,'ownerSpkiSha256':pin,'run':'2'*32},b''
   if operation=='gw-status':return {'ap_started':False,'storage_failed':False,'trusted_time':True},b''
   if operation=='gw-lan-status':return {'present':False,'storageFailed':False,'sharedApIsolationVerified':True},b''
   raise TimeoutError('declared uncertain result')
  with self.assertRaises(TimeoutError):m.migrate(config,'mock',rpc)
  self.assertEqual(len(calls),5);self.assertTrue(calls[-1].startswith('gw-lan-stage '))
unittest.main(argv=['routed-lan-setup'],verbosity=2)
