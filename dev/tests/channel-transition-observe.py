"""Bounded read-only station observations during a separately authorised trial."""
import argparse
import json
import time
from pathlib import Path
import serial

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--port', required=True)
p.add_argument('--seconds', type=int, default=90)
p.add_argument('--out', required=True)
a = p.parse_args()
if not 1 <= a.seconds <= 180:
    raise SystemExit('Observation must be bounded to 1..180 seconds')
target = Path(a.out).resolve()
artifacts = (Path(__file__).resolve().parents[1] / 'artifacts').resolve()
if not target.is_relative_to(artifacts):
    raise SystemExit('Device observations belong under ignored dev/artifacts')
target.parent.mkdir(parents=True, exist_ok=True)
connection = serial.Serial(None, 115200, timeout=0.05, write_timeout=1)
connection.dtr = False
connection.rts = False
connection.port = a.port
rows = []
with connection:
    connection.reset_input_buffer()
    deadline, sent, pending = time.monotonic() + a.seconds, 0, b''
    while time.monotonic() < deadline:
        if time.monotonic() - sent >= 1:
            connection.write(b'radio-status\n')
            sent = time.monotonic()
        pending += connection.read(8192)
        if len(pending) > 65536:
            raise RuntimeError('Console observation exceeded its bound')
        while b'\n' in pending:
            line, pending = pending.split(b'\n', 1)
            if not line.startswith(b'{"schema"'):
                continue
            try:
                value = json.loads(line)
            except ValueError:
                continue
            if value.get('type') == 'radio_status':
                rows.append({'time': time.time(),
                             'actualChannel': value.get('actual_channel'),
                             'interfaceUp': value.get('interface_up'),
                             'stationState': value.get('station_state'),
                             'diagnostics': value.get('diagnostics')})
target.write_text(json.dumps(rows, indent=2) + '\n')
print('Saved station observations:', len(rows))
