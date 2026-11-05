"""Download pinned, unmodified upstream STLs; pack the same bytes for offline viewing."""
import base64
import hashlib
import html
import json
import pathlib
import re
import runpy
import struct
import urllib.request
import urllib.parse

root = pathlib.Path(__file__).resolve().parents[1]
selection = json.loads((root / 'hardware/cad/upstream-selection.json').read_text())
dest = root / 'docs/assets/models/ties1887-v2'
dest.mkdir(parents=True, exist_ok=True)
prefix = f"https://raw.githubusercontent.com/{selection['repository']}/{selection['commit']}/"

def download(path, output, sha=None):
    data = urllib.request.urlopen(prefix + urllib.parse.quote(path), timeout=60).read()
    if sha and hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest() != sha:
        raise ValueError(f'Upstream Git blob mismatch: {path}')
    output.write_bytes(data)
    return data

parts = []
for entry in selection['files']:
    name = pathlib.PurePosixPath(entry['path']).name
    data = download(entry['path'], dest / name, entry['sha'])
    count = struct.unpack_from('<I', data, 80)[0]
    if len(data) != 84 + 50 * count:
        raise ValueError(f'Invalid binary STL length: {name}')
    points = [struct.unpack_from('<3f', data, 84 + 50*i + 12 + 12*j) for i in range(count) for j in range(3)]
    bounds = [[min(v[a] for v in points), max(v[a] for v in points)] for a in range(3)]
    label = name.removeprefix('Assem2 - ').removesuffix('.STL')
    hardware = label.startswith(('pi4withall', 'buck converter'))
    zone = 0 if label.startswith(('batcase','Twist lock battery','wing part')) else 2 if label.startswith(('top-', 'TPU gasket for top')) else 1
    parts.append(dict(id=label, label=label, zone=zone, hardware=hardware,
        filename=name, path=entry['path'], sha256=hashlib.sha256(data).hexdigest(), gitBlob=entry['sha'],
        triangles=count, bounds=bounds, data=base64.b64encode(data).decode()))
    print(label, count, bounds)
download('LICENSE', dest / 'LICENSE.txt')
download('First-Generation-Builds/V2_30-5-2026/README.md', dest / 'UPSTREAM-README.txt')
download('README.md', dest / 'UPSTREAM-PROJECT-README.txt')
manifest = {k:v for k,v in selection.items() if k!='files'}
manifest['parts'] = [{k:v for k,v in p.items() if k!='data'} for p in parts]
(dest/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(dest/'assembly.js').write_text('window.AUMANET_UPSTREAM='+json.dumps({**manifest,'parts':parts},separators=(',',':'))+';\n')
page = root/'docs/equipment-3d.html'
links = ''.join(f'<li><a href="assets/models/ties1887-v2/{urllib.parse.quote(p["filename"])}" download>{html.escape(p["label"])} · STL</a></li>' for p in parts)
page.write_text(re.sub(r'<ul id="downloads">.*?</ul>', '<ul id="downloads">'+links+'</ul>',page.read_text(encoding='utf-8'),flags=re.S),encoding='utf-8')
# Vendored browser renderer: no CDN requests at runtime.
vendor = root/'docs/assets/vendor'
vendor.mkdir(exist_ok=True)
for path, name in [('build/three.min.js','three.min.js'),('examples/js/controls/OrbitControls.js','OrbitControls.js'),('LICENSE','three-LICENSE.txt')]:
    url='https://raw.githubusercontent.com/mrdoob/three.js/r128/'+path
    (vendor/name).write_bytes(urllib.request.urlopen(url,timeout=60).read())
print('Imported',len(parts),'unchanged STLs; manifest includes SHA-256 and Git blob IDs.')
runpy.run_path(str(root / 'scripts/build-print-bundle.py'))['build']()
