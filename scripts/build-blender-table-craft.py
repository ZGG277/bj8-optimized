"""
[INPUT]: 注入的 SURFACE_CONTRACT 与哈希；现有 Blender 第一版球房参考
[OUTPUT]: 六袋双道针脚/圆润包边 GLB 和独立可编辑的台面细化 blend
[POS]: 原创建模，逐站消费共享袋口合同；不产生新碰撞体或独立袋型
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
"""
import bpy
import math
from mathutils import Vector

OUTPUT_ROOT = '/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration'
SCENE_NAME = 'BJ8_Table_Craft_V2'
old_scene = bpy.data.scenes.get(SCENE_NAME)
if old_scene:
    for o in list(old_scene.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(old_scene)
scene = bpy.data.scenes.new(SCENE_NAME)
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene['surface_contract_sha256'] = CONTRACT_SHA256
root = bpy.data.objects.new('BJ8_PocketCraft', None)
scene.collection.objects.link(root)
root['surface_contract_sha256'] = CONTRACT_SHA256
root['authoring'] = 'Original local Blender MCP; same seam stations as runtime caps'


def xyz(p):
    return Vector((p[0], -p[2], p[1]))


def material(name, color, roughness):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return m


thread = material('Craft_WaxedFlax', (.40, .275, .151), .91)
binding = material('Craft_BurnishedLeather', (.235, .13, .066), .61)
batches = {'BJ8_Stitching': [[], [], thread], 'BJ8_EdgeBinding': [[], [], binding]}


def tube(name, game_points, radius, sides=6):
    positions, faces, mat = batches[name]
    points = [xyz(p) for p in game_points]
    start = len(positions)
    for i, point in enumerate(points):
        tangent = (points[min(i+1, len(points)-1)] - points[max(0, i-1)]).normalized()
        normal = tangent.cross(Vector((0, 0, 1))).normalized()
        bitangent = tangent.cross(normal).normalized()
        for j in range(sides):
            angle = j * math.tau / sides
            positions.append(tuple(point + radius * (normal * math.cos(angle) + bitangent * math.sin(angle))))
    for i in range(len(points)-1):
        for j in range(sides):
            a = start + i*sides+j
            b = start + i*sides+(j+1)%sides
            faces.append((a, b, b+sides, a+sides))
    faces.append(tuple(start+j for j in reversed(range(sides))))
    faces.append(tuple(start+(len(points)-1)*sides+j for j in range(sides)))


def path_at(stations, fraction):
    return [Vector((s['inner']['x'] + (s['outer']['x']-s['inner']['x'])*fraction,
                    s['topY'],
                    s['inner']['z'] + (s['outer']['z']-s['inner']['z'])*fraction)) for s in stations]


def distances(path):
    values = [0]
    for i in range(1, len(path)):
        values.append(values[-1] + (path[i]-path[i-1]).length)
    return values


def sample(path, lengths, distance):
    for i in range(1, len(path)):
        if distance <= lengths[i]:
            return path[i-1].lerp(path[i], (distance-lengths[i-1])/(lengths[i]-lengths[i-1]))
    return path[-1].copy()


stitch_count = 0
for pocket in SURFACE_CONTRACT['pockets']:
    stations = pocket['seam']['stations']
    anchor = bpy.data.objects.new('BJ8_PocketAnchor_%d' % pocket['index'], None)
    scene.collection.objects.link(anchor)
    anchor.parent = root
    anchor.location = xyz((pocket['x'], 0, pocket['z']))
    for fraction in [.23, .77]:
        path = path_at(stations, fraction)
        lengths = distances(path)
        # 2.7mm 针距实体，4.9mm 节距；距端座留 2.5mm，不跨过接合面。
        distance = .003
        while distance + .0027 < lengths[-1] - .0025:
            stitch = []
            for k in range(3):
                t = k/2
                p = sample(path, lengths, distance+.0027*t)
                p.y += .00012 + math.sin(t*math.pi)*.00022
                stitch.append(tuple(p))
            tube('BJ8_Stitching', stitch, .00025)
            stitch_count += 1
            distance += .0049
    for fraction in [.07, .94]:
        path = path_at(stations, fraction)
        lengths = distances(path)
        # 包边回缩 1mm，实体管截面也必须留在两端承托面内。
        path = [sample(path, lengths, .001)] + [p for i,p in enumerate(path) if .001 < lengths[i] < lengths[-1]-.001] + [sample(path, lengths, lengths[-1]-.001)]
        points = [(p.x, p.y-.00020, p.z) for p in path]
        tube('BJ8_EdgeBinding', points, .00044, 8)

for name, (vertices, faces, mat) in batches.items():
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.parent = root
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = True
root['stitch_count'] = stitch_count
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for obj in root.children:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUTPUT_ROOT+'/src/scene/assets/table-craft-v2.glb',
    export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
    export_extras=True, export_cameras=False, export_lights=False)
