"""
Turns each downloaded furniture model (glTF + loose textures) into one GLB
for the app, textures inside as JPEG, in assets-build/house/models/.

    D:\\blender.exe -b --factory-startup -P scripts/blender/convert_models.py -- [ids…]
"""
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets-src", "house", "models")
OUT = os.path.join(ROOT, "assets-build", "house", "models")
os.makedirs(OUT, exist_ok=True)

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
# Small things don't need 1k textures: --small id,id,… get 512 (and their detail maps 256).
small = set()
if "--small" in args:
    i = args.index("--small")
    small = set(args[i + 1].split(","))
    del args[i : i + 2]
ids = args or sorted(os.listdir(SRC))
for mid in ids:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, mid, f"{mid}.gltf"))
    for img in bpy.data.images:
        if img.source != "FILE":
            continue
        detail = img.colorspace_settings.name == "Non-Color"
        cap = (256 if detail else 512) if mid in small else (512 if detail else 1024)
        if max(img.size) > cap:
            img.scale(cap, cap)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f"{mid}.glb"),
        export_format="GLB",
        export_image_format="JPEG",
        export_jpeg_quality=78,
        export_yup=True,
        export_apply=True,
    )
    print(f"[models] {mid}.glb")
