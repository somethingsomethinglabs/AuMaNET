import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'setup'))
from relay_mode import set_mode

HW = '1cdbd47539c0'

class Mode(unittest.TestCase):
    def transport(self, wrong=False, lost=False, readback=True):
        calls=[]
        def command(port, operation, kind):
            calls.append(operation)
            written = any(c.startswith('relay-mode-set ') for c in calls)
            if operation == 'status': return dict(node=HW,radio_started=False,radio_autostart=False),b''
            if operation.startswith('relay-mode-set '):
                if lost: raise RuntimeError('Unknown acknowledgement')
                return {},b''
            return dict(schema='aumanet.relay-mode.v1',hardwareNode='7ce8b1a777ec' if wrong else HW,
                        state='ready',enabled=written and readback,runtimeEnabled=False,
                        pendingReboot=written and readback,supported=True),b''
        return command,calls
    def test_wrong_device_never_mutates(self):
        transport,calls=self.transport(wrong=True)
        with self.assertRaises(RuntimeError): set_mode('COM99',HW,True,transport,True)
        self.assertFalse(any(c.startswith('relay-mode-set') for c in calls))
    def test_lost_ack_is_read_back_without_replay(self):
        transport,calls=self.transport(lost=True)
        self.assertTrue(set_mode('COM99',HW,True,transport,True)['verified'])
        self.assertEqual(sum(c.startswith('relay-mode-set') for c in calls),1)
    def test_unknown_outcome_never_repeats_write(self):
        transport,calls=self.transport(lost=True,readback=False)
        with self.assertRaisesRegex(RuntimeError,'unconfirmed'): set_mode('COM99',HW,True,transport,True)
        self.assertEqual(sum(c.startswith('relay-mode-set') for c in calls),1)
    def test_plan_never_mutates(self):
        transport,calls=self.transport()
        result=set_mode('COM99',HW,True,transport,False)
        self.assertFalse(result['applied'])
        self.assertFalse(any(c.startswith('relay-mode-set') for c in calls))

if __name__ == '__main__': unittest.main()
