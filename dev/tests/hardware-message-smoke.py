"""Physical two-node acceptance; requires 0.3.x and node B's radio service initially stopped."""
import argparse
import json
from pathlib import Path
import secrets
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "dev/firmware/tools"))
from device import command

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port-a", required=True)
parser.add_argument("--port-b", required=True)
parser.add_argument("--node-a", required=True)
parser.add_argument("--node-b", required=True)
args = parser.parse_args()
ports = {"A": args.port_a, "B": args.port_b}
nodes = {"A": args.node_a.replace(":", "").lower(), "B": args.node_b.replace(":", "").lower()}
out = ROOT / "dev/artifacts/hardware-messages"
out.mkdir(parents=True, exist_ok=True)
results = []
sequence = 0


def call(role, text, kind, timeout=10):
    global sequence
    sequence += 1
    result, transcript = command(ports[role], text, kind, timeout)
    (out / f"{sequence:02d}-{role}-{kind}.log").write_bytes(transcript)
    return result


def passed(case, **data):
    results.append({"case": case, "passed": True, **data})
    (out / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results[-1]), flush=True)


for role in ("A", "B"):
    status = call(role, "status", "status")
    assert status["node"] == nodes[role] and status["role"] == role
    assert status["firmware"].startswith("0.3.") and status["rf_enabled"]
    if role == "B":
        assert not status["radio_started"], "Reset node B before the outage-control test"
    elif not status["radio_started"]:
        call(role, "radio-start", "radio_started", 30)
passed("distinct physical node identities and message firmware")

identifier = secrets.token_hex(8)
text = "AuMaNET A → B: retry after peer startup ✨"
wire = f"message-send {identifier} {text.encode('utf-8').hex()}"
unconfirmed = call("A", wire, "message_result")
assert unconfirmed["message"]["state"] == "unconfirmed" and unconfirmed["attempts"] == 3
assert not any(m["id"] == identifier for m in call("B", "messages", "messages")["messages"])
passed("absent peer service cannot produce delivery acknowledgement", attempts=3)

call("B", "radio-start", "radio_started", 30)
for _ in range(8):
    radio = call("B", "radio-status", "radio_status")
    if radio["station_state"] == 2 and radio["interface_up"]:
        break
else:
    raise AssertionError("Node B did not associate with node A")
passed("physical HaLow association", centre_hz=radio["centre_hz"], channel=radio["actual_channel"])

delivered = call("A", wire, "message_result")
assert delivered["message"]["state"] == "delivered_to_peer"
received = [m for m in call("B", "messages", "messages")["messages"] if m["id"] == identifier]
assert len(received) == 1 and received[0]["from"] == "A" and received[0]["text"] == text and received[0]["state"] == "received"
passed("A to B real UTF-8 message, retrying the original ID after outage")

duplicate = call("A", wire, "message_result")
assert duplicate["message"]["state"] == "delivered_to_peer" and duplicate["attempts"] == 0
assert sum(m["id"] == identifier for m in call("B", "messages", "messages")["messages"]) == 1
passed("same-ID retry does not duplicate peer inbox")

try:
    call("A", f"message-send {identifier} {'changed'.encode().hex()}", "message_result")
except RuntimeError as error:
    assert "rejected" in str(error)
    (out / "conflicting-id-rejected.log").write_text(str(error))
else:
    raise AssertionError("Conflicting message ID was accepted")
passed("same ID with different text rejected")

for case, body in (("B to A real UTF-8 message", "AuMaNET B → A: received 🛰️"), ("maximum 240-byte message", "🙂" * 60)):
    reply_id = secrets.token_hex(8)
    sent = call("B", f"message-send {reply_id} {body.encode().hex()}", "message_result")
    assert sent["message"]["state"] == "delivered_to_peer"
    inbox = [m for m in call("A", "messages", "messages")["messages"] if m["id"] == reply_id]
    assert len(inbox) == 1 and inbox[0]["text"] == body and inbox[0]["state"] == "received"
    passed(case, payload_bytes=len(body.encode()))

for case, hex_text in (("oversize firmware input rejected", ("🙂" * 61).encode().hex()),
                       ("NUL firmware input rejected", "610062"),
                       ("malformed UTF-8 firmware input rejected", "eda080")):
    try:
        call("A", f"message-send {secrets.token_hex(8)} {hex_text}", "message_result")
    except RuntimeError as error:
        assert "rejected" in str(error)
        (out / (case.replace(" ", "-") + ".log")).write_text(str(error))
    else:
        raise AssertionError(case)
    passed(case)

for role in ("A", "B"):
    status = call(role, "status", "status")
    assert status["node"] == nodes[role]
    call(role, "ping", "pong")
passed("both nodes still responsive after positive and negative cases")
print(json.dumps({"passed": len(results), "evidence": str(out / "results.json")}), flush=True)
