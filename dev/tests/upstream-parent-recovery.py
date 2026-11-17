"""Controlled root outage/return; measures SDK recovery, not root election."""
import json
from pathlib import Path
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'setup'))
from usb_bounded import command
nodes=json.loads(Path('dev/artifacts/universal-role-pair-config.json').read_text(encoding='utf-8-sig'))['nodes']
root,child=nodes
out=Path('dev/artifacts/upstream-parent-recovery.json')
report=dict(schema='aumanet.upstream-parent-recovery.v1',passed=False,rootElectionTested=False,events=[])
def save(stage,n,v):
    report['events'].append(dict(stage=stage,hardware=n['hardware'],value=v))
    out.write_text(json.dumps(report,indent=2)+'\n')
def status(n):
    s,_=command(n['port'],'status','status')
    if s['node']!=n['hardware'] or s['firmware']!='0.8.0-upstream.3': raise RuntimeError('Wrong target/image')
    return s
def automatic(n,wanted):
    if status(n)['radio_autostart']!=wanted:
        try: command(n['port'],'radio-autostart '+('on' if wanted else 'off'),'radio_autostart')
        except RuntimeError: pass
    s=status(n)
    if s['radio_autostart']!=wanted: raise RuntimeError('Autostart outcome unconfirmed')
    save('autostart-readback',n,s)
def reboot(n):
    before,_=command(n['port'],'gw-provision-status','gateway_admission')
    try: command(n['port'],'reboot','status')
    except RuntimeError: pass
    for _ in range(8):
        try:
            s=status(n)
            a,_=command(n['port'],'gw-provision-status','gateway_admission')
            if a['run']!=before['run']:
                save('fresh-boot',n,dict(status=s,run=a['run']))
                return
        except RuntimeError: pass
        time.sleep(.5)
    raise RuntimeError('Boot unconfirmed; reboot not replayed')

root_stopped=False
loss=False
try:
    status(root);status(child)
    child_before,_=command(child['port'],'gw-provision-status','gateway_admission')
    automatic(root,False)
    root_stopped=True
    try:
        reboot(root)
        if status(root)['radio_started']: raise RuntimeError('Root did not remain off')
        loss=False
        for _ in range(16):
            s,_=command(child['port'],'relay-status','relay_status')
            save('parent-absent',child,s)
            if s['state']=='station' and s['staState']!=2:
                loss=True
                break
            time.sleep(.5)
        report['lossObserved']=loss
    finally:
        # Explicit restoration phase; each write is reconciled, not retried.
        automatic(root,True)
        reboot(root)
        root_stopped=False
    recovered=False
    for _ in range(32):
        s,_=command(child['port'],'relay-status','relay_status')
        save('parent-returned',child,s)
        if s['state']=='repeater' and s['depth']==1 and s['staState']==2:
            recovered=True
            break
        time.sleep(.5)
    child_after,_=command(child['port'],'gw-provision-status','gateway_admission')
    root_state,_=command(root['port'],'relay-status','relay_status')
    report.update(recovered=recovered,childBootUnchanged=child_before['run']==child_after['run'],rootState=root_state)
    report['passed']=(loss and recovered and report['childBootUnchanged'] and root_state['state']=='root')
finally:
    report['rootRestorationUnconfirmed']=root_stopped
    out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(passed=report['passed'],report=str(out))))
if not report['passed']: raise SystemExit(1)
