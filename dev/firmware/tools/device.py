"""Explicit USB bench deployment, backup and bounded smoke checks. Python 3.10+."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time

import serial
from serial.tools import list_ports

ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"


def port_name(value):
    if value:
        return value
    ports = [p.device for p in list_ports.comports() if p.vid == 0x303A and p.pid == 0x1001]
    if len(ports) != 1:
        raise RuntimeError(f"Specify --port; found {len(ports)} Espressif USB devices: {ports}")
    return ports[0]


def esptool(port, *args):
    result = subprocess.run([sys.executable, "-m", "esptool", "--chip", "esp32s3",
                             "--port", port, "--baud", "921600", *map(str, args)],
                            capture_output=True, text=True, timeout=240)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    # Keep progress control characters out of machine-readable command output.
    return result.stdout


def identify(port, expected=None):
    output = esptool(port, "flash_id")
    mac = re.search(r"MAC: ([0-9a-f:]+)", output)
    if not mac or "Detected flash size: 8MB" not in output:
        raise RuntimeError("Expected the 8 MB ESP32-S3 board; identification was:\n" + output)
    node = mac[1].replace(":", "")
    if expected and node != expected.lower().replace(":", ""):
        raise RuntimeError(f"Expected node {expected}; connected node is {node}")
    return node


def command(port, command, expected_type, timeout=8):
    transcript = bytearray()
    records = []
    connection = serial.Serial(None, 115200, timeout=0.1, write_timeout=2)
    # Espressif USB Serial/JTAG uses DTR/RTS for reset/bootloader entry.
    # Set them before opening, rather than briefly asserting pyserial defaults.
    connection.dtr = False
    connection.rts = False
    connection.port = port
    connection.open()
    with connection:
        # Let a fresh boot settle; discard old responses so every check needs a new reply.
        time.sleep(2)
        connection.reset_input_buffer()
        connection.write((command + "\n").encode())
        deadline = time.monotonic() + timeout
        line = bytearray()
        while time.monotonic() < deadline:
            chunk = connection.read(4096)
            transcript.extend(chunk)
            line.extend(chunk)
            while b"\n" in line:
                current, _, remainder = line.partition(b"\n")
                line = bytearray(remainder)
                if b"Command returned non-zero error code" in current:
                    raise RuntimeError(f"Board rejected {command!r}:\n" + transcript.decode(errors="replace"))
                start = current.find(b'{"')
                if start < 0:
                    continue
                try:
                    record = json.loads(current[start:])
                except (ValueError, UnicodeError):
                    continue
                records.append(record)
                if record.get("type") == expected_type:
                    return record, bytes(transcript)
    raise RuntimeError(f"No {expected_type} response to {command!r}:\n" + transcript.decode(errors="replace"))


def smoke(port, expected=None):
    status, transcript = command(port, "status", "status")
    if status.get("schema") != "aumanet.bench.v1":
        raise RuntimeError("Unexpected firmware schema")
    if expected and status.get("node") != expected.lower().replace(":", ""):
        raise RuntimeError("Firmware identity does not match deployment target")
    pong, ping_log = command(port, "ping", "pong")
    if pong.get("schema") != "aumanet.bench.v1":
        raise RuntimeError("Unexpected ping schema")
    destination = ARTIFACTS / "seeed-bringup"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / f"{status['node']}-smoke.log").write_bytes(transcript + ping_log)
    print(json.dumps({"usb_bidirectional": True, "status": status}))
    return status


def validate_artifact(directory):
    expected = {}
    for line in (directory / "SHA256SUMS").read_text().splitlines():
        digest, name = line.split(maxsplit=1)
        expected[name.strip()] = digest
    files = [("0x0", "bootloader/bootloader.bin"),
             ("0x8000", "partition_table/partition-table.bin"),
             ("0x10000", "aumanet_bench.bin")]
    for _, name in files:
        actual = hashlib.sha256((directory / name).read_bytes()).hexdigest()
        if expected.get(name) != actual:
            raise RuntimeError(f"Artifact checksum mismatch: {name}")
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["ports", "identify", "flash", "smoke", "selftest", "radio-start", "radio-status", "radio-scan", "link-test"])
    parser.add_argument("--port")
    parser.add_argument("--expect-node", help="ESP base MAC with or without colons")
    parser.add_argument("--artifact", type=Path, default=ARTIFACTS / "firmware-usb")
    args = parser.parse_args()
    if args.action == "ports":
        print(json.dumps([{"port": p.device, "vid": p.vid, "pid": p.pid, "description": p.description}
                          for p in list_ports.comports()]))
        return
    port = port_name(args.port)
    if args.action == "identify":
        print(json.dumps({"port": port, "node": identify(port, args.expect_node), "flash_bytes": 8388608}))
    elif args.action == "flash":
        files = validate_artifact(args.artifact)
        node = identify(port, args.expect_node)
        backup = ARTIFACTS / "seeed-bringup" / f"{node}-original-flash.bin"
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            temporary = backup.with_suffix(".partial")
            esptool(port, "read_flash", "0", "0x800000", temporary)
            if temporary.stat().st_size != 8388608:
                raise RuntimeError("Incomplete backup; refusing to deploy")
            temporary.replace(backup)
            backup.with_suffix(".sha256").write_text(hashlib.sha256(backup.read_bytes()).hexdigest() + "\n")
        if backup.stat().st_size != 8388608:
            raise RuntimeError("Existing backup is incomplete; refusing to deploy")
        backup_hash = backup.with_suffix(".sha256")
        if not backup_hash.exists() or backup_hash.read_text().strip().lower() != hashlib.sha256(backup.read_bytes()).hexdigest():
            raise RuntimeError("Backup checksum missing or incorrect; refusing to deploy")
        arguments = ["write_flash", "--flash_mode", "dio", "--flash_size", "8MB"]
        for offset, name in files:
            arguments.extend([offset, args.artifact / name])
        output = esptool(port, *arguments)
        (backup.parent / f"{node}-flash.log").write_text(output)
        time.sleep(2)
        smoke(port, node)
    elif args.action == "smoke":
        smoke(port, args.expect_node)
    else:
        # Verify identity before operations that could start RF or hardware tests.
        status = smoke(port, args.expect_node)
        cmd, kind, timeout = {
            "selftest": ("radio-test", "selftest_complete", 60),
            "radio-start": ("radio-start", "radio_started", 45),
            "radio-status": ("radio-status", "radio_status", 8),
            "radio-scan": ("radio-scan", "scan_result", 15),
            "link-test": ("link-test", "link_result", 30),
        }[args.action]
        result, transcript = command(port, cmd, kind, timeout)
        log = ARTIFACTS / "seeed-bringup" / f"{status['node']}-{args.action}.log"
        log.write_bytes(transcript)
        print(transcript.decode(errors="replace"))
        if args.action == "selftest":
            text = re.sub(r"\x1b\[[0-9;]*m", "", transcript.decode(errors="replace"))
            # Two upstream initialization steps return TEST_NO_RESULT. BUSY is
            # explicitly unsupported with power save disabled on this carrier.
            if not re.search(r"13 total test steps\. 10 passed, 0 failed, 2 no result, 1 skipped", text):
                raise RuntimeError("Hardware test did not pass the supported checks; see " + str(log))
        if args.action == "link-test" and result.get("received") != 10:
            raise RuntimeError("Peer echo did not receive all ten replies")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
