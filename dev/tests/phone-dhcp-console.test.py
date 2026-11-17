"""Host-only serial response contract; never opens USB."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'firmware/tools'))
import device


class FakeSerial:
    def __init__(self, record):
        self.record = record
        self.written = []

    def open(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def reset_input_buffer(self):
        pass

    def write(self, value):
        self.written.append(value)

    def read(self, count):
        data, self.record = self.record, b''
        return data


class ConsoleContract(unittest.TestCase):
    def test_schema_and_legacy_type_replies(self):
        for field in ['schema', 'type']:
            record = {field: 'aumanet.node-update-status.v1', 'buildId': 'test'}
            serial = FakeSerial((json.dumps(record) + '\n').encode())
            with patch.object(device.serial, 'Serial', return_value=serial), patch.object(device.time, 'sleep'):
                actual, _ = device.command('fake', 'gw-update-status', record[field])
            self.assertEqual(actual, record)
            self.assertEqual(serial.written, [b'gw-update-status\n'])
            self.assertFalse(serial.dtr)
            self.assertFalse(serial.rts)

    def test_missing_reply_fails_bounded(self):
        with patch.object(device.serial, 'Serial', return_value=FakeSerial(b'')), patch.object(device.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'No expected response'):
                device.command('fake', 'status', 'expected', timeout=0)


if __name__ == '__main__':
    unittest.main()
