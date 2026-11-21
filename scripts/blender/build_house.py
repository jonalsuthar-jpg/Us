"""
Our House: builds the realistic house in Blender, with no window open.

    D:\\blender.exe -b --factory-startup -P scripts/blender/build_house.py -- [--samples 128] [--size 1024] [--preview]

Reads the CC0 source art from assets-src/house (scripts/fetch-house-assets.mjs)
and writes assets-build/house/:

    ground.glb, upper.glb, roof.glb   the house in three layers (the app hides
                                      the upper floor and the roof to look in)
    ground_light.png, …               baked bounce light for each layer
    preview.png                       a render of the result (with --preview)

The layout is the one in packages/shared/src/house/layout.ts and
scene/model.tsx: the same walls, doors, windows, stairs and pool, so walking
doesn't change. Coordinates here are the app's (x, y up, z towards the
garden), placed in Blender as (x, -z, y); the glTF exporter turns them back.

Bounce light: each layer gets a second UV map ("lightmap") and one baked
image of the light that bounces off walls, floors and ceilings, from the sky
and from the sun. The app keeps the sun's direct light and shadows live, so
the furniture and the two of us are lit the same way as the walls.
"""
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default):
    if name in ARGS:
        i = ARGS.index(name)
        return type(default)(ARGS[i + 1]) if not isinstance(default, bool) else True
    return default


SAMPLES = arg("--samples", 128)
SIZE = arg("--size", 1024)
PREVIEW = arg("--preview", False)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets-src", "house")
OUT = os.path.join(ROOT, "assets-build", "house")
os.makedirs(OUT, exist_ok=True)

# --- layout.ts -------------------------------------------------------------
FLOOR_H = 3.0
WALL_T = 0.2
HOUSE = dict(x0=-6.0, x1=6.0, z0=-4.0, z1=4.0)
STAIRS = dict(x0=1.6, x1=5.0, z0=-3.8, z1=-2.8, steps=12)
POOL = dict(x0=2.0, x1=8.0, z0=7.0, z1=11.0, depth=1.2)


def V(x, y, z):
    """The app's (x, y, z) as a Blender position."""
    return Vector((x, -z, y))


# --- scene -----------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
LAYERS = {}
for name in ("ground", "upper", "roof"):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    LAYERS[name] = col

# --- materials -------------------------------------------------------------
MATS = {}


def image(path, color=True):
    img = bpy.data.images.load(path, check_existing=True)
    if not color:
        img.colorspace_settings.name = "Non-Color"
    return img


