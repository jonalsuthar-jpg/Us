"""
Our House: the two of us as ourselves. The same Quaternius bodies and
skeleton as build_characters.py (so every animation fits), with our own
faces, skin, hair, glasses, watches and earrings, and the clothes from our
photos, all coloured in here so the app shows them as they are.

    python scripts/blender/likeness_textures.py
    D:\\blender.exe -b --factory-startup -P scripts/blender/build_likeness.py

Writes assets-build/house/characters/body_jonal.glb and body_parul.glb.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, kdtree, noise

sys.path.insert(0, os.path.dirname(__file__))
import build_characters as bc  # noqa: E402

TEX = os.path.join(bc.ROOT, "assets-build", "house", "likeness")
FRONT = Vector((0, -1, 0))  # the bodies face -Y in Blender


def load(gltf):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(bc.BASE, gltf))
    for o in [o for o in bpy.context.scene.objects if o.name.startswith("Icosphere")]:
        bpy.data.objects.remove(o)
    objs = bpy.context.scene.objects
    arm = next(o for o in objs if o.type == "ARMATURE")
    body = next(o for o in objs if o.type == "MESH" and o.name.lower().startswith("superhero"))
    body.name = "Body"
    return arm, body, objs["Eyes"], objs["Eyebrows"]


def swap_image(obj, has, path):
    for m in obj.data.materials:
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and has in n.image.name:
                space = n.image.colorspace_settings.name
                n.image = bpy.data.images.load(path)
                n.image.colorspace_settings.name = space  # a normal map stays Non-Color


def tinted(obj, rgb):
    """Multiply the colour texture of each material by `rgb` (the app no longer tints these)."""
    for m in obj.data.materials:
        for n in m.node_tree.nodes:
            if n.type != "TEX_IMAGE" or not n.image or "Normal" in n.image.name:
                continue
            src = n.image
            px = np.empty(len(src.pixels), np.float32)
            src.pixels.foreach_get(px)
            px = px.reshape(-1, 4)
            px[:, :3] *= np.array(rgb, np.float32)
            img = bpy.data.images.new(src.name + "_ours", *src.size, alpha=True)
            img.pixels.foreach_set(px.ravel())
            img.pack()
            n.image = img
        b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if b and not b.inputs["Base Color"].is_linked:
            c = b.inputs["Base Color"].default_value
            b.inputs["Base Color"].default_value = (*(c[i] * rgb[i] ** 2.2 for i in range(3)), 1)


def flat(name, rgb, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*srgb(rgb), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def srgb(rgb):
    return tuple(((c / 255 + 0.055) / 1.055) ** 2.4 if c / 255 > 0.04045 else c / 255 / 12.92 for c in rgb)


def textured(name, file, rough=0.9):
    m = bc.clothes_material(name)
    m.use_backface_culling = False  # the inside of a hem shows from below
    nt = m.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(os.path.join(TEX, file))
    nt.links.new(t.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    nt.nodes["Principled BSDF"].inputs["Roughness"].default_value = rough
    return m


def wrap(piece, arms_from=None):
    """Wrap the clothes' texture round the body (see likeness_textures.py); sleeves round the arm."""
    me = piece.data
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[-1])
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers[0].data
    mw = piece.matrix_world
    for poly in me.polygons:
        coords = []
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if arms_from and abs(co.x) > arms_from:
                u = 0.25 + math.atan2(co.z - 1.45, co.y) / (2 * math.pi) * 0.3
                v = 0.88 + (abs(co.x) - arms_from) * 0.2
            else:
                u = 0.5 + math.atan2(co.x, -(co.y - 0.02)) / (2 * math.pi)
                v = co.z / 2
            coords.append([u, v])
        us = [c[0] for c in coords]
        if max(us) - min(us) > 0.5:  # across the seam at the back
            for c in coords:
                if c[0] < 0.5:
                    c[0] += 1
        for li, c in zip(poly.loop_indices, coords):
            uv[li].uv = c


