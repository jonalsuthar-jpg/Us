"""
Isle's art, rendered in Blender from simple shapes made here (nothing
downloaded, nothing to license): the land tiles seen from straight above,
two of each so the island doesn't repeat, a painted sea, the resource card
pictures (the same little worlds seen from low down), and the development
card pictures.

Writes PNGs to assets-build/isle/ (scripts/build-isle-art.mjs turns them into
the JPEGs the apps ship).

  D:\\blender.exe -b --factory-startup -P scripts/blender/build_isle_art.py -- [--only forest,pasture] [--samples 48]
"""
import bpy
import math
import os
import random
import sys
import zlib
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets-build', 'isle')
os.makedirs(OUT, exist_ok=True)

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return args[args.index(name) + 1] if name in args else default


ONLY = set(arg('--only', '').split(',')) - {''}
SAMPLES = int(arg('--samples', '48'))
HEX_R = 1.0  # centre to corner


def seed_of(*key):
    """The same layout on every run (Python's hash() changes from run to run)."""
    return zlib.crc32(repr(key).encode())


# ---- Scene -------------------------------------------------------------------------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            if any(d.type == kind for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = 'GPU'
                break
        except Exception:
            pass
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    # Standard, not AgX: board-game colours want to be rich, not filmic.
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('world')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.75, 0.86, 1.0, 1)
    bg.inputs['Strength'].default_value = 0.42
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 4.2
    sun.angle = math.radians(9)
    sun.color = (1.0, 0.93, 0.82)
    o = bpy.data.objects.new('sun', sun)
    o.rotation_euler = (math.radians(52), math.radians(-22), math.radians(-35))
    scene.collection.objects.link(o)
    return scene


