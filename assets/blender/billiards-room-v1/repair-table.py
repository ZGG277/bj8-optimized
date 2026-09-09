"""Execute inside the connected Blender MCP, never in an offline substitute.
Preserve quiet-room-v1.blend; append only visual underlaps and side apron closures.
"""
import bpy, bmesh, json, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path('/Users/zgg/Projects/游戏/bl8-3D台球/bj8-table-blender-repair')
OUT = ROOT / 'assets/blender/billiards-room-v1'
scene = bpy.context.scene
assert scene.name == 'BJ8_Quiet_Room_V1'
shell = scene.objects['BJ8_TableShell']
assert not scene.objects.get('BJ8_ClothUnderlap')
reference = json.loads((ROOT / 'assets/blender/table-craft-v2/runtime-surface-reference.json').read_text())

def xyz(p):
    return (p[0], -p[2], p[1])

def mesh(name, vertices, faces, material):
    data = bpy.data.meshes.new(name + '_Mesh')
    data.from_pydata([xyz(p) for p in vertices], [], faces)
    data.update()
    bm=bmesh.new();bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
    obj.parent=shell;data.materials.append(material)
    obj['repair_source_commit']='91331ffacb07163b9b46d11d24ffcebf6c20f461'
    obj['visual_only']=True
    return obj

def prism(vertices, faces, outline, bottom, top):
    base=len(vertices)
    vertices.extend([(p[0],y,p[1]) for y in [bottom,top] for p in outline])
    n=len(outline)
    faces.extend([tuple(base+i for i in reversed(range(n))),tuple(base+n+i for i in range(n))])
    faces.extend([(base+i,base+(i+1)%n,base+n+(i+1)%n,base+n+i) for i in range(n)])

green=bpy.data.materials.new('BJ8_UnderlapCloth')
green.diffuse_color=(.012,.105,.059,1);green.use_nodes=True
shader=green.node_tree.nodes.get('Principled BSDF')
shader.inputs['Base Color'].default_value=green.diffuse_color
shader.inputs['Roughness'].default_value=.95
verts=[];faces=[];bands=0
for ref in reference:
    if not ref['name'].startswith('cushion-'):continue
    p=ref['positions']
    at=lambda i:Vector((p[i*3],p[i*3+2]))
    noseA,noseB,backA,backB=at(8),at(9),at(0),at(1)
    # Extend inward 1 mm beneath existing cloth; out to the shared 48 mm cushion back.
    innerA=noseA-(backA-noseA)*(.001/.048)
    innerB=noseB-(backB-noseB)*(.001/.048)
    prism(verts,faces,[innerA,innerB,backB,backA],-.038,-.0004)
    bands+=1
underlap=mesh('BJ8_ClothUnderlap',verts,faces,green)
underlap['cushion_segments']=bands
underlap['top_game_y']=-.0004
underlap['source_reference_sha256']=hashlib.sha256((ROOT/'assets/blender/table-craft-v2/runtime-surface-reference.json').read_bytes()).hexdigest()

verts=[];faces=[]
for sign in [-1,1]:
    # Rear of the side-pocket aperture reaches |x|=.713. This begins at .715.
    # Its 2 mm clearance keeps the authored pocket cavity open above and below.
    outline=[(sign*.715,-.16),(sign*.750,-.16),(sign*.750,.16),(sign*.715,.16)]
    prism(verts,faces,outline,-.253,-.003)
aprons=mesh('BJ8_MiddlePocketAprons',verts,faces,bpy.data.materials.get('BJ8_Walnut'))
aprons['pocket_rear_clearance_m']=.002
aprons['side_count']=2

for obj in [underlap,aprons]:
    uv=obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        for loop in poly.loop_indices:
            v=obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv=(v.y,v.z)

roots=[scene.objects[n] for n in ['BJ8_TableShell','BJ8_Room','BJ8_Pendant']]
bpy.ops.object.select_all(action='DESELECT')
exported=[]
for root in roots:
    for obj in [root]+list(root.children_recursive):
        obj.select_set(True);exported.append(obj)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'src/scene/assets/billiards-room-v1.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_cameras=False,export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'quiet-room-v1-repaired.blend'))
report={'blender_version':bpy.app.version_string,'source_file':'quiet-room-v1.blend','repaired_file':bpy.data.filepath,'direct_mcp_execution':True,'bands':bands,'mesh_count':len([o for o in exported if o.type=='MESH']),'repairs':[{ 'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'bounds_blender':[[min((o.matrix_world@Vector(c))[i] for c in o.bound_box),max((o.matrix_world@Vector(c))[i] for c in o.bound_box)] for i in range(3)]} for o in [underlap,aprons]]}
(OUT/'repair-evidence/blender-edit.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