def skin_to(obj, arm, groups):
    """Bind a new piece to the skeleton with these weights {bone: w}."""
    for b, w in groups.items():
        g = obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b)
        g.add(range(len(obj.data.vertices)), w, "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    obj.parent = arm


def new_object(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def slimmer(objs, arm, bones, factor):
    """Thinner (or fuller) round these bones: each vertex moves to or from the bone, as much as the bone moves it."""
    for b in bones:
        head = arm.matrix_world @ arm.data.bones[b].head_local
        tail = arm.matrix_world @ arm.data.bones[b].tail_local
        axis = tail - head
        for o in objs:
            g = o.vertex_groups.get(b)
            if not g:
                continue
            inv = o.matrix_world.inverted()
            for v in o.data.vertices:
                w = next((x.weight for x in v.groups if x.group == g.index), 0)
                if w <= 0:
                    continue
                co = o.matrix_world @ v.co
                t = max(0, min(1, (co - head).dot(axis) / axis.length_squared))
                on = head + axis * t
                v.co = inv @ (on + (co - on) * (1 + (factor - 1) * w))


def belly(body, amount):
    """A softer, rounder middle: the front of the waist comes forward."""
    for v in body.data.vertices:
        co = body.matrix_world @ v.co
        if co.y < 0.02 and 0.95 < co.z < 1.3:
            t = math.sin((co.z - 0.95) / 0.35 * math.pi) * min(1, (0.02 - co.y) / 0.1)
            v.co.y -= amount * t * max(0, 1 - abs(co.x) / 0.2)


def rounder_face(objs, eyes_z, amount):
    """A fuller, rounder lower face: wider below the eyes."""
    for o in objs:
        for v in o.data.vertices:
            co = o.matrix_world @ v.co
            if eyes_z - 0.16 < co.z < eyes_z - 0.01 and co.y < 0.06:
                t = min(1, (eyes_z - 0.01 - co.z) / 0.05) * min(1, (co.z - eyes_z + 0.16) / 0.05)
                v.co.x *= 1 + amount * t


def boxed_beard(beard, eyes_z):
    """Jonal's beard: short and full, square at the chin rather than pointed."""
    mw, inv = beard.matrix_world, beard.matrix_world.inverted()
    chin = eyes_z - 0.15
    for v in beard.data.vertices:
        co = mw @ v.co
        if co.z < chin:
            co.z = chin - (chin - co.z) * 0.45
        if co.z < eyes_z - 0.08:
            co.x *= 1.12
        v.co = inv @ co


def thinner_brows(brows, factor):
    for side in (1, -1):
        vs = [v for v in brows.data.vertices if v.co.x * side > 0]
        cz = sum(v.co.z for v in vs) / len(vs)
        for v in vs:
            v.co.z = cz + (v.co.z - cz) * factor


def longer(hair, from_z, stretch, back):
    """Longer hair: everything below `from_z` hangs further down, falling behind the shoulders."""
    mw, inv = hair.matrix_world, hair.matrix_world.inverted()
    for v in hair.data.vertices:
        co = mw @ v.co
        if co.z < from_z:
            d = from_z - co.z
            co.z = from_z - d * stretch
            co.y += d * back
            v.co = inv @ co


def skirt(body, arm, z_top, z_hem, flare, mat, rings=12, around=56):
    """A kurta below the waist: rings round the hips and thighs, falling straight and flaring a little, moving with the legs."""
    verts = [(body.matrix_world @ v.co, v) for v in body.data.vertices]
    near = [(co, v) for co, v in verts if z_hem - 0.05 < co.z < z_top + 0.05 and abs(co.x) < 0.3]
    cy = sum(co.y for co, _ in near) / len(near)
    radius = []
    for k in range(rings):
        z = z_top + (z_hem - z_top) * k / (rings - 1)
        band = [co for co, _ in near if abs(co.z - z) < 0.025]
        r = [0.0] * around
        for co in band:
            a = math.atan2(co.x, -(co.y - cy))
            i = int(round((a / (2 * math.pi)) * around)) % around
            r[i] = max(r[i], math.hypot(co.x, co.y - cy))
        # Fill the gaps (between the legs) from the neighbours, then smooth round.
        for _ in range(around):
            r = [x or max(r[i - 1], r[(i + 1) % around]) for i, x in enumerate(r)]
        for _ in range(4):
            r = [(r[i - 1] + 2 * r[i] + r[(i + 1) % around]) / 4 for i in range(around)]
        if radius:  # a kurta never goes in again below the hips
            r = [max(a, b) for a, b in zip(r, radius[-1])]
        radius.append(r)
    bm = bmesh.new()
    grid = []
    for k, r in enumerate(radius):
        t = k / (rings - 1)
        z = z_top + (z_hem - z_top) * t
        ring = []
        for i in range(around):
            a = i / around * 2 * math.pi
            rr = r[i] + 0.018 + flare * t * t
            ring.append(bm.verts.new((math.sin(a) * rr, cy - math.cos(a) * rr, z)))
        grid.append(ring)
    for k in range(rings - 1):
        for i in range(around):
            j = (i + 1) % around
            bm.faces.new((grid[k][i], grid[k][j], grid[k + 1][j], grid[k + 1][i]))
    bm.normal_update()
    o = new_object("Cloth_Top_Skirt", bm, mat)
    # Weights: the nearest bit of body's, more pelvis near the waist so it hangs rather than splits.
    tree = kdtree.KDTree(len(near))
    for n, (co, _) in enumerate(near):
        tree.insert(co, n)
    tree.balance()
    names = {g.index: g.name for g in body.vertex_groups}
    for v in o.data.vertices:
        t = (z_top - v.co.z) / (z_top - z_hem)
        _, n, _ = tree.find(v.co)
        w = {names[g.group]: g.weight for g in near[n][1].groups if g.weight > 0.01}
        total = sum(w.values()) or 1
        w = {b: x / total * t for b, x in w.items()}
        w["pelvis"] = w.get("pelvis", 0) + (1 - t)
        for b, x in w.items():
            (o.vertex_groups.get(b) or o.vertex_groups.new(name=b)).add([v.index], x, "REPLACE")
    o.modifiers.new("Armature", "ARMATURE").object = arm
    o.parent = arm
    wrap(o)
    return o


def palazzo(piece, arm, amount):
    """Wide legs: from the knee down each trouser leg stands further off the leg."""
    for side in ("l", "r"):
        knee = arm.matrix_world @ arm.data.bones[f"calf_{side}"].head_local
        ankle = arm.matrix_world @ arm.data.bones[f"foot_{side}"].head_local
        hip = arm.matrix_world @ arm.data.bones[f"thigh_{side}"].head_local
        for v in piece.data.vertices:
            co = piece.matrix_world @ v.co
            if (co.x > 0) != (knee.x > 0) or co.z > hip.z - 0.12:
                continue
            t = min(1, max(0, (hip.z - 0.12 - co.z) / (hip.z - 0.12 - ankle.z)))
            axis = knee.lerp(ankle, min(1, max(0, (knee.z - co.z) / (knee.z - ankle.z)))) if co.z < knee.z else hip.lerp(knee, (hip.z - co.z) / (hip.z - knee.z))
            out = Vector((co.x - axis.x, co.y - axis.y, 0))
            if out.length > 1e-5:
                v.co += out.normalized() * amount * t**1.3


def sole(shoes, colour):
    """The bottom of the shoes a different colour (white trainers' soles)."""
    shoes.data.materials.append(flat("Shoes_Sole", colour, 0.7))
    for p in shoes.data.polygons:
        if all((shoes.matrix_world @ shoes.data.vertices[i].co).z < 0.022 for i in p.vertices):
            p.material_index = 1


def add_hair(arm, style, rgb, shape=None):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(bc.HAIR, f"{style}.gltf"))
    new = [o for o in bpy.context.scene.objects if o not in before]
    hair = None
    for o in [o for o in new if o.name.startswith("Icosphere")]:
        new.remove(o)
        bpy.data.objects.remove(o)
    for o in new:
        if o.type == "MESH":
            hair = o
            o.name = style
            for mod in o.modifiers:
                if mod.type == "ARMATURE":
                    mod.object = arm
            world = o.matrix_world.copy()
            o.parent = arm
            o.matrix_world = world
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    if shape:
        shape(hair)
    tinted(hair, rgb)
    return hair


HEAD_C = Vector((0, 0.02, 1.70))


def curls(hair):
    """Jonal's hair, the shape under the curls: fuller and rounder on top, close at the sides."""
    mw, inv = hair.matrix_world, hair.matrix_world.inverted()
    for v in hair.data.vertices:
        co = mw @ v.co
        t = min(1, max(0, (co.z - 1.7) / 0.1))
        d = co - HEAD_C
        d.x *= 1.04 + 0.14 * t
        d.y *= 1.04 + 0.1 * t
        d.z *= 0.97 + 0.02 * t
        v.co = inv @ (HEAD_C + d)


def curl_balls(hair, arm, n=480, seed=5, centre=HEAD_C, low=1.66):
    """Tight curls all over the hair: small round clusters sitting on it, more on top."""
    r = np.random.default_rng(seed)
    mw = hair.matrix_world
    spots = []
    for v in hair.data.vertices:
        co = mw @ v.co
        out = (co - centre).normalized()
        if co.z > low and out.y < 0.6:  # not the back of the neck
            spots.append((co, out))
    bm = bmesh.new()
    weight = np.array([1 + 2 * min(1, max(0, (co.z - centre.z) / 0.1)) for co, _ in spots])
    for i in r.choice(len(spots), size=min(n, len(spots)), replace=False, p=weight / weight.sum()):
        co, out = spots[i]
        top = min(1, max(0, (co.z - centre.z - 0.02) / 0.08))
        rad = r.uniform(0.008, 0.011) + 0.001 * top
        jitter = Vector(r.normal(0, 0.002, 3))
        bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=rad, matrix=Matrix.Translation(co - out * rad * 0.15 + jitter))
    bm.normal_update()
    for f in bm.faces:
        f.smooth = True
    o = new_object("Hair_Curls", bm, flat("Hair_Curls", (40, 30, 26), 0.6))
    skin_to(o, arm, {"Head": 1.0})


