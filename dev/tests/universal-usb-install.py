"""Exact-target USB first migration; writes only the existing VALID app slot.

Normal OTA remains publisher authenticated. This explicitly authorized physical
migration requires a verified same-board full backup and an exact image digest.
Never writes NVS, PHY, factory, bootloader, partition table or OTA selection data.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'dev/firmware/tools'))
import device
from node_setup import Setup
sys.path.insert(0, str(ROOT / 'dev/setup'))
from usb_bounded import command


def sha(data): return hashlib.sha256(data).hexdigest()


def checked_backup(manifest_path, node):
    manifest_path = Path(manifest_path).resolve()
    manifest = json.loads(manifest_path.read_text())
    if (manifest.get('node') != node or manifest.get('bytes') != 8388608
            or manifest.get('double_read_verified') is not True):
        raise RuntimeError('A double-read verified backup of this exact node is required')
    backup = manifest_path.parent / 'flash.bin'
    data = backup.read_bytes()
    if len(data) != 8388608 or sha(data) != manifest.get('sha256'):
        raise RuntimeError('Backup digest/size mismatch')
    return data


def reboot(port, node):
    try:
        command(port, 'reboot', 'status', timeout=5)
    except (RuntimeError, OSError):
        pass  # a reboot may lose its reply; never replay the reset command
    time.sleep(3)
    status, _ = command(port, 'status', 'status')
    if status.get('node') != node:
        raise RuntimeError('Identity changed after reboot')
    return status


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('port','expect-node','image','image-sha256','backup-manifest'):
        p.add_argument('--'+name, required=True)
    p.add_argument('--role', choices=['A','B'], required=True)
    p.add_argument('--execute', action='store_true')
    p.add_argument('--defer-field-setup', action='store_true')
    p.add_argument('--defer-radio-start', action='store_true',
                   help='Record verified flash but defer runtime hashing until explicit radio startup')
    args = p.parse_args()
    node = args.expect_node
    image = Path(args.image).resolve()
    image_data = image.read_bytes()
    if sha(image_data) != args.image_sha256:
        raise RuntimeError('Candidate image digest mismatch')
    identity = json.loads(subprocess.check_output(['node',str(ROOT/'dev/releases/release.mjs'),
        'inspect','--image',str(image)], text=True))
    if identity['role'] != 'U' or identity['privateBootstrap'] or identity['imageSha256'] != args.image_sha256:
        raise RuntimeError('Only a checked generic universal application image is permitted')
    backup = checked_backup(args.backup_manifest,node)
    before, _ = command(args.port,'status','status')
    if before.get('node') != node or before.get('role') != args.role:
        raise RuntimeError('Unexpected running device identity/role')
    old, _ = command(args.port,'gw-update-status','aumanet.node-update-status.v1')
    offset = old.get('partitionOffset')
    if (offset not in (0x310000,0x550000) or old.get('pendingVerification') is not False
            or old.get('bootState') != 2 or not old.get('imageBytes')):
        raise RuntimeError('Only the existing VALID OTA application slot may be migrated')
    old_bytes = old['imageBytes']
    if sha(backup[offset:offset+old_bytes]) != old.get('imageSha256'):
        raise RuntimeError('Backup does not contain the reported current application')
    plan = {'node':node,'port':args.port,'offset':hex(offset),'imageSha256':args.image_sha256,
            'bytes':len(image_data),'previous':old,'role':args.role}
    if not args.execute:
        print(json.dumps({'plan':plan,'executed':False})); return
    directory = ROOT/'dev/artifacts/universal-install'/f'{time.time_ns()}-{node}'
    directory.mkdir(parents=True,exist_ok=False)
    staged = directory/'application.bin'
    staged.write_bytes(image_data)
    (directory/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
    device.identify(args.port,node)
    device.esptool(args.port,'write_flash',hex(offset),staged)
    device.esptool(args.port,'verify_flash',hex(offset),staged)
    time.sleep(3)
    fresh, _ = command(args.port,'status','status')
    if fresh.get('node') != node or fresh.get('firmware') != identity['version']:
        raise RuntimeError('New firmware identity not observed')
    # No valid profile may silently adopt the old compile-time role.
    profile, _ = command(args.port,'node-profile','node_profile')
    initial_profile = profile.copy()
    if profile.get('state') == 'unprovisioned' and fresh.get('radio_started') is not False:
        raise RuntimeError('Unprovisioned universal node started radio')
    prepared = Setup(args.port,node,transport=command).prepare(args.role)
    if prepared.get('pendingReboot') or profile.get('state') == 'unprovisioned':
        reboot(args.port,node)
    final, _ = command(args.port,'status','status')
    profile, _ = command(args.port,'node-profile','node_profile')
    update, _ = command(args.port,'gw-update-status','aumanet.node-update-status.v1')
    needs_provision = False
    needs_radio = (args.defer_radio_start and update.get('imageSha256') is None
                   and update.get('imageBytes') == 0 and final.get('radio_started') is False
                   and final.get('radio_autostart') is False and update.get('bootState') == 2
                   and update.get('pendingVerification') is False and update.get('partitionOffset') == offset)
    if args.defer_field_setup and update.get('imageSha256') is None:
        admission, _ = command(args.port,'gw-provision-status','gateway_admission')
        gateway, _ = command(args.port,'gw-status','status')
        needs_provision = (admission.get('hardwareNode') == node and admission.get('state') == 'ready'
                           and admission.get('controlIngressReady') is False and gateway.get('ap_started') is False)
    if (final.get('node') != node or final.get('role') != args.role
            or profile.get('state') != 'ready' or profile.get('pending_reboot') is not False
            or update.get('version') != identity['version'] or update.get('buildId') != identity['buildId']
            or (update.get('imageSha256') != args.image_sha256 and not needs_provision and not needs_radio)):
        raise RuntimeError('Installed image/profile verification failed; inspect exact-node recovery backup')
    report={'plan':plan,'initialUniversalStatus':fresh,'initialProfile':initial_profile,
            'finalStatus':final,'finalProfile':profile,'finalUpdate':update,'flashVerified':True,
            'verified':not needs_provision and not needs_radio,'awaitingFieldSetup':needs_provision,'awaitingRadioStart':needs_radio}
    (directory/'result.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'verified':not needs_provision and not needs_radio,'flashVerified':True,'awaitingFieldSetup':needs_provision,
                     'awaitingRadioStart':needs_radio,
                     'node':node,'imageSha256':args.image_sha256,'result':str(directory/'result.json')}))


if __name__ == '__main__': main()