def material(name, color, color2=None, rough=0.75, scale=6.0, bump=0.15, metal=0.0, emit=0.0):
    """A painted-looking surface: two tones mixed by noise, with a little bump."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if color2 is None:
        p.inputs['Base Color'].default_value = (*color, 1)
    else:
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = scale
        noise.inputs['Detail'].default_value = 6
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (*color, 1)
        ramp.color_ramp.elements[1].color = (*color2, 1)
        ramp.color_ramp.elements[0].position = 0.35
        ramp.color_ramp.elements[1].position = 0.65
        nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
        if bump:
            b = nt.nodes.new('ShaderNodeBump')
            b.inputs['Strength'].default_value = bump
            nt.links.new(noise.outputs['Fac'], b.inputs['Height'])
            nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    if emit:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emit
    return m


def height_material(name, low, high, at=0.18, soft=0.05):
    """Rock going to snow above a height: for the peaks."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Roughness'].default_value = 0.85
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 18
    add = nt.nodes.new('ShaderNodeMath')
    add.operation = 'MULTIPLY_ADD'
    add.inputs[1].default_value = 0.04
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = at - soft
    ramp.color_ramp.elements[0].color = (*low, 1)
    ramp.color_ramp.elements[1].position = at + soft
    ramp.color_ramp.elements[1].color = (*high, 1)
    nt.links.new(geo.outputs['Position'], sep.inputs['Vector'])
    nt.links.new(noise.outputs['Fac'], add.inputs[0])
    nt.links.new(sep.outputs['Z'], add.inputs[2])
    nt.links.new(add.outputs['Value'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    return m


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def shape(kind, mat, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), smooth=True, **kw):
    """One primitive, made with bpy.ops (fine for the few hundred a tile needs)."""
    ops = {
        'cube': bpy.ops.mesh.primitive_cube_add,
        'sphere': bpy.ops.mesh.primitive_ico_sphere_add,
        'uv': bpy.ops.mesh.primitive_uv_sphere_add,
        'cone': bpy.ops.mesh.primitive_cone_add,
        'cyl': bpy.ops.mesh.primitive_cylinder_add,
        'plane': bpy.ops.mesh.primitive_plane_add,
        'torus': bpy.ops.mesh.primitive_torus_add,
    }
    ops[kind](location=loc, rotation=rot, **kw)
    o = bpy.context.active_object
    o.scale = scale
    o.data.materials.append(mat)
    if smooth:
        bpy.ops.object.shade_smooth()
    return o


def displace(o, strength=0.04, size=0.25, subdiv=2):
    m = o.modifiers.new('sub', 'SUBSURF')
    m.levels = m.render_levels = subdiv
    tex = bpy.data.textures.new(o.name + 'n', 'CLOUDS')
    tex.noise_scale = size
    d = o.modifiers.new('disp', 'DISPLACE')
    d.texture = tex
    d.strength = strength
    return o


def ground(mat, size=2.6, z=0.0):
    return shape('plane', mat, loc=(0, 0, z), scale=(size, size, 1), smooth=False)


def in_hex(x, y, r=HEX_R * 0.97):
    """Inside a pointy-topped hex of corner radius r (the tile's shape)."""
    ax, ay = abs(x), abs(y)
    w = r * math.sqrt(3) / 2
    return ax <= w and ay <= r - ax / math.sqrt(3)


def scatter(rng, n, gap, r=1.1, hexed=True, avoid=()):
    pts = []
    tries = 0
    while len(pts) < n and tries < n * 80:
        tries += 1
        x, y = rng.uniform(-r, r), rng.uniform(-r, r)
        if hexed and not in_hex(x, y, r):
            continue
        if any((x - a) ** 2 + (y - b) ** 2 < gap * gap for a, b in pts):
            continue
        if any((x - a) ** 2 + (y - b) ** 2 < rr * rr for a, b, rr in avoid):
            continue
        pts.append((x, y))
    return pts


# ---- The lands -------------------------------------------------------------------------

G = {
    'grass': ((0.2, 0.48, 0.08), (0.36, 0.62, 0.12)),
    'forest_floor': ((0.13, 0.27, 0.08), (0.22, 0.35, 0.11)),
    'pine': ((0.06, 0.24, 0.09), (0.1, 0.32, 0.12)),
    'leaf': ((0.18, 0.45, 0.12), (0.3, 0.55, 0.16)),
    'trunk': ((0.28, 0.17, 0.08), None),
    'wheat': ((0.86, 0.66, 0.2), (0.95, 0.78, 0.32)),
    'wheat_dark': ((0.72, 0.5, 0.13), (0.8, 0.6, 0.18)),
    'clay': ((0.62, 0.28, 0.13), (0.72, 0.36, 0.17)),
    'clay_dark': ((0.45, 0.17, 0.08), (0.55, 0.22, 0.1)),
    'brick': ((0.7, 0.3, 0.17), (0.78, 0.36, 0.2)),
    'rock': ((0.42, 0.42, 0.44), (0.55, 0.54, 0.56)),
    'snow': ((0.95, 0.96, 0.98), None),
    'sand': ((0.88, 0.75, 0.48), (0.95, 0.84, 0.58)),
    'wool': ((0.97, 0.96, 0.92), (1.0, 1.0, 0.98)),
    'dark': ((0.08, 0.07, 0.07), None),
    'wood': ((0.45, 0.28, 0.14), (0.52, 0.33, 0.17)),
}


def mats():
    out = {}
    for k, (a, b) in G.items():
        out[k] = material(k, a, b, scale=9 if k in ('grass', 'forest_floor', 'sand', 'clay') else 14)
    out['peak'] = height_material('peak', (0.4, 0.4, 0.43), (0.96, 0.97, 1.0), at=0.2)
    out['water'] = material('water', (0.12, 0.42, 0.62), (0.2, 0.55, 0.72), rough=0.15, scale=5)
    return out


def tree(M, rng, x, y, s=1.0, pine=None):
    pine = rng.random() < 0.55 if pine is None else pine
    shape('cyl', M['trunk'], loc=(x, y, 0.03 * s), scale=(0.012 * s, 0.012 * s, 0.03 * s), vertices=6)
    if pine:
        for k, (r, h, z) in enumerate([(0.07, 0.11, 0.08), (0.055, 0.09, 0.14), (0.035, 0.07, 0.19)]):
            shape('cone', M['pine'], loc=(x, y, z * s), scale=(r * s, r * s, h * s / 2), vertices=9, rot=(0, 0, rng.random() * 6))
    else:
        c = shape('sphere', M['leaf'], loc=(x, y, 0.1 * s), scale=(0.07 * s, 0.07 * s, 0.06 * s), subdivisions=2)
        displace(c, 0.012 * s, 0.05, 1)


def sheep(M, rng, x, y, a, s=1.6):
    ca, sa = math.cos(a), math.sin(a)
    # Drawn at 1, then scaled up so they read on a tile.
    before = set(bpy.context.scene.objects)
    shape('sphere', M['wool'], loc=(x, y, 0.035), scale=(0.055, 0.04, 0.035), rot=(0, 0, a), subdivisions=2)
    for k in range(5):
        u, v = rng.uniform(-0.035, 0.035), rng.uniform(-0.02, 0.02)
        shape('sphere', M['wool'], loc=(x + u * ca - v * sa, y + u * sa + v * ca, 0.055), scale=(0.022, 0.022, 0.018), subdivisions=1)
    shape('sphere', M['dark'], loc=(x + 0.058 * ca, y + 0.058 * sa, 0.04), scale=(0.02, 0.016, 0.016), rot=(0, 0, a), subdivisions=2)
    for o in set(bpy.context.scene.objects) - before:
        o.location = (x + (o.location.x - x) * s, y + (o.location.y - y) * s, o.location.z * s)
        o.scale = o.scale * s


def fence(M, pts):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        shape('cube', M['wood'], loc=(x0, y0, 0.03), scale=(0.008, 0.008, 0.03), smooth=False)
        d = math.hypot(x1 - x0, y1 - y0)
        a = math.atan2(y1 - y0, x1 - x0)
        for z in (0.025, 0.045):
            shape('cube', M['wood'], loc=((x0 + x1) / 2, (y0 + y1) / 2, z), scale=(d / 2, 0.004, 0.004), rot=(0, 0, a), smooth=False)


def house(M, x, y, a, s=1.0):
    wall = material('wall', (0.93, 0.88, 0.78))
    roof = material('roof', (0.6, 0.2, 0.12), (0.7, 0.26, 0.15))
    shape('cube', wall, loc=(x, y, 0.035 * s), scale=(0.06 * s, 0.04 * s, 0.035 * s), rot=(0, 0, a), smooth=False)
    shape('cyl', roof, loc=(x, y, 0.08 * s), scale=(0.035 * s, 0.035 * s, 0.065 * s), rot=(math.pi / 2, 0, a + math.pi / 2), vertices=3, smooth=False)


def build_forest(M, rng):
    ground(M['forest_floor'])
    path = [(rng.uniform(-0.3, 0.3) + 0.3 * math.sin(t * 2.2 + rng.random() * 3), t) for t in [i / 10 - 1.1 for i in range(23)]]
    dirt = material('dirt', (0.42, 0.3, 0.16), (0.5, 0.37, 0.2))
    for (x, y) in path:
        shape('cyl', dirt, loc=(x, y, 0.002), scale=(0.07, 0.07, 0.002), vertices=12)
    for x, y in scatter(rng, 150, 0.085, avoid=[(px, py, 0.1) for px, py in path[::2]]):
        tree(M, rng, x, y, rng.uniform(0.8, 1.35))


def build_pasture(M, rng):
    g = ground(M['grass'])
    displace(g, 0.03, 0.6, 4)
    # Darker patches of longer grass, a pond, hedges.
    tall = material('tall', (0.14, 0.4, 0.06), (0.22, 0.5, 0.1), scale=20)
    for x, y in scatter(rng, 10, 0.3, r=1.1):
        p = shape('sphere', tall, loc=(x, y, -0.01), scale=(rng.uniform(0.12, 0.22), rng.uniform(0.1, 0.18), 0.02), rot=(0, 0, rng.random() * 6), subdivisions=2)
    px, py = scatter(rng, 1, 0, r=0.6)[0]
    shape('cyl', M['water'], loc=(px, py, 0.004), scale=(0.16, 0.11, 0.004), rot=(0, 0, rng.random() * 3), vertices=24)
    shape('cyl', M['sand'], loc=(px, py, 0.002), scale=(0.18, 0.13, 0.003), rot=(0, 0, rng.random() * 3), vertices=24)
    for x, y in scatter(rng, 16, 0.09, r=1.1, avoid=[(px, py, 0.25)]):
        shape('sphere', M['leaf'], loc=(x, y, 0.025), scale=(0.04, 0.035, 0.028), subdivisions=2)
    flower = [material('f1', (0.98, 0.95, 0.6)), material('f2', (0.98, 0.98, 0.98)), material('f3', (0.85, 0.5, 0.8))]
    for x, y in scatter(rng, 160, 0.03, r=1.15):
        shape('sphere', rng.choice(flower), loc=(x, y, 0.012), scale=(0.008, 0.008, 0.006), subdivisions=1, smooth=False)
    a0 = rng.random() * 6.28
    arc = [(0.75 * math.cos(a0 + t * 0.18), 0.75 * math.sin(a0 + t * 0.18)) for t in range(12)]
    fence(M, arc)
    for x, y in scatter(rng, 8, 0.26, r=0.85):
        sheep(M, rng, x, y, rng.random() * 6.28)
    for x, y in scatter(rng, 5, 0.3, r=1.0):
        tree(M, rng, x, y, 1.2, pine=False)


def build_fields(M, rng):
    """A patchwork: golden wheat, paler barley, young green crop, ploughed earth, each with its own rows, hedges between."""
    ground(material('soil', (0.42, 0.3, 0.15), (0.5, 0.36, 0.18), scale=20))
    crops = [
        material('crop_gold', (0.9, 0.66, 0.14), (0.98, 0.78, 0.28), scale=30),
        material('crop_pale', (0.95, 0.82, 0.45), (1.0, 0.9, 0.58), scale=30),
        material('crop_green', (0.48, 0.62, 0.16), (0.58, 0.7, 0.22), scale=30),
        material('crop_ochre', (0.82, 0.52, 0.12), (0.9, 0.6, 0.2), scale=30),
    ]
    seeds = [(rng.uniform(-0.6, 0.6), rng.uniform(-0.7, 0.7)) for _ in range(4)]
    kinds = [crops[0], crops[rng.choice([1, 3])], crops[2], crops[0]]
    rng.shuffle(kinds)
    angles = [rng.random() * math.pi for _ in seeds]

    def patch(x, y):
        return min(range(len(seeds)), key=lambda i: (x - seeds[i][0]) ** 2 + (y - seeds[i][1]) ** 2)

    step = 0.055
    for i, (sx, sy) in enumerate(seeds):
        a = angles[i]
        ca, sa = math.cos(a), math.sin(a)
        for k in range(-26, 27):
            for j in range(-26, 27):
                x = sx + k * step * -sa + j * step * ca
                y = sy + k * step * ca + j * step * sa
                if not in_hex(x, y, 1.12) or patch(x, y) != i:
                    continue
                h = 0.016 + rng.random() * 0.006
                shape('cube', kinds[i], loc=(x, y, h), scale=(step * 0.52, step * 0.3, h), rot=(0, 0, a), smooth=False)
    # Hedges along the patch borders.
    for x, y in scatter(rng, 400, 0.02, r=1.12):
        d = sorted(((x - a) ** 2 + (y - b) ** 2) ** 0.5 for a, b in seeds)
        if d[1] - d[0] < 0.045:
            shape('sphere', M['leaf'], loc=(x, y, 0.03), scale=(0.028, 0.028, 0.03), subdivisions=1)
    for x, y in scatter(rng, 4, 0.3, r=0.75):
        shape('cyl', M['wheat'], loc=(x, y, 0.045), scale=(0.035, 0.035, 0.05), rot=(math.pi / 2, 0, rng.random() * 3), vertices=16)
    x, y = scatter(rng, 1, 0, r=0.55)[0]
    house(M, x, y, rng.random() * 6.28, 1.6)


def build_hills(M, rng):
    """Rolling red-clay hills with pits dug into them, a brick kiln, and stacks of fresh bricks."""
    g = ground(M['clay'])
    displace(g, 0.05, 0.5, 4)
    hill = material('hill', (0.56, 0.22, 0.09), (0.46, 0.26, 0.1), scale=12)
    for x, y in scatter(rng, 6, 0.45, r=0.85):
        s = rng.uniform(0.25, 0.38)
        h = shape('uv', hill, loc=(x, y, -0.02), scale=(s, s * rng.uniform(0.75, 1), s * 0.45), segments=24, ring_count=12)
        displace(h, 0.03, 0.15, 1)
    pit = material('pit', (0.36, 0.12, 0.06), (0.44, 0.16, 0.08), scale=20)
    for x, y in scatter(rng, 4, 0.35, r=0.9):
        shape('cyl', pit, loc=(x, y, 0.006), scale=(rng.uniform(0.09, 0.13), rng.uniform(0.07, 0.1), 0.006), rot=(0, 0, rng.random() * 3), vertices=20)
    kx, ky = scatter(rng, 1, 0, r=0.45)[0]
    shape('cyl', M['brick'], loc=(kx, ky, 0.07), scale=(0.12, 0.12, 0.07), vertices=24)
    shape('uv', M['brick'], loc=(kx, ky, 0.14), scale=(0.12, 0.12, 0.08), segments=24, ring_count=12)
    shape('cyl', M['brick'], loc=(kx + 0.05, ky + 0.04, 0.24), scale=(0.025, 0.025, 0.08), vertices=12)
    shape('cyl', M['dark'], loc=(kx + 0.05, ky + 0.04, 0.32), scale=(0.018, 0.018, 0.005), vertices=12)
    for x, y in scatter(rng, 5, 0.26, r=0.95, avoid=[(kx, ky, 0.25)]):
        a = rng.random() * 6.28
        for i in range(4):
            for j in range(3):
                for z in range(rng.randint(2, 4)):
                    u, v = (i - 1.5) * 0.045, (j - 1) * 0.028
                    shape('cube', M['brick'], loc=(x + u * math.cos(a) - v * math.sin(a), y + u * math.sin(a) + v * math.cos(a), 0.011 + z * 0.022), scale=(0.021, 0.013, 0.01), rot=(0, 0, a), smooth=False)
    for x, y in scatter(rng, 18, 0.12, r=1.1):
        shape('sphere', M['leaf'], loc=(x, y, 0.025), scale=(0.035, 0.035, 0.026), subdivisions=1)


def build_mountains(M, rng):
    """Sharp grey-brown peaks with snow only on their tips, scree, and a mine with its cart track."""
    g = ground(material('scree', (0.26, 0.25, 0.23), (0.36, 0.34, 0.31), scale=14))
    displace(g, 0.06, 0.4, 4)
    grassy = material('alp', (0.2, 0.32, 0.1), (0.27, 0.38, 0.13), scale=16)
    for x, y in scatter(rng, 5, 0.35, r=1.1):
        shape('sphere', grassy, loc=(x, y, -0.005), scale=(rng.uniform(0.07, 0.12), rng.uniform(0.06, 0.1), 0.012), subdivisions=2)
    peak = height_material('peak2', (0.36, 0.33, 0.3), (0.97, 0.98, 1.0), at=0.24, soft=0.03)
    for x, y in scatter(rng, 9, 0.3, r=0.88):
        s = rng.uniform(0.24, 0.38)
        p = shape('cone', peak, loc=(x, y, s * 0.7), scale=(s, s * rng.uniform(0.75, 1.0), s * 1.4), vertices=7, rot=(0, 0, rng.random() * 6), smooth=False)
        displace(p, 0.035, 0.1, 1)
    for x, y in scatter(rng, 26, 0.09, r=1.1):
        shape('sphere', M['rock'], loc=(x, y, 0.015), scale=(0.04, 0.032, 0.028), subdivisions=1, smooth=False)
    mx, my = scatter(rng, 1, 0, r=0.45)[0]
    shape('cube', M['dark'], loc=(mx, my, 0.04), scale=(0.045, 0.025, 0.04), smooth=False)
    for dx in (-0.055, 0.055):
        shape('cube', M['wood'], loc=(mx + dx, my, 0.045), scale=(0.01, 0.03, 0.045), smooth=False)
    shape('cube', M['wood'], loc=(mx, my, 0.09), scale=(0.07, 0.03, 0.009), smooth=False)
    for t in range(10):
        shape('cube', M['wood'], loc=(mx, my - 0.06 - t * 0.045, 0.004), scale=(0.04, 0.008, 0.004), smooth=False)
    cart = material('cart', (0.3, 0.3, 0.33), rough=0.4, metal=0.6)
    shape('cube', cart, loc=(mx, my - 0.3, 0.03), scale=(0.035, 0.05, 0.025), smooth=False)
    shape('sphere', M['rock'], loc=(mx, my - 0.3, 0.06), scale=(0.03, 0.04, 0.02), subdivisions=1, smooth=False)


def build_desert(M, rng):
    """Warm sand, low crescent dunes with rippled faces, a few palms, cactus and stones."""
    sand = material('sandrip', (0.86, 0.64, 0.33), (0.94, 0.76, 0.44), scale=7)
    nt = sand.node_tree
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.inputs['Scale'].default_value = 14
    wave.inputs['Distortion'].default_value = 5
    b = nt.nodes.new('ShaderNodeBump')
    b.inputs['Strength'].default_value = 0.45
    nt.links.new(wave.outputs['Fac'], b.inputs['Height'])
    nt.links.new(b.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])
    g = ground(sand)
    displace(g, 0.06, 0.6, 4)
    for x, y in scatter(rng, 8, 0.32, r=0.95):
        a = rng.random() * 6
        d = shape('uv', sand, loc=(x, y, -0.01), scale=(0.26, 0.11, 0.045), rot=(0, 0, a), segments=24, ring_count=12)
        displace(d, 0.02, 0.2, 1)
    palm = material('palm', (0.18, 0.46, 0.14), (0.26, 0.56, 0.18))
    for x, y in scatter(rng, 3, 0.4, r=0.8):
        shape('cyl', M['wood'], loc=(x, y, 0.08), scale=(0.012, 0.012, 0.08), vertices=6)
        for k in range(7):
            a = k * 2 * math.pi / 7 + rng.random() * 0.3
            shape('cone', palm, loc=(x + 0.06 * math.cos(a), y + 0.06 * math.sin(a), 0.15), scale=(0.075, 0.02, 0.008), rot=(0, 0, a), vertices=4, smooth=False)
    for x, y in scatter(rng, 14, 0.13, r=1.05):
        shape('sphere', M['rock'], loc=(x, y, 0.012), scale=(0.035, 0.03, 0.022), subdivisions=1, smooth=False)
    cactus = material('cactus', (0.22, 0.45, 0.2))
    for x, y in scatter(rng, 4, 0.3, r=0.9):
        shape('cyl', cactus, loc=(x, y, 0.06), scale=(0.02, 0.02, 0.06), vertices=10)
        shape('cyl', cactus, loc=(x + 0.028, y, 0.07), scale=(0.011, 0.011, 0.03), vertices=8)
        shape('cyl', cactus, loc=(x - 0.026, y + 0.005, 0.055), scale=(0.01, 0.01, 0.025), vertices=8)


