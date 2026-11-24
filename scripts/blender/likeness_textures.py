"""
Our House: the skin and eyes for the two of us, painted onto the Quaternius
light skin (the face is the top-left of its 2048 texture). Plain Python with
Pillow, run before build_likeness.py:

    python scripts/blender/likeness_textures.py

Writes assets-build/house/likeness/: <who>_skin.png, <who>_eye.png and the
clothes, <who>_top.png and <who>_bottom.png. The clothes are wrapped round
the body (build_likeness.py): across is once round, from the back; up is the
height in metres over 2, so a border at a height is a row here.
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEX = os.path.join(ROOT, "assets-src", "house", "characters", "Universal Base Characters[Standard]", "Base Characters", "Textures")
OUT = os.path.join(ROOT, "assets-build", "house", "likeness")
os.makedirs(OUT, exist_ok=True)

rng = np.random.default_rng(7)
H = W = 2048
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


def ellipse(cx, cy, rx, ry, feather=0.25):
    """1 inside, 0 outside, a soft edge `feather` of the radius wide."""
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    return np.clip((1 - d) / feather, 0, 1)


def blur(a, r):
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255


def paint(rgb, mask, colour, amount=1.0):
    m = (np.clip(mask, 0, 1) * amount)[..., None]
    return rgb * (1 - m) + np.array(colour, np.float32) * m


def skin_tone(rgb, target, face):
    """Shift the whole skin so the face's middle is `target`."""
    sample = rgb[face > 0.9]
    med = np.median(sample, axis=0)
    return np.clip(rgb * (np.array(target, np.float32) / med), 0, 255)


def hair_noise(scale):
    """Hair-like speckle: fine noise, a little blurred, so it reads as stubble or curls."""
    n = rng.random((H, W)).astype(np.float32)
    return blur(n, scale)


def eye(iris_dark):
    im = np.asarray(Image.open(os.path.join(TEX, "T_Eye_Brown.png")).convert("RGB"), np.float32)
    h, w = im.shape[:2]
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt((x - w * 0.5) ** 2 + (y - h * 0.5) ** 2) / (w * 0.5)
    iris = np.clip((0.17 - d) / 0.03, 0, 1)[..., None]
    im = im * (1 - iris * iris_dark)
    return Image.fromarray(np.clip(im, 0, 255).astype(np.uint8))


def jonal():
    rgb = np.asarray(Image.open(os.path.join(TEX, "T_Superhero_Male_Ligh.png")).convert("RGB"), np.float32)
    face = ellipse(382, 420, 200, 150, 0.1)
    nose_x, lips_y = 382, 546
    # Young skin: the base face's frown lines, creases and shadows smoothed away (not the eyes or lips).
    keep = np.maximum.reduce([ellipse(278, 353, 48, 30, 0.4), ellipse(482, 353, 48, 30, 0.4), ellipse(nose_x, lips_y, 70, 22, 0.4)])
    smooth = blur(np.ones((H, W), np.float32), 0) * ellipse(382, 440, 330, 300, 0.3) * (1 - keep)
    soft = np.asarray(Image.fromarray(rgb.astype(np.uint8)).filter(ImageFilter.GaussianBlur(14)), np.float32)
    rgb = rgb * (1 - smooth[..., None]) + soft * smooth[..., None]
    rgb = skin_tone(rgb, (172, 124, 96), face)
    # A short, neat full beard: jaw, chin and lower cheeks with a clean cheek line, and a moustache.
    dx = np.abs(xx - nose_x)
    cheek = 505 - 90 * np.clip((dx - 280) / 100, 0, 1)
    beard = np.clip((yy - cheek) / 10, 0, 1) * np.clip((750 - yy) / 40, 0, 1) * (dx < 420)
    tache = ellipse(nose_x, 520, 88, 18, 0.4)
    beard = np.maximum(beard, tache)
    beard *= 1 - ellipse(nose_x, lips_y, 62, 15, 0.35)  # the lips show through
    beard *= 1 - ellipse(nose_x, 470, 50, 36, 0.4)  # not on the nose
    beard = blur(beard, 4)
    fill = 0.8 + 0.2 * hair_noise(0.8)
    rgb = paint(rgb, beard * fill, (26, 19, 17), 0.95)
    # Natural lips, a touch darker.
    rgb = paint(rgb, ellipse(nose_x, lips_y, 58, 13, 0.5), (138, 86, 78), 0.45)
    Image.fromarray(rgb.astype(np.uint8)).save(os.path.join(OUT, "jonal_skin.png"))
    eye(0.55).save(os.path.join(OUT, "jonal_eye.png"))
    # The bumps that go with it: the face's creases flattened too.
    n = np.asarray(Image.open(os.path.join(TEX, "T_Superhero_Male_Normal.png")).convert("RGB"), np.float32)
    flat = smooth[..., None] * 0.8
    n = n * (1 - flat) + np.array((128, 128, 255), np.float32) * flat
    Image.fromarray(n.astype(np.uint8)).save(os.path.join(OUT, "jonal_normal.png"))


