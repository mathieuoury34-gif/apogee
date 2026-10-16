# Génère les icônes d'Apogée à partir du pictogramme : trois lunes qui montent en diagonale (croissant, demi-lune, pleine lune),
# sur fond encre. Les SVG sont rendus par Chromium (Playwright). usage : python3 tools/icons.py
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INK, MOON, FULL = '#16181B', '#ECE8E0', '#F0A61E'


def sw(px):
    """Épaisseur du trait des contours, en unités du pictogramme (100) : plus épais quand l'icône est petite."""
    return 1.8 if px >= 256 else 2.6 if px >= 128 else 3.6 if px >= 64 else 4.5 if px >= 40 else 5.5


def moons(stroke, full, strokew, fill=None):
    """Le pictogramme dans un repère 0–100 (centré, légèrement décalé comme dans la planche de Claude Design)."""
    fill = fill or stroke
    return (f'<g transform="translate(-2 3)">'
            f'<circle cx="22" cy="76" r="10" fill="none" stroke="{stroke}" stroke-width="{strokew}"/>'
            f'<path d="M22 66A10 10 0 0 1 22 86A5.5 10 0 0 0 22 66Z" fill="{fill}"/>'
            f'<circle cx="45" cy="53" r="14" fill="none" stroke="{stroke}" stroke-width="{strokew}"/>'
            f'<path d="M45 39A14 14 0 0 1 45 67Z" fill="{fill}"/>'
            f'<circle cx="73" cy="27" r="19" fill="{full}"/></g>')


def svg(px, scale, bg=None, shape='square', mono=False, strokew=None):
    """Icône carrée de `px` pixels ; `scale` = largeur du repère 0–100 / taille de l'image."""
    w = strokew if strokew is not None else sw(px)
    art = moons('#FFFFFF', '#FFFFFF', w) if mono else moons(MOON, FULL, w)
    k = scale
    tile = ''
    if bg:
        if shape == 'round': tile = f'<circle cx="50" cy="50" r="50" fill="{bg}"/>'
        elif shape == 'rounded': tile = f'<rect width="100" height="100" rx="22.5" fill="{bg}"/>'
        else: tile = f'<rect width="100" height="100" fill="{bg}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{px}" height="{px}" viewBox="0 0 100 100">{tile}'
            f'<g transform="translate(50 50) scale({k}) translate(-50 -50)">{art}</g></svg>')


JOBS = []  # (chemin, taille, svg)


def job(rel, px, scale, **kw):
    JOBS.append((rel, px, svg(px, scale, **kw)))


# web / PWA
job('public/icons/icon-512.png', 512, 0.66, bg=INK, shape='rounded')
job('public/icons/icon-192.png', 192, 0.66, bg=INK, shape='rounded')
job('public/icons/icon-maskable-512.png', 512, 0.56, bg=INK)
job('public/icons/icon-maskable-192.png', 192, 0.56, bg=INK)
job('public/icons/apple-touch-icon.png', 180, 0.64, bg=INK)
job('public/icons/favicon-32.png', 32, 0.86, bg=INK, shape='rounded')
# Android : lanceur (anciennes versions) et premier plan de l'icône adaptative (fond : #16181B, zone sûre 66/108)
for dens, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    job(f'android-shell/res/mipmap-{dens}/ic_launcher.png', px, 0.70, bg=INK, shape='rounded')
    job(f'android-shell/res/mipmap-{dens}/ic_launcher_round.png', px, 0.62, bg=INK, shape='round')
for dens, px in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
    job(f'android-shell/res/mipmap-{dens}/ic_launcher_foreground.png', px, 0.52)
# icône de notification : silhouette blanche sur transparent
for dens, px in {'mdpi': 24, 'hdpi': 36, 'xhdpi': 48, 'xxhdpi': 72, 'xxxhdpi': 96}.items():
    job(f'android-shell/res/drawable-{dens}/ic_stat_apogee.png', px, 0.98, mono=True, strokew=7)

if __name__ == '__main__':
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        for rel, px, s in JOBS:
            pg.set_viewport_size({'width': px, 'height': px})
            pg.set_content(f'<html><body style="margin:0;background:transparent">{s}</body></html>')
            out = os.path.join(ROOT, rel)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            pg.screenshot(path=out, omit_background=True, clip={'x': 0, 'y': 0, 'width': px, 'height': px})
        b.close()
    print(len(JOBS), 'icônes')
