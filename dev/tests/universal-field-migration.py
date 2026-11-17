"""Explicitly migrate known two-node control ingress and rearm checked local access."""
import importlib.util
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'dev/setup'))
sys.path.insert(0,str(ROOT/'dev/firmware/tools'))
from usb_bounded import command
import control_ingress
import device
spec=importlib.util.spec_from_file_location('install',Path(__file__).with_name('universal-usb-install.py'))
install=importlib.util.module_from_spec(spec);spec.loader.exec_module(install)
device.command=command
nodes=json.loads((ROOT/'dev/artifacts/universal-pair.json').read_text())['nodes']
ingress='7629190f35d807d250e92bdfe5eaa83f'
expected='ad71cf943d872c479b74687f196a9857398400d15ed95d4d1636246bc66900c9'
report=[]
def rpc(n,op,kind):return command(n['port'],op,kind)[0]
for n in nodes:
    status=rpc(n,'status','status')
    if status['node']!=n['hardware'] or status['firmware']!='0.7.0-universal.2':raise RuntimeError('Unexpected target')
    if not rpc(n,'radio-autostart off','radio_autostart')['enabled'] is False:raise RuntimeError('Cannot stop next-boot radio')
for n in nodes:
    if install.reboot(n['port'],n['hardware'])['radio_started'] is not False:raise RuntimeError('Radio not stopped')
for n in nodes:
    print(json.dumps({'node':n['hardware'],'stage':'migrating-ingress'}),flush=True)
    migration=control_ingress.migrate(n['port'],n['hardware'],n['group'],n['epoch'],n['node'],n['ownerSpki'],ingress,command)
    current=rpc(n,'gw-provision-status','gateway_admission')
    acquired=rpc(n,f"gw-acquisition {current['run']} {n['phoneMac']}\ngw-status",'status')
    if not acquired['acquisition_configured'] or acquired['acquisition_storage_failed']:raise RuntimeError('Acquisition not confirmed')
    field=rpc(n,f"gw-field {current['run']} on",'field_permission')
    if not field['accepted'] or not field['enabled'] or field['storage_failed']:raise RuntimeError('Field rearm not confirmed')
    if not rpc(n,'radio-autostart on','radio_autostart')['enabled']:raise RuntimeError('Autostart not confirmed')
    report.append({'hardware':n['hardware'],'ingress':migration,'field':field})
for n in nodes:install.reboot(n['port'],n['hardware'])
for n,row in zip(nodes,report):
    row['status']=rpc(n,'status','status')
    row['gateway']=rpc(n,'gw-status','status')
    row['update']=rpc(n,'gw-update-status','aumanet.node-update-status.v1')
    if row['update']['imageSha256']!=expected:raise RuntimeError('Running image hash mismatch')
(ROOT/'dev/artifacts/universal-field-migration.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'verified':True,'nodes':len(report),'imageSha256':expected}))