def apply_modifier(o, mod):
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def pixels(img):
    """An image's pixels as rows (bottom first, as UVs count them) of RGBA floats."""
    px = np.empty(len(img.pixels), np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(img.size[1], img.size[0], 4)


def base_image(o):
    for m in o.data.materials:
        b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if b and b.inputs["Base Color"].is_linked:
            n = b.inputs["Base Color"].links[0].from_node
            if n.type == "TEX_IMAGE":
                return n.image
    # Through other nodes: the one colour texture.
    for m in o.data.materials:
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and not any(k in n.image.name for k in ("Normal", "Rough")):
                return n.image
    return None


def colour_at(o, img, verts):
    """The texture's median colour under these vertices."""
    px = pixels(img)
    h, w = px.shape[:2]
    uv = o.data.uv_layers.active.data
    want = set(verts)
    got = []
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            if o.data.loops[li].vertex_index in want:
                u, v = uv[li].uv
                got.append(px[int(v % 1 * (h - 1)), int(u % 1 * (w - 1)), :3])
    return np.median(np.array(got), axis=0)


def opaque(o):
    """Nothing see-through (dithered alpha is costly on a phone and the face needs none)."""
    for m in o.data.materials:
        b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if b:
            for link in list(b.inputs["Alpha"].links):
                m.node_tree.links.remove(link)
            b.inputs["Alpha"].default_value = 1
        m.blend_method = "OPAQUE"
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "DITHERED"


def brown_irises(eyes):
    """The scan's eyes came out grey: dark brown, like his. The white and the pupil stay."""
    img = base_image(eyes)
    px = pixels(img)
    rgb = px[..., :3]
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    iris = (lum > 0.08) & (lum < 0.7) & (sat < 0.12)
    target = np.array([0.22, 0.13, 0.07], np.float32)
    rgb[iris] = target * (0.6 + 0.8 * lum[iris, None])
    out = bpy.data.images.new("Eyes_ours", img.size[0], img.size[1], alpha=True)
    out.pixels.foreach_set(px.ravel())
    out.pack()
    for m in eyes.data.materials:
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image == img:
                n.image = out


def scanned_head(arm, body, eyes, brows, path, tris=7000):
    """
    Jonal's own head, from a MetaPerson scan (assets-src/likeness/jonal/model.glb, kept
    private): only the head and eyes, set on our body where its head was and bound to
    our skeleton, so every animation still fits. Returns the head and its eyes.
    """
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.context.scene.objects if o not in before]
    keep = {"AvatarHead", "AvatarLeftEyeball", "AvatarRightEyeball"}
    kept = [o for o in new if o.name in keep]
    for o in kept:
        mw = o.matrix_world.copy()
        o.parent = None
        o.modifiers.clear()
        if o.data.shape_keys:
            o.shape_key_clear()
        o.data.transform(mw)
        o.matrix_world = Matrix()
        o.vertex_groups.clear()
        opaque(o)
    for o in new:
        if o not in kept:
            bpy.data.objects.remove(o)
    head = next(o for o in kept if o.name == "AvatarHead")
    for o in kept:
        if o is not head:
            o.select_set(True)
    with bpy.context.temp_override(active_object=kept[1], selected_editable_objects=[o for o in kept if o is not head]):
        bpy.ops.object.join()
    scan_eyes = next(o for o in bpy.context.scene.objects if o in kept and o is not head and o.name in bpy.context.scene.objects)
    scan_eyes.name = "Eyes_Scan"

    # Where our eyes are, and the size: the scan's eye spacing made ours.
    ours_l, ours_r = eye_line(eyes)
    scan_l, scan_r = eye_line(scan_eyes)
    scale = max(0.95, min(1.08, (ours_l - ours_r).length / (scan_l - scan_r).length))
    move = Matrix.Translation((ours_l + ours_r) / 2) @ Matrix.Scale(scale, 4) @ Matrix.Translation(-(scan_l + scan_r) / 2)
    for o in (head, scan_eyes):
        o.data.transform(move)
    eye_z = (ours_l.z + ours_r.z) / 2

    # Lighter for the phone.
    dec = head.modifiers.new("Decimate", "DECIMATE")
    dec.ratio = min(1.0, tris / max(1, sum(len(p.vertices) - 2 for p in head.data.polygons)))
    apply_modifier(head, dec)

    # The neck: the scan's down to 1.53, ours up to 1.56; the overlap sits under the beard and collar.
    cut_scan, cut_body = eye_z - 0.26, eye_z - 0.2
    for o, below in ((head, True), (body, False)):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        gone = [f for f in bm.faces if all(((v.co.z < cut_scan) if below else (v.co.z > cut_body)) for v in f.verts)]
        bmesh.ops.delete(bm, geom=gone, context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(o.data)
        bm.free()
    bpy.data.objects.remove(eyes)
    bpy.data.objects.remove(brows)

    # Our body's skin, the colour of the scan's neck.
    neck = [v.index for v in head.data.vertices if v.co.z < cut_body]
    want = colour_at(head, base_image(head), neck)
    skin = base_image(body)
    ours = colour_at(body, skin, [v.index for v in body.data.vertices if cut_body - 0.06 < v.co.z < cut_body])
    px = pixels(skin)
    print(f"[likeness] skin {ours} -> {want} ({skin.name})")
    # The scan's skin also reads darker in light than its texture alone says (its own roughness and bumps).
    px[..., :3] *= (want / np.maximum(ours, 1e-3) * 0.84).astype(np.float32)
    toned = bpy.data.images.new("Skin_ours", skin.size[0], skin.size[1], alpha=True)
    toned.pixels.foreach_set(np.clip(px, 0, 1).ravel())
    toned.pack()
    for m in body.data.materials:
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image == skin:
                n.image = toned

    brown_irises(scan_eyes)

    # Bound to our skeleton: the neck bends with neck_01, the rest turns with the head.
    lo, hi = eye_z - 0.17, eye_z - 0.09
    gh = head.vertex_groups.new(name="Head")
    gn = head.vertex_groups.new(name="neck_01")
    for v in head.data.vertices:
        t = min(1, max(0, (v.co.z - lo) / (hi - lo)))
        gh.add([v.index], t, "REPLACE")
        gn.add([v.index], 1 - t, "REPLACE")
    head.modifiers.new("Armature", "ARMATURE").object = arm
    head.parent = arm
    skin_to(scan_eyes, arm, {"Head": 1.0})
    return head, scan_eyes, eye_z


def scan_curls(head, arm, eye_z):
    """
    His curls over the scan's short hair: the hair is where the scan's texture is dark
    above the brows. A dark layer over it, a little fuller on top, and the curls on that.
    """
    img = base_image(head)
    px = pixels(img)
    h, w = px.shape[:2]
    uv = head.data.uv_layers.active.data
    front = min(v.co.y for v in head.data.vertices)
    bm = bmesh.new()
    bm.from_mesh(head.data)
    bm.faces.ensure_lookup_table()
    layer = bm.loops.layers.uv.active
    hair = []
    for f in bm.faces:
        c = f.calc_center_median()
        if c.z < eye_z + 0.015:
            continue
        if c.y < front + 0.06 and c.z < eye_z + 0.05:  # the brows are dark too
            continue
        col = np.mean([px[int(l[layer].uv.y % 1 * (h - 1)), int(l[layer].uv.x % 1 * (w - 1)), :3] for l in f.loops], axis=0)
        if col.mean() < 0.24:
            hair.append(f)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in set(hair)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    centre = Vector((0, sum(v.co.y for v in bm.verts) / max(1, len(bm.verts)), eye_z + 0.01))
    for v in bm.verts:
        t = min(1, max(0, (v.co.z - eye_z - 0.04) / 0.08))
        d = v.co - centre
        d.x *= 1.0 + 0.06 * t
        d.y *= 1.0 + 0.06 * t
        d.z *= 1.0 + 0.04 * t
        v.co = centre + d + v.normal * 0.005
    for f in bm.faces:
        f.smooth = True
    for l in list(bm.loops.layers.uv):
        bm.loops.layers.uv.remove(l)
    shell = new_object("Hair_Shell", bm, flat("Hair_Shell", (34, 26, 22), 0.8))
    skin_to(shell, arm, {"Head": 1.0})
    curl_balls(shell, arm, n=520, centre=centre, low=eye_z + 0.0)


def eye_line(eyes):
    vs = [eyes.matrix_world @ v.co for v in eyes.data.vertices]
    left = [v for v in vs if v.x > 0]
    right = [v for v in vs if v.x < 0]
    return sum(left, Vector()) / len(left), sum(right, Vector()) / len(right)


def head_width(body, z, y_max):
    return max(abs((body.matrix_world @ v.co).x) for v in body.data.vertices if abs((body.matrix_world @ v.co).z - z) < 0.012 and (body.matrix_world @ v.co).y > y_max)


def tube(bm, pts, r, cyclic):
    """A thin round wire along points."""
    segs = 6
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        a = pts[(i - 1) % n] if (cyclic or i > 0) else p
        b = pts[(i + 1) % n] if (cyclic or i < n - 1) else p
        t = (b - a).normalized()
        side = t.cross(Vector((0, 0, 1)))
        if side.length < 1e-3:
            side = t.cross(Vector((0, 1, 0)))
        side.normalize()
        up = side.cross(t)
        rings.append([bm.verts.new(p + (side * math.cos(k / segs * 2 * math.pi) + up * math.sin(k / segs * 2 * math.pi)) * r) for k in range(segs)])
    for i in range(n if cyclic else n - 1):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(segs):
            bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))


