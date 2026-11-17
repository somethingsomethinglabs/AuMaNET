"""Actual C transport and extracted exact OTA admission functions; no devices."""
import argparse,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser();p.add_argument('--cc',required=True);p.add_argument('--output',default='dev/artifacts/owner-ingress-host');a=p.parse_args()
out=(root/a.output).resolve();out.mkdir(parents=True,exist_ok=True)
fw=root/'dev/firmware';test=Path(__file__).resolve().parent
files=[fw/'gateway'/name for name in ('boot_transport.c','boot_recovery.c','radio_control.c','radio_profile.c')]
inputs=files+[fw/'main/gateway_ota.c',fw/'main/gateway_ota.h',fw/'gateway/ota.c',test/'ingress_test.c',test/'ota_relay_test.c.in',Path(__file__)]
inputs += [fw/'gateway/include'/name for name in ('aumanet_boot_transport.h','aumanet_boot_recovery.h','aumanet_radio_control.h','aumanet_radio_profile.h','aumanet_ota.h')]
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
before={str(path.relative_to(root)):sha(path) for path in inputs}
def run(args):return subprocess.check_output([str(v) for v in args],text=True,stderr=subprocess.STDOUT,timeout=90)
def function(source,name):
 start=source.index(name);at=source.index('{',start);depth=0
 for i in range(at,len(source)):
  if source[i]=='{':depth+=1
  elif source[i]=='}':
   depth-=1
   if not depth:return source[start:i+1]
 raise RuntimeError('Missing function end')
source=(fw/'main/gateway_ota.c').read_text()
struct=source[source.index('struct relay_state {'):source.index('static struct relay_state relay;')+len('static struct relay_state relay;')]
budget_start=source.index('struct receive_budget {');budget=source[budget_start:source.index('};',budget_start)+2]
production=struct+'\n'+budget+'\n'+'\n'.join(function(source,name) for name in ('static int same_endpoint(','static int relay_packet(','static int ingress_scope(','static int ingress_source(','static int peer_report_source(','static int receive_budget_take('))
generated=out/'ota_relay_test.c';generated.write_text((test/'ota_relay_test.c.in').read_text().replace('@@PRODUCTION@@',production))
report={'scope':'Production C boot/radio transports and exact extracted OTA admission/relay functions, fake crypto/clock adapters; not RF, ESP persistence or cryptographic acceptance','sourceSha256':before}
try:
 common=[a.cc,'cc','-std=c11','-Wall','-Wextra','-Werror','-I',fw/'gateway/include','-I',fw/'main']
 transport=out/'transport.exe';run(common+[test/'ingress_test.c',*files,'-o',transport]);report['transport']=run([transport]).strip()
 ota=out/'ota.exe';run(common+[generated,fw/'gateway/ota.c','-lws2_32','-o',ota]);report['ota']=run([ota]).strip()
 for path in inputs:
  if before[str(path.relative_to(root))]!=sha(path):raise RuntimeError('Sources changed during test')
 report['status']='pass'
except Exception as error:
 report['status']='fail';report['error']=str(error);raise
finally:
 (out/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