BUILD = {
    'forest': build_forest,
    'pasture': build_pasture,
    'fields': build_fields,
    'hills': build_hills,
    'mountains': build_mountains,
    'desert': build_desert,
}


# ---- Cameras and renders -----------------------------------------------------------------

def top_camera(scene, size=768):
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = 2.0 * HEX_R
    o = bpy.data.objects.new('cam', cam)
    o.location = (0, 0, 5)
    scene.collection.objects.link(o)
    scene.camera = o
    scene.render.resolution_x = scene.render.resolution_y = size


def card_camera(scene, w=360, h=480, dist=2.0, height=0.75, look=(0, 0, 0.05), lens=42):
    cam = bpy.data.cameras.new('cam')
    cam.lens = lens
    o = bpy.data.objects.new('cam', cam)
    o.location = (0, -dist, height)
    scene.collection.objects.link(o)
    d = Vector(look) - o.location
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = o
    scene.render.resolution_x = w
    scene.render.resolution_y = h


def render(scene, name, transparent=False):
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name)


def wanted(name):
    return not ONLY or name in ONLY or name.split('_')[0] in ONLY


# Tiles: two of each land, seen from straight above.
for land, build in BUILD.items():
    for variant in (1, 2):
        name = f'tile_{land}_{variant}'
        if not wanted(name):
            continue
        scene = reset()
        M = mats()
        build(M, random.Random(seed_of(land, variant)))
        top_camera(scene)
        render(scene, name)

