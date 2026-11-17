"""Physical two-board role swap and restoration; same app image, no secret export."""
import importlib.util
import hashlib
import json
from pathlib import Path
import sys
import subprocess
import time

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'dev/firmware/tools'))
import device
from node_setup import Setup
spec=importlib.util.spec_from_file_location('install',Path(__file__).with_name('universal-usb-install.py'))
install=importlib.util.module_from_spec(spec);spec.loader.exec_module(install)
nodes=[('COM4','1cdbd47539c0'),('COM3','7ce8b1a777ec')]
report={'scope':'same-image physical radio role swap; not signed phone/control acceptance','stages':[]}
out=ROOT/'dev/artifacts/universal-role-swap.json'
def bounded(port,cmd,kind,timeout=10):
    code="import sys,json;sys.path.insert(0,sys.argv[1]);import device;r,_=device.command(sys.argv[2],sys.argv[3],sys.argv[4],float(sys.argv[5]));print(json.dumps(r))"
    raw=subprocess.check_output([sys.executable,'-c',code,str(ROOT/'dev/firmware/tools'),port,cmd,kind,str(timeout)],timeout=timeout+12,text=True)
    return json.loads(raw),b''
device.command=bounded
def save():out.write_text(json.dumps(report,indent=2)+'\n')
def command(port,cmd,kind,timeout=10):return device.command(port,cmd,kind,timeout)[0]
def inspect():
    values=[]
    for port,node in nodes:
        status=command(port,'status','status');assert status['node']==node
        image=command(port,'gw-update-status','aumanet.node-update-status.v1')
        history=command(port,'messages','messages')
        values.append({'port':port,'node':node,'role':status['role'],'image':image['imageSha256'],
          'historyHash':hashlib.sha256(json.dumps(history.get('messages',[]),sort_keys=True).encode()).hexdigest()})
    return values
def apply(roles):
    for port,node in nodes:
        assert command(port,'status','status')['node']==node
        assert command(port,'radio-autostart off','radio_autostart')['enabled'] is False
    for port,node in nodes:
        status=install.reboot(port,node);assert status['radio_started'] is False
    for (port,node),role in zip(nodes,roles):
        Setup(port,node).prepare(role,replace=True)
        assert command(port,'radio-autostart on','radio_autostart')['enabled'] is True
    for port,node in nodes:install.reboot(port,node)
    time.sleep(4)
    return inspect()
def links():
    values=[]
    for port,node in nodes:
        radio=command(port,'radio-status','radio_status')
        link=command(port,'link-test','link_result',28)
        values.append({'node':node,'interfaceUp':radio['interface_up'],'link':link})
    return values

restore_only='--restore-only' in sys.argv
if restore_only:
    report=json.loads(out.read_text())
    original=report['before']
else:
    original=inspect()
if len({v['image'] for v in original})!=1 or not original[0]['image']:raise RuntimeError('Both boards must run the same verified image')
original_roles=[v['role'] for v in original]
if set(original_roles)!={'A','B'}:raise RuntimeError('Expected complementary initial roles')
report['before']=original;save()
try:
    if not restore_only:
        swapped=apply(['B' if r=='A' else 'A' for r in original_roles])
        swapped_links=links();report['stages'].append({'stage':'swapped','nodes':swapped,'links':swapped_links});save()
        for old,new in zip(original,swapped):
            assert old['image']==new['image'] and old['historyHash']==new['historyHash']
        assert all(v['interfaceUp'] and v['link']['received']==10 for v in swapped_links)
        report['swapPassed']=True
finally:
    restored=apply(original_roles)
    restored_links=links();report['stages'].append({'stage':'restored','nodes':restored,'links':restored_links});save()
    report['restored']=all(v['interfaceUp'] and v['link']['received']==10 for v in restored_links)
    save()
print(json.dumps({'swapPassed':report.get('swapPassed',False),'restored':report['restored'],'report':str(out)}))
