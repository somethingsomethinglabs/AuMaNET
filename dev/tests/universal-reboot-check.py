"""One controlled member-node reset; verify retained public scope and image."""
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'setup'))
from usb_bounded import command

expected = 'c02f4071473b64e3ccd8671baf6cf704b5104a49d25d2af45ef0c9e59fa8efb4'
out = Path('dev/artifacts/universal-reboot-final.json')
pair = json.loads(Path('dev/artifacts/universal-role-pair-config.json').read_text(encoding='utf-8-sig'))
node = pair['nodes'][1]

def snapshot():
    status, _ = command(node['port'], 'status', 'status')
    admission, _ = command(node['port'], 'gw-provision-status', 'gateway_admission')
    profile, _ = command(node['port'], 'node-profile', 'node_profile')
    image, _ = command(node['port'], 'gw-update-status', None)
    if status.get('node') != node['hardware'] or admission.get('nodeId') != node['node']:
        raise RuntimeError('Unexpected physical target')
    return dict(status=status, admission=admission, profile=profile, image=image)

before = snapshot()
if before['image'].get('imageSha256') != expected:
    raise RuntimeError('Unexpected starting firmware')
try:
    command(node['port'], 'reboot', 'status')
except RuntimeError:
    pass  # Reset has no reliable USB acknowledgement; never replay it.
deadline = time.monotonic() + 60
after = None
while time.monotonic() < deadline:
    try:
        candidate = snapshot()
        if candidate['admission']['run'] != before['admission']['run']:
            after = candidate
            break
    except RuntimeError:
        pass
    time.sleep(.5)
report = dict(schema='aumanet.universal-reboot-evidence.v1', before=before, after=after, passed=False)
if after:
    stable = ('hardwareNode', 'groupId', 'epoch', 'nodeId', 'peerId', 'peerMac', 'ownerSpkiSha256', 'controlIngress')
    report['passed'] = (
        all(before['admission'].get(k) == after['admission'].get(k) for k in stable)
        and after['image'].get('imageSha256') == expected
        and after['image'].get('pendingVerification') is False
        and after['profile'].get('runtime_role') == 'B'
        and after['profile'].get('pending_reboot') is False
        and after['status'].get('message_storage_ready') is True)
out.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(passed=report['passed'], hardware=node['hardware'], report=str(out))))
if not report['passed']:
    raise SystemExit(1)
