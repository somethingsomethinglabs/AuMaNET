"""Host fault fixtures; separate from physical unplug/power-cycle evidence."""
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "firmware/tools"))
import usb_bench as bench

IDENTITY = "1cdbd47539c0"


class Connection:
    def __init__(self, factory):
        self.factory = factory
        self.buffer = bytearray()
        self.failed = False
        self.closed = False

    def open(self):
        self.factory.opens.append(self.port)

    def close(self):
        self.closed = True

    def reset_input_buffer(self):
        self.buffer.clear()

    @property
    def in_waiting(self):
        return len(self.buffer)

    def read(self, size):
        data = bytes(self.buffer[:size]); del self.buffer[:size]
        return data

    def write(self, data):
        if self.failed:
            raise bench.serial.SerialException("stale Windows USB handle")
        text = data.decode().strip()
        self.factory.commands.append(text)
        kind = text
        value = {}
        if text == "status":
            value = dict(node=self.factory.identity, role="A", firmware=self.factory.firmware, rf_enabled=True,
                         radio_started=self.factory.started, uptime_ms=100)
        elif text == "radio-start":
            self.factory.started = True; kind = "radio_started"
        elif text == "radio-status":
            kind = "radio_status"; value = {"started": True}
        elif text == "messages":
            value = {"messages": []}
        elif text.startswith("message-send "):
            if self.factory.fail_send:
                raise bench.serial.SerialException("write completed but USB response was lost")
            _, identifier, encoded = text.split()
            kind = "message_result"
            value = {"message": {"id": identifier, "from": "A", "text": bytes.fromhex(encoded).decode()}}
        value.update(schema="aumanet.bench.v1", type=kind)
        self.buffer.extend((json.dumps(value)+"\n").encode())


class Factory:
    def __init__(self):
        self.identity, self.started, self.fail_send = IDENTITY, True, False
        self.firmware = "0.4.0"
        self.ports = [SimpleNamespace(vid=0x303A, pid=0x1001, serial_number="1C:DB:D4:75:39:C0", device="COM7")]
        self.opens, self.commands, self.connections = [], [], []

    def serial(self, *args, **kwargs):
        connection = Connection(self); self.connections.append(connection)
        return connection


class Recovery(unittest.TestCase):
    def setUp(self):
        self.factory = Factory()
        self.serial_patch = patch.object(bench.serial, "Serial", self.factory.serial)
        self.ports_patch = patch.object(bench.list_ports, "comports", lambda: self.factory.ports)
        self.serial_patch.start(); self.ports_patch.start()
        self.addCleanup(self.serial_patch.stop); self.addCleanup(self.ports_patch.stop)
        self.node = bench.Node("A", "COM7", IDENTITY)
        self.addCleanup(self.node.close)

    def test_server_can_start_with_node_absent_then_recover(self):
        self.factory.ports = []
        with self.assertRaisesRegex(RuntimeError, "disconnected"):
            self.node.snapshot()
        self.factory.ports = [SimpleNamespace(vid=0x303A, pid=0x1001, serial_number=IDENTITY, device="COM12")]
        self.node.next_open = 0
        self.assertEqual(self.node.snapshot()["node"], IDENTITY)
        self.assertEqual(self.factory.opens, ["COM12"])

    def test_ble_firmware_keeps_usb_bench_compatible(self):
        self.factory.firmware = "0.5.0"
        self.assertEqual(self.node.snapshot()["firmware"], "0.5.0")

    def test_unknown_or_older_firmware_cannot_start_radio_or_send(self):
        for firmware in ("0.3.1", "0.6.0", "0.5.bad", "0.5.0-extra"):
            with self.subTest(firmware=firmware):
                self.factory.firmware = firmware; self.factory.started = False
                self.node.next_open = 0; self.factory.commands.clear()
                with self.assertRaisesRegex(RuntimeError, "supported persistent message build or the explicit gateway candidate"):
                    self.node.send("0123456789abcdef", "hello")
                self.assertEqual(self.factory.commands, ["status"])

    def test_stale_handle_closed_then_changed_com_rediscovered(self):
        self.node.snapshot()
        old = self.factory.connections[-1]; old.failed = True
        with self.assertRaisesRegex(RuntimeError, "reconnecting automatically"):
            self.node.snapshot()
        self.assertTrue(old.closed)
        self.factory.ports[0].device = "COM14"; self.node.next_open = 0
        self.assertEqual(self.node.snapshot()["role"], "A")
        self.assertEqual(self.factory.opens, ["COM7", "COM14"])

    def test_firmware_reboot_on_open_handle_restarts_service(self):
        self.node.snapshot(); self.factory.started = False
        self.node.snapshot()
        self.assertEqual(self.factory.commands.count("radio-start"), 1)

    def test_wrong_usb_identity_is_never_opened(self):
        self.factory.ports[0].serial_number = "7ce8b1a777ec"
        with self.assertRaisesRegex(RuntimeError, "disconnected"):
            self.node.snapshot()
        self.assertEqual(self.factory.opens, [])

    def test_firmware_identity_mismatch_cannot_start_radio_or_send(self):
        self.factory.identity = "7ce8b1a777ec"; self.factory.started = False
        with self.assertRaisesRegex(RuntimeError, "Identity or role mismatch"):
            self.node.send("0123456789abcdef", "hello")
        self.assertEqual(self.factory.commands, ["status"])
        self.assertTrue(self.factory.connections[0].closed)

    def test_ambiguous_write_is_not_automatically_replayed(self):
        self.node.snapshot(); self.factory.fail_send = True
        with self.assertRaisesRegex(RuntimeError, "reconnecting automatically"):
            self.node.send("0123456789abcdef", "hello")
        self.assertEqual(self.factory.opens, ["COM7"])
        self.assertEqual(sum(cmd.startswith("message-send ") for cmd in self.factory.commands), 1)

    def test_busy_request_is_bounded(self):
        self.node.lock.acquire()
        try:
            with self.assertRaisesRegex(RuntimeError, "busy"):
                self.node.snapshot()
        finally:
            self.node.lock.release()
        self.assertEqual(self.factory.commands, [])


if __name__ == "__main__":
    unittest.main()
