"""
Our village: builds its art in Blender, with no window open.

    node scripts/export-village-layout.mjs
    D:\\blender.exe -b --factory-startup -P scripts/blender/build_village.py -- [--samples 96] [--size 2048] [--preview]

Reads the map (assets-build/house/village_layout.json, from
packages/shared/src/house/village.ts) and the CC0 source art in
assets-src/house, and writes into assets-build/house/:

    village.glb                every zone's buildings, ground, fountain, pond,
                               stall, benches and café: one mesh per material
                               per zone (few draw calls), named <zone>_<material>
    village_<zone>_light.png   its baked sky and bounce light
    village_trees.glb          the tree kinds and a shrub, drawn instanced by the app
    village_preview.png        a render (with --preview)

Coordinates are the app's (x, y up, z south), placed in Blender as (x, -z, y).
"""
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default):
    if name in ARGS:
        i = ARGS.index(name)
        return type(default)(ARGS[i + 1]) if not isinstance(default, bool) else True
    return default


SAMPLES = arg("--samples", 96)
SIZE = arg("--size", 2048)
PREVIEW = arg("--preview", False)
NO_BAKE = arg("--no-bake", False)
# Bake just this zone's light map and stop (a run per zone needs less GPU memory; the light-map
# layout comes out the same every run, so a later --no-bake run exports matching meshes).
ONLY = arg("--zone", "")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets-src", "house")
OUT = os.path.join(ROOT, "assets-build", "house")
with open(os.path.join(OUT, "village_layout.json"), encoding="utf-8") as f:
    L = json.load(f)
random.seed(7)


def V(x, y, z):
    return Vector((x, -z, y))


# --- scene -----------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
ZONES = {z["id"]: z for z in L["ZONES"]}
COLS = {}
PARTS = {}
for zid in list(ZONES) + ["trees"]:
    col = bpy.data.collections.new(zid)
    scene.collection.children.link(col)
    COLS[zid] = col
    PARTS[zid] = []


def zone_at(x, z):
    for zid, r in ZONES.items():
        if r["x0"] <= x <= r["x1"] and r["z0"] <= z <= r["z1"]:
            return zid
    return "square"


# --- materials -------------------------------------------------------------
MATS = {}


def image(path, color=True):
    img = bpy.data.images.load(path, check_existing=True)
    if not color:
        img.colorspace_settings.name = "Non-Color"
    return img


