"""Original icon for TELEMAC-MASCARET Language Support.

Motif: an unstructured triangular mesh (finite elements) over which a free
surface wave runs. Drawn at 4x and downsampled for clean anti-aliasing.
"""
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.spatial import Delaunay

OUT = sys.argv[1]
SS = 4
N = 256 * SS
rng = np.random.default_rng(7)

TOP = np.array([11, 57, 84])      # #0B3954 deep navy
BOTTOM = np.array([8, 126, 139])  # #087E8B teal
WATER_TOP = np.array([64, 196, 214])
WATER_BOT = np.array([20, 120, 160])


def lerp(a, b, t):
    return (a + (b - a) * t).astype(int)


# --- background gradient in a rounded square --------------------------------
bg = Image.new("RGBA", (N, N))
px = bg.load()
for y in range(N):
    c = lerp(TOP, BOTTOM, y / (N - 1))
    for x in range(N):
        px[x, y] = (*c, 255)
mask = Image.new("L", (N, N), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, N - 1, N - 1], radius=int(N * 0.20), fill=255)

# --- free surface ------------------------------------------------------------
def surface(x):
    u = x / N
    return N * (0.60 - 0.095 * math.cos(2 * math.pi * (u - 0.68))
                - 0.035 * math.sin(4 * math.pi * (u - 0.68)))

# --- triangular mesh (jittered points, Delaunay) -----------------------------
pts = []
step = N / 4.0
for j in range(-1, 7):
    for i in range(-1, 7):
        x = i * step + (step / 2 if j % 2 else 0) + rng.uniform(-0.22, 0.22) * step
        y = j * step * 0.87 + rng.uniform(-0.22, 0.22) * step
        pts.append((x, y))
pts = np.array(pts)
tri = Delaunay(pts)

mesh = Image.new("RGBA", (N, N), (0, 0, 0, 0))
md = ImageDraw.Draw(mesh)
edges = set()
for a, b, c in tri.simplices:
    for p, q in ((a, b), (b, c), (c, a)):
        edges.add((min(p, q), max(p, q)))
lw = int(N * 0.011)
for p, q in edges:
    md.line([tuple(pts[p]), tuple(pts[q])], fill=(255, 255, 255, 120), width=lw)
r = int(N * 0.018)
for x, y in pts:
    md.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, 170))

# --- water body below the surface -------------------------------------------
water = Image.new("RGBA", (N, N), (0, 0, 0, 0))
wpx = water.load()
for x in range(N):
    s = int(surface(x))
    for y in range(max(s, 0), N):
        t = (y - s) / max(N - s, 1)
        c = lerp(WATER_TOP, WATER_BOT, t)
        wpx[x, y] = (*c, 215)

# crest line with a soft glow
crest = Image.new("RGBA", (N, N), (0, 0, 0, 0))
cd = ImageDraw.Draw(crest)
hw = N * 0.020  # half width of the crest stroke
x = -hw
while x <= N + hw:  # stamp discs densely along the curve: smooth round stroke
    y = surface(x)
    cd.ellipse([x - hw, y - hw, x + hw, y + hw], fill=(255, 255, 255, 255))
    x += 0.5
glow = crest.filter(ImageFilter.GaussianBlur(N * 0.02))

img = Image.alpha_composite(bg, mesh)
img = Image.alpha_composite(img, water)
# mesh continues faintly under water
under = mesh.copy()
under.putalpha(under.getchannel("A").point(lambda a: int(a * 0.45)))
uw = Image.new("RGBA", (N, N), (0, 0, 0, 0))
umask = Image.new("L", (N, N), 0)
ImageDraw.Draw(umask).polygon([(x, surface(x)) for x in range(0, N + 1, 4)] + [(N, N), (0, N)], fill=255)
uw.paste(under, (0, 0), umask)
img = Image.alpha_composite(img, uw)
img = Image.alpha_composite(img, glow)
img = Image.alpha_composite(img, crest)

img.putalpha(Image.composite(img.getchannel("A"), Image.new("L", (N, N), 0), mask))
img = img.resize((256, 256), Image.LANCZOS)
img.save(OUT)
img.resize((128, 128), Image.LANCZOS).save(OUT.replace(".png", "-128-preview.png"))
img.resize((32, 32), Image.LANCZOS).resize((128, 128), Image.NEAREST).save(OUT.replace(".png", "-32-preview.png"))
print("saved", OUT)
