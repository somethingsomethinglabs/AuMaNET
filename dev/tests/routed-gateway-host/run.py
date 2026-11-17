"""Production routed C policy and exact NVS methods, real Windows CNG crypto.

Run native-gateway-issuer.mjs first; --fixtures is that run's directory.
Network/pbuf/clock/NVS are declared host adapters, not hardware evidence.
"""
import argparse,hashlib,json,subprocess
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--cc',type=Path,required=True);p.add_argument('--fixtures',type=Path,required=True)
p.add_argument('--output',type=Path,default=Path('dev/artifacts/routed-multi-device/c-host'))
a=p.parse_args();root=Path(__file__).resolve().parents[3];test=Path(__file__).resolve().parent;fw=root/'dev/firmware';out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
inputs=[*(test.rglob('*.h')),*(test.glob('*.c')),Path(__file__),fw/'gateway/gateway.c',fw/'gateway/routed_lan.c',fw/'main/gateway_lan.inc',*(fw/'gateway/include').glob('*.h')]
fixtures=[a.fixtures/name for name in ('owner.der','lan-local.bin','lan-peer.bin','lan-local.sig','lan-peer.sig','packet-0.bin','packet-1.bin','packet-2.bin','renewal-0.bin','renewal-1.bin','renewal-2.bin')]
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
before={str(f.relative_to(root)):sha(f) for f in inputs};report={'physical':False,'sourceSha256':before,'fixturesSha256':{f.name:sha(f) for f in fixtures},'results':[],'status':'running'}
try:
 for name in ('GatewayRoutedTest','GatewayLanStoreTest'):
  exe=out/(name+'.exe');sources=[test/(name+'.c'),test/'crypto_bcrypt.c',fw/'gateway/routed_lan.c']
  if name=='GatewayRoutedTest':sources.append(fw/'gateway/gateway.c')
  cmd=[str(a.cc),'cc','-std=c11','-Wall','-Wextra','-Werror','-Wno-unused-function','-Wno-misleading-indentation','-I',str(test),'-I',str(fw/'gateway/include'),'-I',str(fw/'main'),*map(str,sources),'-lbcrypt','-o',str(exe)]
  subprocess.run(cmd,check=True,capture_output=True,text=True,timeout=90)
  value=subprocess.check_output([str(exe),str(a.fixtures.resolve())],text=True,stderr=subprocess.STDOUT,timeout=30)
  (out/(name+'.log')).write_text(value);result=json.loads(value.splitlines()[-1]);assert result['status']=='pass' and result['physical'] is False
  report['results'].append({'name':name,**result,'binarySha256':sha(exe)})
 assert all(before[str(f.relative_to(root))]==sha(f) for f in inputs)
 report['status']='pass'
except Exception as e:
 report['status']='fail';report['error']=str(e)
 if isinstance(e,subprocess.CalledProcessError):report['diagnostics']=(e.stdout or '')+(e.stderr or '')
 raise
finally:
 (out/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':report['status'],'physical':False,'suites':len(report['results']),'result':str(out/'result.json')}))