# Resource cards: the same little worlds, low and close, under a soft sky.
CARDS = {'wood': 'forest', 'brick': 'hills', 'wool': 'pasture', 'grain': 'fields', 'ore': 'mountains'}
for res, land in CARDS.items():
    name = f'card_{res}'
    if not wanted(name):
        continue
    scene = reset()
    M = mats()
    rng = random.Random(seed_of(land, 'card'))
    BUILD[land](M, rng)
    # Something to look at up front.
    if res == 'wool':
        sheep(M, rng, -0.12, -0.42, 0.4, s=2.2)
        sheep(M, rng, 0.22, -0.3, 2.6, s=2.0)
    elif res == 'grain':
        for x in (-0.2, 0.15):
            shape('cyl', M['wheat'], loc=(x, -0.4, 0.06), scale=(0.06, 0.06, 0.08), rot=(math.pi / 2, 0, 0.3 + x), vertices=20)
    elif res == 'brick':
        for i in range(4):
            for z in range(4):
                shape('cube', M['brick'], loc=(-0.1 + i * 0.07, -0.42, 0.015 + z * 0.03), scale=(0.032, 0.02, 0.014), smooth=False)
    # A clear blue sky behind the little world.
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.45, 0.7, 1.0, 1)
    card_camera(scene, dist=1.25, height=0.42, look=(0, 0.15, 0.02))
    render(scene, name)

