"""Loopback-only AuMaNET development adapter; user messages travel board-to-board over HaLow."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import secrets
import threading
import time
from urllib.parse import urlsplit

import serial
from serial.tools import list_ports

SCHEMA = "aumanet.usb-bench.v1"
ROOT = Path(__file__).resolve().parents[3]


def valid_text(text):
    if not isinstance(text, str) or not text.strip() or "\0" in text:
        raise ValueError("Message must contain text and no NUL")
    try:
        encoded = text.encode("utf-8", errors="strict")
    except UnicodeError as error:
        raise ValueError("Message is not valid Unicode") from error
    if len(encoded) > 240:
        raise ValueError("Message exceeds 240 UTF-8 bytes")
    return encoded


class Node:
    def __init__(self, role, port, expected):
        self.role, self.expected = role, expected.lower().replace(":", "")
        if role not in ("A", "B") or not re.fullmatch("[0-9a-f]{12}", self.expected):
            raise ValueError("Expected an A/B role and a 12-digit ESP identity")
        self.port_hint = port
        self.lock = threading.Lock()
        self.connection = None
        self.next_open = 0

    def _open(self):
        if self.connection is not None:
            return
        if time.monotonic() < self.next_open:
            raise RuntimeError(f"Node {self.role} reconnecting; retry shortly")
        self.next_open = time.monotonic() + 1
        matches = [p for p in list_ports.comports() if p.vid == 0x303A and p.pid == 0x1001 and
                   (p.serial_number or "").lower().replace(":", "") == self.expected]
        if len(matches) != 1:
            raise RuntimeError(f"Node {self.role} disconnected; waiting for its USB identity")
        connection = serial.Serial(None, 115200, timeout=0.05, write_timeout=2)
        connection.dtr = connection.rts = False
        connection.port = matches[0].device  # Rediscover by identity even when COM numbering changes.
        try:
            connection.open()
        except Exception:
            connection.close()
            raise
        self.connection = connection

    def _command(self, command, kind, timeout=8):
        self.connection.reset_input_buffer()
        self.connection.write((command + "\n").encode("ascii"))
        deadline = time.monotonic() + timeout
        buffer = bytearray()
        while time.monotonic() < deadline:
            buffer.extend(self.connection.read(min(4096, self.connection.in_waiting or 1)))
            if len(buffer) > 65536:
                raise RuntimeError(f"Node {self.role} returned an oversized console record")
            while b"\n" in buffer:
                line, _, tail = buffer.partition(b"\n")
                buffer = bytearray(tail)
                if b"Command returned non-zero error code" in line:
                    raise RuntimeError(f"Node {self.role} rejected the command")
                start = line.find(b'{"')
                if start < 0:
                    continue
                try:
                    record = json.loads(line[start:])
                except (ValueError, UnicodeError):
                    continue
                if record.get("schema") == "aumanet.bench.v1" and record.get("type") == kind:
                    return record
        raise TimeoutError(f"Node {self.role} did not return {kind}")

    def _ready(self):
        self._open()
        status = self._command("status", "status")
        if status.get("node") != self.expected or status.get("role") != self.role:
            raise RuntimeError(f"Identity or role mismatch on node {self.role}")
        supported = bool(re.fullmatch(r"0\.(?:4|5)\.\d+", status.get("firmware", ""))) or (
            status.get("firmware") == "0.6.0-gateway.4" and status.get("experimental_gateway") is True)
        if not supported or not status.get("rf_enabled"):
            raise RuntimeError(f"Node {self.role} requires a supported persistent message build or the explicit gateway candidate")
        if not status.get("radio_started"):
            self._command("radio-start", "radio_started", 30)
        return status

    def _operation(self, action):
        # Keep a reconnect/startup from building an unbounded queue of polling threads.
        if not self.lock.acquire(timeout=0.1):
            raise RuntimeError(f"Node {self.role} busy reconnecting or sending; retry shortly")
        try:
            status = self._ready()  # Also detects a firmware reboot on an otherwise open port.
            return action(status)
        except (serial.SerialException, OSError, TimeoutError) as error:
            self.close()
            raise RuntimeError(f"Node {self.role} USB connection lost; reconnecting automatically") from error
        except RuntimeError:
            self.close()
            raise
        finally:
            self.lock.release()

    def snapshot(self):
        def read(status):
            radio = self._command("radio-status", "radio_status")
            messages = self._command("messages", "messages")["messages"]
            return {"schema": SCHEMA, "role": self.role, "node": status["node"],
                    "firmware": status["firmware"], "uptime_ms": status["uptime_ms"],
                    "radio": radio, "messages": messages}
        return self._operation(read)

    def send(self, identifier, text):
        if not isinstance(identifier, str) or not re.fullmatch("[0-9a-f]{16}", identifier):
            raise ValueError("Message ID must be 16 lowercase hexadecimal characters")
        encoded = valid_text(text)
        def write(status):
            result = self._command(f"message-send {identifier} {encoded.hex()}", "message_result", 10)
            message = result["message"]
            if message.get("id") != identifier or message.get("from") != self.role or message.get("text") != text:
                raise RuntimeError("Board returned a mismatched message result")
            return result
        return self._operation(write)

    def close(self):
        connection, self.connection = self.connection, None
        if connection is not None:
            try:
                connection.close()
            except OSError:
                pass


class Server(ThreadingHTTPServer):
    daemon_threads = True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(args[2].build), **kwargs)

    def list_directory(self, path):
        self.reply(403, {"error": "Directory listing is disabled"})
        return None

    def log_message(self, format, *args):
        # Do not log request bodies, credentials or private conversation contents.
        return

    def local_request(self):
        allowed_hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        allowed_origins = {"http://" + host for host in allowed_hosts}
        allowed_origins.update({"http://127.0.0.1:5173", "http://localhost:5173"})
        origin = self.headers.get("Origin")
        if self.headers.get("Host") not in allowed_hosts or (origin and origin not in allowed_origins):
            self.reply(403, {"error": "Local bench origin required"})
            return False
        return True

    def reply(self, code, value):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass  # Browser navigation/cancelled polling is not a new hardware failure.

    def do_GET(self):
        if not self.local_request():
            return
        path = urlsplit(self.path).path
        if path == "/api/hardware/session":
            self.reply(200, {"schema": SCHEMA, "token": self.server.token})
            return
        match = re.fullmatch(r"/api/hardware/nodes/([AB])", path)
        if match:
            try:
                self.reply(200, self.server.nodes[match[1]].snapshot())
            except (RuntimeError, TimeoutError, OSError) as error:
                self.reply(503, {"error": str(error)})
            return
        if path.startswith("/api/"):
            self.reply(404, {"error": "Unknown bench endpoint"})
            return
        if path.rstrip("/") == "/bench":
            self.path = "/index.html"  # Svelte's static SPA fallback preserves the browser route.
        super().do_GET()

    def do_POST(self):
        if not self.local_request():
            return
        token = self.headers.get("X-AuMaNET-Bench-Token", "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token) or not secrets.compare_digest(token, self.server.token):
            self.reply(403, {"error": "Bench session token required"})
            return
        match = re.fullmatch(r"/api/hardware/nodes/([AB])/messages", urlsplit(self.path).path)
        if not match:
            self.reply(404, {"error": "Unknown bench endpoint"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 4096:
                raise ValueError("Request must contain 1–4096 bytes")
            value = json.loads(self.rfile.read(length))
            if not isinstance(value, dict) or set(value) != {"id", "text"}:
                raise ValueError("Expected only id and text")
            result = self.server.nodes[match[1]].send(value["id"], value["text"])
            self.reply(200, {"schema": SCHEMA, "message": result["message"]})
        except (ValueError, UnicodeError) as error:
            self.reply(400, {"error": str(error)})
        except (RuntimeError, TimeoutError, OSError) as error:
            self.reply(503, {"error": str(error)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port-a", required=True)
    parser.add_argument("--port-b", required=True)
    parser.add_argument("--node-a", required=True)
    parser.add_argument("--node-b", required=True)
    parser.add_argument("--http-port", type=int, default=8765)
    parser.add_argument("--build", type=Path, default=ROOT / "dev/app/build")
    args = parser.parse_args()
    nodes = {}
    try:
        nodes["A"] = Node("A", args.port_a, args.node_a)
        nodes["B"] = Node("B", args.port_b, args.node_b)
        server = Server(("127.0.0.1", args.http_port), Handler)
        server.nodes, server.token, server.build = nodes, secrets.token_urlsafe(32), args.build.resolve()
        print(json.dumps({"ready": True, "url": f"http://127.0.0.1:{args.http_port}/bench", "nodes": list(nodes)}), flush=True)
        try:
            server.serve_forever()
        finally:
            server.server_close()
    except KeyboardInterrupt:
        pass
    finally:
        for node in nodes.values():
            node.close()


if __name__ == "__main__":
    main()
