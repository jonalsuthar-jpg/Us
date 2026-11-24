"""
Our House: the two of us as real people, from the Quaternius Universal Base
Characters and Universal Animation Library (CC0), with no window open.

    D:\\blender.exe -b --factory-startup -P scripts/blender/build_characters.py

Writes assets-build/house/characters/:

    body_m.glb, body_f.glb   a body each, dressed, with every hairstyle on it
                             (the app shows the one you chose)
    moves.glb                the skeleton and the animations we use

The free kit comes in underwear only, so the clothes are cut from each body's
own mesh: the faces its chest and arms move with become a T-shirt, its hips
and legs trousers, its feet shoes, each pushed out a few millimetres. They
keep the body's skin weights, so they bend with every animation. Each has its
own white material (Cloth_Top, Cloth_Bottom, Shoes) the app colours in.
"""
import os

import bmesh
import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CH = os.path.join(ROOT, "assets-src", "house", "characters")
BASE = os.path.join(CH, "Universal Base Characters[Standard]", "Base Characters", "Godot - UE")
HAIR = os.path.join(CH, "Universal Base Characters[Standard]", "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)")
ANIM = os.path.join(CH, "Universal Animation Library[Standard]", "Unreal-Godot", "UAL1_Standard.glb")
OUT = os.path.join(ROOT, "assets-build", "house", "characters")
os.makedirs(OUT, exist_ok=True)

HAIRSTYLES = ["Hair_SimpleParted", "Hair_Long", "Hair_Buns", "Hair_Buzzed", "Hair_BuzzedFemale", "Hair_Beard"]

# The animations the house uses (scene/avatar-real.tsx); the rest stay out.
MOVES = [
    "Idle_Loop",
    "Idle_Talking_Loop",
    "Walk_Loop",
    "Jog_Fwd_Loop",
    "Sprint_Loop",
    "Sitting_Enter",
    "Sitting_Idle_Loop",
    "Sitting_Exit",
    "Swim_Idle_Loop",
    "Swim_Fwd_Loop",
    "Dance_Loop",
    "Interact",
    "PickUp_Table",
    "Fixing_Kneeling",
]


def clothes_material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Roughness"].default_value = 0.92 if name != "Shoes" else 0.55
    return m


def cut(body, name, bones, offset, mat, threshold=0.35, smooth=12):
    """A piece of clothing: the body's faces that these bones move, pushed out by `offset` metres."""
    idx = {body.vertex_groups[b].index for b in bones if b in body.vertex_groups}
    sel = set()
    for v in body.data.vertices:
        if sum(g.weight for g in v.groups if g.group in idx) >= threshold:
            sel.add(v.index)
    piece = body.copy()
    piece.data = body.data.copy()
    piece.name = name
    for col in body.users_collection:
        col.objects.link(piece)
    bm = bmesh.new()
    bm.from_mesh(piece.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in sel for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # glTF splits vertices along texture seams; join them so the piece smooths as one.
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bm.normal_update()
    # Drape: smooth the muscles away (the skin underneath is removed, see hide_under),
    # keep the edges where they are so they still meet the skin, then sit off the body.
    edge = [v for v in bm.verts if v.is_boundary]
    inner = [v for v in bm.verts if not v.is_boundary]
    # Taubin smoothing: smooth, then inflate a touch. Bumps flatten, but the
    # shape doesn't shrink into the body the way plain smoothing does.
    bm.verts.ensure_lookup_table()
    ring = {v: [e.other_vert(v) for e in v.link_edges] for v in inner}
    for _ in range(smooth):
        for factor in (0.5, -0.53):
            moves = {}
            for v, near in ring.items():
                if near:
                    avg = sum((n.co for n in near), v.co * 0) / len(near)
                    moves[v] = (avg - v.co) * factor
            for v, d in moves.items():
                v.co += d
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * (offset * (0.6 if v in edge else 1.0))
    bm.to_mesh(piece.data)
    bm.free()
    piece.data.materials.clear()
    piece.data.materials.append(mat)
    return piece


def shrink_images():
    """Colour at 1024, normals and roughness at 512: plenty on a phone."""
    for img in bpy.data.images:
        if img.source != "FILE":
            continue
        cap = 512 if img.colorspace_settings.name == "Non-Color" else 1024
        if max(img.size) > cap:
            img.scale(cap, cap)


def hide_under(body, bones, threshold=0.7):
    """Remove the skin the clothes cover, so the clothes can be shaped freely and nothing pokes through."""
    idx = {body.vertex_groups[b].index for b in bones if b in body.vertex_groups}
    covered = {v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in idx) >= threshold}
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.index in covered for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(body.data)
    bm.free()


def light_skin(body, tag):
    """The light skin texture: the app tints it to any skin tone (tinting can only darken)."""
    tex = os.path.join(CH, "Universal Base Characters[Standard]", "Base Characters", "Textures")
    light = os.path.join(tex, "T_Superhero_Male_Ligh.png" if tag == "m" else "T_Superhero_Female_Light_BaseColor.png")
    for m in body.data.materials:
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and "Dark" in n.image.name:
                n.image = bpy.data.images.load(light)


def build(tag, gltf):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(BASE, gltf))
    for o in [o for o in bpy.context.scene.objects if o.name.startswith("Icosphere")]:
        bpy.data.objects.remove(o)
    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    body = next(o for o in bpy.context.scene.objects if o.type == "MESH" and o.name.lower().startswith("superhero"))
    body.name = "Body"
    light_skin(body, tag)

    cut(body, "Cloth_Top", ["spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r"], 0.01, clothes_material("Cloth_Top"), smooth=14)
    cut(body, "Cloth_Bottom", ["pelvis", "thigh_l", "thigh_r", "calf_l", "calf_r"], 0.012, clothes_material("Cloth_Bottom"), smooth=24)
    cut(body, "Shoes", ["foot_l", "foot_r", "ball_l", "ball_r"], 0.016, clothes_material("Shoes"), threshold=0.5, smooth=30)
    hide_under(body, ["spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "pelvis", "thigh_l", "thigh_r", "calf_l", "calf_r"])
    hide_under(body, ["foot_l", "foot_r", "ball_l", "ball_r"], threshold=0.85)

    # Every hairstyle, bound to this body's skeleton (same bone names).
    for style in HAIRSTYLES:
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(HAIR, f"{style}.gltf"))
        new = [o for o in bpy.context.scene.objects if o not in before]
        for o in new:
            if o.type == "MESH":
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

    shrink_images()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f"body_{tag}.glb"),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_skins=True,
        export_image_format="JPEG",
        export_jpeg_quality=80,
        export_yup=True,
    )
    print(f"[characters] body_{tag}.glb")


def main():
    build("m", "Superhero_Male_FullBody.gltf")
    build("f", "Superhero_Female_FullBody.gltf")

    # The moves: just the skeleton and the animations we use.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=ANIM)
    for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        bpy.data.objects.remove(o)
    for a in list(bpy.data.actions):
        if a.name not in MOVES:
            bpy.data.actions.remove(a)
    missing = [m for m in MOVES if m not in bpy.data.actions]
    if missing:
        raise SystemExit(f"missing animations: {missing}")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, "moves.glb"),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_yup=True,
    )
    print("[characters] moves.glb")


if __name__ == "__main__":
    main()
