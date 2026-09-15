"""Add four visual outer aprons around the corner pockets."""

import bmesh
import bpy
import hashlib
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path("/Users/zgg/Projects/游戏/bl8-3D台球/bj8-pocket-outer-gap-candidate")
ASSET_DIR = ROOT / "assets/blender/billiards-room-v1"
EVIDENCE_DIR = ASSET_DIR / "pocket-outer-gap-evidence"
RUNTIME_GLB = ROOT / "src/scene/assets/billiards-room-v1.glb"
OUTPUT_BLEND = ASSET_DIR / "quiet-room-v1-corner-aprons.blend"
BASELINE_COMMIT = "ed47657c10dbaaaf5bebec448fbbdadc4a2899e5"

scene = bpy.context.scene
assert scene.name == "BJ8_Quiet_Room_V1"
shell = scene.objects["BJ8_TableShell"]
assert scene.objects.get("BJ8_ClothUnderlap")
assert scene.objects.get("BJ8_MiddlePocketAprons")
assert not scene.objects.get("BJ8_CornerPocketOuterAprons")


def game_to_blender(point):
    return point[0], -point[2], point[1]


def append_prism(vertices, faces, outline, bottom, top):
    base = len(vertices)
    vertices.extend(
        (point[0], height, point[1])
        for height in (bottom, top)
        for point in outline
    )
    count = len(outline)
    faces.append(tuple(base + index for index in reversed(range(count))))
    faces.append(tuple(base + count + index for index in range(count)))
    faces.extend(
        (
            base + index,
            base + (index + 1) % count,
            base + count + (index + 1) % count,
            base + count + index,
        )
        for index in range(count)
    )


vertices = []
faces = []
positive_outline = [
    (0.665, 1.190),
    (0.729, 1.190),
    (0.729, 1.360),
    (0.590, 1.360),
    (0.590, 1.325),
    (0.690, 1.325),
    (0.690, 1.220),
    (0.665, 1.220),
]
for sign_x in (-1, 1):
    for sign_z in (-1, 1):
        outline = [(sign_x * x, sign_z * z) for x, z in positive_outline]
        append_prism(vertices, faces, outline, -0.248, -0.028)

mesh_data = bpy.data.meshes.new("BJ8_CornerPocketOuterAprons_Mesh")
mesh_data.from_pydata([game_to_blender(point) for point in vertices], [], faces)
mesh_data.update()
mesh_bm = bmesh.new()
mesh_bm.from_mesh(mesh_data)
bmesh.ops.recalc_face_normals(mesh_bm, faces=list(mesh_bm.faces))
mesh_bm.to_mesh(mesh_data)
mesh_bm.free()

aprons = bpy.data.objects.new("BJ8_CornerPocketOuterAprons", mesh_data)
scene.collection.objects.link(aprons)
aprons.parent = shell
mesh_data.materials.append(bpy.data.materials["BJ8_Walnut"])
aprons["source_baseline_commit"] = BASELINE_COMMIT
aprons["visual_only"] = True
aprons["collision_geometry"] = False
aprons["corner_count"] = 4
aprons["minimum_pocket_well_clearance_m"] = 0.0012
aprons["minimum_pocket_net_clearance_m"] = 0.006
reference_path = ASSET_DIR / "table-reference.json"
aprons["source_reference_sha256"] = hashlib.sha256(reference_path.read_bytes()).hexdigest()

uv_layer = mesh_data.uv_layers.new(name="UVMap")
for polygon in mesh_data.polygons:
    for loop_index in polygon.loop_indices:
        vertex = mesh_data.vertices[mesh_data.loops[loop_index].vertex_index].co
        uv_layer.data[loop_index].uv = (vertex.y, vertex.z)

roots = [scene.objects[name] for name in ("BJ8_TableShell", "BJ8_Room", "BJ8_Pendant")]
bpy.ops.object.select_all(action="DESELECT")
exported = []
for root in roots:
    for obj in [root] + list(root.children_recursive):
        obj.select_set(True)
        exported.append(obj)

bpy.ops.export_scene.gltf(
    filepath=str(RUNTIME_GLB),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_extras=True,
    export_cameras=False,
    export_lights=False,
)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND))

EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
world_bounds = [
    [
        min((aprons.matrix_world @ Vector(corner))[axis] for corner in aprons.bound_box),
        max((aprons.matrix_world @ Vector(corner))[axis] for corner in aprons.bound_box),
    ]
    for axis in range(3)
]
report = {
    "blender_version": bpy.app.version_string,
    "source_file": "quiet-room-v1-repaired.blend",
    "output_file": str(OUTPUT_BLEND),
    "runtime_glb": str(RUNTIME_GLB),
    "baseline_commit": BASELINE_COMMIT,
    "repair": {
        "name": aprons.name,
        "vertices": len(mesh_data.vertices),
        "polygons": len(mesh_data.polygons),
        "corner_count": 4,
        "bounds_blender_xyz": world_bounds,
        "visual_only": True,
        "collision_geometry": False,
    },
    "exported_mesh_count": len([obj for obj in exported if obj.type == "MESH"]),
}
(EVIDENCE_DIR / "blender-edit.json").write_text(
    json.dumps(report, indent=2), encoding="utf-8"
)
print("BJ8_CORNER_APRONS " + json.dumps(report))
