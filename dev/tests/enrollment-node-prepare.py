"""Explicit two-node acceptance setup. No erasure, role change or private key export."""
import hashlib,json,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'dev/setup'))
from usb_bounded import command
from membership_epoch import migrate
BASE=ROOT/'dev/artifacts/fresh-enrollment-20261116'
nodes=[dict(label='A',port='COM4',hardware='1cdbd47539c0',phone='owner'),dict(label='B',port='COM3',hardware='7ce8b1a777ec',phone='member')]
def read(name,private=False):return json.loads((BASE/('private' if private else '')/(name+'.json')).read_text())
def observe(n):
    status=command(n['port'],'status','status')[0]
    if status['node']!=n['hardware']:raise RuntimeError('Wrong physical target')
    admission=command(n['port'],'gw-provision-status','gateway_admission')[0]
    public=command(n['port'],f'gw-key {admission["run"]} public','node_public')[0]
    checked=read('owner-config',True)['config'];expected=next(x for x in checked['nodes'] if x['id']==admission['nodeId'])
    if not public['available'] or public['pin'].upper()!=expected['publicKeySha256'].upper():raise RuntimeError('Node private identity was not retained')
    return dict(**n,status=status,admission=admission,public=public,image=command(n['port'],'gw-update-status','aumanet.node-update-status.v1')[0])
action=sys.argv[1]
if action=='prepare':
    n=next(x for x in nodes if x['label']==sys.argv[2]);a=read('authority-public');s=observe(n);old=read('before')[0]['group']['group']['epoch'];new=a['scope']['epoch']
    if s['status']['firmware']!='0.9.1-enrollment.1':raise RuntimeError('Install checked enrollment candidate first')
    result=migrate(n['port'],n['hardware'],a['scope']['groupId'],s['admission']['nodeId'],a['publicKeySha256'].lower(),old,new,True)
    profile=read(n['phone']+'-profile',True)['profile'];g=command(n['port'],'gw-status','status')[0]
    configured=command(n['port'],f'gw-acquisition {g["run"]} {profile["mac"]}\ngw-status','status')[0]
    if configured['acquisition_configured'] is not True:raise RuntimeError('Checked acquisition not confirmed')
    field=command(n['port'],f'gw-field {g["run"]} on','field_permission')[0]
    if field['accepted'] is not True or field['enabled'] is not True:raise RuntimeError('Field permission not confirmed')
    (BASE/f'prepare-{n["label"]}.json').write_text(json.dumps(dict(migration=result,observed=observe(n)),indent=2));print(json.dumps(result))
elif action=='start':
    for n in nodes:
        s=observe(n)
        if s['status']['firmware']!='0.9.1-enrollment.1' or s['admission']['epoch']!=read('authority-public')['scope']['epoch']:raise RuntimeError('Expected prepared candidate and membership epoch')
        if command(n['port'],'radio-autostart on','radio_autostart')[0]['enabled'] is not True:raise RuntimeError()
    for n in nodes:
        try:command(n['port'],'reboot','status',5)
        except RuntimeError:pass
    time.sleep(4)
    values=[observe(n) for n in nodes];expected=hashlib.sha256((ROOT/'dev/artifacts/windows-upstream/U/aumanet_bench.bin').read_bytes()).hexdigest()
    for s in values:
        if s['image']['imageSha256']!=expected or s['image']['bootState']!=2 or s['admission']['epoch']!=read('authority-public')['scope']['epoch']:raise RuntimeError('Running image/epoch not confirmed')
    (BASE/'node-readback.json').write_text(json.dumps(values,indent=2));print(json.dumps(dict(started=True,imageSha256=expected,identitiesRetained=True)))
elif action=='readback':
    values=[observe(n) for n in nodes];(BASE/'node-readback.json').write_text(json.dumps(values,indent=2));print(json.dumps([dict(hardware=n['hardware'],image=n['image'],epoch=n['admission']['epoch']) for n in values]))
else:raise ValueError('Use prepare A|B, start or readback')