def textured(name, tex, tile=1.0, tint=None, rough_mul=1.0):
    """A material from a Poly Haven texture set; `tile` is metres per repeat."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    d = os.path.join(SRC, "textures", tex)
    diff = nt.nodes.new("ShaderNodeTexImage")
    diff.image = image(os.path.join(d, "diff.jpg"))
    if tint:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs["B"].default_value = (*tint, 1.0)
        nt.links.new(diff.outputs["Color"], mix.inputs["A"])
        nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    else:
        nt.links.new(diff.outputs["Color"], bsdf.inputs["Base Color"])
    arm_path = os.path.join(d, "arm.jpg")
    if os.path.exists(arm_path):
        arm = nt.nodes.new("ShaderNodeTexImage")
        arm.image = image(arm_path, color=False)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(arm.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    rough_path = os.path.join(d, "rough.jpg")
    if not os.path.exists(arm_path) and os.path.exists(rough_path):
        rough = nt.nodes.new("ShaderNodeTexImage")
        rough.image = image(rough_path, color=False)
        nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
        bsdf.inputs["Metallic"].default_value = 0.0
    nor_path = os.path.join(d, "nor_gl.jpg")
    if os.path.exists(nor_path):
        nor = nt.nodes.new("ShaderNodeTexImage")
        nor.image = image(nor_path, color=False)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(nor.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    m["tile"] = tile
    MATS[name] = m
    return m


def plain(name, color, rough=0.6, metal=0.0, alpha=1.0, transmission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND" if hasattr(m, "blend_method") else None
    if transmission:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    m["tile"] = 1.0
    MATS[name] = m
    return m


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


textured("floor", "laminate_floor_02", tile=2.0)
textured("plaster", "painted_plaster_wall", tile=2.5, tint=srgb("#F3EEE6"))
textured("plaster_out", "white_plaster_02", tile=3.0, tint=srgb("#FFFDF8"))
textured("tile", "floor_tiles_06", tile=1.2)
textured("roof", "clay_roof_tiles_02", tile=2.0)
textured("grass", "Grass001", tile=2.5)
textured("paving", "stone_tiles_02", tile=1.6)
textured("deck", "wood_floor_deck", tile=2.0)
textured("brick", "red_brick_03", tile=1.5)
textured("pool", "granite_tile", tile=1.0, tint=srgb("#CFE9EF"))
plain("trim", srgb("#F7F5F0"), rough=0.45)
plain("wood_dark", srgb("#5A3A24"), rough=0.5)
plain("metal", srgb("#8C9196"), rough=0.35, metal=0.9)
plain("glass", srgb("#BFD9E6"), rough=0.02, alpha=0.25, transmission=1.0)
plain("hedge", srgb("#2F5A23"), rough=0.95)
plain("bark", srgb("#5B4030"), rough=1.0)
plain("leaves", srgb("#3F7A2E"), rough=0.85)

# --- geometry --------------------------------------------------------------
PARTS = {name: [] for name in LAYERS}


def box(layer, a, b, mat, name="box", cut=None):
    """A box between the app-space corners a and b, as its own object."""
    lo = [min(a[i], b[i]) for i in range(3)]
    hi = [max(a[i], b[i]) for i in range(3)]
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        p = [lo[i] + (v.co[i] + 0.5) * (hi[i] - lo[i]) for i in range(3)]
        v.co = V(*p)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(MATS[mat])
    LAYERS[layer].objects.link(obj)
    if cut:
        obj["cut"] = list(cut)
    PARTS[layer].append(obj)
    return obj


def wall(layer, x0, z0, x1, z1, y, holes=(), cut=None, h=FLOOR_H, inside="plaster", outside="plaster_out", name="wall"):
    """A wall from (x0, z0) to (x1, z1) standing on y, with door and window holes
    (along, along, bottom, top). The pieces join into one object, so a wall
    that's cut open in the app drops as one."""
    length = math.hypot(x1 - x0, z1 - z0)
    dx, dz = (x1 - x0) / length, (z1 - z0) / length
    # The side facing the house's middle is the inside.
    nx, nz = -dz, dx
    t = WALL_T / 2
    pieces = []

    def piece(a, b, y0, y1):
        corners = []
        for s in (a, b):
            for o in (-t, t):
                corners.append((x0 + dx * s + nx * o, z0 + dz * s + nz * o))
        xs = [c[0] for c in corners]
        zs = [c[1] for c in corners]
        pieces.append(box(layer, (min(xs), y + y0, min(zs)), (max(xs), y + y1, max(zs)), inside, name=f"{name}_p"))

    at = 0.0
    glass = []
    for a, b, bottom, top in sorted(holes):
        if a > at:
            piece(at, a, 0, h)
        if bottom > 0:
            piece(a, b, 0, bottom)
        if top < h:
            piece(a, b, top, h)
        if bottom > 0:
            cx = [x0 + dx * s for s in (a, b)]
            cz = [z0 + dz * s for s in (a, b)]
            glass.append(box(layer, (min(cx) - abs(nx) * 0.02, y + bottom, min(cz) - abs(nz) * 0.02), (max(cx) + abs(nx) * 0.02, y + top, max(cz) + abs(nz) * 0.02), "glass", name="glass"))
            sill = box(layer, (min(cx) - 0.05 - abs(nx) * (t + 0.04), y + bottom - 0.06, min(cz) - 0.05 * abs(dz) - abs(nz) * (t + 0.04)), (max(cx) + 0.05 + abs(nx) * (t + 0.04), y + bottom, max(cz) + 0.05 * abs(dz) + abs(nz) * (t + 0.04)), "trim", name="sill")
            pieces.append(sill)
        at = b
    if at < length:
        piece(at, length, 0, h)
    # One object per wall, with the outside face in the outside material.
    for p in pieces:
        PARTS[layer].remove(p)
    bpy.ops.object.select_all(action="DESELECT")
    for p in pieces:
        p.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    if outside != inside and cut:
        obj.data.materials.append(MATS[outside])
        out = Vector((cut[0], -cut[1], 0))
        for poly in obj.data.polygons:
            if poly.normal.dot(out) > 0.9:
                poly.material_index = len(obj.data.materials) - 1
    if cut:
        obj["cut"] = list(cut)
        # The app drops a cut wall to a low strip by scaling it: it pivots at its own floor.
        base = V(0, y, 0)
        obj.data.transform(Matrix.Translation(-base))
        obj.location = base
    PARTS[layer].append(obj)
    return obj