def glasses(body, eyes, arm):
    """Clear rectangular frames (Jonal's)."""
    l, r = eye_line(eyes)
    y = min(l.y, r.y) - 0.028
    w, h = 0.027, 0.021
    wide = min(head_width(body, l.z, y + 0.02) + 0.004, abs(l.x) + w + 0.014)
    bm = bmesh.new()
    for c in (l, r):
        pts = []
        for i in range(28):
            a = i / 28 * 2 * math.pi
            ca, sa = math.cos(a), math.sin(a)
            # A squircle: rounded rectangle.
            px = w * math.copysign(abs(ca) ** 0.45, ca)
            pz = h * math.copysign(abs(sa) ** 0.45, sa)
            pts.append(Vector((c.x + px, y, c.z + 0.004 + pz)))
        tube(bm, pts, 0.0017, True)
    inner = min(l.x, -r.x) - w
    tube(bm, [Vector((-inner, y, l.z + 0.012)), Vector((0, y - 0.003, l.z + 0.014)), Vector((inner, y, l.z + 0.012))], 0.0018, False)
    for s in (1, -1):
        x = s * (abs(l.x) + w)
        tube(bm, [Vector((x, y, l.z + 0.012)), Vector((s * wide, y + 0.03, l.z + 0.012)), Vector((s * wide, y + 0.1, l.z + 0.002)), Vector((s * (wide - 0.006), y + 0.115, l.z - 0.02))], 0.0018, False)
    o = new_object("Glasses", bm, flat("Glasses", (176, 178, 176), 0.2))
    skin_to(o, arm, {"Head": 1.0})


