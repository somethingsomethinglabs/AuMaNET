"""Read-only exact-image checks; optional bounded direct echo/relay assertions."""
import argparse
import json
from pathlib import Path
import re
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'setup'))
from usb_bounded import command

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--image-sha256', required=True)
p.add_argument('--out', type=Path, required=True)
p.add_argument('--links', action='store_true')
p.add_argument('--native-relay', action='store_true')
args = p.parse_args()
if not re.fullmatch('[a-f0-9]{64}', args.image_sha256):
    raise ValueError('Exact image digest required')
pair = json.loads(Path('dev/artifacts/universal-role-pair-config.json').read_text(encoding='utf-8-sig'))
report = dict(schema='aumanet.upstream-usb-evidence.v1', imageSha256=args.image_sha256, passed=False, nodes=[])
args.out.parent.mkdir(parents=True, exist_ok=True)

def save():
    args.out.write_text(json.dumps(report, indent=2) + '\n')

try:
    for n in pair['nodes']:
        row = dict(hardware=n['hardware'])
        report['nodes'].append(row)
        for key, operation, kind in [('status','status','status'),('profile','node-profile','node_profile'),
                                      ('admission','gw-provision-status','gateway_admission'),
                                      ('gateway','gw-status','status'),('image','gw-update-status',None),
                                      ('radio','radio-status','radio_status'),('mode','relay-mode','relay_mode'),
                                      ('relay','relay-status','relay_status')]:
            row[key], _ = command(n['port'], operation, kind)
            save()
        if (row['status'].get('node') != n['hardware'] or row['admission'].get('nodeId') != n['node']
                or row['admission'].get('groupId') != n['group'] or row['admission'].get('epoch') != n['epoch']
                or row['admission'].get('ownerSpkiSha256') != n['ownerSpki']
                or row['image'].get('imageSha256') != args.image_sha256
                or row['image'].get('pendingVerification') is not False
                or row['image'].get('bootState') != 2
                or row['status'].get('message_storage_ready') is not True
                or row['profile'].get('pending_reboot') is not False
                or row['relay'].get('relayCompiled') is not True):
            raise RuntimeError('Retained scope, image health, storage or compiled capability mismatch')
        if args.native_relay:
            expected = 'station' if row['profile'].get('runtime_role') == 'B' else 'root'
            # STA mode without a running AP does not prove a repeater.
            if expected == 'station': expected = 'repeater'
            if (row['relay'].get('state') != expected
                    or row['relay'].get('depth') != (1 if expected == 'repeater' else 0)
                    or expected == 'repeater' and row['relay'].get('staState') != 2):
                raise RuntimeError('Native relay state mismatch')
    # Verify BOTH endpoints before probing either direction. Starting the radio
    # does not mean the peer's asynchronous association has completed.
    if args.links:
        for n,row in zip(pair['nodes'],report['nodes']):
            row['link'], _ = command(n['port'], 'link-test', 'link_result', timeout=30)
            save()
            if row['link'].get('sent') != 10 or row['link'].get('received') != 10:
                raise RuntimeError('Direct path did not pass')
    report['passed'] = True
finally:
    save()
print(json.dumps(dict(passed=True, report=str(args.out))))
