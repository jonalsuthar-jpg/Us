"""
Pictures of the two of us as built by build_likeness.py, standing in the idle
pose: full length, and our faces from the front and from the side, to set
next to the photos. Writes assets-build/house/likeness/preview_<who>.png.

    D:\\blender.exe -b --factory-startup -P scripts/blender/preview_likeness.py
"""
import math
import os

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CH = os.path.join(ROOT, "assets-build", "house", "characters")
OUT = os.path.join(ROOT, "assets-build", "house", "likeness")


def shot(scene, target, dist, yaw, path, size):
    cam = scene.camera
    a = math.radians(yaw)
    cam.location = target + Vector((math.sin(a) * dist, -math.cos(a) * dist, 0.05))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


for who in ("jonal", "parul"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=os.path.join(CH, "moves.glb"))
    idle = bpy.data.actions["Idle_Loop"]
    for o in list(scene.objects):
        bpy.data.objects.remove(o)
    bpy.ops.import_scene.gltf(filepath=os.path.join(CH, f"body_{who}.glb"))
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    arm.animation_data_create()
    arm.animation_data.action = idle
    if hasattr(arm.animation_data, "action_slot") and idle.slots:
        arm.animation_data.action_slot = idle.slots[0]
    scene.frame_set(12)
    for o in scene.objects:
        if o.type == "MESH" and o.name.startswith("Hair_") and who == "parul" and o.name != "Hair_Long":
            o.hide_render = True

    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(55), 0, math.radians(-25))
    scene.collection.objects.link(sun)
    scene.world = bpy.data.worlds.new("w")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.75, 0.78, 0.82, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    head = arm.matrix_world @ arm.pose.bones["Head"].head + Vector((0, 0, 0.09))
    shot(scene, Vector((0, 0, 0.9)), 4.2, 0, os.path.join(OUT, f"preview_{who}_full.png"), (600, 1000))
    shot(scene, Vector((0, 0, 0.9)), 4.2, 35, os.path.join(OUT, f"preview_{who}_full34.png"), (600, 1000))
    cam.data.lens = 85
    shot(scene, head, 1.0, 0, os.path.join(OUT, f"preview_{who}_face.png"), (600, 600))
    shot(scene, head, 1.0, 35, os.path.join(OUT, f"preview_{who}_face34.png"), (600, 600))
    print(f"[likeness] preview {who}")