def watch(body, arm, band_rgb, face_rgb, metal=True):
    """A watch on the left wrist."""
    e = arm.matrix_world @ arm.data.bones["lowerarm_l"].head_local
    h = arm.matrix_world @ arm.data.bones["hand_l"].head_local
    axis = (h - e).normalized()
    c = h - axis * 0.035
    ring = [(body.matrix_world @ v.co) for v in body.data.vertices]
    ring = [p for p in ring if abs((p - c).dot(axis)) < 0.008]
    r = sum(((p - c) - axis * (p - c).dot(axis)).length for p in ring) / len(ring)
    # Band: a flat ring round the wrist; face: a disc on the back of the wrist (palms face down in the rest pose).
    bm = bmesh.new()
    rot = Vector((0, 0, 1)).rotation_difference(axis).to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, segments=24, radius1=r + 0.003, radius2=r + 0.003, depth=0.016, cap_ends=False, matrix=Matrix.Translation(c) @ rot)
    up = Vector((0, 0, 1))
    up = (up - axis * up.dot(axis)).normalized()
    bmesh.ops.create_cone(bm, segments=20, radius1=0.016, radius2=0.016, depth=0.007, cap_ends=True, matrix=Matrix.Translation(c + up * (r + 0.006)) @ Vector((0, 0, 1)).rotation_difference(up).to_matrix().to_4x4())
    bm.normal_update()
    o = new_object("Watch", bm, flat("Watch_Band", band_rgb, 0.3, 1.0 if metal else 0.0))
    o.data.materials.append(flat("Watch_Face", face_rgb, 0.2))
    # The top cap of the face is the dial.
    for p in o.data.polygons:
        if len(p.vertices) > 4 and (p.center - (c + up * (r + 0.006))).dot(up) > 0.002:
            p.material_index = 1
    skin_to(o, arm, {"lowerarm_l": 1.0})


