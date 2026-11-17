"""Physical USB phone/node DHCP regression. Never changes node authorization.

Requires adb, Node.js, pyserial and USB WebView debugging for the installed app.
Wi-Fi reconnects and optional node reboot are real disruptive bench operations.
"""
import argparse
import datetime
import json
import re
import shlex
import subprocess
import time
from pathlib import Path

import serial
from device import command


def verified_app_connection(record):
    # The current Network layout places Connected before Your node on separate
    # lines. Native verified/attached state is stronger than label ordering.
    trusted=record.get('trusted',{})
    return (trusted.get('schema')=='aumanet.trusted-connection.v1'
            and trusted.get('source')=='device' and trusted.get('state')=='connected'
            and trusted.get('attachmentAvailable') is True
            and trusted.get('configuration')=='ready'
            and isinstance(trusted.get('runId'),str)
            and re.fullmatch('[a-f0-9]{32}',trusted['runId']) is not None
            and trusted.get('errorCode')=='')


def verified_image(record, expected_sha256, expected_build_id):
    return (record.get('schema') == 'aumanet.node-update-status.v1'
            and record.get('imageSha256') == expected_sha256
            and record.get('buildId') == expected_build_id
            and record.get('pendingVerification') is False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adb', required=True)
    parser.add_argument('--serial', required=True, help='USB Android serial')
    parser.add_argument('--port', required=True, help='USB node console')
    parser.add_argument('--node', required=True, help='Expected 12-hex hardware node')
    parser.add_argument('--mac', required=True, help='Checked per-SSID phone MAC')
    parser.add_argument('--ip', required=True, help='Expected DHCP IPv4 address')
    parser.add_argument('--ssid', required=True, help='Expected checked node SSID')
    parser.add_argument('--image-sha256', required=True, help='SHA-256 of exact installed candidate binary')
    parser.add_argument('--build-id', required=True, help='Expected embedded candidate build identity')
    parser.add_argument('--mode', choices=['app', 'saved'], default='app')
    parser.add_argument('--credentials', type=Path, help='Private saved-network diagnostic only')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--cycles', type=int, default=3)
    parser.add_argument('--reboot', action='store_true')
    parser.add_argument('--soak', type=int, default=30)
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{64}', args.image_sha256) or not re.fullmatch('[A-Za-z0-9._-]{1,63}', args.build_id):
        parser.error('Expected lowercase SHA-256 and safe exact build identity')
    if args.cycles < 3 or args.soak < 30:
        parser.error('Acceptance requires at least three reconnects and 30 seconds stable')
    mac = args.mac.replace(':', '').lower()
    if not re.fullmatch('[0-9a-f]{12}', mac) or not re.fullmatch('[0-9a-f]{12}', args.node):
        parser.error('Invalid checked hardware node or phone MAC')
    report = {'schema': 'aumanet.phone-dhcp-test.v1', 'startedUtc':
              datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'phone': args.serial, 'node': args.node, 'expectedMac': mac,
              'expectedIp': args.ip, 'checks': [], 'passed': False}
    report['mode'] = args.mode
    report['expectedImageSha256'] = args.image_sha256
    report['expectedBuildId'] = args.build_id

    def app(action):
        result = subprocess.run(['node', str(Path(__file__).with_name('phone_app_action.mjs')),
                                 '--adb', args.adb, '--serial', args.serial, '--action', action],
                                capture_output=True, text=True, encoding='utf-8', timeout=45)
        if result.returncode:
            raise RuntimeError('Installed app action failed: ' + action)
        return json.loads(result.stdout.strip().splitlines()[-1])

    def adb(*values):
        if values and values[0] == 'shell':
            values = ('shell', shlex.join(values[1:]))
        result = subprocess.run([args.adb, '-s', args.serial, *values],
                                capture_output=True, text=True, encoding='utf-8', timeout=30)
        # Never include a command or its output in errors: connect carries a password.
        if result.returncode:
            raise RuntimeError('ADB operation failed')
        return result.stdout

    def console(name, kind):
        value, _ = command(args.port, name, kind)
        return value

    def phone_ready(ssid):
        status = adb('shell', 'cmd', 'wifi', 'status')
        address = adb('shell', 'ip', '-4', 'addr', 'show', 'wlan0')
        observed = re.search(r'MAC: ([0-9a-f:]+)', status, re.I)
        right_mac = observed and observed[1].replace(':', '').lower() == mac
        return (f'Wifi is connected to "{ssid}"' in status and right_mac and
                re.search(r'\binet ' + re.escape(args.ip) + r'/\d+\b', address) and
                ' dynamic ' in address)

    def connect(label, credentials):
        began = time.monotonic()
        if args.mode == 'app':
            app('resume')
        else:
            adb('shell', 'cmd', 'wifi', 'connect-network', credentials['ssid'], 'wpa2',
                credentials['password'], '-r', 'persistent')
        while time.monotonic() - began < 45:
            if phone_ready(credentials['ssid']):
                stations = console('gw-stations', 'observed_stations')
                if mac not in stations.get('macs', []):
                    raise RuntimeError('Phone association absent from checked node')
                report['checks'].append({'case': label, 'passed': True,
                                         'seconds': round(time.monotonic() - began, 2)})
                print(label + ': DHCP/SSID/MAC/node association passed', flush=True)
                return
            time.sleep(1)
        raise RuntimeError(label + ': no matching dynamic DHCP address within 45 seconds')

    try:
        if adb('get-state').strip() != 'device':
            raise RuntimeError('USB debugging device unavailable')
        # A network ADB connection could disappear during the test; require USB.
        if ':' in args.serial:
            raise RuntimeError('Use a USB serial, not wireless ADB')
        status = console('status', 'status')
        if status.get('node') != args.node:
            raise RuntimeError('Unexpected USB node; no Wi-Fi or reboot action taken')
        report['firmware'] = status['firmware']
        report['image'] = console('gw-update-status', 'aumanet.node-update-status.v1')
        if not verified_image(report['image'], args.image_sha256, args.build_id):
            raise RuntimeError('Installed candidate identity is wrong or pending verification; no Wi-Fi or reboot action taken')
        if args.mode == 'app':
            saved = adb('shell', 'cmd', 'wifi', 'list-networks')
            if re.search(r'(?m)^\s*\d+\s+' + re.escape(args.ssid) + r'\s+', saved):
                raise RuntimeError('Conflicting manual saved node Wi-Fi profile; inspect its MAC before app acceptance')
            report['checks'].append({'case': 'no-competing-saved-profile', 'passed': True})
        if args.mode == 'saved' and args.credentials is None:
            raise RuntimeError('Saved-network diagnostics require --credentials')
        credentials = json.loads(args.credentials.read_text()) if args.mode == 'saved' else {'ssid': args.ssid}
        if credentials['ssid'] != args.ssid:
            raise RuntimeError('Credential file SSID does not match checked target')
        report['ssid'] = credentials['ssid']
        for cycle in range(1, args.cycles + 1):
            if args.mode == 'app':
                app('stop')
            adb('shell', 'svc', 'wifi', 'disable')
            time.sleep(1)
            address = adb('shell', 'ip', '-4', 'addr', 'show', 'wlan0')
            if re.search(r'\binet ' + re.escape(args.ip) + r'/', address):
                raise RuntimeError('Previous IPv4 address did not clear before reconnect')
            adb('shell', 'svc', 'wifi', 'enable')
            time.sleep(1)
            connect('reconnect-' + str(cycle), credentials)
        if args.reboot:
            before = console('gw-status', 'aumanet.gateway.v1')['run']
            with serial.Serial(port=None, baudrate=115200, timeout=.1) as link:
                link.dtr = False
                link.rts = False
                link.port = args.port
                link.open()
                link.write(b'reboot\n')
                link.flush()
            time.sleep(6)
            after = console('gw-status', 'aumanet.gateway.v1')
            if after['run'] == before or not after.get('acquisition_ready'):
                raise RuntimeError('Node reboot/acquisition persistence check failed')
            report['reboot'] = {'beforeRun': before, 'afterRun': after['run']}
            # Force a fresh DHCP acquisition even if Android recovered automatically.
            if args.mode == 'app':
                app('stop')
            adb('shell', 'svc', 'wifi', 'disable')
            time.sleep(1)
            adb('shell', 'svc', 'wifi', 'enable')
            time.sleep(1)
            connect('node-reboot', credentials)
        began = time.monotonic()
        while time.monotonic() - began < args.soak:
            if not phone_ready(credentials['ssid']):
                raise RuntimeError('Phone lost its DHCP address/association during stability check')
            time.sleep(2)
        report['checks'].append({'case': 'stable-address', 'passed': True, 'seconds': args.soak})
        report['imageAfter'] = console('gw-update-status', 'aumanet.node-update-status.v1')
        if not verified_image(report['imageAfter'], args.image_sha256, args.build_id):
            raise RuntimeError('Installed firmware identity changed or remains unconfirmed after recovery')
        if args.mode == 'app':
            report['appAfter'] = app('status')
            if not verified_app_connection(report['appAfter']):
                raise RuntimeError('App did not verify its node after DHCP recovery')
            report['checks'].append({'case': 'app-node-connected', 'passed': True})
        report['passed'] = True
    except Exception as error:
        # Errors from console reads contain public status only; credentials stay local.
        report['error'] = str(error)
        print('FAIL: ' + str(error), flush=True)
    finally:
        report['acceptanceComplete'] = report['passed'] and args.mode == 'app' and args.reboot
        report['completedUtc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + '\n')
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
