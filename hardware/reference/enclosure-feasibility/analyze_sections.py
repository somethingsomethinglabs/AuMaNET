"""Read-only enclosure section comparison. No printable parts are generated.

Run after caching the cited upstream STEP references in the directory passed
with --cache (see README). Requires cadquery, trimesh, numpy and matplotlib.
"""
from pathlib import Path
import argparse
import json
import hashlib
import numpy as np
import cadquery as cq
import trimesh
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--cache', type=Path, default=Path.home() / 'AppData/Local/Temp/aumanet-case-research')
args = parser.parse_args()
data = {'upstream_commit': 'f0d285c67bc893ddacc5d8121fe1c92385cd54fb', 'date': '2026-11-06',
        'units': 'mm', 'source_parts': [], 'status': 'Feasibility measurements only; no adapted CAD or complete fit validation'}
for f in sorted(args.cache.rglob('*.STEP')):
    record = {'path': str(f.relative_to(args.cache)).replace('\\', '/'),
              'sha256': hashlib.sha256(f.read_bytes()).hexdigest()}
    s = cq.importers.importStep(str(f)).val()
    if not s.Solids():
        record['note'] = 'External-reference assembly: simple import has no geometry'
    else:
        b = s.BoundingBox()
        record['bounds'] = [[b.xmin, b.xmax], [b.ymin, b.ymax], [b.zmin, b.zmax]]
        record['size_raw_axes'] = [b.xlen, b.ylen, b.zlen]
        record['solid_count'] = len(s.Solids())
    data['source_parts'].append(record)

v2root = REPO / 'docs/assets/models/ties1887-v2'
manifest = json.loads((v2root / 'manifest.json').read_text())
all_bounds = np.array([part['bounds'] for part in manifest['parts']])
data['v2_combined_bounds_size'] = (all_bounds[:, :, 1].max(axis=0) - all_bounds[:, :, 0].min(axis=0)).tolist()
fig, axes = plt.subplots(1, 2, figsize=(13, 6))
for ax in axes:
    ax.set_aspect('equal'); ax.grid(alpha=.2); ax.set_axisbelow(True)
    ax.set_xlabel('Width (mm)'); ax.set_ylabel('Depth (mm)')

radio = trimesh.load(v2root / 'Assem2 - base-1.STL', force='mesh')
section = radio.section(plane_normal=[0, 0, 1], plane_origin=[0, 0, 145])
for line in section.discrete:
    axes[0].plot(line[:, 0], line[:, 1], color='#46525e', lw=2)
axes[0].add_patch(Rectangle((13, 12), 26, 16, facecolor='#82c1a5', edgecolor='#1e6650'))
axes[0].text(26, 20, 'S3 + HaLow\n26 × 16 allowance', ha='center', va='center', fontsize=9)
axes[0].add_patch(Rectangle((43, 14), 30, 12, facecolor='#e3edf7', edgecolor='#3773a1', linestyle='--'))
axes[0].text(58, 20, 'Pi Zero\n30 × 12*', ha='center', va='center', fontsize=9)
axes[0].set_title('Existing V2 radio shell — section at Z = 145 mm\nInner contour bounding span ≈ 66.72 × 39.36 mm', fontsize=11)
axes[0].set_xlim(-2, 87); axes[0].set_ylim(-4, 52)
fig.text(.08, .12, '*Pi width is published; 12 mm depth is an assumed allowance.\nBare component spaces only; tray and cable fit remain unverified.', fontsize=8, va='top')

assembly = cq.importers.importStep(str(args.cache / 'battery-assembled-reference.step')).val()
cells = [s for s in assembly.Solids() if abs(s.Volume() - 25657) < 20]
main = next(s for s in assembly.Solids() if abs(s.Volume() - 45106) < 30)
b = main.BoundingBox()
for shape, color in [(main, '#46525e')] + [(s, '#b37b2d') for s in cells]:
    vs, ts = shape.tessellate(.05, .1)
    mesh = trimesh.Trimesh(vertices=[v.toTuple() for v in vs], faces=ts, process=False)
    sec = mesh.section(plane_normal=[0, 1, 0], plane_origin=[0, -40, 0])
    for line in sec.discrete:
        axes[1].plot(line[:, 0] - b.xmin, line[:, 2] - b.zmin, color=color, lw=1.7)
axes[1].set_title('Newer standalone battery pack — actual CAD section\nFour 21700 reference cells in a staggered arrangement', fontsize=11)
axes[1].set_xlim(-4, 75); axes[1].set_ylim(-4, 52)
fig.text(.56, .12, 'CAD cells are Ø21.5 mm; M50A example is Ø21.7 mm maximum.\nThis newer assembly is not a verified drop-in V2 battery module.', fontsize=8, va='top')
data['standalone_battery_cell_count'] = len(cells)
data['standalone_minimum_cell_axis_spacing'] = min(np.linalg.norm(np.array(a.Center().toTuple())[::2] - np.array(b.Center().toTuple())[::2]) for i, a in enumerate(cells) for b in cells[i + 1:])
data['v2_radio_section'] = {'z': 145, 'inner_contour_bounding_span': [66.72, 39.36], 'note': 'Single section; not an unobstructed cuboid'}
data['runtime_scenarios'] = [{'cells': n, 'nominal_Wh': n * 18, 'assumed_usable_Wh': n * 18 * .8,
                             'hours_at_load_W': {str(w): n * 18 * .8 / w for w in [.5, 1, 2, 5]},
                             'cell_mass_g': n * 68} for n in [2, 4, 6]]
(ROOT / 'measurements.json').write_text(json.dumps(data, indent=2) + '\n')
fig.suptitle('AuMaNET enclosure feasibility — measured source geometry, illustrative electronics placement', fontsize=14, fontweight='bold')
fig.text(.04, .02, 'Enclosure geometry © 2026 ties1887, CC BY-NC-SA 4.0. Analysis/annotations: AuMaNET. Not a released fit or wiring design.', fontsize=9)
fig.tight_layout(rect=(0, .18, 1, .91))
fig.savefig(ROOT / 'case-sections.png', dpi=170)
print('Measured references and section drawing saved; no CAD, STLs or print bundle changed.')
