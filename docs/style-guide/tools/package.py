from pathlib import Path
import hashlib,json,zipfile,re
root=Path(__file__).resolve().parent.parent
excluded={'PACKAGE-MANIFEST.json','AuMaNET-design-handover.zip'}
files=sorted(p for p in root.rglob('*') if p.is_file() and p.relative_to(root).as_posix() not in excluded)
manifest={'version':'1.0','sourceCommit':'83600e761ad7440bac5603987bedafd258159c42','excludedFromHashList':sorted(excluded),'files':[{'path':p.relative_to(root).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(root/'PACKAGE-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8',newline='\n')
with zipfile.ZipFile(root/'AuMaNET-design-handover.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in files+[root/'PACKAGE-MANIFEST.json']:z.write(p,p.relative_to(root).as_posix())
with zipfile.ZipFile(root/'AuMaNET-design-handover.zip') as z:
    assert z.testzip() is None
    assert 'index.html' in z.namelist() and 'AuMaNET-design-handover.pdf' in z.namelist()
    assert len([n for n in z.namelist() if n.startswith('screenshots/') and n.endswith('.jpg')])==27
    for f in manifest['files']:assert hashlib.sha256(z.read(f['path'])).hexdigest()==f['sha256']
text=(root/'index.html').read_text(encoding='utf8');bad=[]
for rel in re.findall(r'(?:href|src)="([^"]+)"',text):
    if rel.startswith('#') or '://' in rel:continue
    if not (root/rel.split('#')[0]).exists():bad.append(rel)
assert not bad,bad
print(json.dumps({'files':len(files)+1,'screenshots':27,'zipBytes':(root/'AuMaNET-design-handover.zip').stat().st_size,'hashesVerified':len(files),'brokenGuideLinks':bad}))
