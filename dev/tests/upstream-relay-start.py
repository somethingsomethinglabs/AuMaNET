"""Explicit two-device native relay trial after guarded install/mode opt-in."""
import json
import argparse
from pathlib import Path
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'setup'))
from usb_bounded import command

nodes = json.loads(Path('dev/artifacts/universal-role-pair-config.json').read_text(encoding='utf-8-sig'))['nodes']
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--version',default='0.8.0-upstream.3')
p.add_argument('--out',type=Path,default=Path('dev/artifacts/upstream-relay-start.json'))
args=p.parse_args()
out = args.out
report = dict(schema='aumanet.upstream-relay-start.v1',passed=False,automaticRecoveryIntegrated=False,events=[])
def record(stage, n, value):
    report['events'].append(dict(stage=stage,hardware=n['hardware'],value=value))
    out.write_text(json.dumps(report,indent=2)+'\n')
def checked(n):
    status,_=command(n['port'],'status','status')
    if status.get('node')!=n['hardware'] or status.get('firmware')!=args.version:
        raise RuntimeError('Unexpected physical target or image version')
    return status
def reboot(n):
    before,_=command(n['port'],'gw-provision-status','gateway_admission')
    try: command(n['port'],'reboot','status')
    except RuntimeError: pass
    for attempt in range(8):
        try:
            status=checked(n)
            after,_=command(n['port'],'gw-provision-status','gateway_admission')
            if after['run']!=before['run']:
                record('fresh-boot',n,dict(status=status,run=after['run']))
                return
        except RuntimeError: pass
        time.sleep(.5)
    raise RuntimeError('Fresh boot unconfirmed; reset not replayed')
try:
    for n in nodes:
        s=checked(n)
        mode,_=command(n['port'],'relay-mode','relay_mode')
        if s['radio_autostart'] or s['radio_started'] or not mode['enabled']:
            raise RuntimeError('Expected exact stopped pending opt-in checkpoint')
        if mode['pendingReboot']: reboot(n)
        mode,_=command(n['port'],'relay-mode','relay_mode')
        if not mode['runtimeEnabled'] or mode['pendingReboot'] or not mode['rfAllowed']:
            raise RuntimeError('Persisted relay opt-in did not load')
    for n in nodes:
        record('requesting-radio-once',n,{})
        try: command(n['port'],'radio-start','radio_started',timeout=35)
        except RuntimeError: pass  # Observe outcome; never replay startup.
        status=checked(n)
        record('manual-radio-readback',n,status)
        if status['radio_started'] is not True:
            raise RuntimeError('Native relay startup unconfirmed; untouched boot required for recovery')
    for i,n in enumerate(nodes):
        expected='root' if i==0 else 'repeater'
        for attempt in range(24):
            state,_=command(n['port'],'relay-status','relay_status')
            record('actual-sdk-state',n,state)
            if state['state']==expected and state['depth']==i: break
            time.sleep(.5)
        else: raise RuntimeError('Expected native ROOT/REPEATER state unavailable')
    for n in nodes:
        try: command(n['port'],'radio-autostart on','radio_autostart')
        except RuntimeError: pass
        if checked(n)['radio_autostart'] is not True:
            raise RuntimeError('Autostart write unconfirmed')
    # Startup order now exercises the ordinary boot/field-resume path too.
    for n in nodes: reboot(n)
    report['passed']=True
finally:
    out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(passed=report['passed'],report=str(out))))
