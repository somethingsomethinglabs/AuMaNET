"""Public provenance generator checks in an isolated local Git fixture."""
import argparse,hashlib,json,os,shutil,subprocess,tempfile
from pathlib import Path
repo=Path(__file__).resolve().parents[3];source=repo/'dev/firmware/tools/ota_build_meta.py'
p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
fixture=Path(tempfile.mkdtemp(prefix='git-fixture-',dir=out));fw=fixture/'dev/firmware';(fw/'tools').mkdir(parents=True);script=fw/'tools/ota_build_meta.py';shutil.copy2(source,script);code=fw/'example.c';code.write_text('public source version one\n')
def git(*args):return subprocess.check_output(['git','-C',str(fixture),*args],text=True,stderr=subprocess.STDOUT)
git('init','-q');git('add','.');git('-c','user.name=OTA fixture','-c','user.email=fixture@invalid','commit','-qm','Fixture')
head=git('rev-parse','HEAD').strip();base={k:v for k,v in os.environ.items() if not k.startswith('AUMANET_RELEASE_')};header=out/'metadata.h';checks=0
def generate(extra={},good=True):
 global checks
 env=dict(base,**extra);result=subprocess.run(['python3',str(script),str(header),'A'],env=env,text=True,capture_output=True);checks+=1
 if (result.returncode==0)!=good:raise AssertionError('Provenance policy returned an unexpected outcome: '+result.stderr)
 return header.read_text() if good else ''
first=generate({'AUMANET_RELEASE_COMMIT':head,'AUMANET_RELEASE_CHANNEL':'stable','AUMANET_RELEASE_VERSION':'0.6.0-ci-test'})
assert '#define GO_DIRTY 0' in first and '#define GO_CHANNEL 0' in first and '#define GO_VERSION "0.6.0-ci-test"' in first;checks+=3
generate({'AUMANET_RELEASE_COMMIT':'0'*40},False)
code.write_text('public source version two\n');second=generate();assert '#define GO_DIRTY 1' in second;checks+=1
code.write_text('public source version three\n');third=generate();assert next(x for x in second.splitlines() if x.startswith('#define GO_BUILD '))!=next(x for x in third.splitlines() if x.startswith('#define GO_BUILD '));checks+=1
for channel in ('stable','beta'):generate({'AUMANET_RELEASE_CHANNEL':channel},False)
for ref in ('.bad','main..old','main//old','main/','main.','main;bad'):generate({'AUMANET_RELEASE_REF':ref},False)
generate({'AUMANET_RELEASE_REF':'feature/safe+test-1','AUMANET_RELEASE_CHANNEL':'branch'})
generate({'AUMANET_RELEASE_VERSION':'invalid;version'},False)
report={'status':'pass','testCount':1,'assertionCount':checks,'sourceSha256':{str(source.relative_to(repo)):hashlib.sha256(source.read_bytes()).hexdigest(),str(Path(__file__).relative_to(repo)):hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},'scope':'Actual public metadata generator against isolated real Git HEAD/source changes; no device or publisher secret'}
(out/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