# The sea for the board's frame.
if wanted('sea'):
    scene = reset()
    M = mats()
    nt = M['water'].node_tree
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.inputs['Scale'].default_value = 3
    wave.inputs['Distortion'].default_value = 8
    b = nt.nodes.new('ShaderNodeBump')
    b.inputs['Strength'].default_value = 0.3
    nt.links.new(wave.outputs['Fac'], b.inputs['Height'])
    nt.links.new(b.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])
    ground(M['water'])
    top_camera(scene, 512)
    render(scene, 'sea')


# ---- Development cards: little still lifes on a wooden table ---------------------------------

def table(M):
    t = material('table', (0.36, 0.22, 0.12), (0.45, 0.29, 0.16), scale=3)
    ground(t, 4)
    wall = material('wall_bg', (0.85, 0.74, 0.52), (0.9, 0.8, 0.6), scale=4)
    shape('plane', wall, loc=(0, 1.2, 0.6), scale=(3, 1, 1), rot=(math.pi / 2, 0, 0), smooth=False)


GOLD = ((0.95, 0.7, 0.2), (1.0, 0.8, 0.35))
STEEL = ((0.7, 0.72, 0.76), (0.82, 0.84, 0.88))


def dev_knight(M):
    gold = material('gold', *GOLD, rough=0.3, metal=1)
    steel = material('steel', *STEEL, rough=0.25, metal=1)
    red = material('red', (0.6, 0.08, 0.08), (0.7, 0.12, 0.1))
    # Two swords crossed behind an upright shield.
    for a in (-0.65, 0.65):
        shape('cube', steel, loc=(0, 0.12, 0.34), scale=(0.016, 0.008, 0.3), rot=(0, a, 0), smooth=False)
        hx, hz = math.sin(a) * -0.26, 0.34 - math.cos(a) * 0.26
        shape('cube', gold, loc=(hx, 0.12, hz), scale=(0.07, 0.012, 0.012), rot=(0, a, 0), smooth=False)
        shape('sphere', gold, loc=(math.sin(a) * -0.33, 0.12, 0.34 - math.cos(a) * 0.33), scale=(0.025, 0.025, 0.025), subdivisions=2)
    shape('cyl', red, loc=(0, 0.04, 0.3), scale=(0.2, 0.25, 0.03), rot=(math.pi / 2, 0, 0), vertices=6)
    shape('torus', gold, loc=(0, 0.0, 0.3), scale=(0.2, 0.25, 0.3), rot=(math.pi / 2, 0, 0), major_radius=1, minor_radius=0.07)
    shape('sphere', gold, loc=(0, -0.0, 0.3), scale=(0.05, 0.02, 0.05), subdivisions=2)


