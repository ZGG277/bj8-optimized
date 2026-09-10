"""Derive the clear-water candidate from the accepted lake source in Blender 5.2.
Run: Blender --background --python assets/blender/lake360/build_lake360.py
Uses a separate Blender process; never touches an open interactive file.
"""
import bpy, math, json, hashlib, random
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'assets/blender/lake360/lake360.blend'
DEST = SOURCE.with_name('lake360-clear-water.blend')
assert bpy.app.background, 'Run in a separate background Blender to protect the user scene'
assert SOURCE != DEST
source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
original = bpy.context.scene
scene = bpy.data.scenes.new('BJ8_Lake360_ClearWater')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
# Retain accepted geometry and source scenes, but give the candidate its own data.
for name in ('Lake360_WaterMesh', 'Lake360_SkyDome'):
    src = original.objects.get(name)
    assert src is not None, name
    obj = src.copy(); obj.data = src.data.copy(); scene.collection.objects.link(obj)
    src.name = name + '_AcceptedSource'; obj.name = name
    obj.data.materials.clear()
    mat = bpy.data.materials.new(name + '_ClearWater'); mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    color = (.27,.58,.58,1) if 'Water' in name else (.52,.73,.83,1)
    mat.diffuse_color = color; p.inputs['Base Color'].default_value = color
    p.inputs['Roughness'].default_value = .17 if 'Water' in name else 1
    if 'Water' in name:
        p.inputs['Transmission Weight'].default_value = .85
        p.inputs['IOR'].default_value = 1.333
        tex = mat.node_tree.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = 3.8
        tex.inputs['Detail'].default_value = 2
        bump = mat.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .16
        bump.inputs['Distance'].default_value = .035
        mat.node_tree.links.new(tex.outputs['Fac'],bump.inputs['Height'])
        mat.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
    obj.data.materials.append(mat)
# Y-up author coordinates: a broad shallow shelf with small natural relief.
def bed_y(x,z):
    r = math.hypot(x,z)
    depth = .46 + .026*r + .0025*r*r
    relief = .035*math.sin(x*.81+z*.31)+.025*math.sin(z*1.43-x*.37)
    return -.76-depth+relief
verts=[]; faces=[]; colors=[]
def vertex(x,y,z,color):
    verts.append((x,-z,y)); colors.append((*color,1)); return len(verts)-1
sand = (.62,.64,.46)
vertex(0,bed_y(0,0),0,sand)
segments=64; rings=20
for j in range(1,rings+1):
    r=55*(j/rings)**2
    for i in range(segments):
        a=math.tau*i/segments; x=r*math.cos(a); z=r*math.sin(a)
        vertex(x,bed_y(x,z),z,sand)
for i in range(segments): faces.append((0,1+(i+1)%segments,1+i))
for j in range(rings-1):
    for i in range(segments):
        a=1+j*segments+i; b=1+j*segments+(i+1)%segments; c=a+segments; d=b+segments
        faces.extend(((a,b,c),(b,d,c)))
# Pebble clusters are intentionally sparse and low: no island or stage.
rng=random.Random(20260910)
for x,z in [(-1.65,1.7),(1.9,-.8),(-2.8,-2.2),(2.8,2.6),(-4.3,.9),(4.4,-3.2),(.3,4.6),(-1.,-5.4)]:
    for k in range(3):
        px=x+rng.uniform(-.32,.32); pz=z+rng.uniform(-.32,.32)
        radius=rng.uniform(.065,.15); y=bed_y(px,pz)
        col=(.30+rng.random()*.12,.36+rng.random()*.09,.30+rng.random()*.07)
        ids=[]
        for j in range(3):
            lat=math.pi*(j+1)/4; ring=[]
            for i in range(8):
                a=math.tau*i/8
                ring.append(vertex(px+radius*math.sin(lat)*math.cos(a),y+radius*.5*math.cos(lat)+radius*.25,pz+radius*.8*math.sin(lat)*math.sin(a),col))
            ids.append(ring)
        top=vertex(px,y+radius*.75,pz,col); bottom=vertex(px,y-radius*.25,pz,col)
        for i in range(8):
            ni=(i+1)%8; faces.extend(((top,ids[0][ni],ids[0][i]),(bottom,ids[2][i],ids[2][ni])))
            for j in range(2): faces.extend(((ids[j][i],ids[j][ni],ids[j+1][i]),(ids[j][ni],ids[j+1][ni],ids[j+1][i])))
m=bpy.data.meshes.new('ClearWater_SandShelfAndPebbles'); m.from_pydata(verts,[],faces); m.update()
o=bpy.data.objects.new('Lake360_Lakebed',m); scene.collection.objects.link(o)
attr=m.color_attributes.new(name='LakebedColor',type='FLOAT_COLOR',domain='POINT')
for i,c in enumerate(colors): attr.data[i].color=c
for poly in m.polygons: poly.use_smooth=True
mat=bpy.data.materials.new('ClearWater_SandAndStone'); mat.use_nodes=True; mat.diffuse_color=(*sand,1)
p=mat.node_tree.nodes.get('Principled BSDF'); p.inputs['Roughness'].default_value=.85
color=mat.node_tree.nodes.new('ShaderNodeVertexColor'); color.layer_name='LakebedColor'; mat.node_tree.links.new(color.outputs['Color'],p.inputs['Base Color'])
m.materials.append(mat)
scene.world=original.world.copy() if original.world else bpy.data.worlds.new('ClearWater_Daylight')
scene['runtime_contract']='Y-up metres, water=-0.76m; 3 draw batches; real transparent water over shelf and pebble geometry. Procedural sand/caustics and Fresnel sky in lake360.ts; no textures or extra render pass.'
scene['reference']='https://www.ghibli.jp/works/chihiro/ — palette, calm space, water only; no copied imagery or objects.'
scene['source_sha256']=source_hash
out=ROOT/'src/scene/assets/lake360.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_active_scene=True,export_cameras=False,export_lights=False,export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=str(DEST))
objects=[o for o in scene.objects if o.type=='MESH']
for o in objects: o.data.calc_loop_triangles()
record={'author':'GPT-6 / local Blender Python','blender':bpy.app.version_string,'blender_build':bpy.app.build_hash.decode(),'source_file':str(SOURCE.relative_to(ROOT)),'source_sha256':source_hash,'source_preserved':hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash,'source_scene':original.name,'active_scene':scene.name,'editable_source':str(DEST.relative_to(ROOT)),'blend_sha256':hashlib.sha256(DEST.read_bytes()).hexdigest(),'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'runtime_sha256':hashlib.sha256((ROOT/'src/scene/lake360.ts').read_bytes()).hexdigest(),'meshes':len(objects),'materials':len({m.name for o in objects for m in o.data.materials}),'triangles':sum(len(o.data.loop_triangles) for o in objects),'mesh_statistics':{o.name:{'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles)} for o in objects},'glb_bytes':out.stat().st_size,'glb_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'reference':'https://www.ghibli.jp/works/chihiro/','license':'Original procedural geometry/materials; no third-party media included.','offline_render':False,'validation_scope':'Blender export and source preservation; browser validation delegated to PM.'}
(SOURCE.parent/'provenance.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(record,ensure_ascii=False))
