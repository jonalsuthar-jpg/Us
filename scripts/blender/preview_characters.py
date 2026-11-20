"""
A render of both built characters, dressed, one hairstyle each, to check
the clothes. Writes assets-build/house/characters/preview.png.

    D:\\blender.exe -b --factory-startup -P scripts/blender/preview_characters.py
"""
import math
import os

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "assets-build", "house", "characters")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COLOURS = {"Cloth_Top": (0.55, 0.08, 0.15), "Cloth_Bottom": (0.05, 0.08, 0.2), "Shoes": (0.9, 0.9, 0.88)}
for tag, x, hair in (("m", -0.6, "Hair_SimpleParted"), ("f", 0.6, "Hair_Long")):
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, f"body_{tag}.glb"))
    new = [o for o in scene.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location.x += x
        if o.type == "MESH" and o.name.startswith("Hair_") and not o.name.startswith(hair):
            o.hide_render = True
    for o in new:
        if o.type != "MESH":
            continue
        for i, m in enumerate(o.data.materials):
            key = m.name.split(".")[0] if m else ""
            if key in COLOURS:
                c = m.copy()
                bsdf = next(n for n in c.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
                bsdf.inputs["Base Color"].default_value = (*COLOURS[key], 1)
                o.data.materials[i] = c
    if tag == "f":
        COLOURS["Cloth_Top"] = (0.1, 0.35, 0.33)

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
scene.collection.objects.link(sun)
scene.world = bpy.data.worlds.new("w")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
cam.location = (0, -4.2, 1.1)
cam.rotation_euler = (Vector((0, 0, 0.95)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "CYCLES"
scene.cycles.samples = 32
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.filepath = os.path.join(OUT, "preview.png")
bpy.ops.render.render(write_still=True)
print("[characters] preview.png")
