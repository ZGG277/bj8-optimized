"""
[INPUT]: 米制球桌合同；MCP 调用时注入既有 Three.js 台面/袋口参考网格
[OUTPUT]: Blender 桌体/球房独立场景、可编辑 blend 和仅含视觉外壳的 GLB
[POS]: 离线资产作者脚本；不产生碰撞体、不修改物理或已存在的用户场景
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
"""
import bpy
import math
from mathutils import Vector

OUTPUT_ROOT = '/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration'
SCENE_NAME = 'BJ8_Quiet_Room_V1'
W, L = 1.27, 2.54

# ---- 独立资产场景；仅复建本脚本拥有的场景 ----
old_scene = bpy.data.scenes.get(SCENE_NAME)
if old_scene:
    for obj in list(old_scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(old_scene)
scene = bpy.data.scenes.new(SCENE_NAME)
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0
scene['source_commit'] = '741cae41e7686d989460a2f3feb44de677ea580d'
scene['asset_contract'] = 'XZ table, Y up, metres; cloth Y=0; R=0.028575'


def game_xyz(p):
    # Blender Z up → glTF Y up，导出后逐坐标还原游戏世界。
    return (p[0], -p[2], p[1])


def material(name, color, roughness=0.5, metal=0, coat=0, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    p.inputs['Coat Weight'].default_value = coat
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m


walnut = material('BJ8_Walnut', (0.19, 0.092, 0.046), .4, coat=.25)
ebony = material('BJ8_Ebony', (.024, .033, .031), .38, coat=.22)
bronze = material('BJ8_BrushedBronze', (.43, .28, .12), .38, .72)
iron = material('BJ8_BlackMetal', (.025, .029, .03), .45, .7)
ivory = material('BJ8_IvorySights', (.67, .65, .51), .38)
wall = material('BJ8_MineralWall', (.044, .068, .061), .94)
panel = material('BJ8_WallPanel', (.025, .043, .038), .86)
leather = material('BJ8_SeatLeather', (.12, .068, .038), .69)
light = material('BJ8_WarmDiffuser', (1.0, .77, .45), .55, emission=1.4)
floor_mats = [material('BJ8_Floor_%d' % i, (.068+i*.003, .073+i*.003, .064+i*.003), .9) for i in range(3)]
asset_roots = []


def root(name):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    asset_roots.append(obj)
    return obj


shell = root('BJ8_TableShell')
room = root('BJ8_Room')
pendant = root('BJ8_Pendant')


def finish(obj, name, mat, parent, bevel=0):
    obj.name = name
    obj.parent = parent
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Crafted edge', 'BEVEL')
        mod.width = min(bevel, min(obj.dimensions) * .2)
        mod.segments = 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for p in obj.data.polygons:
            p.use_smooth = True
        mod = obj.modifiers.new('Face weighted normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def box(name, pos, size, mat, parent, bevel=.004):
    bpy.ops.mesh.primitive_cube_add(size=1, location=game_xyz(pos))
    obj = bpy.context.object
    obj.dimensions = (size[0], size[2], size[1])
    return finish(obj, name, mat, parent, bevel)


def cylinder(name, pos, radius, depth, mat, parent, radius_bottom=None):
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=radius_bottom or radius,
                                  radius2=radius, depth=depth, location=game_xyz(pos))
    return finish(bpy.context.object, name, mat, parent, .002)


# ---- 台裙、接缝和六脚底座；上层留出真实六袋的完整通道 ----
box('Recessed slate support', (0, -.12, 0), (1.22, .09, 2.42), ebony, shell, .012)
box('Lower cabinet', (0, -.285, 0), (1.43, .16, 2.69), walnut, shell, .035)
box('Cabinet shadow reveal', (0, -.378, 0), (1.38, .026, 2.64), ebony, shell, .009)
for sign in [-1, 1]:
    for z in [-.665, .665]:
        box('Split long apron', (sign*.697, -.138, z), (.064, .22, 1.05), walnut, shell, .012)
        box('Fine bronze reveal', (sign*.736, -.026, z), (.006, .008, 1.05), bronze, shell, .002)
    box('End apron', (0, -.138, sign*1.332), (1.18, .22, .056), walnut, shell, .012)
    box('End bronze reveal', (0, -.026, sign*1.371), (1.18, .008, .006), bronze, shell, .002)
    box('Side inlay', (sign*.717, -.287, 0), (.003, .008, 2.28), bronze, shell, .001)
    box('Lower side beam', (sign*.52, -.63, 0), (.045, .06, 2.02), ebony, shell, .008)
    for z in [-.98, 0, .98]:
        cylinder('Tapered pedestal', (sign*.53, -.579, z), .075, .385, ebony, shell, .058)
        cylinder('Brass foot collar', (sign*.53, -.775, z), .061, .019, bronze, shell)
        cylinder('Levelling foot', (sign*.53, -.805, z), .066, .022, iron, shell)

# 台帮上十八个镶嵌瞄点；只位于木框实体的顶部。
for sign in [-1, 1]:
    for z in [-.9525, -.635, -.3175, .3175, .635, .9525]:
        o = box('Rail sight', (sign*.713, .04765, z), (.010, .001, .010), ivory, shell, .0005)
        o.rotation_euler.z = math.pi/4
    for x in [-.3175, 0, .3175]:
        o = box('End sight', (x, .04765, sign*1.348), (.010, .001, .010), ivory, shell, .0005)
        o.rotation_euler.z = math.pi/4

# ---- 克制球房：石质地板、深绿墙面与暖色壁槽 ----
box('Room foundation', (0, -.858, 0), (24, .05, 24), floor_mats[0], room, 0)
for ix in range(-4, 4):
    for iz in range(-5, 5):
        box('Honed stone tile', (ix+.5, -.827, iz+.5), (.996, .012, .996),
            floor_mats[(ix*7+iz*11)%3], room, 0)
for sign in [-1, 1]:
    box('End mineral wall', (0, .75, sign*4.65), (7.8, 3.15, .08), wall, room, .015)
    box('Side mineral wall', (sign*3.85, .75, 0), (.08, 3.15, 9.3), wall, room, .015)
    box('End wainscot', (0, -.34, sign*4.595), (7.75, .92, .035), panel, room, .006)
    box('Side wainscot', (sign*3.795, -.34, 0), (.035, .92, 9.2), panel, room, .006)
    box('End cove', (0, 1.75, sign*4.592), (7.7, .018, .012), light, room, .002)
    box('Side cove', (sign*3.792, 1.75, 0), (.012, .018, 9.2), light, room, .002)
    # 三片有留缝的吸音墙板，使低机位有真实空间尺度。
    for x in [-2.5, 0, 2.5]:
        box('Acoustic inset', (x, .72, sign*4.58), (1.6, 1.10, .042), panel, room, .015)
        for dx in [-.77, .77]:
            box('Acoustic edge', (x+dx, .72, sign*4.552), (.012, 1.10, .012), bronze, room, .002)
    box('Bench support', (sign*2.92, -.60, 0), (.48, .38, 2.4), ebony, room, .018)
    box('Bench cushion', (sign*2.91, -.385, 0), (.54, .115, 2.43), leather, room, .035)
    box('Bench back', (sign*3.13, -.13, 0), (.09, .45, 2.43), leather, room, .025)

# ---- 薄框长灯；运行时按相机高度统一隐藏 ----
box('Pendant body', (0, 1.92, 0), (.57, .09, 1.93), iron, pendant, .025)
box('Pendant rim', (0, 1.873, 0), (.565, .009, 1.925), bronze, pendant, .015)
box('Pendant diffuser', (0, 1.867, 0), (.51, .008, 1.87), light, pendant, .018)
for z in [-.7, .7]:
    cylinder('Suspension', (0, 2.37, z), .0025, .80, iron, pendant)

# 同父节点/同材质的静态网格合并，避免每块地砖独占一次绘制。
for parent in asset_roots:
    mats = sorted({o.data.materials[0].name for o in parent.children if o.type=='MESH'})
    for mat_name in mats:
        objects = [o for o in parent.children if o.type=='MESH' and o.data.materials[0].name==mat_name]
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        bpy.context.object.name = parent.name + '_' + mat_name

# 空节点作为独立尺度审计锚点；不含新的碰撞模型。
for name, pos in [('BJ8_Origin',(0,0,0)),('BJ8_Width',(W/2,0,0)),('BJ8_Length',(0,0,L/2))]:
    obj=bpy.data.objects.new(name,None)
    scene.collection.objects.link(obj)
    obj.location=game_xyz(pos)
    obj.parent=shell

bpy.ops.object.select_all(action='DESELECT')
for parent in asset_roots:
    parent.select_set(True)
    for o in parent.children:
        o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUTPUT_ROOT+'/src/scene/assets/billiards-room-v1.glb',
                          export_format='GLB', use_selection=True, export_yup=True,
                          export_apply=True, export_extras=True, export_cameras=False,
                          export_lights=False)
print('BJ8_ASSET_READY', len([o for p in asset_roots for o in p.children if o.type=='MESH']))
