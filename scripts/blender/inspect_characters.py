"""
Lists what's in the Quaternius character and animation packs: meshes,
materials, bones and animation names, as JSON.

    D:\\blender.exe -b --factory-startup -P scripts/blender/inspect_characters.py
"""
import json
import os

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CH = os.path.join(ROOT, "assets-src", "house", "characters")
BASE = os.path.join(CH, "Universal Base Characters[Standard]", "Base Characters", "Godot - UE")
ANIM = os.path.join(CH, "Universal Animation Library[Standard]", "Unreal-Godot", "UAL1_Standard.glb")

out = {}
for name in ("Superhero_Male_FullBody", "Superhero_Female_FullBody"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(BASE, f"{name}.gltf"))
    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    out[name] = {
        "bones": [b.name for b in arm.data.bones],
        "meshes": [{"name": m.name, "verts": len(m.data.vertices), "materials": [s.name for s in m.data.materials], "groups": len(m.vertex_groups)} for m in meshes],
        "height": round(max((m.matrix_world @ v.co).z for m in meshes for v in m.data.vertices), 3),
        "actions": [a.name for a in bpy.data.actions],
    }

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=ANIM)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
out["animations"] = {
    "bones": [b.name for b in arm.data.bones],
    "meshes": [o.name for o in bpy.context.scene.objects if o.type == "MESH"],
    "actions": sorted(f"{a.name}:{round((a.frame_range[1] - a.frame_range[0]) / 30, 2)}s" for a in bpy.data.actions),
}
print("INSPECT " + json.dumps(out))
