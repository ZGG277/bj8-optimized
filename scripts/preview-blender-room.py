"""
[INPUT]: build-blender-room 创建的场景和注入的 REFERENCE_MESHES 共享几何快照
[OUTPUT]: 带真实台面参考的 Blender 制作文件、预览相机与灯光
[POS]: 美术审阅辅助；参考几何不属于运行时 GLB 导出
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
"""
import bpy
import math
from mathutils import Vector

scene = bpy.data.scenes['BJ8_Quiet_Room_V1']
bpy.context.window.scene = scene
reference = bpy.data.objects.new('BJ8_Reference_NotExported', None)
scene.collection.objects.link(reference)
reference['source'] = 'v1.5.1 runtime table/pockets; excluded from GLB'
materials = {}
for source in REFERENCE_MESHES:
    m = source['matrix']
    raw = source['positions']
    vertices = []
    for i in range(0, len(raw), 3):
        x, y, z = raw[i:i+3]
        wx = m[0]*x+m[4]*y+m[8]*z+m[12]
        wy = m[1]*x+m[5]*y+m[9]*z+m[13]
        wz = m[2]*x+m[6]*y+m[10]*z+m[14]
        vertices.append((wx,-wz,wy))
    indices = source['indices'] or list(range(len(vertices)))
    faces = [indices[i:i+3] for i in range(0,len(indices),3)]
    mesh = bpy.data.meshes.new('Ref_'+source['name'])
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    obj = bpy.data.objects.new('Ref_'+source['name'],mesh)
    scene.collection.objects.link(obj)
    obj.parent = reference
    color = source.get('color') or [.06,.18,.11]
    if source['name']=='table-cloth':color=[.011,.12,.063]
    key = tuple(color)
    if key not in materials:
        mat = bpy.data.materials.new('Reference material')
        mat.diffuse_color=(*color,1)
        mat.use_nodes=True
        bsdf=mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value=(*color,1)
        bsdf.inputs['Roughness'].default_value=.6
        materials[key]=mat
    mesh.materials.append(materials[key])

# 仅用于构图的标准球，运行时仍由物理世界决定位置。
colors=[(.9,.86,.73),(.72,.43,.03),(.02,.04,.5),(.6,.025,.02),(.17,.02,.25),(.8,.17,.01),(.03,.2,.09),(.28,.025,.02),(.005,.006,.006)]
positions=[(0,.028575,.635)]
for row in range(5):
    for col in range(row+1):
        positions.append(((col-row/2)*.058,.028575,-.635-row*.0502))
for i,(x,y,z) in enumerate(positions):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=.028575, location=(x,-z,y))
    obj=bpy.context.object
    obj.name='Reference_ball_%02d'%i
    obj.parent=reference
    mat=bpy.data.materials.new('Reference ball')
    mat.diffuse_color=(*colors[i%len(colors)],1)
    mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=mat.diffuse_color
    p.inputs['Roughness'].default_value=.18
    p.inputs['Coat Weight'].default_value=.5
    obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True

world=bpy.data.worlds.new('Quiet room world')
scene.world=world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.2,.24,.22,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.35
for name,position,energy,size in [('Table softbox', (0,0,2.5),450,3),('Room fill',(2,-2,2.8),320,4)]:
    data=bpy.data.lights.new(name,'AREA')
    data.energy=energy
    data.shape='DISK'
    data.size=size
    obj=bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location=position
    obj.rotation_euler=(Vector((0,0,-.2))-obj.location).to_track_quat('-Z','Y').to_euler()
camera_data=bpy.data.cameras.new('BJ8_Preview_Camera')
camera=bpy.data.objects.new('BJ8_Preview_Camera',camera_data)
scene.collection.objects.link(camera)
camera.location=(2.8,-3.6,1.8)
target=Vector((0,0,-.12))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.lens=42
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.render.resolution_x=1280
scene.render.resolution_y=900
scene.render.resolution_percentage=100
bpy.ops.object.select_all(action='DESELECT')
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.overlay.show_overlays=False
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath='/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/assets/blender/billiards-room-v1/quiet-room-v1.blend')
print('BJ8_BLEND_SAVED', len(scene.objects))