def earrings(body, eyes, arm):
    """Small gold drops (Parul's)."""
    l, _ = eye_line(eyes)
    bm = bmesh.new()
    for s in (1, -1):
        band = [(body.matrix_world @ v.co) for v in body.data.vertices]
        band = [p for p in band if l.z - 0.07 < p.z < l.z - 0.035 and p.x * s > 0 and abs(p.y - 0.0) < 0.05]
        lobe = max(band, key=lambda p: abs(p.x))
        for dz, rad in ((-0.006, 0.0045), (-0.016, 0.006)):
            bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=rad, matrix=Matrix.Translation(lobe + Vector((s * 0.002, 0, dz))))
    o = new_object("Earrings", bm, flat("Gold", (214, 178, 104), 0.3, 1.0))
    skin_to(o, arm, {"Head": 1.0})


def export(tag):
    bc.shrink_images()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(bc.OUT, f"body_{tag}.glb"),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_skins=True,
        export_image_format="JPEG",
        export_jpeg_quality=82,
        export_yup=True,
    )
    print(f"[likeness] body_{tag}.glb")


TORSO = ["spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r"]
LEGS = ["pelvis", "thigh_l", "thigh_r", "calf_l", "calf_r"]
FEET = ["foot_l", "foot_r", "ball_l", "ball_r"]
HAIR_DARK = (0.16, 0.12, 0.10)


