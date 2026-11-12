"""Generate public, bounded embedded build identity; never reads private profiles."""
import hashlib,json,os,re,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]);role=sys.argv[2]
head=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip().lower()
commit=(os.getenv('AUMANET_RELEASE_COMMIT') or head).lower()
if commit!=head:raise SystemExit('Release commit must match the actual source checkout')
ref=os.getenv('AUMANET_RELEASE_REF','workspace')
digest=hashlib.sha256()
for p in sorted(root.rglob('*')):
 if p.is_file() and '__pycache__' not in p.parts:
  digest.update(p.relative_to(root).as_posix().encode()+b'\0');digest.update(p.read_bytes())
build=os.getenv('AUMANET_RELEASE_BUILD_ID','local-'+role+'-'+digest.hexdigest()[:24])
version=os.getenv('AUMANET_RELEASE_VERSION','0.6.0-gateway.15')
if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._+\-]{0,30}',version):raise SystemExit('Invalid firmware version')
if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/+\-]*',ref) or '..' in ref or '//' in ref or ref.endswith(('/','.')):raise SystemExit('Invalid Git ref')
channel=os.getenv('AUMANET_RELEASE_CHANNEL','nightly')
if channel not in ('stable','beta','nightly','branch'):raise SystemExit('Invalid firmware release channel')
dirty=bool(subprocess.call(['git','-C',str(root),'diff','--quiet','HEAD','--']) or subprocess.check_output(['git','-C',str(root),'ls-files','--others','--exclude-standard','--','dev/firmware'],text=True).strip())
if dirty and channel in ('stable','beta'):raise SystemExit('Dirty source cannot claim stable or beta')
if role not in ('A','B') or not re.fullmatch('[0-9a-fA-F]{40}',commit):raise SystemExit('Invalid firmware build identity')
for value,limit in [(ref,127),(build,63)]:
 if not value or len(value)>limit or any(ord(c)<33 or ord(c)>126 or c in '\\~^:?*[' for c in value):raise SystemExit('Invalid public build label')
profile=bytes.fromhex('97df7dda585403a213a2f5ea743a071bb926f93f502837ed8a8518f7d7ccdf4d')
arr=lambda b:','.join(str(v) for v in b)
out.write_text('#pragma once\n#define GO_COMMIT_BYTES {'+arr(bytes.fromhex(commit))+'}\n#define GO_REF '+json.dumps(ref)+'\n#define GO_BUILD '+json.dumps(build)+'\n#define GO_VERSION '+json.dumps(version)+'\n#define GO_PROFILE_BYTES {'+arr(profile)+'}\n#define GO_CHANNEL '+str(('stable','beta','nightly','branch').index(channel))+'\n#define GO_DIRTY '+str(int(dirty))+'\n')