def dev_vp(M):
    gold = material('gold', *GOLD, rough=0.25, metal=1)
    gem = material('gem', (0.7, 0.05, 0.1), rough=0.1)
    shape('cyl', gold, loc=(0, 0, 0.12), scale=(0.2, 0.2, 0.08), vertices=32)
    for k in range(5):
        a = k * 2 * math.pi / 5
        shape('cone', gold, loc=(0.17 * math.cos(a), 0.17 * math.sin(a), 0.27), scale=(0.05, 0.05, 0.08), vertices=8)
        shape('sphere', gem, loc=(0.2 * math.cos(a), 0.2 * math.sin(a), 0.12), scale=(0.025, 0.025, 0.025), subdivisions=2)


def dev_roads(M):
    road = material('road', (0.55, 0.42, 0.28), (0.6, 0.47, 0.3))
    for k in range(2):
        shape('cube', road, loc=(-0.15 + k * 0.3, 0, 0.03), scale=(0.14, 0.04, 0.03), rot=(0, 0, 0.5 - k), smooth=False)
    shape('cyl', M['wood'], loc=(0.1, 0.25, 0.22), scale=(0.015, 0.015, 0.22), vertices=8)
    sign = material('sign', (0.85, 0.72, 0.5))
    shape('cube', sign, loc=(0.18, 0.24, 0.36), scale=(0.1, 0.01, 0.035), rot=(0, 0, 0.2), smooth=False)
    shape('cube', sign, loc=(0.03, 0.24, 0.29), scale=(0.09, 0.01, 0.03), rot=(0, 0, -0.3), smooth=False)