def W(a, b, bottom=0.9, top=2.2):
    return (a, b, bottom, top)


def DOOR(a, b, top=2.2):
    return (a, b, 0.0, top)


def floor_walls(layer, y, upper):
    x0, x1, z0, z1 = HOUSE["x0"], HOUSE["x1"], HOUSE["z0"], HOUSE["z1"]
    tag = "u" if upper else "g"
    wall(layer, x0, z1, x1, z1, y, cut=(0, 1), name=f"{tag}_south", holes=[W(1.9, 3.1, 0, 2.3), W(4.5, 6.3), W(8.5, 10.5)] if upper else [W(0.6, 1.8), DOOR(2.4, 3.6), W(4.4, 6.4, 0.5, 2.4), W(8, 10.5, 1.0)])
    wall(layer, x1, z0, x0, z0, y, cut=(0, -1), name=f"{tag}_north", holes=[W(2, 3.5), W(8.5, 10, 1.0)] if upper else [W(8, 10)])
    wall(layer, x0, z0, x0, z1, y, cut=(-1, 0), name=f"{tag}_west", holes=[W(3, 5)])
    wall(layer, x1, z1, x1, z0, y, cut=(1, 0), name=f"{tag}_east", holes=[W(1.5, 3.5, 1.1)])
    wall(layer, 1, z0, 1, z1, y, name=f"{tag}_inner", holes=[DOOR(4.1, 5.1)], outside="plaster")


# Ground floor: oak in the living room, tiles in the kitchen.
box("ground", (HOUSE["x0"], -0.15, HOUSE["z0"]), (1.0, 0.0, HOUSE["z1"]), "floor", name="floor_living")
box("ground", (1.0, -0.15, HOUSE["z0"]), (HOUSE["x1"], 0.0, HOUSE["z1"]), "tile", name="floor_kitchen")
floor_walls("ground", 0.0, False)
run = (STAIRS["x1"] - STAIRS["x0"]) / STAIRS["steps"]
rise = FLOOR_H / STAIRS["steps"]
for i in range(STAIRS["steps"]):
    box("ground", (STAIRS["x0"] + i * run, 0, STAIRS["z0"] - 0.05), (STAIRS["x0"] + (i + 1) * run, (i + 1) * rise, STAIRS["z1"] + 0.05), "floor", name="step")
for i in range(5):
    x = STAIRS["x0"] + 0.2 + i * 0.8
    yb = (x - STAIRS["x0"]) / (STAIRS["x1"] - STAIRS["x0"]) * FLOOR_H
    box("ground", (x - 0.03, yb, STAIRS["z1"] + 0.02), (x + 0.03, yb + 0.95, STAIRS["z1"] + 0.08), "wood_dark", name="baluster")

