"""Prepare a review-only overlay from the exact inspected upstream DTBO.

Never flashes a board or edits a boot partition. A generated overlay is not a
validated firmware release. Only the profile's exact upstream binary is accepted.
The tool patches fixed-size GPIO cells, retaining the original FDT/fixup layout.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct


ROOT = Path(__file__).resolve().parents[1]
PROFILE = json.loads((ROOT / 'firmware/heltec-profile.json').read_text(encoding='utf-8'))


def properties(blob):
    if len(blob) < 40:
        raise ValueError('Truncated FDT header')
    header = struct.unpack_from('>10I', blob)
    magic, total, structure, strings = header[:4]
    if magic != 0xD00DFEED or total > len(blob):
        raise ValueError('Invalid FDT header')
    strings_end = strings + header[8]
    structure_end = structure + header[9]
    if strings_end > total or structure_end > total:
        raise ValueError('Invalid FDT block bounds')
    stack = []
    offset = structure
    result = {}
    while offset + 4 <= structure_end:
        token = struct.unpack_from('>I', blob, offset)[0]
        offset += 4
        if token == 1:
            end = blob.index(0, offset, structure_end)
            stack.append(blob[offset:end].decode('ascii'))
            offset = (end + 4) & ~3
        elif token == 2:
            if not stack:
                raise ValueError('Unbalanced FDT node')
            stack.pop()
        elif token == 3:
            length, name_offset = struct.unpack_from('>II', blob, offset)
            offset += 8
            name_start = strings + name_offset
            if name_start >= strings_end or offset + length > structure_end:
                raise ValueError('Invalid FDT property bounds')
            name_end = blob.index(0, name_start, strings_end)
            key = ('/'.join(stack), blob[name_start:name_end].decode('ascii'))
            if key in result:
                raise ValueError('Duplicate FDT property')
            result[key] = (offset, bytes(blob[offset:offset + length]))
            offset = (offset + length + 3) & ~3
        elif token == 4:
            continue
        elif token == 9:
            if stack:
                raise ValueError('FDT ended inside a node')
            return result
        else:
            raise ValueError(f'Unexpected FDT token {token}')
    raise ValueError('Missing FDT end token')


def adapt(source):
    digest = hashlib.sha256(source).hexdigest()
    if digest != PROFILE['upstream_overlay_sha256']:
        raise ValueError('Source hash differs from inspected OpenMANET 1.8.0 overlay; no output written')
    props = properties(source)
    node = '/fragment@0/__overlay__/mm6108@0'
    gpio = '/fragment@1/__overlay__/'
    # Property path, cell index, expected old value, proposed new value.
    edits = [
        (node, 'reset-gpios', 1, 17, 5),
        (node, 'spi-irq-gpios', 1, 5, 25),
        (node, 'power-gpios', 1, 23, 3),
        (node, 'power-gpios', 4, 24, 7),
        (gpio + 'morse_reset', 'brcm,pins', 0, 17, 5),
        (gpio + 'morse_irq', 'brcm,pins', 0, 5, 25),
        (gpio + 'morse_wake', 'brcm,pins', 0, 23, 3),
        (gpio + 'morse_busy', 'brcm,pins', 0, 24, 7),
    ]
    output = bytearray(source)
    report = []
    changed = set()
    for node_path, prop, cell, expected, proposed in edits:
        offset, value = props[(node_path, prop)]
        relative = cell * 4
        if relative + 4 > len(value) or struct.unpack_from('>I', value, relative)[0] != expected:
            raise ValueError(f'Unexpected value: {node_path}/{prop} cell {cell}')
        struct.pack_into('>I', output, offset + relative, proposed)
        changed.update(range(offset + relative, offset + relative + 4))
        report.append({'node': node_path, 'property': prop, 'cell': cell, 'old': expected, 'new': proposed})
    # Independently parse the resulting blob and ensure every intended cell is set.
    actual = properties(output)
    for node_path, prop, cell, _, proposed in edits:
        if struct.unpack_from('>I', actual[(node_path, prop)][1], cell * 4)[0] != proposed:
            raise ValueError('Output property verification failed')
    if len(output) != len(source) or any(a != b and i not in changed for i, (a, b) in enumerate(zip(source, output))):
        raise ValueError('Unexpected binary change outside intended GPIO cells')
    return bytes(output), report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Extracted upstream mm610x-spi.dtbo, not a whole image')
    parser.add_argument('output', type=Path, help='New review-only DTBO file; will not overwrite an existing file')
    args = parser.parse_args()
    if args.output.resolve() == args.source.resolve():
        parser.error('Source must be preserved')
    blob, edits = adapt(args.source.read_bytes())
    with args.output.open('xb') as handle:
        handle.write(blob)
    print(json.dumps({
        'status': 'prepared-for-review-not-hardware-validated',
        'source_sha256': PROFILE['upstream_overlay_sha256'],
        'output_sha256': hashlib.sha256(blob).hexdigest(),
        'edits': edits,
        'boot_configuration_and_bcf': 'still require separate review',
    }, indent=2))


if __name__ == '__main__':
    main()
