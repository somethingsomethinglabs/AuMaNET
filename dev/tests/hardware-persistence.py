"""Real MCU restart/flash-history and live HTTP reconnect acceptance (changes bench histories)."""
import argparse
import json
from pathlib import Path
import secrets
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "dev/firmware/tools"))
from usb_bench import Node, Server, Handler

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--firmware", choices=("0.4.1", "0.5.0"), default="0.4.1",
                    help="Exact expected image version; original acceptance used 0.4.1")
for flag in ("port-a", "port-b", "node-a", "node-b"):
    parser.add_argument("--"+flag, required=True)
args = parser.parse_args()
out = ROOT / "dev/artifacts/reconnect-20261110"
out.mkdir(exist_ok=True)
nodes = {"A": Node("A", args.port_a, args.node_a), "B": Node("B", args.port_b, args.node_b)}
server = Server(("127.0.0.1", 8766), Handler)
server.nodes, server.token, server.build = nodes, secrets.token_urlsafe(32), ROOT / "dev/app/build"
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
base = "http://127.0.0.1:8766/api/hardware/nodes/"
results, observations = [], []


def passed(case, **data):
    results.append({"case": case, "passed": True, **data})
    (out / "persistence-results.json").write_text(json.dumps(results, indent=2)+"\n")
    print(json.dumps(results[-1]), flush=True)


def request(role, value=None):
    req = urllib.request.Request(base+role+("/messages" if value is not None else ""),
        data=json.dumps(value).encode() if value is not None else None,
        headers={"Content-Type": "application/json", "X-AuMaNET-Bench-Token": server.token})
    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            record = json.load(response)
        observations.append({"role": role, "operation": "send" if value else "snapshot", "record": record})
        return record
    except urllib.error.HTTPError as error:
        record = json.load(error)
        observations.append({"role": role, "error": record})
        raise RuntimeError(record["error"]) from error


def snapshot(role, timeout=40):
    deadline = time.monotonic()+timeout
    while True:
        try:
            return request(role)
        except (RuntimeError, OSError):
            if time.monotonic() >= deadline:
                raise
            time.sleep(0.5)


def connected():
    deadline = time.monotonic()+45
    while time.monotonic() < deadline:
        a, b = snapshot("A"), snapshot("B")
        if a["radio"]["ap_peer_state"] == 3 and b["radio"]["station_state"] == 2:
            return a, b
        time.sleep(0.5)
    raise AssertionError("Physical radio association did not recover")


def reboot(role):
    # Test harness owns the console. There is no exposed HTTP reboot endpoint.
    node = nodes[role]
    with node.lock:
        node.connection.write(b"reboot\n")
        node.connection.flush()
    time.sleep(2)


def control(role, text, kind):
    with nodes[role].lock:
        return nodes[role]._command(text, kind)


def history(role):
    return snapshot(role)["messages"]


def send(role, text, identifier=None):
    identifier = identifier or secrets.token_hex(8)
    message = request(role, {"id": identifier, "text": text})["message"]
    assert message["id"] == identifier and message["text"] == text and message["from"] == role
    return message


try:
    a, b = connected()
    assert a["node"] == args.node_a and b["node"] == args.node_b
    assert a["firmware"] == b["firmware"] == args.firmware
    passed(f"both physical identities and {args.firmware} radio association")

    am = send("A", "Persistence A to B: " + "🙂"*30)
    bm = send("B", 'Persistence B to A: "quoted"\nnew line ✨')
    assert am["state"] == bm["state"] == "delivered_to_peer"
    before_a, before_b = history("A"), history("B")
    assert next(m for m in before_b if m["id"] == am["id"])["state"] == "received"
    assert next(m for m in before_a if m["id"] == bm["id"])["state"] == "received"
    passed("bidirectional UTF-8 and JSON text stored with peer acknowledgements")

    uptime_a = snapshot("A")["uptime_ms"]
    reboot("A")
    a, b = connected()
    assert a["uptime_ms"] < uptime_a and a["messages"] == before_a
    assert history("B") == before_b
    passed("A restart restores exact history and radio without restarting adapter")

    uptime_b = snapshot("B")["uptime_ms"]
    reboot("B")
    a, b = connected()
    assert b["uptime_ms"] < uptime_b and b["messages"] == before_b
    assert history("A") == before_a
    passed("B restart restores exact history and radio without restarting adapter")

    duplicate = send("A", am["text"], am["id"])
    assert duplicate["state"] == "delivered_to_peer" and history("B") == before_b
    passed("retained delivered ID remains deduplicated after both restarts")

    # B's console stays available while its radio service is disabled for one boot.
    control("B", "radio-autostart off", "radio_autostart")
    reboot("B")
    pending = send("A", "Unconfirmed survives a sender restart")
    assert pending["state"] == "unconfirmed"
    reboot("A")
    restored = history("A")
    assert next(m for m in restored if m["id"] == pending["id"])["state"] == "unconfirmed"
    passed("unacknowledged outbound message survives sender restart honestly")
    # Accessing B again makes the adapter detect and restart its stopped service.
    connected()
    delivered = send("A", pending["text"], pending["id"])
    assert delivered["state"] == "delivered_to_peer"
    assert sum(m["id"] == pending["id"] for m in history("B")) == 1
    passed("same-ID retry after restart and absent peer service delivers exactly once")

    maximum = send("B", "🙂"*60)
    assert maximum["state"] == "delivered_to_peer"
    reboot("B"); connected()
    assert next(m for m in history("B") if m["id"] == maximum["id"])["text"] == "🙂"*60
    passed("240-byte boundary message survives restart")

    for i in range(10):
        assert send("A", f"Bounded persistent history item {i}")["state"] == "delivered_to_peer"
    full_a, full_b = history("A"), history("B")
    assert len(full_a) == len(full_b) == 8
    assert [m["text"] for m in full_a] == [f"Bounded persistent history item {i}" for i in range(2, 10)]
    reboot("A"); reboot("B"); connected()
    assert history("A") == full_a and history("B") == full_b
    passed("eight-entry eviction and exact retained histories survive both restarts")

    for role in ("A", "B"):
        state = control(role, "status", "status")
        assert state["radio_autostart"] and state["radio_started"] and state["message_storage_ready"]
    passed("both nodes finish with persistent startup enabled and healthy storage")
finally:
    (out / "persistence-observations.json").write_text(json.dumps(observations, indent=2)+"\n")
    server.shutdown(); server.server_close(); thread.join()
    for node in nodes.values(): node.close()