def jonal():
    arm, body, eyes, brows = load("Superhero_Male_FullBody.gltf")
    swap_image(body, "Dark", os.path.join(TEX, "jonal_skin.png"))
    swap_image(body, "Normal", os.path.join(TEX, "jonal_normal.png"))
    swap_image(eyes, "Eye_Brown", os.path.join(TEX, "jonal_eye.png"))
    tinted(brows, HAIR_DARK)
    thinner_brows(brows, 0.85)
    slimmer([body], arm, ["upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r"], 0.9)
    slimmer([body], arm, ["clavicle_l", "clavicle_r"], 0.85)
    belly(body, 0.035)
    shirt = textured("Cloth_Top", "jonal_top.png")
    top = bc.cut(body, "Cloth_Top", TORSO + ["upperarm_l", "upperarm_r"], 0.012, shirt, smooth=14)
    wrap(top, arms_from=0.2)
    z_top = min((top.matrix_world @ v.co).z for v in top.data.vertices) + 0.05
    skirt(body, arm, z_top, 0.9, 0.01, shirt)  # worn untucked
    bottom = bc.cut(body, "Cloth_Bottom", LEGS, 0.012, textured("Cloth_Bottom", "jonal_bottom.png"), smooth=24)
    palazzo(bottom, arm, 0.022)  # straight, not skinny
    wrap(bottom)
    shoes = bc.cut(body, "Shoes", FEET, 0.016, flat("Shoes", (28, 28, 30), 0.55), threshold=0.5, smooth=30)
    sole(shoes, (236, 236, 232))
    bc.hide_under(body, TORSO + LEGS)
    bc.hide_under(body, FEET, threshold=0.85)
    head, eyes, eye_z = scanned_head(arm, body, eyes, brows, os.path.join(bc.ROOT, "assets-src", "likeness", "jonal", "model.glb"))
    scan_curls(head, arm, eye_z)
    glasses(head, eyes, arm)
    watch(body, arm, (200, 200, 204), (20, 34, 70))
    export("jonal")