# Upstairs: the floor with the stairwell, its railing, the balcony.
Y = FLOOR_H
box("upper", (HOUSE["x0"], Y - 0.15, -2.7), (HOUSE["x1"], Y, HOUSE["z1"]), "floor", name="floor_up_a")
box("upper", (HOUSE["x0"], Y - 0.15, HOUSE["z0"]), (STAIRS["x0"], Y, -2.7), "floor", name="floor_up_b")
box("upper", (STAIRS["x1"], Y - 0.15, HOUSE["z0"]), (HOUSE["x1"], Y, -2.7), "floor", name="floor_up_c")
floor_walls("upper", Y, True)
box("upper", (STAIRS["x0"], Y, -2.78), (STAIRS["x1"], Y + 1.0, -2.72), "glass", name="glass_rail")
box("upper", (STAIRS["x0"], Y + 1.0, -2.8), (STAIRS["x1"], Y + 1.05, -2.7), "wood_dark", name="rail")
box("upper", (-6, Y - 0.2, 4), (-1, Y, 5.8), "deck", name="balcony")
box("upper", (-6, Y, 5.72), (-1, Y + 1.0, 5.78), "glass", name="glass_balcony")
box("upper", (-6, Y, 4.1), (-5.94, Y + 1.0, 5.78), "glass", name="glass_balcony")
box("upper", (-1.06, Y, 4.1), (-1, Y + 1.0, 5.78), "glass", name="glass_balcony")
box("upper", (-6.02, Y + 1.0, 5.7), (-0.98, Y + 1.05, 5.8), "metal", name="balcony_rail")

# The roof: two clay-tiled slopes, gables, a brick chimney.
top = FLOOR_H * 2
eave = 4.6
ridge = top + 2.0
angle = math.atan2(ridge - (top - 0.15), eave)
slope = math.hypot(eave, ridge - (top - 0.15))
for side in (1, -1):
    o = box("roof", (-6.5, -0.08, -slope / 2 - 0.05), (6.5, 0.08, slope / 2 + 0.05), "roof", name="roof_slope")
    # Built flat round the origin, then tipped and moved into place.
    o.rotation_euler = (side * angle, 0, 0)
    o.location = V(0, (ridge + top - 0.15) / 2, side * eave / 2)
for gx in (HOUSE["x0"] - 0.1, HOUSE["x1"] - 0.1):
    mesh = bpy.data.meshes.new("gable")
    bm = bmesh.new()
    pts = [(-4.1, 0), (4.1, 0), (0, 1.9)]
    for dx in (0, WALL_T):
        for z, yy in pts:
            bm.verts.new(V(gx + dx, top + yy, z))
    bm.verts.ensure_lookup_table()
    v = bm.verts
    for f in ((0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)):
        bm.faces.new([v[i] for i in f])
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    g = bpy.data.objects.new("gable", mesh)
    g.data.materials.append(MATS["plaster_out"])
    LAYERS["roof"].objects.link(g)
    PARTS["roof"].append(g)
box("roof", (-6.55, ridge - 0.05, -0.12), (6.55, ridge + 0.12, 0.12), "wood_dark", name="ridge")
box("roof", (-4.4, top + 0.6, -1.9), (-3.6, ridge + 0.9, -1.1), "brick", name="chimney")

# The garden: grass round a paved deck, the pool, paths, porch, hedges, trees.
p = POOL
box("ground", (-16, -0.2, -8), (16, -0.02, 5.8), "grass", name="grass")
box("ground", (-16, -0.2, 5.8), (0.8, -0.02, 12.2), "grass", name="grass")
box("ground", (9.2, -0.2, 5.8), (16, -0.02, 12.2), "grass", name="grass")
box("ground", (-16, -0.2, 12.2), (16, -0.02, 16), "grass", name="grass")
box("ground", (0.8, -0.2, 5.8), (9.2, 0.02, p["z0"]), "paving", name="deck")
box("ground", (0.8, -0.2, p["z1"]), (9.2, 0.02, 12.2), "paving", name="deck")
box("ground", (0.8, -0.2, p["z0"]), (p["x0"], 0.02, p["z1"]), "paving", name="deck")
box("ground", (p["x1"], -0.2, p["z0"]), (9.2, 0.02, p["z1"]), "paving", name="deck")
box("ground", (p["x0"], -p["depth"] - 0.1, p["z0"]), (p["x1"], -p["depth"], p["z1"]), "pool", name="pool_floor")
box("ground", (p["x0"], -p["depth"], p["z0"]), (p["x1"], -0.2, p["z0"] + 0.05), "pool", name="pool_wall")
box("ground", (p["x0"], -p["depth"], p["z1"] - 0.05), (p["x1"], -0.2, p["z1"]), "pool", name="pool_wall")
box("ground", (p["x1"] - 0.05, -p["depth"], p["z0"]), (p["x1"], -0.2, p["z1"]), "pool", name="pool_wall")
box("ground", (p["x0"], -p["depth"], p["z0"]), (p["x0"] + 0.05, -0.2, p["z1"]), "pool", name="pool_wall")
for i in range(3):
    box("ground", (p["x0"], -p["depth"], 8.4), (p["x0"] + 0.3 * (i + 1), -0.35 - i * 0.3, 9.6), "pool", name="pool_step")