def dev_plenty(M):
    basket = material('basket', (0.55, 0.38, 0.18), (0.65, 0.46, 0.22), scale=30)
    shape('cyl', basket, loc=(0, 0, 0.09), scale=(0.24, 0.24, 0.09), vertices=24)
    fruit = [material('apple', (0.75, 0.1, 0.08)), material('pear', (0.6, 0.7, 0.15)), material('orange', (0.95, 0.5, 0.1)), material('grape', (0.35, 0.1, 0.4))]
    rng = random.Random(3)
    for x, y in scatter(rng, 14, 0.09, r=0.2, hexed=False):
        shape('sphere', rng.choice(fruit), loc=(x, y, 0.2 + rng.random() * 0.04), scale=(0.055, 0.055, 0.055), subdivisions=2)
    for k in range(5):
        shape('cube', M['wheat'], loc=(-0.15 + k * 0.03, 0.12, 0.3), scale=(0.006, 0.006, 0.16), rot=(0.3, -0.4 + k * 0.2, 0), smooth=False)


def dev_monopoly(M):
    gold = material('gold', *GOLD, rough=0.3, metal=1)
    rng = random.Random(5)
    for stack, (x, y, n) in enumerate([(-0.15, 0, 7), (0.0, -0.08, 10), (0.15, 0.02, 5)]):
        for i in range(n):
            shape('cyl', gold, loc=(x + rng.uniform(-0.005, 0.005), y, 0.012 + i * 0.022), scale=(0.07, 0.07, 0.01), vertices=24)
    chest = material('chest', (0.4, 0.22, 0.1), (0.48, 0.28, 0.13))
    shape('cube', chest, loc=(0.05, 0.3, 0.1), scale=(0.2, 0.1, 0.1), smooth=False)
    shape('cyl', chest, loc=(0.05, 0.3, 0.2), scale=(0.1, 0.1, 0.2), rot=(0, math.pi / 2, 0), vertices=16)
    shape('cube', gold, loc=(0.05, 0.19, 0.16), scale=(0.03, 0.01, 0.03), smooth=False)


DEVS = {'knight': dev_knight, 'vp': dev_vp, 'roads': dev_roads, 'plenty': dev_plenty, 'monopoly': dev_monopoly}
for card, build in DEVS.items():
    name = f'dev_{card}'
    if not wanted(name):
        continue
    scene = reset()
    M = mats()
    table(M)
    build(M)
    card_camera(scene, dist=1.35, height=0.75, look=(0, 0.05, 0.2), lens=50)
    render(scene, name)