print('CRAFT_GLB_READY', stitch_count, 'stitches', len(batches), 'mesh batches')

# 原场景只读复制为制作参照；此集合完全排除在 GLB 之外。
reference = bpy.data.collections.new('Craft_Reference_NotExported')
scene.collection.children.link(reference)
source_scene = bpy.data.scenes.get('BJ8_Quiet_Room_V1')
if source_scene:
    for old in source_scene.objects:
        if old.type != 'MESH' or old.name.startswith('Ref_pocket-mouth-'):
            continue
        copy = old.copy()
        copy.data = old.data.copy()
        copy.parent = None
        copy.matrix_world = old.matrix_world.copy()
        reference.objects.link(copy)
        if old.name.startswith('Ref_') or old.name.startswith('Reference_ball'):
            for i, original in enumerate(copy.data.materials):
                copy.data.materials[i] = original.copy()
            if 'cloth' in old.name or 'cushion' in old.name:
                for mat in copy.data.materials:
                    bsdf = mat.node_tree.nodes.get('Principled BSDF')
                    bsdf.inputs['Base Color'].default_value = (.012, .13, .071, 1)
                    bsdf.inputs['Roughness'].default_value = .94
                    bsdf.inputs['Sheen Weight'].default_value = .25
                    tex = mat.node_tree.nodes.new('ShaderNodeTexNoise')
                    tex.inputs['Scale'].default_value = 1500
                    tex.inputs['Detail'].default_value = 2
                    bump = mat.node_tree.nodes.new('ShaderNodeBump')
                    bump.inputs['Strength'].default_value = .2
                    bump.inputs['Distance'].default_value = .00015
                    mat.node_tree.links.new(tex.outputs['Fac'], bump.inputs['Height'])
                    mat.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
            if 'pocket-top-trim-' in old.name:
                for mat in copy.data.materials:
                    bsdf = mat.node_tree.nodes.get('Principled BSDF')
                    bsdf.inputs['Roughness'].default_value = .76
                    tex = mat.node_tree.nodes.new('ShaderNodeTexNoise')
                    tex.inputs['Scale'].default_value = 320
                    bump = mat.node_tree.nodes.new('ShaderNodeBump')
                    bump.inputs['Strength'].default_value = .18
                    bump.inputs['Distance'].default_value = .0001
                    mat.node_tree.links.new(tex.outputs['Fac'], bump.inputs['Height'])
                    mat.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

world = bpy.data.worlds.new('Craft studio world')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.2, .25, .22, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .35
for name, pos, energy, size in [('Craft softbox', (0, 0, 2.5), 420, 2.5), ('Craft rim', (1, -1, 1.5), 130, 1.2)]:
    light = bpy.data.lights.new(name, 'AREA')
    light.energy = energy
    light.size = size
    obj = bpy.data.objects.new(name, light)
    scene.collection.objects.link(obj)
    obj.location = pos
    obj.rotation_euler = (Vector((0,0,0))-obj.location).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.cameras.new('Craft inspection camera')
obj = bpy.data.objects.new('Craft inspection camera', cam)
scene.collection.objects.link(obj)
obj.location = xyz((.16, .35, .35))
obj.rotation_euler = (xyz((.655, .01, 0))-obj.location).to_track_quat('-Z', 'Y').to_euler()
cam.lens = 58
scene.camera = obj
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_x = 1280
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
bpy.ops.object.select_all(action='DESELECT')
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.overlay.show_overlays = False
        area.spaces.active.region_3d.view_perspective = 'CAMERA'
        area.spaces.active.shading.type = 'MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_ROOT+'/assets/blender/table-craft-v2/table-craft-v2.blend')
print('CRAFT_BLEND_READY', len(scene.objects))