for z in (4.5, 5.2):
    box("ground", (-3.45, -0.02, z), (-2.55, 0.015, z + 0.5), "paving", name="path")
for x in (-2.4, -1.4, -0.4):
    box("ground", (x, -0.02, 5.95), (x + 0.6, 0.015, 6.55), "paving", name="path")
box("ground", (-5.95, 0, 5.55), (-5.75, 2.8, 5.75), "trim", name="post")
box("ground", (-1.25, 0, 5.55), (-1.05, 2.8, 5.75), "trim", name="post")
box("ground", (-3.8, 0, 4.0), (-2.2, 0.06, 4.45), "paving", name="step_front")
# The south hedge has a gap for the garden gate (packages/shared/src/house/village.ts GATE): out to the village.
box("ground", (-15.5, 0, 15), (3.25, 1.1, 15.8), "hedge", name="hedge")
box("ground", (6.75, 0, 15), (15.5, 1.1, 15.8), "hedge", name="hedge")
box("ground", (-15.8, 0, -7.5), (-15, 1.1, 15.8), "hedge", name="hedge")
box("ground", (15, 0, -7.5), (15.8, 1.1, 15.8), "hedge", name="hedge")
box("ground", (-15.5, 0, -7.8), (15.5, 1.1, -7), "hedge", name="hedge")


def tree(x, z, s=1.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.17 * s, depth=2.2 * s, location=V(x, 1.1 * s, z))
    t = bpy.context.active_object
    t.data.materials.append(MATS["bark"])
    for (ox, oy, oz, r) in ((0, 2.9, 0, 1.4), (0.5, 3.6, 0.3, 0.9), (-0.4, 3.3, -0.3, 1.0)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r * s, location=V(x + ox * s, oy * s, z + oz * s))
        c = bpy.context.active_object
        c.data.materials.append(MATS["leaves"])
        for o in (c,):
            for col in o.users_collection:
                col.objects.unlink(o)
            LAYERS["ground"].objects.link(o)
            PARTS["ground"].append(o)
    for col in t.users_collection:
        col.objects.unlink(t)
    LAYERS["ground"].objects.link(t)
    PARTS["ground"].append(t)


for x, z, s in ((-10, 9, 1), (-12, -3, 1.2), (11, -4, 1.1), (12, 13, 0.9), (-8, 13, 1.05)):
    tree(x, z, s)

# --- UVs: textures at true size, then the lightmap ----------------------------


def world_uvs(obj):
    """Box-project each face in world space, so a 2 m floor tile is 2 m wherever it is."""
    me = obj.data
    mw = obj.matrix_world
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers[0].data
    for poly in me.polygons:
        mat = me.materials[poly.material_index] if me.materials else None
        tile = float(mat.get("tile", 1.0)) if mat else 1.0
        n = (mw.to_3x3() @ poly.normal).normalized()
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if ax == 2:
                u, v = co.x, co.y
            elif ax == 0:
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            uv[li].uv = (u / tile, v / tile)


for layer, objs in PARTS.items():
    for o in objs:
        world_uvs(o)