def parul():
    rgb = np.asarray(Image.open(os.path.join(TEX, "T_Superhero_Female_Light_BaseColor.png")).convert("RGB"), np.float32)
    # No freckles: smooth the cheeks.
    cheeks = np.maximum(ellipse(270, 445, 160, 70, 0.5), ellipse(485, 445, 160, 70, 0.5))
    soft = np.asarray(Image.fromarray(rgb.astype(np.uint8)).filter(ImageFilter.MedianFilter(9)), np.float32)
    rgb = rgb * (1 - cheeks[..., None]) + soft * cheeks[..., None]
    face = ellipse(377, 420, 200, 150, 0.1)
    rgb = skin_tone(rgb, (204, 156, 134), face)
    # Kajal: a dark line along each upper lid, flicking out at the corner.
    for cx, out in ((270, -1), (485, 1)):
        lid = ellipse(cx, 352, 62, 22, 0.25) * (1 - ellipse(cx, 362, 58, 20, 0.35))
        wing = ellipse(cx + out * 62, 350, 16, 6, 0.6)
        rgb = paint(rgb, blur(np.maximum(lid, wing), 1.5), (30, 22, 22), 0.85)
    # A small dark-red bindi between the brows.
    rgb = paint(rgb, ellipse(377, 318, 5, 5, 0.4), (120, 22, 34), 1.0)
    # Rose lipstick and a little blush.
    rgb = paint(rgb, ellipse(375, 540, 66, 26, 0.4), (176, 78, 92), 0.7)
    rgb = paint(rgb, np.maximum(ellipse(250, 470, 70, 40, 0.8), ellipse(505, 470, 70, 40, 0.8)), (220, 130, 125), 0.18)
    Image.fromarray(rgb.astype(np.uint8)).save(os.path.join(OUT, "parul_skin.png"))
    eye(0.6).save(os.path.join(OUT, "parul_eye.png"))


# The clothes: 1024 across (once round) by 1024 up (0 to 2 m).
C = 1024


def row(z):
    return int(round((1 - z / 2) * C))


def col(u):
    return int(round(u * C))


