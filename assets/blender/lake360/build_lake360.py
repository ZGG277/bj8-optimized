"""GPT-6 authored; executed through Blender MCP. Preserve original scene; no render."""
import bpy, math, json, hashlib
from pathlib import Path
ROOT=Path('/Users/zgg/Projects/游戏/bl8-3D台球/bj8-lake360-experiment')
assert ROOT.name == 'bj8-lake360-experiment'
original=bpy.context.scene
assert not bpy.data.is_dirty, 'Protect unsaved Blender edits before making experiment'
scene=bpy.data.scenes.new('BJ8_Lake360_Experiment')
bpy.context.window.scene=scene
scene.unit_settings.system='METRIC'
def material(name,color,roughness):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=roughness
    return m
watermat=material('Lake360_Water',(.24,.41,.46),.18)
skymat=material('Lake360_Sky',(.55,.70,.76),1)
def mesh(name,verts,faces,mat):
    m=bpy.data.meshes.new(name); m.from_pydata([(x,-z,y) for x,y,z in verts],[],faces); m.update()
    o=bpy.data.objects.new(name,m); scene.collection.objects.link(o); m.materials.append(mat)
    for p in m.polygons: p.use_smooth=True
    return o
# Concentrate authored rings around the table; broad lake continues 900 metres.
v=[(0,-.76,0)]; f=[]; segments=96; rings=40
for j in range(1,rings+1):
    r=900*(j/rings)**3
    for i in range(segments):
        a=i/segments*math.tau; v.append((r*math.cos(a),-.76,r*math.sin(a)))
for i in range(segments): f.append((0,1+(i+1)%segments,1+i))
for j in range(rings-1):
    for i in range(segments):
        a=1+j*segments+i; b=1+j*segments+(i+1)%segments; c=a+segments; d=b+segments
        f.extend([(a,b,c),(b,d,c)])
water=mesh('Lake360_WaterMesh',v,f,watermat)
bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=960)
sky=bpy.context.object; sky.name='Lake360_SkyDome'; sky.data.materials.append(skymat)
for p in sky.data.polygons: p.use_smooth=True
world=bpy.data.worlds.new('Lake360_Daylight'); scene.world=world; world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.55,.7,.76,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
scene['runtime_contract']='Y-up metres; water at -0.76m; analytic directional sky/reflection shader in lake360.ts; no terrain, SSR or reflection camera.'
scene['restore_scene']=original.name
out=ROOT/'src/scene/assets/lake360.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_active_scene=True,export_cameras=False,export_lights=False,export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/lake360/lake360.blend'))
triangles=sum(len(o.data.polygons)*2 if o==sky else len(o.data.polygons) for o in [water,sky])
record={'author':'GPT-6 via Blender MCP','blender':bpy.app.version_string,'original_file':'','original_scene':original.name,'original_dirty':False,'active_scene':scene.name,'restoration':'Switch scene selector to Scene; original Cube, Light, Camera retained.','triangles_upper_bound':triangles,'meshes':2,'materials':2,'glb_bytes':out.stat().st_size,'glb_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'offline_render':False}
(ROOT/'assets/blender/lake360/provenance.json').write_text(json.dumps(record,ensure_ascii=False,indent=2))
print(json.dumps(record,ensure_ascii=False))