def parul():
    arm, body, eyes, brows = load("Superhero_Female_FullBody.gltf")
    swap_image(body, "Dark", os.path.join(TEX, "parul_skin.png"))
    swap_image(eyes, "Eye_Brown", os.path.join(TEX, "parul_eye.png"))
    tinted(brows, (0.14, 0.1, 0.09))
    thinner_brows(brows, 0.6)
    slimmer([body], arm, ["upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r"], 0.78)
    slimmer([body], arm, ["clavicle_l", "clavicle_r", "spine_03"], 0.9)
    slimmer([body], arm, ["thigh_l", "thigh_r", "calf_l", "calf_r", "pelvis"], 0.9)
    kurta = textured("Cloth_Top", "parul_top.png", 0.55)
    top = bc.cut(body, "Cloth_Top", TORSO, 0.009, kurta, smooth=14)
    wrap(top)
    z_top = min((top.matrix_world @ v.co).z for v in top.data.vertices) + 0.04
    skirt(body, arm, z_top, 0.70, 0.035, kurta)
    bottom = bc.cut(body, "Cloth_Bottom", LEGS, 0.012, textured("Cloth_Bottom", "parul_bottom.png", 0.55), smooth=24)
    palazzo(bottom, arm, 0.075)
    wrap(bottom)
    bc.cut(body, "Shoes", FEET, 0.012, flat("Shoes", (58, 42, 36), 0.5), threshold=0.5, smooth=30)
    bc.hide_under(body, TORSO + LEGS)
    bc.hide_under(body, FEET, threshold=0.85)
    add_hair(arm, "Hair_Long", (0.12, 0.09, 0.08), lambda h: longer(h, 1.6, 3.6, 0.3))
    earrings(body, eyes, arm)
    watch(body, arm, (226, 170, 150), (246, 236, 230))
    export("parul")


if __name__ == "__main__":
    jonal()
    parul()
