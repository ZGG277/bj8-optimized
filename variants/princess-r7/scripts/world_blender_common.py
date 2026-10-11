"""Local-only Blender authoring/export support for the three experimental worlds.
The Blender process is disposable; existing project scenes and assets are read-only.
"""
import bpy
import bmesh
import math
import json
import hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
assert ROOT.name == 'bj8-world-shell-experiment', 'Author only in the isolated experiment'


def game_xyz(p):
    return (p[0], -p[2], p[1])


def group(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def material(name, color, roughness=.8, metal=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    return mat


def mesh(name, vertices_game, faces, mat, parent=None):
    data = bpy.data.meshes.new(name + '_mesh')
    data.from_pydata([game_xyz(p) for p in vertices_game], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    if all(edge.is_manifold for edge in bm.edges):
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    data.materials.append(mat)
    # Stable metric UVs on each face's dominant plane, including real vertical sides.
    uv = data.uv_layers.new(name='MetricUV')
    for polygon in data.polygons:
        axis = max(range(3), key=lambda i: abs(polygon.normal[i]))
        axes = [i for i in range(3) if i != axis]
        for index in polygon.loop_indices:
            p = data.vertices[data.loops[index].vertex_index].co
            uv.data[index].uv = (p[axes[0]] * .65, p[axes[1]] * .65)
    return obj


def beveled_box(name, pos, size, mat, parent, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=game_xyz(pos))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (size[0], size[2], size[1])
    obj.parent = parent
    obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new('Crafted_Edges', 'BEVEL')
        mod.width = min(bevel, min(size) * .22)
        mod.segments = 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def add_surface_textures(mat):
    """Create packed, portable mineral microstructure, not export-lost procedural nodes."""
    shader = mat.node_tree.nodes.get('Principled BSDF')
    if shader.inputs['Emission Strength'].default_value > 0:
        return
    if not any(term in mat.name.lower() for term in ('stone', 'rock', 'slate', 'ice', 'basalt', 'obsidian', 'bamboo')):
        return
    size = 128
    color = shader.inputs['Base Color'].default_value[:3]
    pixels = []
    normals = []
    for y in range(size):
        for x in range(size):
            grain = (math.sin(x * 1.73 + y * 2.97) * math.sin(x * 4.91 - y * 1.31) + 1) * .5
            mineral = (math.sin(x * .12 + math.sin(y * .11) * 2.1) + 1) * .5
            fac = .82 + grain * .23 + mineral * .08
            pixels.extend((color[0] * fac, color[1] * fac, color[2] * fac, 1))
            normals.extend((.5 + math.sin(x * 1.73 + y * 2.97) * .07,
                            .5 + math.cos(x * 2.13 - y * 1.91) * .07, .994, 1))
    image = bpy.data.images.new(mat.name + '_Albedo', width=size, height=size)
    image.pixels.foreach_set(pixels)
    image.pack()
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    normal_image = bpy.data.images.new(mat.name + '_Normal', width=size, height=size, is_data=True)
    normal_image.pixels.foreach_set(normals)
    normal_image.pack()
    normal_tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    normal_tex.image = normal_image
    normal = mat.node_tree.nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .22
    mat.node_tree.links.new(normal_tex.outputs['Color'], normal.inputs['Color'])
    mat.node_tree.links.new(normal.outputs['Normal'], shader.inputs['Normal'])


def _descendants(root):
    return [root, *root.children_recursive]


def finish_world(world_id, shell_root, quiet_root, preview_camera_game=(8, 5, 11), preview_target_game=(0, -.4, 0)):
    assert world_id in ('galaxy', 'bamboo', 'aurora-lake')
    scene = bpy.context.scene
    scene.name = 'BJ8_World_' + world_id
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    # Batch the authored objects by material while retaining separate floor/world ownership.
    for parent in (shell_root, quiet_root):
        batches = {}
        for child in parent.children_recursive:
            if child.type == 'MESH':
                batches.setdefault(tuple(m.name for m in child.data.materials if m), []).append(child)
        for names, objects in batches.items():
            if len(objects) < 2:
                continue
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            bpy.ops.object.join()
            objects[0].name = parent.name + '_' + '_'.join(names)
    asset_objects = _descendants(shell_root) + _descendants(quiet_root)
    asset_materials = {m for obj in asset_objects if obj.type == 'MESH' for m in obj.data.materials if m}
    for mat in asset_materials:
        add_surface_textures(mat)
    directory = ROOT / 'assets' / 'blender' / ('world-' + world_id)
    directory.mkdir(parents=True, exist_ok=True)
    destination = ROOT / 'src' / 'scene' / 'assets' / ('world-' + world_id + '.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in asset_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = shell_root
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True, export_cameras=False, export_lights=False)
    # The preview uses the actual inherited Blender table shell as a scale reference only.
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'src/scene/assets/billiards-room-v1.glb'))
    bpy.context.view_layer.update()
    imported = set(bpy.data.objects) - before
    table = next((o for o in imported if o.name == 'BJ8_TableShell'), None)
    keep = set(_descendants(table)) if table else set()
    for obj in keep:
        transform = obj.matrix_world.copy()
        if obj.parent not in keep:
            obj.parent = None
            obj.matrix_world = transform
    for obj in imported - keep:
        bpy.data.objects.remove(obj, do_unlink=True)
    felt = material('Preview_Existing_Table_Cloth', (.027, .115, .086), .95)
    beveled_box('Preview_Table_Surface_Not_Exported', (0, -.045, 0), (1.25, .08, 2.52), felt, None, .006)
    if scene.world is None:
        scene.world = bpy.data.worlds.new('Review_World')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.055, .075, .10, 1)
    scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .35
    for name, location, power, size, color in [
        ('Review_Key', (1, 5.5, 2), 1000, 7, (1, .91, .80)),
        ('Review_Atmosphere', (-8, 8, -10), 1700, 12, (.54, .70, 1)),
    ]:
        lamp = bpy.data.lights.new(name, 'AREA')
        lamp.energy, lamp.size, lamp.color = power, size, color
        obj = bpy.data.objects.new(name, lamp)
        scene.collection.objects.link(obj)
        obj.location = game_xyz(location)
        obj.rotation_euler = (Vector(game_xyz((0, 0, 0))) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.cameras.new('Review_Camera')
    camera.lens = 35
    obj = bpy.data.objects.new('Review_Camera', camera)
    scene.collection.objects.link(obj)
    obj.location = game_xyz(preview_camera_game)
    obj.rotation_euler = (Vector(game_xyz(preview_target_game)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = obj
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 768, 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(directory / 'preview.png')
    scene['review_only_lighting'] = 'Preview lamps and reference table are not exported; runtime retains its accepted table and lighting.'
    bpy.ops.wm.save_as_mainfile(filepath=str(directory / ('world-' + world_id + '.blend')))
    triangles = sum(sum(len(face.vertices) - 2 for face in obj.data.polygons) for obj in asset_objects if obj.type == 'MESH')
    record = {'world': world_id, 'blenderVersion': bpy.app.version_string, 'authoring': 'local Blender bpy; no paid provider',
              'runtimeFile': str(destination.relative_to(ROOT)), 'runtimeBytes': destination.stat().st_size,
              'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'trianglesBeforeExport': triangles,
              'meshObjects': sum(obj.type == 'MESH' for obj in asset_objects),
              'rootGroups': [shell_root.name, quiet_root.name], 'previewIsRuntimeEvidence': False}
    (directory / 'provenance.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf8')
    bpy.ops.render.render(write_still=True)
    print('WORLD_ASSET_READY ' + json.dumps(record))