def textured(name, tex, tile=1.0, tint=None):
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
    arm = os.path.join(d, "arm.jpg")
    if os.path.exists(arm):
        a = nt.nodes.new("ShaderNodeTexImage")
        a.image = image(arm, color=False)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(a.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    rough = os.path.join(d, "rough.jpg")
    if not os.path.exists(arm) and os.path.exists(rough):
        r = nt.nodes.new("ShaderNodeTexImage")
        r.image = image(rough, color=False)
        nt.links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
    nor = os.path.join(d, "nor_gl.jpg")
    if os.path.exists(nor):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = image(nor, color=False)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    m["tile"] = tile
    MATS[name] = m
    return m


def plain(name, color, rough=0.6, metal=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    m["tile"] = 1.0
    MATS[name] = m
    return m


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


textured("grass", "Grass001", tile=2.5)
textured("lanePath", "grass_path_3", tile=3.0)
textured("cobble", "cobblestone_floor_04", tile=2.2)
textured("squarePaving", "patterned_cobblestone", tile=3.0)
textured("parkPath", "stony_dirt_path", tile=2.5)
textured("cafeFloor", "oak_wood_planks", tile=2.0)
textured("plasterYellow", "yellow_plaster", tile=3.0)
textured("plasterWhite", "white_stucco", tile=3.0)
textured("plasterRed", "red_plaster_weathered", tile=3.0)
textured("plasterBlue", "blue_plaster_weathered", tile=3.0)
textured("plasterClay", "patterned_clay_plaster", tile=3.0)
textured("siding", "weathered_plank_siding", tile=2.0)
textured("stoneBase", "plaster_stone_wall_01", tile=2.0)
textured("stoneWall", "old_stone_wall", tile=2.0)
textured("roofSlate", "red_slate_roof_tiles_01", tile=2.0)
textured("roofGrey", "grey_roof_tiles", tile=2.0)
textured("roof", "clay_roof_tiles_02", tile=2.0)
textured("shutter", "wood_shutter", tile=1.2)
textured("door", "rough_pine_door", tile=2.2)
textured("pondEdge", "mossy_cobblestone", tile=1.5)
textured("pondBed", "brown_mud", tile=2.0)
textured("brick", "red_brick_03", tile=1.5)
textured("leaves", "leafy_grass", tile=0.8, tint=srgb("#9BD07A"))
textured("leavesDark", "leafy_grass", tile=0.8, tint=srgb("#6FA35A"))
plain("trim", srgb("#F4F1EA"), rough=0.45)
plain("woodDark", srgb("#5A3A24"), rough=0.55)
plain("wood", srgb("#9A6A42"), rough=0.6)
plain("window", srgb("#1E2A33"), rough=0.08, metal=0.2)
plain("interior", srgb("#F3E6D2"), rough=0.8)
plain("counterTop", srgb("#E8E2D6"), rough=0.3)
plain("bark", srgb("#5B4030"), rough=1.0)
plain("water", srgb("#3F7F95"), rough=0.05)
plain("blackboard", srgb("#22302B"), rough=0.9)
plain("chalk", srgb("#F2F2EA"), rough=0.9)
plain("metalDark", srgb("#2E3136"), rough=0.4, metal=0.8)
for i, c in enumerate(("#E84A6F", "#FFC93C", "#F2A7B8", "#9B5DE5", "#FFFFFF", "#FF8A3D")):
    plain(f"flower{i}", srgb(c), rough=0.7)
for b in L["BUILDINGS"]:
    if b.get("awning"):
        plain(f"awning_{b['id']}", srgb(b["awning"]), rough=0.8)
plain("awningWhite", srgb("#F4F1EA"), rough=0.8)
plain("stallStripe", srgb("#2F6B5A"), rough=0.8)

# --- geometry --------------------------------------------------------------


def link(zone, obj, mat=None):
    if mat:
        obj.data.materials.append(MATS[mat])
    COLS[zone].objects.link(obj)
    PARTS[zone].append(obj)
    return obj


def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    return bpy.data.objects.new(name, me)


def box(zone, a, b, mat, name="box"):
    lo = [min(a[i], b[i]) for i in range(3)]
    hi = [max(a[i], b[i]) for i in range(3)]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = V(*[lo[i] + (v.co[i] + 0.5) * (hi[i] - lo[i]) for i in range(3)])
    return link(zone, mesh_obj(name, bm), mat)


def cyl(zone, x, y0, z, r, h, mat, segs=16, r2=None, name="cyl"):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    for v in bm.verts:
        v.co = Vector((v.co.x + x, v.co.y - z, v.co.z + y0 + h / 2))
    return link(zone, mesh_obj(name, bm), mat)


def ball(zone, x, y, z, r, mat, subdiv=1, squash=1.0, name="ball"):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    for v in bm.verts:
        v.co = Vector((v.co.x + x, v.co.y - z, v.co.z * squash + y))
    return link(zone, mesh_obj(name, bm), mat)


def slab(zone, corners, thick, mat, name="slab"):
    """A thick quad: four top corners (app space), extruded down by `thick`."""
    bm = bmesh.new()
    top = [bm.verts.new(V(*c)) for c in corners]
    bot = [bm.verts.new(V(c[0], c[1] - thick, c[2])) for c in corners]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new([top[i], bot[i], bot[j], top[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(zone, mesh_obj(name, bm), mat)


def prism(zone, pts, a, b, axis, mat, name="gable"):
    """A triangle (pts: (along-across, y) pairs) extruded from a to b along x or z."""
    bm = bmesh.new()
    ends = []
    for at in (a, b):
        ends.append([bm.verts.new(V(at, y, c) if axis == "x" else V(c, y, at)) for c, y in pts])
    bm.faces.new(ends[0])
    bm.faces.new(list(reversed(ends[1])))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([ends[0][i], ends[1][i], ends[1][j], ends[0][j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(zone, mesh_obj(name, bm), mat)


def text(zone, body, x, y, z, ry, size, mat):
    cu = bpy.data.curves.new("sign", "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = 0.015
    cu.align_x = "CENTER"
    tmp = bpy.data.objects.new("sign_tmp", cu)
    scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    scene.collection.objects.unlink(tmp)
    obj = bpy.data.objects.new("sign", me)
    # Upright, facing +z in the app (Blender -y), then turned.
    obj.matrix_world = Matrix.Translation(V(x, y, z)) @ Matrix.Rotation(ry, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "X")
    return link(zone, obj, mat)


def subtract(r, hole):
    """The parts of rectangle r outside hole."""
    if hole["x1"] <= r["x0"] or hole["x0"] >= r["x1"] or hole["z1"] <= r["z0"] or hole["z0"] >= r["z1"]:
        return [r]
    out = []
    if hole["z0"] > r["z0"]:
        out.append(dict(r, z1=hole["z0"]))
    if hole["z1"] < r["z1"]:
        out.append(dict(r, z0=hole["z1"]))
    mz0, mz1 = max(r["z0"], hole["z0"]), min(r["z1"], hole["z1"])
    if hole["x0"] > r["x0"]:
        out.append(dict(r, x1=hole["x0"], z0=mz0, z1=mz1))
    if hole["x1"] < r["x1"]:
        out.append(dict(r, x0=hole["x1"], z0=mz0, z1=mz1))
    return out


def clip(r, zone):
    z = ZONES[zone]
    c = dict(r, x0=max(r["x0"], z["x0"]), x1=min(r["x1"], z["x1"]), z0=max(r["z0"], z["z0"]), z1=min(r["z1"], z["z1"]))
    return c if c["x0"] < c["x1"] and c["z0"] < c["z1"] else None


POND = L["POND"]
POND_HOLE = dict(x0=POND["x0"] - 0.4, x1=POND["x1"] + 0.4, z0=POND["z0"] - 0.4, z1=POND["z1"] + 0.4)

# --- the ground --------------------------------------------------------------
# Grass under the whole village (a hair below the garden's, so they never fight), paths on top.
for zid, zr in ZONES.items():
    base = dict(zr, z0=max(zr["z0"], 15.8))
    for piece in subtract(base, POND_HOLE):
        box(zid, (piece["x0"], -0.25, piece["z0"]), (piece["x1"], -0.03, piece["z1"]), "grass", name="grass")
for i, g in enumerate(L["GROUNDS"]):
    y = 0.012 + i * 0.0015
    for zid in ZONES:
        c = clip(g, zid)
        if not c:
            continue
        for piece in subtract(c, POND_HOLE) if g["kind"] == "parkPath" else [c]:
            box(zid, (piece["x0"], -0.04, piece["z0"]), (piece["x1"], y, piece["z1"]), g["kind"], name=f"ground_{g['kind']}")
# Kerbs along the street.
for zz in (30.0, 35.9):
    for zid in ZONES:
        c = clip(dict(x0=-54, x1=60, z0=zz - 0.05, z1=zz + 0.15), zid)
        if c:
            box(zid, (c["x0"], 0, c["z0"]), (c["x1"], 0.06, c["z1"]), "stoneBase", name="kerb")

# The gate: two stone posts and a little arch, in the gap in the garden's hedge.
G = L["GATE"]
for gx in (G["x0"] - 0.35, G["x1"]):
    box("square", (gx, 0, 15.05), (gx + 0.35, 1.5, 15.75), "stoneWall", name="gate_post")
    box("square", (gx - 0.03, 1.5, 15.02), (gx + 0.38, 1.6, 15.78), "trim", name="gate_cap")

# --- buildings ---------------------------------------------------------------
WALL_T = 0.3


def building(b):
    zid = zone_at((b["x0"] + b["x1"]) / 2, (b["z0"] + b["z1"]) / 2)
    x0, x1, z0, z1, h = b["x0"], b["x1"], b["z0"], b["z1"], b["h"]
    wall_m = b["wall"]
    # A stone plinth, then the walls (the café has a floor you walk on instead).
    if not b.get("inside"):
        box(zid, (x0 - 0.05, 0, z0 - 0.05), (x1 + 0.05, 0.6, z1 + 0.05), "stoneBase", name="plinth")
    door = b["door"]
    sides = {
        "n": ((x0, z0), (x1, z0), (0, -1)),
        "s": ((x1, z1), (x0, z1), (0, 1)),
        "w": ((x0, z1), (x0, z0), (-1, 0)),
        "e": ((x1, z0), (x1, z1), (1, 0)),
    }
    if b.get("inside"):
        cafe_walls(b, zid)
    else:
        box(zid, (x0, 0.6, z0), (x1, h, z1), wall_m, name="walls")
    for side, ((ax, az), (bx, bz), (nx, nz)) in sides.items():
        length = math.hypot(bx - ax, bz - az)
        dx, dz = (bx - ax) / length, (bz - az) / length
        out = 0.03

        def at(s, off=0.0):
            return ax + dx * s + nx * (out + off), az + dz * s + nz * (out + off)

        door_s = None
        if door["side"] == side:
            door_s = (door["at"] - ax) / dx if abs(dx) > 0.5 else (door["at"] - az) / dz
            doorway(zid, at, dx, dz, nx, nz, door_s, b)
        # Windows every ~2.6 m, clear of the door.
        n = max(1, int(length // 2.6))
        for k in range(n):
            s = (k + 0.5) * length / n
            if door_s is not None and abs(s - door_s) < 1.3:
                continue
            if b.get("inside") and side in ("w", "n"):
                continue  # the café's are real windows (cafe_walls)
            window(zid, at, dx, dz, nx, nz, s, wall_m)
        if b.get("awning") and side == door["side"]:
            awning(zid, at, dx, dz, nx, nz, length, h, b)
    roof(zid, b)
    if b.get("sign"):
        sign_board(zid, b, sides)
    if not b.get("sign"):
        # Cottages: a chimney, through the roof on one slope, standing clear of the ridge.
        rise = (z1 - z0) / 2 * 0.75 if b["ridge"] == "x" else (x1 - x0) / 2 * 0.75
        cx = x0 + (x1 - x0) * 0.25
        cz = z0 + (z1 - z0) * 0.3
        box(zid, (cx - 0.35, h, cz - 0.35), (cx + 0.35, h + rise + 0.7, cz + 0.35), "brick", name="chimney")


def doorway(zid, at, dx, dz, nx, nz, s, b):
    w = 1.2
    (px, pz) = at(s)
    lo_x, hi_x = sorted((px - dx * w / 2, px + dx * w / 2))
    lo_z, hi_z = sorted((pz - dz * w / 2, pz + dz * w / 2))
    t = 0.06
    if b.get("inside"):
        # The café's door stands open, back against the wall.
        return
    box(zid, (lo_x - abs(nx) * t, 0.6, lo_z - abs(nz) * t), (hi_x + abs(nx) * t, 2.85, hi_z + abs(nz) * t), "door", name="door")
    box(zid, (lo_x - abs(dz) * 0.1 - abs(nx) * 0.08, 2.85, lo_z - abs(dx) * 0.1 - abs(nz) * 0.08), (hi_x + abs(dz) * 0.1 + abs(nx) * 0.08, 3.0, hi_z + abs(dx) * 0.1 + abs(nz) * 0.08), "trim", name="door_head")
    # A stone step up to it.
    sx, sz = at(s, 0.4)
    box(zid, (sx - abs(dz) * 0.8 - 0.4 * abs(nx), 0, sz - abs(dx) * 0.8 - 0.4 * abs(nz)), (sx + abs(dz) * 0.8 + 0.4 * abs(nx), 0.6, sz + abs(dx) * 0.8 + 0.4 * abs(nz)), "stoneBase", name="step")


def window(zid, at, dx, dz, nx, nz, s, wall_m):
    w, y0, y1 = 1.0, 1.25, 2.55
    px, pz = at(s)
    ex, ez = abs(dx) * w / 2, abs(dz) * w / 2
    t = 0.05
    box(zid, (px - ex - abs(nx) * t, y0, pz - ez - abs(nz) * t), (px + ex + abs(nx) * t, y1, pz + ez + abs(nz) * t), "window", name="window")
    # Frame and sill.
    f = 0.07
    box(zid, (px - ex - abs(dx) * f - abs(nx) * 0.07, y1, pz - ez - abs(dz) * f - abs(nz) * 0.07), (px + ex + abs(dx) * f + abs(nx) * 0.07, y1 + 0.1, pz + ez + abs(dz) * f + abs(nz) * 0.07), "trim", name="frame")
    box(zid, (px - ex - abs(dx) * f - abs(nx) * 0.12, y0 - 0.08, pz - ez - abs(dz) * f - abs(nz) * 0.12), (px + ex + abs(dx) * f + abs(nx) * 0.12, y0, pz + ez + abs(dz) * f + abs(nz) * 0.12), "trim", name="sill")
    # Shutters open either side.
    for sgn in (-1, 1):
        cx, cz = px + dx * sgn * (w / 2 + 0.3), pz + dz * sgn * (w / 2 + 0.3)
        box(zid, (cx - abs(dx) * 0.27 - abs(nx) * 0.04, y0, cz - abs(dz) * 0.27 - abs(nz) * 0.04), (cx + abs(dx) * 0.27 + abs(nx) * 0.04, y1, cz + abs(dz) * 0.27 + abs(nz) * 0.04), "shutter", name="shutter")
    # A flower box under it.
    bx, bz = at(s, 0.14)
    box(zid, (bx - ex - abs(nx) * 0.1, y0 - 0.35, bz - ez - abs(nz) * 0.1), (bx + ex + abs(nx) * 0.1, y0 - 0.1, bz + ez + abs(nz) * 0.1), "woodDark", name="flowerbox")
    for k in range(5):
        u = -w / 2 + 0.12 + k * (w - 0.24) / 4
        ball(zid, bx + dx * u, y0 - 0.05, bz + dz * u, 0.12, f"flower{random.randrange(6)}", subdiv=1, name="flowers")


def awning(zid, at, dx, dz, nx, nz, length, h, b):
    span = min(length - 1.0, 7.0)
    mid = length / 2
    stripes = 8
    for k in range(stripes):
        s0 = mid - span / 2 + k * span / stripes
        s1 = s0 + span / stripes
        pa, pb = at(s0), at(s1)
        qa, qb = at(s0, 1.4), at(s1, 1.4)
        corners = [(pa[0], 3.35, pa[1]), (pb[0], 3.35, pb[1]), (qb[0], 2.85, qb[1]), (qa[0], 2.85, qa[1])]
        slab(zid, corners, 0.04, f"awning_{b['id']}" if k % 2 == 0 else "awningWhite", name="awning")


def sign_board(zid, b, sides):
    (ax, az), (bx, bz), (nx, nz) = sides[b["door"]["side"]]
    mx, mz = (ax + bx) / 2 + nx * 0.06, (az + bz) / 2 + nz * 0.06
    w = 3.2
    box(zid, (mx - abs(nz) * w / 2 - abs(nx) * 0.04, 3.45, mz - abs(nx) * w / 2 - abs(nz) * 0.04), (mx + abs(nz) * w / 2 + abs(nx) * 0.04, 4.1, mz + abs(nx) * w / 2 + abs(nz) * 0.04), "woodDark", name="signboard")
    ry = math.atan2(nx, nz)
    text(zid, b["sign"], mx + nx * 0.05, 3.6, mz + nz * 0.05, ry, 0.5, "trim")


def roof(zid, b):
    x0, x1, z0, z1, h = b["x0"], b["x1"], b["z0"], b["z1"], b["h"]
    o = 0.45
    mat = b["roof"]
    if b["ridge"] == "x":
        zc = (z0 + z1) / 2
        rise = (z1 - z0) / 2 * 0.75
        top = h + rise
        for za, zb in ((z0 - o, zc), (z1 + o, zc)):
            ya = h - o * 0.75
            slab(zid, [(x0 - o, ya, za), (x1 + o, ya, za), (x1 + o, top, zb), (x0 - o, top, zb)], 0.12, mat, name="roof")["ridge"] = "x"
        prism(zid, [(z0, h), (z1, h), (zc, top - 0.05)], x0, x1, "x", b["wall"], name="gable")
    else:
        xc = (x0 + x1) / 2
        rise = (x1 - x0) / 2 * 0.75
        top = h + rise
        for xa, xb in ((x0 - o, xc), (x1 + o, xc)):
            ya = h - o * 0.75
            slab(zid, [(xa, ya, z0 - o), (xa, ya, z1 + o), (xb, top, z1 + o), (xb, top, z0 - o)], 0.12, mat, name="roof")["ridge"] = "z"
        prism(zid, [(x0, h), (x1, h), (xc, top - 0.05)], z0, z1, "z", b["wall"], name="gable")


def cafe_walls(b, zid):
    """The café: walls you can see through (big windows on the square and the street), a door, a room inside."""
    x0, x1, z0, z1, h = b["x0"], b["x1"], b["z0"], b["z1"], b["h"]
    t = WALL_T
    door_z = b["door"]["at"]

    def solid(a, c):
        box(zid, a, c, b["wall"], name="cafe_wall")

    # West wall (onto the square): windows either side of the open door.
    for (za, zb) in ((z0, 39.2), (42.6, door_z - 0.7), (door_z + 0.7, 45.4), (48.8, z1)):
        solid((x0, 0.0, za), (x0 + t, h, zb))
    for (za, zb) in ((39.2, 42.6), (45.4, 48.8)):
        solid((x0, 0.0, za), (x0 + t, 1.0, zb))
        solid((x0, 3.2, za), (x0 + t, h, zb))
        box(zid, (x0 + 0.12, 1.0, za), (x0 + 0.16, 3.2, zb), "window", name="cafe_glass")
        box(zid, (x0 - 0.06, 3.2, za - 0.05), (x0 + t + 0.06, 3.3, zb + 0.05), "trim", name="frame")
        box(zid, (x0 - 0.12, 0.92, za - 0.05), (x0 + t + 0.06, 1.0, zb + 0.05), "trim", name="sill")
    solid((x0, 2.9, door_z - 0.7), (x0 + t, h, door_z + 0.7))
    # North wall (onto the street): two windows.
    for (xa, xb) in ((x0, 14.2), (17.4, 18.6), (21.8, x1)):
        solid((xa, 0.0, z0), (xb, h, z0 + t))
    for (xa, xb) in ((14.2, 17.4), (18.6, 21.8)):
        solid((xa, 0.0, z0), (xb, 1.0, z0 + t))
        solid((xa, 3.2, z0), (xb, h, z0 + t))
        box(zid, (xa, 1.0, z0 + 0.12), (xb, 3.2, z0 + 0.16), "window", name="cafe_glass")
    # East and south: plain.
    solid((x1 - t, 0.0, z0), (x1, h, z1))
    solid((x0, 0.0, z1 - t), (x1, h, z1))
    # Inside: a warm room, a ceiling, the counter along the east wall, shelves, a blackboard menu.
    box(zid, (x0 + t, 0.0, z0 + t), (x0 + t + 0.02, h, z1 - t), "interior", name="cafe_in")
    box(zid, (x1 - t - 0.02, 0.0, z0 + t), (x1 - t, h, z1 - t), "interior", name="cafe_in")
    box(zid, (x0 + t, 0.0, z1 - t - 0.02), (x1 - t, h, z1 - t), "interior", name="cafe_in")
    box(zid, (x0 + t, 0.0, z0 + t), (x1 - t, h, z0 + t + 0.02), "interior", name="cafe_in")
    box(zid, (x0, h - 0.1, z0), (x1, h, z1), "interior", name="cafe_ceiling")
    box(zid, (21.2, 0.0, 40), (22.2, 1.05, 48), "wood", name="counter")
    box(zid, (21.1, 1.05, 39.9), (22.3, 1.12, 48.1), "counterTop", name="counter_top")
    for y in (2.1, 2.7):
        box(zid, (23.3, y, 40), (23.7, y + 0.05, 47.5), "woodDark", name="shelf")
        for k in range(10):
            cyl(zid, 23.5, y + 0.05, 40.4 + k * 0.7, 0.09, 0.25, f"flower{k % 6}" if k % 3 else "trim", segs=8, name="jar")
    box(zid, (23.62, 1.9, 43.2), (23.68, 3.1, 45.6), "blackboard", name="menu")
    text(zid, "Menu", 23.6, 2.75, 44.4, -math.pi / 2, 0.28, "chalk")


for b in L["BUILDINGS"]:
    building(b)

# --- the fountain, the pond, the stall ------------------------------------------
F = L["FOUNTAIN"]
cyl("square", F["x"], 0, F["z"], F["r"], 0.55, "stoneWall", segs=24, name="basin")
water_f = cyl("square", F["x"], 0.3, F["z"], F["r"] - 0.25, 0.2, "water", segs=24, name="water_fountain")
cyl("square", F["x"], 0.5, F["z"], 0.28, 1.2, "stoneWall", segs=12, name="column")
cyl("square", F["x"], 1.55, F["z"], 0.2, 0.3, "stoneWall", segs=16, r2=0.95, name="bowl")
ball("square", F["x"], 2.05, F["z"], 0.22, "stoneWall", subdiv=2, name="finial")

P = POND
box("park", (P["x0"] - 0.4, -0.7, P["z0"] - 0.4), (P["x1"] + 0.4, -0.6, P["z1"] + 0.4), "pondBed", name="pond_bed")
for (a, c) in (
    ((P["x0"] - 0.5, -0.6, P["z0"] - 0.5), (P["x1"] + 0.5, 0.18, P["z0"])),
    ((P["x0"] - 0.5, -0.6, P["z1"]), (P["x1"] + 0.5, 0.18, P["z1"] + 0.5)),
    ((P["x0"] - 0.5, -0.6, P["z0"]), (P["x0"], 0.18, P["z1"])),
    ((P["x1"], -0.6, P["z0"]), (P["x1"] + 0.5, 0.18, P["z1"])),
):
    box("park", a, c, "pondEdge", name="pond_edge")
box("park", (P["x0"], -0.25, P["z0"]), (P["x1"], -0.12, P["z1"]), "water", name="water_pond")
# Reeds and lily pads.
for k in range(14):
    side = k % 4
    x = P["x0"] + 0.3 if side == 0 else P["x1"] - 0.3 if side == 1 else P["x0"] + 1 + random.random() * (P["x1"] - P["x0"] - 2)
    z = P["z0"] + 1 + random.random() * (P["z1"] - P["z0"] - 2) if side < 2 else (P["z0"] + 0.3 if side == 2 else P["z1"] - 0.3)
    cyl("park", x, -0.15, z, 0.03, 0.9 + random.random() * 0.4, "leavesDark", segs=5, name="reed")
for k in range(8):
    cyl("park", P["x0"] + 1.5 + random.random() * (P["x1"] - P["x0"] - 3), -0.115, P["z0"] + 1.5 + random.random() * (P["z1"] - P["z0"] - 3), 0.35, 0.01, "leaves", segs=10, name="lily")

S = L["STALL"]
sx, sz = S["x"], S["z"]
box("square", (sx - 0.7, 0, sz - 1.4), (sx + 0.7, 0.9, sz + 1.4), "wood", name="stall_table")
for ox in (-0.65, 0.65):
    for oz in (-1.35, 1.35):
        box("square", (sx + ox - 0.05, 0, sz + oz - 0.05), (sx + ox + 0.05, 2.4, sz + oz + 0.05), "woodDark", name="stall_post")
for k in range(6):
    z0 = sz - 1.6 + k * 3.2 / 6
    slab("square", [(sx - 0.95, 2.35, z0), (sx - 0.95, 2.35, z0 + 3.2 / 6), (sx + 0.95, 2.55, z0 + 3.2 / 6), (sx + 0.95, 2.55, z0)], 0.03, "stallStripe" if k % 2 == 0 else "awningWhite", name="stall_canopy")
for k in range(6):
    bz = sz - 1.1 + k * 0.44
    cyl("square", sx + 0.25, 0.9, bz, 0.14, 0.22, "metalDark", segs=10, name="bucket")
    for j in range(5):
        a = j * 1.3
        ball("square", sx + 0.25 + math.cos(a) * 0.08, 1.2 + (j % 2) * 0.06, bz + math.sin(a) * 0.08, 0.07, f"flower{(k + j) % 6}", subdiv=1, name="bloom")
text("square", "Flowers", sx + 0.96, 2.05, sz, math.pi / 2, 0.28, "trim")

# --- the temple: Shiva, small and South Indian --------------------------------------
plain("blackStone", srgb("#2A2A2E"), rough=0.32)
plain("templeStone", srgb("#C9B89A"), rough=0.85)
plain("gold", srgb("#C9A23A"), rough=0.3, metal=0.9)
plain("marigold", srgb("#F2A21B"), rough=0.7)
T = L["TEMPLE"]
TZ = "west"


def tiers(cx, cz, w, d, y, n, step_h, inset, mat):
    """A stepped tower: n tiers, each smaller, with little pavilions at the corners; a dome and a kalasha on top."""
    for k in range(n):
        hw, hd = w / 2 - k * inset, d / 2 - k * inset
        box(TZ, (cx - hw, y, cz - hd), (cx + hw, y + step_h * 0.8, cz + hd), mat, name="tier")
        # A cornice on each tier, and small corner pavilions (kudu).
        box(TZ, (cx - hw - 0.08, y + step_h * 0.8, cz - hd - 0.08), (cx + hw + 0.08, y + step_h, cz + hd + 0.08), "templeStone", name="cornice")
        for sx in (-1, 1):
            for sz in (-1, 1):
                ball(TZ, cx + sx * (hw - 0.15), y + step_h + 0.1, cz + sz * (hd - 0.15), 0.14, mat, subdiv=1, squash=1.2, name="kudu")
        y += step_h
    r = max(0.35, min(w, d) / 2 - n * inset)
    ball(TZ, cx, y + r * 0.45, cz, r, mat, subdiv=2, squash=0.9, name="shikhara")
    cyl(TZ, cx, y + r * 1.3, cz, 0.12, 0.18, "gold", segs=12, name="kalasha_base")
    ball(TZ, cx, y + r * 1.55, cz, 0.13, "gold", subdiv=2, name="kalasha")
    cyl(TZ, cx, y + r * 1.62, cz, 0.04, 0.3, "gold", segs=8, r2=0.0, name="kalasha_tip")


# The gateway: two piers, a lintel, and a little tiered tower over the opening onto the courtyard.
g = T["gateway"]
gz = g["z"]
for (a, b) in ((g["x0"] - 0.9, g["x0"]), (g["x1"], g["x1"] + 0.9)):
    box(TZ, (a, 0, gz - 0.45), (b, 3.0, gz + 0.45), "templeStone", name="gate_pier")
box(TZ, (g["x0"] - 1.0, 3.0, gz - 0.55), (g["x1"] + 1.0, 3.45, gz + 0.55), "templeStone", name="gate_lintel")
tiers((g["x0"] + g["x1"]) / 2, gz, g["x1"] - g["x0"] + 1.6, 1.0, 3.45, 3, 0.75, 0.25, "stoneWall")

# The courtyard's low wall, open at the gateway and towards the hall.
for (a, b) in (((-61.2, 0, 45.8), (g["x0"] - 0.9, 1.1, 46.2)), ((g["x1"] + 0.9, 0, 45.8), (-46.8, 1.1, 46.2)), ((-61.2, 0, 46.2), (-60.8, 1.1, 53)), ((-47.2, 0, 46.2), (-46.8, 1.1, 53))):
    box(TZ, a, b, "stoneWall", name="court_wall")
    box(TZ, (a[0] - 0.05, 1.1, a[2] - 0.05), (b[0] + 0.05, 1.2, b[2] + 0.05), "templeStone", name="court_cap")

# The hall (mandapa): a stone floor, pillars, a flat roof with a parapet.
hh = T["hall"]
box(TZ, (hh["x0"] - 0.4, 0, hh["z0"] - 0.1), (hh["x1"] + 0.4, 0.08, hh["z1"] + 0.2), "templeStone", name="hall_floor")
for px in (hh["x0"] - 0.1, hh["x0"] + 2.6, hh["x1"] - 2.6, hh["x1"] + 0.1):
    for pz in (hh["z0"] + 0.1, hh["z1"] - 0.1):
        box(TZ, (px - 0.2, 0.08, pz - 0.2), (px + 0.2, 3.0, pz + 0.2), "templeStone", name="pillar")
        box(TZ, (px - 0.28, 0.08, pz - 0.28), (px + 0.28, 0.4, pz + 0.28), "stoneWall", name="pillar_base")
        box(TZ, (px - 0.3, 2.8, pz - 0.3), (px + 0.3, 3.0, pz + 0.3), "stoneWall", name="pillar_capital")
box(TZ, (hh["x0"] - 0.5, 3.0, hh["z0"] - 0.4), (hh["x1"] + 0.5, 3.3, hh["z1"] + 0.2), "templeStone", name="hall_roof")
for (a, b) in (((hh["x0"] - 0.5, 3.3, hh["z0"] - 0.4), (hh["x1"] + 0.5, 3.6, hh["z0"] - 0.25)), ((hh["x0"] - 0.5, 3.3, hh["z0"] - 0.4), (hh["x0"] - 0.35, 3.6, hh["z1"] + 0.2)), ((hh["x1"] + 0.35, 3.3, hh["z0"] - 0.4), (hh["x1"] + 0.5, 3.6, hh["z1"] + 0.2))):
    box(TZ, a, b, "stoneWall", name="parapet")

# The sanctum (garbhagriha): thick walls, a doorway facing the hall, the lingam inside, the vimana above.
sn = T["sanctum"]
t = 0.45
door_x = (T["lingam"]["x"] - 0.6, T["lingam"]["x"] + 0.6)
box(TZ, (sn["x0"], 0, sn["z0"]), (door_x[0], 3.4, sn["z0"] + t), "templeStone", name="sanctum_wall")
box(TZ, (door_x[1], 0, sn["z0"]), (sn["x1"], 3.4, sn["z0"] + t), "templeStone", name="sanctum_wall")
box(TZ, (door_x[0], 2.3, sn["z0"]), (door_x[1], 3.4, sn["z0"] + t), "templeStone", name="sanctum_wall")
box(TZ, (door_x[0] - 0.12, 0, sn["z0"] - 0.05), (door_x[0], 2.4, sn["z0"] + t + 0.05), "gold", name="door_frame")
box(TZ, (door_x[1], 0, sn["z0"] - 0.05), (door_x[1] + 0.12, 2.4, sn["z0"] + t + 0.05), "gold", name="door_frame")
box(TZ, (sn["x0"], 0, sn["z1"] - t), (sn["x1"], 3.4, sn["z1"]), "templeStone", name="sanctum_wall")
box(TZ, (sn["x0"], 0, sn["z0"]), (sn["x0"] + t, 3.4, sn["z1"]), "templeStone", name="sanctum_wall")
box(TZ, (sn["x1"] - t, 0, sn["z0"]), (sn["x1"], 3.4, sn["z1"]), "templeStone", name="sanctum_wall")
box(TZ, (sn["x0"], 0, sn["z0"]), (sn["x1"], 0.1, sn["z1"]), "templeStone", name="sanctum_floor")
box(TZ, (sn["x0"] - 0.1, 3.4, sn["z0"] - 0.1), (sn["x1"] + 0.1, 3.6, sn["z1"] + 0.1), "templeStone", name="sanctum_roof")
tiers((sn["x0"] + sn["x1"]) / 2, (sn["z0"] + sn["z1"]) / 2, sn["x1"] - sn["x0"], sn["z1"] - sn["z0"], 3.6, 4, 0.9, 0.42, "stoneWall")

# The lingam on its base (the yoni, its spout to the north), in black stone, garlanded with marigolds.
lx, lz = T["lingam"]["x"], T["lingam"]["z"]
cyl(TZ, lx, 0.1, lz, 0.55, 0.22, "blackStone", segs=24, name="pitha")
cyl(TZ, lx, 0.32, lz, 0.48, 0.12, "blackStone", segs=24, name="yoni")
box(TZ, (lx - 0.12, 0.32, lz - 0.95), (lx + 0.12, 0.42, lz - 0.4), "blackStone", name="yoni_spout")
cyl(TZ, lx, 0.44, lz, 0.17, 0.42, "blackStone", segs=20, name="lingam")
ball(TZ, lx, 0.86, lz, 0.17, "blackStone", subdiv=2, name="lingam_top")
for k in range(14):
    a = k / 14 * math.tau
    ball(TZ, lx + math.cos(a) * 0.2, 0.62, lz + math.sin(a) * 0.2, 0.045, "marigold", subdiv=1, name="garland")
ball(TZ, lx, 1.0, lz, 0.05, "flower0", subdiv=1, name="tilak")

# Nandi, seated in the hall, facing the sanctum: a simple carved bull on a plinth.
nx, nz = T["nandi"]["x"], T["nandi"]["z"]
box(TZ, (nx - 0.45, 0.08, nz - 0.75), (nx + 0.45, 0.32, nz + 0.75), "templeStone", name="nandi_plinth")
ball(TZ, nx, 0.72, nz - 0.1, 0.42, "blackStone", subdiv=2, squash=0.95, name="nandi_body")
for o in [PARTS[TZ][-1]]:
    o.scale = (1.0, 1.7, 1.0)  # longer than wide (Blender y is the app's -z)
ball(TZ, nx, 1.08, nz + 0.05, 0.22, "blackStone", subdiv=2, name="nandi_hump")
ball(TZ, nx, 1.02, nz + 0.62, 0.2, "blackStone", subdiv=2, squash=1.2, name="nandi_head")
for sx in (-1, 1):
    cyl(TZ, nx + sx * 0.13, 1.2, nz + 0.6, 0.035, 0.2, "blackStone", segs=6, r2=0.01, name="nandi_horn")
    ball(TZ, nx + sx * 0.2, 1.08, nz + 0.6, 0.06, "blackStone", subdiv=1, name="nandi_ear")
    box(TZ, (nx + sx * 0.3 - 0.1, 0.32, nz + 0.25), (nx + sx * 0.3 + 0.1, 0.48, nz + 0.6), "blackStone", name="nandi_leg")
ball(TZ, nx, 0.95, nz + 0.82, 0.1, "blackStone", subdiv=1, name="nandi_muzzle")
for k in range(8):
    a = k / 8 * math.tau
    ball(TZ, nx + math.cos(a) * 0.17, 0.92, nz + 0.4 + math.sin(a) * 0.08, 0.035, "marigold", subdiv=1, name="nandi_garland")

# --- props: benches, café furniture, crates and barrels ---------------------------


def load_model(mid, target, tris=None):
    """A Poly Haven model, joined into one object, scaled so its longest side is `target` metres; hidden, for copying."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, "models", mid, f"{mid}.gltf"))
    objs = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    for o in bpy.data.objects:
        if o not in before and o.type != "MESH":
            bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if tris:
        n = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if n > tris:
            mod = o.modifiers.new("dec", "DECIMATE")
            mod.ratio = tris / n
            bpy.ops.object.modifier_apply(modifier="dec")
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    size = hi - lo
    s = target / max(size.x, size.y)
    # Centred on the ground, at the origin.
    o.data.transform(Matrix.Translation(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))))
    o.data.transform(Matrix.Scale(s, 4))
    o.location = (0, 0, 0)
    for col in o.users_collection:
        col.objects.unlink(o)
    return o


def place(zone, proto, x, z, ry, name):
    o = bpy.data.objects.new(name, proto.data.copy())
    # A Blender turn about Z by ry is the app's turn about Y by ry (facing +z → -y).
    o.matrix_world = Matrix.Translation(V(x, 0, z)) @ Matrix.Rotation(ry, 4, "Z")
    return link(zone, o)


bench = load_model("painted_wooden_bench", 1.7)
for (x, z, ry) in L["BENCHES"]:
    place(zone_at(x, z), bench, x, z, ry, "bench")
table = load_model("round_wooden_table_02", 0.9, tris=1500)
chair = load_model("painted_wooden_chair_01", 0.5)
for (x, z) in L["CAFE_TABLES"]:
    zid = zone_at(x, z)
    place(zid, table, x, z, 0, "cafe_table")
    place(zid, chair, x - 0.7, z, math.pi / 2, "cafe_chair")
    place(zid, chair, x + 0.7, z, -math.pi / 2, "cafe_chair")
cart = load_model("CoffeeCart_01", 1.6, tris=6000)
place("square", cart, 20.4, 44, math.pi / 2, "coffee_cart")
crate = load_model("wooden_crate_01", 0.6, tris=800)
barrel = load_model("Barrel_01", 0.7, tris=1200)
basket = load_model("wicker_basket_01", 0.45, tris=1500)
planter = load_model("planter_box_01", 1.2, tris=1500)
for (x, z, ry) in ((-11.4, 39, 0.3), (-11.5, 47.3, 0), (-28, 37.4, 0.6), (-45, 37.4, 0)):
    place(zone_at(x, z), crate, x, z, ry, "crate")
for (x, z) in ((-11.6, 40.0), (11.6, 37.4), (-39.5, 37.4)):
    place(zone_at(x, z), barrel, x, z, 0, "barrel")
for (x, z) in ((-7.4, 52.2), (-7.4, 53.9), (-11.4, 39.3)):
    place(zone_at(x, z), basket, x, z, random.random() * 3, "basket")
for (x, z, ry) in ((-11.3, 44, math.pi / 2), (-11.3, 42, math.pi / 2), (11.4, 50.6, -math.pi / 2), (-3.4, 36.6, 0), (3.4, 36.6, 0)):
    place(zone_at(x, z), planter, x, z, ry, "planter")

# --- trees (one of each kind, drawn instanced by the app) ---------------------------


def crown(col, parts, cx, cy, cz, r, mat, squash=1.0, lumps=5):
    for k in range(lumps):
        a = k / lumps * math.tau + random.random()
        d = r * 0.45
        o = ball("trees", cx + math.cos(a) * d, cy + (random.random() - 0.3) * r * 0.5, cz + math.sin(a) * d, r * (0.62 + random.random() * 0.2), mat, subdiv=2, squash=squash, name="crown")
        parts.append(o)
    parts.append(ball("trees", cx, cy + r * 0.35, cz, r * 0.7, mat, subdiv=2, squash=squash, name="crown"))


def tree_kind(k):
    trunk, leaves = [], []
    if k == 0:
        trunk.append(cyl("trees", 0, 0, 0, 0.22, 2.6, "bark", segs=8, r2=0.14, name="trunk"))
        crown("trees", leaves, 0, 3.4, 0, 1.6, "leaves")
    elif k == 1:
        trunk.append(cyl("trees", 0, 0, 0, 0.2, 3.4, "bark", segs=8, r2=0.12, name="trunk"))
        crown("trees", leaves, 0, 4.2, 0, 1.25, "leavesDark", squash=1.6, lumps=4)
    else:
        trunk.append(cyl("trees", 0, 0, 0, 0.18, 1.2, "bark", segs=8, name="trunk"))
        for i, (y, r) in enumerate(((1.0, 1.5), (2.2, 1.15), (3.3, 0.8), (4.2, 0.45))):
            leaves.append(cyl("trees", 0, y, 0, r, 1.5 - i * 0.15, "leavesDark", segs=10, r2=0.05, name="cone"))
    for parts, nm in ((trunk, f"tree{k}_trunk"), (leaves, f"tree{k}_leaves")):
        bpy.ops.object.select_all(action="DESELECT")
        for o in parts:
            o.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        bpy.context.view_layer.objects.active.name = nm


for k in range(3):
    tree_kind(k)
shrub = load_model("shrub_03", 1.4, tris=1800)
shrub.name = "shrub"
COLS["trees"].objects.link(shrub)
PARTS["trees"] = [o for o in COLS["trees"].objects]

# --- UVs ---------------------------------------------------------------------------


def world_uvs(obj):
    me = obj.data
    mw = obj.matrix_world
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers[0].data
    # A roof slope: the tiles run along the ridge and up the slope, at true size.
    ridge = obj.get("ridge")
    for poly in me.polygons:
        mat = me.materials[poly.material_index] if me.materials else None
        tile = float(mat.get("tile", 1.0)) if mat else 1.0
        n = (mw.to_3x3() @ poly.normal).normalized()
        if ridge and abs(n.z) > 0.2:
            u_dir = Vector((1, 0, 0)) if ridge == "x" else Vector((0, 1, 0))
            v_dir = n.cross(u_dir).normalized()
            for li in poly.loop_indices:
                co = mw @ me.vertices[me.loops[li].vertex_index].co
                uv[li].uv = (co.dot(u_dir) / tile, co.dot(v_dir) / tile)
            continue
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            u, v = (co.x, co.y) if ax == 2 else (co.y, co.z) if ax == 0 else (co.x, co.z)
            uv[li].uv = (u / tile, v / tile)


# Our own shapes get true-size texture UVs; imported models keep theirs.
IMPORTED = {"bench", "cafe_table", "cafe_chair", "coffee_cart", "crate", "barrel", "basket", "planter", "shrub", "sign"}
for zid, objs in PARTS.items():
    for o in objs:
        if o.name.split(".")[0] not in IMPORTED:
            world_uvs(o)

# --- light: sky and bounce, baked per zone ---------------------------------------------
world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
wn = world.node_tree
env = wn.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(os.path.join(SRC, "hdri", "day.hdr"))
bg = wn.nodes["Background"]
wn.links.new(env.outputs["Color"], bg.inputs["Color"])
sun_data = bpy.data.lights.new("sun", "SUN")
sun_data.energy = 4.0
sun_data.angle = math.radians(1.5)
sun = bpy.data.objects.new("sun", sun_data)
scene.collection.objects.link(sun)
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
                print(f"[village] baking on {kind}")
                break
        except TypeError:
            continue
except Exception:
    pass

# The ground, water and leaves are lit live by the app's sun and sky; the light map is for what stands on it.
LIVE = {"grass", "lanePath", "cobble", "squarePaving", "parkPath", "water", "leaves", "leavesDark", "pondBed"}


def baked(o):
    return o.type == "MESH" and not o.name.startswith("water") and not any(m.name in LIVE for m in o.data.materials)


def bake_zone(zid):
    objs = [o for o in PARTS[zid] if baked(o)]
    if not objs:
        return
    for o in objs:
        if "lightmap" not in o.data.uv_layers:
            o.data.uv_layers.new(name="lightmap")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        o.data.uv_layers.active = o.data.uv_layers["lightmap"]
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.003, rotate=True, shape_method="AABB")
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers[0]
    if NO_BAKE or (ONLY and zid != ONLY):
        return
    img = bpy.data.images.new(f"{zid}_light", SIZE, SIZE, float_buffer=True)
    targets = []
    for m in {m for o in objs for m in o.data.materials}:
        n = m.node_tree.nodes.new("ShaderNodeTexImage")
        n.image = img
        m.node_tree.nodes.active = n
        uvn = m.node_tree.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = "lightmap"
        m.node_tree.links.new(uvn.outputs["UV"], n.inputs["Vector"])
        targets.append((m, n, uvn))
    bake = scene.render.bake
    bake.use_pass_color = False
    bake.margin = 4
    print(f"[village] baking {zid}: {len(objs)} objects, {SIZE}px, {SAMPLES} samples")
    sun_data.energy = 0.0
    bg.inputs["Strength"].default_value = 1.0
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True)
    sky = list(img.pixels)
    sun_data.energy = 4.0
    bg.inputs["Strength"].default_value = 0.0
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"INDIRECT"}, use_clear=True)
    bounce = list(img.pixels)
    bg.inputs["Strength"].default_value = 1.0
    px = [min(1.0, (a + b) * 0.5) if (i % 4) != 3 else 1.0 for i, (a, b) in enumerate(zip(sky, bounce))]
    out = bpy.data.images.new(f"{zid}_light_out", SIZE, SIZE)
    out.pixels = px
    out.filepath_raw = os.path.join(OUT, f"village_{zid}_light.png")
    out.file_format = "PNG"
    out.save()
    for m, n, uvn in targets:
        m.node_tree.nodes.remove(n)
        m.node_tree.nodes.remove(uvn)



# --- one mesh per material per zone, then export --------------------------------------


def merge_zone(zid):
    groups = {}
    for o in list(PARTS[zid]):
        if o.name.startswith("water") or o.type != "MESH":
            continue
        key = (o.data.materials[0].name if o.data.materials else "", baked(o))
        groups.setdefault(key, []).append(o)
    merged = [o for o in PARTS[zid] if o.name.startswith("water")]
    for (mat, is_baked), objs in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active
        o.name = f"{zid}_{mat}"
        o["baked"] = 1 if is_baked else 0
        merged.append(o)
    PARTS[zid] = merged


# Merge first, then bake: Cycles bakes one object at a time, so a few dozen merged meshes per
# zone bake in minutes where thousands of little pieces took hours.
for zid in ZONES:
    merge_zone(zid)
bpy.ops.object.select_all(action="DESELECT")
for zid in ZONES:
    bake_zone(zid)
if ONLY:
    print(f"[village] baked {ONLY}")
    sys.exit(0)


for img in bpy.data.images:
    if img.source == "FILE" and img.colorspace_settings.name == "Non-Color" and max(img.size) > 512:
        img.scale(512, 512)

# One file for the whole village, so each texture is stored once; every mesh is named after its
# zone ("square_roofSlate", "park_water_pond") so the app draws the zones near me and lights each with its own map.
bpy.ops.object.select_all(action="DESELECT")
for zid in ZONES:
    merge_zone(zid)
    for o in PARTS[zid]:
        if o.name.startswith("water"):
            o.name = f"{zid}_{o.name}"
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in PARTS[zid])
    print(f"[village] {zid}: {len(PARTS[zid])} meshes, {tris} triangles")
bpy.ops.object.select_all(action="DESELECT")
for zid in ZONES:
    for o in PARTS[zid]:
        o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "village.glb"),
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
print("[village] wrote village.glb")

bpy.ops.object.select_all(action="DESELECT")
for o in PARTS["trees"]:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "village_trees.glb"),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_image_format="JPEG",
    export_jpeg_quality=78,
    export_apply=True,
)
print("[village] wrote village_trees.glb:", [o.name for o in PARTS["trees"]])

if PREVIEW:
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 22
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    if arg("--preview-temple", False):
        cam.location = V(-49.5, 2.4, 48.6)
        cam.rotation_euler = (V(-54.5, 1.6, 57) - cam.location).to_track_quat("-Z", "Y").to_euler()
    else:
        cam.location = V(-14, 16, 64)
        cam.rotation_euler = (V(4, 1, 40) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.cycles.samples = max(32, SAMPLES // 2)
    scene.render.filepath = os.path.join(OUT, "village_preview.png")
    bpy.ops.render.render(write_still=True)
    print("[village] wrote village_preview.png")
