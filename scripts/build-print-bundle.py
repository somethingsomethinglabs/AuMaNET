"""Build a standard geometry-only 3MF from live STL files (Python stdlib only)."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import time
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/assets/models/ties1887-v2'
OUTPUT = ROOT / 'hardware/print'
NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
ET.register_namespace('', NS)


def inputs():
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    parts = [p for p in manifest['parts'] if not p['hardware']]
    return manifest, [(p, (SOURCE / p['filename']).read_bytes()) for p in parts]


def signature():
    manifest, parts = inputs()
    return hashlib.sha256(json.dumps(manifest, sort_keys=True).encode() + b''.join(
        p['filename'].encode() + hashlib.sha256(data).digest() for p, data in parts)).hexdigest()


def build():
    target = OUTPUT / 'AuMaNET-parts.3mf'
    if target.exists():
        with zipfile.ZipFile(target) as existing:
            entries = set(existing.namelist())
            generated_entries = {'[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model'}
            if entries != generated_entries:
                raise ValueError(
                    f'Refusing to overwrite a slicer-edited or unrecognized 3MF: {target}. '
                    'Save the arranged project under a separate name, then move the '
                    'original out of this generated output path before rebuilding. '
                    'Rebuilding does not preserve plate arrangements or slicer settings.')
    manifest, parts = inputs()
    model = ET.Element(f'{{{NS}}}model', unit='millimeter', attrib={'{http://www.w3.org/XML/1998/namespace}lang': 'en-US'})
    ET.SubElement(model, f'{{{NS}}}metadata', name='Title').text = 'AuMaNET upstream V2 printable parts'
    ET.SubElement(model, f'{{{NS}}}metadata', name='Designer').text = 'ties1887'
    ET.SubElement(model, f'{{{NS}}}metadata', name='Description').text = 'CC BY-NC-SA 4.0; upstream geometry; Heltec fit unverified. Arrange and slice in Bambu Studio.'
    resources = ET.SubElement(model, f'{{{NS}}}resources')
    build_node = ET.SubElement(model, f'{{{NS}}}build')
    records = []
    # A separated staging layout, deliberately not a single print plate.
    for oid, (part, data) in enumerate(parts, 1):
        if len(data) < 84:
            raise ValueError(f"Truncated STL: {part['filename']}")
        count = struct.unpack_from('<I', data, 80)[0]
        if not count or len(data) != 84 + 50 * count:
            raise ValueError(f"Expected nonempty binary STL: {part['filename']}")
        vertices, triangles, lookup = [], [], {}
        for i in range(count):
            triangle = []
            for j in range(3):
                point = struct.unpack_from('<3f', data, 84 + i * 50 + 12 + j * 12)
                if not all(math.isfinite(v) for v in point):
                    raise ValueError(f"Nonfinite vertex: {part['filename']}")
                if point not in lookup:
                    lookup[point] = len(vertices)
                    vertices.append(point)
                triangle.append(lookup[point])
            triangles.append(triangle)
        low = [min(v[a] for v in vertices) for a in range(3)]
        size = [max(v[a] for v in vertices) - low[a] for a in range(3)]
        material = 'TPU' if 'TPU' in part['label'] else 'rigid material - select in slicer'
        obj = ET.SubElement(resources, f'{{{NS}}}object', id=str(oid), type='model', name=f"{part['label']} [{material}]")
        mesh = ET.SubElement(obj, f'{{{NS}}}mesh')
        vs = ET.SubElement(mesh, f'{{{NS}}}vertices')
        for point in vertices:
            ET.SubElement(vs, f'{{{NS}}}vertex', **dict(zip(('x', 'y', 'z'), (repr(v) for v in point))))
        ts = ET.SubElement(mesh, f'{{{NS}}}triangles')
        for tri in triangles:
            ET.SubElement(ts, f'{{{NS}}}triangle', **dict(zip(('v1', 'v2', 'v3'), map(str, tri))))
        tx, ty, tz = ((oid - 1) % 4 * 110 - low[0], (oid - 1) // 4 * 110 - low[1], -low[2])
        ET.SubElement(build_node, f'{{{NS}}}item', objectid=str(oid), transform=f'1 0 0 0 1 0 0 0 1 {tx} {ty} {tz}')
        records.append(dict(filename=part['filename'], sha256=hashlib.sha256(data).hexdigest(), triangles=count, size_mm=size, material=material, quantity=1))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix('.3mf.tmp')
    with zipfile.ZipFile(temp, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
        archive.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
        archive.writestr('3D/3dmodel.model', ET.tostring(model, encoding='utf-8', xml_declaration=True))
    temp.replace(target)
    (OUTPUT / 'parts-manifest.json').write_text(json.dumps(dict(source=manifest['repository'], commit=manifest['commit'], license=manifest['license'], parts=records), indent=2) + '\n')
    print(f'Built {target}: {len(records)} parts, {sum(p["triangles"] for p in records):,} triangles.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--watch', action='store_true', help='Rebuild after source changes; Ctrl+C stops.')
    args = parser.parse_args()
    build()
    last = signature()
    if args.watch:
        print('Watching STL files and manifest every 2 seconds. Ctrl+C stops.', flush=True)
        while True:
            time.sleep(2)
            try:
                current = signature()
                if current != last:
                    time.sleep(0.5)
                    if signature() != current:
                        continue
                    build()
                    last = current
            except (OSError, ValueError, struct.error) as error:
                print(f'Rebuild deferred; keeping previous 3MF: {error}', flush=True)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('Watcher stopped.')
