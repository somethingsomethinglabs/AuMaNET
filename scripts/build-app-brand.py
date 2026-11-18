"""Export supplied independent artwork to Android density/mask surfaces.

Requires Pillow. No artwork is redrawn. Inputs are the handover PNGs copied
unchanged to dev/app/static/brand; no design or production-data source is read.
"""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
assets = root / 'dev/app/static/brand'
res = root / 'dev/mobile/android/app/src/main/res'
icon = Image.open(assets / 'app-icon-1024.png').convert('RGBA')
mark = Image.open(assets / 'logo-mark-primary.png').convert('RGBA')
reverse = Image.open(assets / 'logo-mark-reverse.png').convert('RGBA')

def write(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format='PNG', optimize=True)

for density, size in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    folder = res / ('mipmap-' + density)
    flat = icon.resize((size, size), Image.Resampling.LANCZOS)
    write(flat, folder / 'ic_launcher.png')
    mask = Image.new('L', (size, size)); ImageDraw.Draw(mask).ellipse((0, 0, size-1, size-1), fill=255)
    rounded = flat.copy(); rounded.putalpha(mask)
    write(rounded, folder / 'ic_launcher_round.png')
    adaptive = round(size * 108 / 48)
    # Android masks the central 72dp of the 108dp adaptive layer. Place the
    # supplied square icon in that viewport instead of enlarging its mark.
    foreground = Image.new('RGBA', (adaptive, adaptive), '#F4F3EC')
    viewport = round(adaptive * 72 / 108)
    foreground.alpha_composite(icon.resize((viewport, viewport), Image.Resampling.LANCZOS), ((adaptive-viewport)//2, (adaptive-viewport)//2))
    write(foreground, folder / 'ic_launcher_foreground.png')
    # Preserve the transparent supplied mark's alpha for Android themed icons.
    mono = Image.new('RGBA', (adaptive, adaptive))
    scaled = mark.copy(); scaled.thumbnail((round(adaptive*.41), round(adaptive*.41)), Image.Resampling.LANCZOS)
    white = Image.new('RGBA', scaled.size, 'white'); white.putalpha(scaled.getchannel('A'))
    mono.alpha_composite(white, ((adaptive-white.width)//2, (adaptive-white.height)//2))
    write(mono, folder / 'ic_launcher_monochrome.png')

for variant, artwork in [('light', mark), ('dark', reverse)]:
    write(artwork, res / 'drawable' / ('launch_mark_' + variant + '.png'))
    (res / 'drawable' / ('launch_' + variant + '.xml')).write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">'
        '<item><shape><solid android:color="' + ('#182A24' if variant=='dark' else '#F4F3EC') + '"/></shape></item>'
        '<item android:width="80dp" android:height="60dp" android:gravity="center"><bitmap android:src="@drawable/launch_mark_' + variant + '" android:gravity="fill"/></item></layer-list>\n', encoding='utf-8')

(res / 'drawable-v24/ic_launcher_foreground.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@mipmap/ic_launcher_foreground" android:gravity="fill"/>\n', encoding='utf-8')
(res / 'drawable/aumanet_monochrome.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@mipmap/ic_launcher_monochrome" android:gravity="fill"/>\n', encoding='utf-8')
(res / 'values/ic_launcher_background.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">#F4F3EC</color></resources>\n', encoding='utf-8')
print('Exported independent mark, adaptive/round/themed icons, and both launch appearances.')
