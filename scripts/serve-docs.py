"""Serve the offline handbook over loopback HTTPS using a supplied development certificate."""
import argparse
import functools
import http.server
import pathlib
import ssl

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cert', required=True)
parser.add_argument('--key', required=True)
parser.add_argument('--port', type=int, default=8443)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.minimum_version = ssl.TLSVersion.TLSv1_2
context.load_cert_chain(args.cert, args.key)
server.socket = context.wrap_socket(server.socket, server_side=True)
print(f'https://localhost:{args.port}/docs/equipment-3d.html', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