def mottled(base, light, dark, seed):
    """A printed cotton: soft blotches of a lighter and a darker shade."""
    r = np.random.default_rng(seed)
    a = np.asarray(Image.fromarray((r.random((C // 40, C // 40)) * 255).astype(np.uint8)).resize((C, C), Image.BICUBIC), np.float32) / 255
    b = np.asarray(Image.fromarray((r.random((C // 14, C // 14)) * 255).astype(np.uint8)).resize((C, C), Image.BICUBIC), np.float32) / 255
    img = np.full((C, C, 3), base, np.float32)
    img = paint_flat(img, np.clip((a - 0.55) * 3, 0, 1) * 0.7, light)
    img = paint_flat(img, np.clip((b - 0.6) * 3, 0, 1) * 0.45, dark)
    return img


def paint_flat(img, mask, colour):
    m = mask[..., None]
    return img * (1 - m) + np.array(colour, np.float32) * m


def flower(d, x, y, r, petals, centre):
    for k in range(5):
        a = k / 5 * 2 * np.pi
        px, py = x + np.cos(a) * r * 0.6, y + np.sin(a) * r * 0.6
        d.ellipse((px - r * 0.5, py - r * 0.5, px + r * 0.5, py + r * 0.5), fill=petals)
    d.ellipse((x - r * 0.3, y - r * 0.3, x + r * 0.3, y + r * 0.3), fill=centre)


PINKS = [(222, 120, 140), (236, 160, 168), (200, 96, 118), (242, 236, 226)]
GOLD = (190, 166, 116)
LEAF = (104, 156, 128)


def embroidery(d, r, z0, z1, n, size):
    """Dense flowers, leaves and gold stitches between two heights."""
    for _ in range(n):
        x, y = r.uniform(0, C), r.uniform(row(z1), row(z0))
        k = r.random()
        if k < 0.55:
            flower(d, x, y, r.uniform(size * 0.7, size * 1.3), PINKS[r.integers(4)], GOLD)
        elif k < 0.8:
            d.ellipse((x - size * 0.5, y - size * 0.2, x + size * 0.5, y + size * 0.2), fill=LEAF)
        else:
            d.line((x, y, x + r.uniform(-size, size), y + r.uniform(-size, size)), fill=GOLD, width=2)


def scattered(d, r, z0, z1, n, size):
    for _ in range(n):
        flower(d, r.uniform(0, C), r.uniform(row(z1), row(z0)), size, PINKS[r.integers(4)], GOLD)


def gold_band(d, z0, z1, scallop=0):
    d.rectangle((0, row(z1), C, row(z0)), fill=GOLD)
    if scallop:
        for x in range(0, C + scallop, scallop):
            d.ellipse((x - scallop / 2, row(z0) - scallop / 2, x + scallop / 2, row(z0) + scallop / 2), fill=GOLD)


def jonal_clothes():
    # The olive printed shirt (photo 4), two chest pockets with flaps, buttoned down the front.
    img = Image.fromarray(mottled((112, 102, 80), (150, 140, 112), (78, 70, 56), 3).astype(np.uint8))
    d = ImageDraw.Draw(img)
    seam = (70, 64, 50)
    for side in (-1, 1):
        u = 0.5 + side * 0.085
        x0, x1 = col(u - 0.042), col(u + 0.042)
        d.rectangle((x0, row(1.41), x1, row(1.27)), outline=seam, width=2)
        d.rectangle((x0, row(1.41), x1, row(1.37)), fill=(98, 90, 70), outline=seam, width=2)
        d.ellipse((col(u) - 3, row(1.385) - 3, col(u) + 3, row(1.385) + 3), fill=(60, 50, 40))
    d.line((col(0.5) - 6, row(1.52), col(0.5) - 6, row(0.9)), fill=seam, width=2)
    d.line((col(0.5) + 6, row(1.52), col(0.5) + 6, row(0.9)), fill=seam, width=2)
    for z in np.arange(1.48, 0.95, -0.09):
        d.ellipse((col(0.5) - 4, row(z) - 4, col(0.5) + 4, row(z) + 4), fill=(60, 50, 40))
    img.save(os.path.join(OUT, "jonal_top.png"))
    # Black jeans: near black with a faint twill.
    jeans = np.full((C, C, 3), (30, 30, 33), np.float32) + hair_noise(0.6)[:C, :C, None] * 10
    Image.fromarray(np.clip(jeans, 0, 255).astype(np.uint8)).save(os.path.join(OUT, "jonal_bottom.png"))


AQUA = (108, 192, 190)


def parul_clothes():
    # The aqua kurta (photo 3): open down the front with gold borders, a mandarin collar,
    # little pink flowers all over, and dense embroidery above a scalloped gold hem.
    r = np.random.default_rng(11)
    img = Image.new("RGB", (C, C), AQUA)
    d = ImageDraw.Draw(img)
    scattered(d, r, 0.9, 1.5, 150, 5)
    embroidery(d, r, 0.72, 0.88, 900, 6)
    gold_band(d, 0.70, 0.715, scallop=16)
    for u in (0.5 - 0.014, 0.5 + 0.014):
        d.rectangle((col(u) - 5, row(1.5), col(u) + 5, row(0.7)), fill=GOLD)
    img.save(os.path.join(OUT, "parul_top.png"))
    # The palazzo: the same aqua, flowers here and there, an embroidered border at the ankle.
    img = Image.new("RGB", (C, C), AQUA)
    d = ImageDraw.Draw(img)
    scattered(d, r, 0.3, 1.1, 260, 5)
    embroidery(d, r, 0.08, 0.26, 1100, 6)
    gold_band(d, 0.0, 0.08)
    img.save(os.path.join(OUT, "parul_bottom.png"))


jonal()
parul()
jonal_clothes()
parul_clothes()
print("[likeness] textures")
