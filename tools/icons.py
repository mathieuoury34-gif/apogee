# Génère les icônes d'Quadra à partir du pictogramme : un anneau en quatre arcs, aux couleurs des quatre sports
# (natation, vélo, course, renforcement). usage : python3 tools/icons.py
import math, os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAPER = (233, 227, 214)
COL = [(30, 157, 184), (240, 166, 30), (226, 85, 46), (106, 91, 214)]  # natation, vélo, course, renforcement
SS = 4

def ring(size, scale, colors=COL, bg=None, shape='square'):
    """Anneau de quatre arcs ; `scale` = diamètre extérieur / taille de l'image."""
    S = size * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg is not None:
        if shape == 'round': d.ellipse([0, 0, S - 1, S - 1], fill=bg + (255,))
        elif shape == 'rounded': d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=bg + (255,))
        else: d.rectangle([0, 0, S, S], fill=bg + (255,))
    R = S * scale / 2
    w = R * 0.40
    r = R - w / 2
    cx = cy = S / 2
    gap, span = 34, 56  # degrés
    for i, c in enumerate(colors):
        a0 = -90 + gap / 2 + i * 90
        d.arc([cx - R, cy - R, cx + R, cy + R], a0, a0 + span, fill=c + (255,), width=int(w))
        for ang in (a0, a0 + span):
            px, py = cx + r * math.cos(math.radians(ang)), cy + r * math.sin(math.radians(ang))
            d.ellipse([px - w / 2, py - w / 2, px + w / 2, py + w / 2], fill=c + (255,))
    return im.resize((size, size), Image.LANCZOS)

def save(im, rel):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True); im.save(p)

# web / PWA
save(ring(512, 0.62, bg=PAPER, shape='rounded'), 'public/icons/icon-512.png')
save(ring(192, 0.62, bg=PAPER, shape='rounded'), 'public/icons/icon-192.png')
save(ring(512, 0.56, bg=PAPER), 'public/icons/icon-maskable-512.png')
save(ring(192, 0.56, bg=PAPER), 'public/icons/icon-maskable-192.png')
save(ring(180, 0.62, bg=PAPER).convert('RGB'), 'public/icons/apple-touch-icon.png')
save(ring(32, 0.78, bg=PAPER, shape='rounded'), 'public/icons/favicon-32.png')
# Android : lanceur
for dens, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    save(ring(px, 0.62, bg=PAPER, shape='rounded'), f'android-shell/res/mipmap-{dens}/ic_launcher.png')
    save(ring(px, 0.62, bg=PAPER, shape='round'), f'android-shell/res/mipmap-{dens}/ic_launcher_round.png')
for dens, px in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
    save(ring(px, 0.50), f'android-shell/res/mipmap-{dens}/ic_launcher_foreground.png')  # zone sûre : 66/108
# icône de notification (monochrome)
for dens, px in {'mdpi': 24, 'hdpi': 36, 'xhdpi': 48, 'xxhdpi': 72, 'xxxhdpi': 96}.items():
    save(ring(px, 0.92, colors=[(255, 255, 255)] * 4), f'android-shell/res/drawable-{dens}/ic_stat_quadra.png')
print('ok')
