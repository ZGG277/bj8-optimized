"""
[INPUT]: 注入的 RUNTIME_SURFACES；同目录 Canvas 原创纹理 PNG
[OUTPUT]: 与当前游戏一致的可编辑台呢/库边/球体参照，打包纹理的 blend
[POS]: 制作源同步；仅更新 V2 参考集合，不重新导出或修改运行时 GLB
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
"""
import bpy
from mathutils import Vector, Matrix
ROOT = '/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/assets/blender/table-craft-v2/'
scene = bpy.data.scenes['BJ8_Table_Craft_V2']
bpy.context.window.scene = scene
collection = next(c for c in scene.collection.children if c.name.startswith('Craft_Reference_NotExported'))
for obj in list(collection.objects):
    if obj.name.startswith(('Ref_table-cloth', 'Ref_cushion-', 'Reference_ball_', 'CraftRef_')):
        bpy.data.objects.remove(obj, do_unlink=True)
materials = {}
for source in RUNTIME_SURFACES:
    m = source['matrix']
    matrix = Matrix([m[0:4], m[4:8], m[8:12], m[12:16]]).transposed()
    vertices = []
    for i in range(0, len(source['positions']), 3):
        p = matrix @ Vector(source['positions'][i:i+3])
        vertices.append((p.x, -p.z, p.y))
    indices = source['indices'] or list(range(len(vertices)))
    mesh = bpy.data.meshes.new('CraftRef_'+source['name'])
    mesh.from_pydata(vertices, [], [indices[i:i+3] for i in range(0, len(indices), 3)])
    mesh.update()
    uv = mesh.uv_layers.new(name='Runtime UV')
    for loop in mesh.loops:
        i = loop.vertex_index * 2
        uv.data[loop.index].uv = source['uv'][i:i+2]
    obj = bpy.data.objects.new('CraftRef_'+source['name'], mesh)
    collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    normals = []
    normal_matrix = matrix.to_3x3().inverted().transposed()
    for i in range(0, len(source['normals']), 3):
        n = (normal_matrix @ Vector(source['normals'][i:i+3])).normalized()
        normals.append((n.x, -n.z, n.y))
    mesh.normals_split_custom_set_from_vertices(normals)
    key = source['name'] if source['name'].startswith('ball-') else 'cloth'
    if key not in materials:
        mat = bpy.data.materials.new('CraftRef_'+key)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        bsdf = nodes.get('Principled BSDF')
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(ROOT+(key+'.png' if key!='cloth' else 'cloth-albedo.png'), check_existing=True)
        tex.image.pack()
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if key == 'cloth':
            bsdf.inputs['Roughness'].default_value = .94
            bsdf.inputs['Sheen Weight'].default_value = .26
            coord = nodes.new('ShaderNodeTexCoord')
            scale = nodes.new('ShaderNodeVectorMath')
            scale.operation = 'SCALE'
            scale.inputs['Scale'].default_value = 6.25
            mat.node_tree.links.new(coord.outputs['UV'], scale.inputs[0])
            mat.node_tree.links.new(scale.outputs['Vector'], tex.inputs['Vector'])
            noise = nodes.new('ShaderNodeTexNoise')
            noise.inputs['Scale'].default_value = 1500
            bump = nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = .18
            bump.inputs['Distance'].default_value = .00012
            mat.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
            mat.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
        else:
            bsdf.inputs['Roughness'].default_value = .19
            bsdf.inputs['Coat Weight'].default_value = 1
            bsdf.inputs['Coat Roughness'].default_value = .095
        materials[key] = mat
    mesh.materials.append(materials[key])
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'table-craft-v2.blend')
print('CRAFT_REFERENCE_SYNCED', len(RUNTIME_SURFACES), 'meshes', len(materials), 'packed materials')
