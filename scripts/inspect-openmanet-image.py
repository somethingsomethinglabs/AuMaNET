"""Read-only inspection of the exact reviewed OpenMANET image; never boots/flashes it.

Extracts only the reviewed boot config files and SPI DTBO into a new directory.
This is an evidence/maintainer tool, not a general disk-image extractor.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import runpy
import struct

ROOT = Path(__file__).resolve().parents[1]
PROFILE = json.loads((ROOT / 'firmware/heltec-profile.json').read_text(encoding='utf-8'))


def inspect(image):
    with image.open('rb') as handle:
        digest = hashlib.file_digest(handle, 'sha256').hexdigest()
    if digest != PROFILE['asset_sha256']:
        raise ValueError('Image hash differs from reviewed release; no output written')
    with gzip.open(image, 'rb') as handle:
        mbr = handle.read(512)
        start, sectors = struct.unpack_from('<II', mbr, 454)
        if mbr[510:512] != b'\x55\xaa' or start != 8192 or sectors != 131072:
            raise ValueError('Unexpected boot partition layout')
        handle.seek(start * 512)
        boot = handle.read(sectors * 512)
    if len(boot) != sectors * 512:
        raise ValueError('Truncated boot partition')
    bps = struct.unpack_from('<H', boot, 11)[0]
    spc = boot[13]
    reserved = struct.unpack_from('<H', boot, 14)[0]
    fats = boot[16]
    root_entries = struct.unpack_from('<H', boot, 17)[0]
    fat_sectors = struct.unpack_from('<H', boot, 22)[0]
    if (bps, spc, reserved, fats, root_entries, fat_sectors) != (512, 4, 4, 2, 512, 128):
        raise ValueError('Unexpected FAT geometry')
    fat = boot[reserved * bps:(reserved + fat_sectors) * bps]
    root_offset = (reserved + fats * fat_sectors) * bps
    data_offset = root_offset + root_entries * 32
    cluster_size = bps * spc

    def chain(cluster):
        output = bytearray()
        seen = set()
        while 2 <= cluster < 0xfff8:
            if cluster in seen or cluster * 2 + 2 > len(fat):
                raise ValueError('Invalid FAT chain')
            seen.add(cluster)
            offset = data_offset + (cluster - 2) * cluster_size
            if offset + cluster_size > len(boot):
                raise ValueError('Cluster outside boot partition')
            output.extend(boot[offset:offset + cluster_size])
            cluster = struct.unpack_from('<H', fat, cluster * 2)[0]
        return bytes(output)

    def directory(data):
        long_name = []
        for offset in range(0, len(data), 32):
            entry = data[offset:offset + 32]
            if len(entry) != 32 or entry[0] == 0:
                break
            if entry[0] == 229:
                long_name = []
                continue
            if entry[11] == 15:
                long_name.append((entry[0] & 31, entry[1:11] + entry[14:26] + entry[28:32]))
                continue
            stem = entry[:8].decode('ascii').strip()
            ext = entry[8:11].decode('ascii').strip()
            name = stem + ('.' + ext if ext else '')
            if long_name:
                name = b''.join(item[1] for item in sorted(long_name)).decode('utf-16le').split('\0')[0].rstrip('\uffff')
            long_name = []
            yield name.lower(), entry[11], struct.unpack_from('<H', entry, 26)[0], struct.unpack_from('<I', entry, 28)[0]

    extracted = {}
    for name, attr, cluster, length in directory(boot[root_offset:root_offset + root_entries * 32]):
        if name in ('config.txt', 'distroconfig.txt') and not attr & 16:
            extracted[name] = chain(cluster)[:length]
        elif name == 'overlays' and attr & 16:
            for filename, fileattr, filecluster, size in directory(chain(cluster)):
                if filename == PROFILE['upstream_overlay'] and not fileattr & 16:
                    extracted[filename] = chain(filecluster)[:size]
    if set(extracted) != {'config.txt', 'distroconfig.txt', PROFILE['upstream_overlay']}:
        raise ValueError('Missing reviewed files')
    if hashlib.sha256(extracted[PROFILE['upstream_overlay']]).hexdigest() != PROFILE['upstream_overlay_sha256']:
        raise ValueError('Unexpected compiled overlay hash')
    return extracted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', type=Path)
    parser.add_argument('output_directory', type=Path, help='Must not already exist')
    args = parser.parse_args()
    if args.output_directory.exists():
        parser.error('Output directory already exists; preserve the previous review')
    files = inspect(args.image)
    properties = runpy.run_path(str(ROOT / 'scripts/prepare-heltec-overlay.py'))['properties']
    props = properties(files[PROFILE['upstream_overlay']])
    node = '/fragment@0/__overlay__/mm6108@0'
    def cells(prop):
        value = props[(node, prop)][1]
        return list(struct.unpack('>' + str(len(value) // 4) + 'I', value))
    report = {
        'status': 'inspected-not-hardware-validated',
        'asset_sha256': PROFILE['asset_sha256'],
        'overlay_sha256': PROFILE['upstream_overlay_sha256'],
        'compiled_bcm': {
            'reset': cells('reset-gpios')[1],
            'interrupt': cells('spi-irq-gpios')[1],
            'power_gpio_pair': [cells('power-gpios')[1], cells('power-gpios')[4]],
        },
        'boot_contains_i2c1_enable': 'dtparam=i2c1=on' in files['distroconfig.txt'].decode('utf-8'),
        'warning': 'No boot configuration, BCF, board or Australian RF profile validated',
    }
    args.output_directory.mkdir()
    for name, data in files.items():
        (args.output_directory / name).write_bytes(data)
    (args.output_directory / 'inspection.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
