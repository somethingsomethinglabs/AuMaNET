"""Bounded read-only USB console capture, including re-enumeration after panic."""
import argparse
import time
from pathlib import Path
import serial

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--port', required=True)
p.add_argument('--out', required=True)
p.add_argument('--seconds', type=int, default=90)
a = p.parse_args()
if not 1 <= a.seconds <= 180:
    raise SystemExit('Capture must be bounded to 1..180 seconds')
deadline = time.monotonic() + a.seconds
target = Path(a.out)
target.parent.mkdir(parents=True, exist_ok=True)
written = 0
with target.open('wb') as output:
    while time.monotonic() < deadline and written < 256 * 1024:
        connection = serial.Serial(None, 115200, timeout=0.1)
        connection.dtr = False
        connection.rts = False
        connection.port = a.port
        try:
            connection.open()
            while time.monotonic() < deadline and written < 256 * 1024:
                data = connection.read(min(4096, 256 * 1024 - written))
                if data:
                    output.write(data)
                    output.flush()
                    written += len(data)
        except (OSError, serial.SerialException):
            time.sleep(0.25)
        finally:
            connection.close()
print(f'Console capture complete: {written} bytes')
