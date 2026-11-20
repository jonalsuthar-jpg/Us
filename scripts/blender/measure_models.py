"""
Prints each downloaded furniture model's size in the app's axes (x wide,
y tall, z deep) and where its bottom and middle are, as JSON.

    D:\\blender.exe -b --factory-startup -P scripts/blender/measure_models.py
"""
import json
import os

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "assets-src", "house", "models")

out = {}
for mid in sorted(os.listdir(MODELS)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, mid, f"{mid}.gltf"))
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    # Blender (x, y, z) is the app's (x, -z, y).
    out[mid] = {
        "w": round(hi.x - lo.x, 3),
        "h": round(hi.z - lo.z, 3),
        "d": round(hi.y - lo.y, 3),
        "bottom": round(lo.z, 3),
        "cx": round((hi.x + lo.x) / 2, 3),
        "cz": round(-(hi.y + lo.y) / 2, 3),
    }
print("MEASURE " + json.dumps(out))
