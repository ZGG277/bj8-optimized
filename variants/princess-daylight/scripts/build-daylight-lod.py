"""CPU-only LOD derivation. Original full asset and earlier rounded-jaw recipe remain untouched."""
import bpy, pathlib, json
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT.parent/'daylight-1009/assets/jewelry-table-daylight.glb'
DEST=ROOT/'src/scene/assets/daylight'
reports=[]
for tier,ratio in [('balanced',.24),('hot',.12)]:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(SOURCE))
 for obj in list(bpy.context.scene.objects):
  if obj.type!='MESH':continue
  bpy.context.view_layer.objects.active=obj;obj.select_set(True)
  # Preserve UVs, material boundaries, silhouette and the complete table. No components hidden.
  mod=obj.modifiers.new('daylight-detail-lod','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=mod.name)
  obj.select_set(False)
 out=DEST/f'table-{tier}.glb'
 bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True)
 triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')
 reports.append({'tier':tier,'ratio':ratio,'triangles':triangles,'bytes':out.stat().st_size})
(DEST/'lod-report.json').write_text(json.dumps(reports,indent=2))
print(reports)

# Runtime supplies the pearl and cloth maps, so omit redundant source texture payloads.
import runpy
runpy.run_path(str(ROOT/"scripts/strip-daylight-overridden-textures.py"),run_name="__main__")