# --- lighting and the bake ------------------------------------------------------
world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
wn = world.node_tree
env = wn.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(os.path.join(SRC, "hdri", "day.hdr"))
bg = wn.nodes["Background"]
wn.links.new(env.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 1.0

sun_data = bpy.data.lights.new("sun", "SUN")
sun_data.energy = 4.0
sun_data.angle = math.radians(1.5)
sun = bpy.data.objects.new("sun", sun_data)
scene.collection.objects.link(sun)
# The app's sun shines from (12, 20, 14) towards (0, 0, 3).
d = (V(0, 0, 3) - V(12, 20, 14)).normalized()
sun.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

scene.render.engine = "CYCLES"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            if any(dv.type == kind for dv in prefs.devices):
                for dv in prefs.devices:
                    dv.use = True
                scene.cycles.device = "GPU"
                print(f"[house] baking on {kind}")
                break
        except TypeError:
            continue
except Exception:
    pass

# Glass lets light through for the bake (it's thin and clear).
for o in [o for objs in PARTS.values() for o in objs if o.name.startswith("glass")]:
    o.visible_shadow = False


# Out in the garden the live sun and sky do fine; the light map is for the house itself.
OUTDOOR = {"grass", "hedge", "leaves", "bark"}


def baked(o):
    return o.type == "MESH" and not o.name.startswith("glass") and not any(m.name in OUTDOOR for m in o.data.materials)


def bake_layer(layer):
    objs = [o for o in PARTS[layer] if baked(o)]
    for o in objs:
        if "lightmap" not in o.data.uv_layers:
            o.data.uv_layers.new(name="lightmap")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers["lightmap"]
    # One atlas for the whole layer.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.004, rotate=True, shape_method="AABB")
    bpy.ops.object.mode_set(mode="OBJECT")

    img = bpy.data.images.new(f"{layer}_light", SIZE, SIZE, float_buffer=True)
    targets = []
    for o in objs:
        for m in o.data.materials:
            n = m.node_tree.nodes.new("ShaderNodeTexImage")
            n.image = img
            n.select = True
            m.node_tree.nodes.active = n
            # Bake through the lightmap UVs.
            uvn = m.node_tree.nodes.new("ShaderNodeUVMap")
            uvn.uv_map = "lightmap"
            m.node_tree.links.new(uvn.outputs["UV"], n.inputs["Vector"])
            targets.append((m, n, uvn))
    bake = scene.render.bake
    bake.use_pass_direct = True
    bake.use_pass_indirect = True
    bake.use_pass_color = False
    bake.margin = 4
    print(f"[house] baking {layer}: {len(objs)} objects, {SIZE}px, {SAMPLES} samples")
    # The sky (light through windows, under eaves) all of it; the sun only what bounces.
    sun_data.energy = 0.0
    bg.inputs["Strength"].default_value = 1.0
    bake.use_pass_direct = True
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True)
    sky = list(img.pixels)
    sun_data.energy = 4.0
    bg.inputs["Strength"].default_value = 0.0
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"INDIRECT"}, use_clear=True)
    bounce = list(img.pixels)
    bg.inputs["Strength"].default_value = 1.0
    # Stored at half intensity (0.5 = 1.0) so bright spots aren't clipped; the app doubles it.
    px = [min(1.0, (a + b) * 0.5) if (i % 4) != 3 else 1.0 for i, (a, b) in enumerate(zip(sky, bounce))]
    img.pixels = px
    out = bpy.data.images.new(f"{layer}_light_out", SIZE, SIZE)
    out.pixels = px
    out.filepath_raw = os.path.join(OUT, f"{layer}_light.png")
    out.file_format = "PNG"
    out.save()
    for m, n, uvn in targets:
        m.node_tree.nodes.remove(n)
        m.node_tree.nodes.remove(uvn)
    bpy.ops.object.select_all(action="DESELECT")


for layer in ("ground", "upper", "roof"):
    bake_layer(layer)

# --- export ------------------------------------------------------------------
# Colour at 1024; the detail maps (normals, roughness) don't need that on a phone.
for img in bpy.data.images:
    if img.source != "FILE" or img.colorspace_settings.name != "Non-Color":
        continue
    w, h = img.size
    if max(w, h) > 512:
        img.scale(512, 512)

for layer in ("ground", "upper", "roof"):
    bpy.ops.object.select_all(action="DESELECT")
    for o in PARTS[layer]:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f"{layer}.glb"),
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=78,
        export_apply=True,
    )
    print(f"[house] wrote {layer}.glb")

if PREVIEW:
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 24
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = V(9, 9, 20)
    cam.rotation_euler = (V(0, 1.5, 2) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.cycles.samples = max(32, SAMPLES // 2)
    scene.render.filepath = os.path.join(OUT, "preview.png")
    bpy.ops.render.render(write_still=True)
    print("[house] wrote preview.png")
