"""Remove only original table maps replaced at runtime; preserve all geometry/materials.
The original full source GLB is never modified. No external image encoder is required.
"""
import json, struct, pathlib

def strip(path):
 data=path.read_bytes();size=struct.unpack_from('<I',data,12)[0]
 doc=json.loads(data[20:20+size]);binary=data[28+size:]
 assert len(doc.get('images',[]))==2 and len(doc.get('textures',[]))==2
 removed={i['bufferView'] for i in doc['images']}
 for material in doc['materials']:
  pbr=material.get('pbrMetallicRoughness',{})
  if 'baseColorTexture' in pbr:
   assert material['name'] in ['Pearl | shell inlay','Emerald cloth | woven']
   del pbr['baseColorTexture']
 for key in ['images','textures','samplers']:doc.pop(key,None)
 packed=bytearray();views=[];mapping={}
 for index,view in enumerate(doc['bufferViews']):
  if index in removed:continue
  mapping[index]=len(views);offset=view.get('byteOffset',0)
  content=binary[offset:offset+view['byteLength']]
  view['byteOffset']=len(packed);packed.extend(content);packed.extend(b'\0'*((-len(packed))%4));views.append(view)
 for accessor in doc['accessors']:
  assert 'sparse' not in accessor
  if 'bufferView' in accessor:accessor['bufferView']=mapping[accessor['bufferView']]
 doc['bufferViews']=views;doc['buffers'][0]['byteLength']=len(packed)
 text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*((-len(text))%4)
 result=struct.pack('<III',0x46546c67,2,28+len(text)+len(packed))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(packed),0x004e4942)+packed
 path.write_bytes(result)
 return len(result)
if __name__=='__main__':
 root=pathlib.Path(__file__).resolve().parents[1]/'src/scene/assets/daylight'
 report=json.loads((root/'lod-report.json').read_text())
 for item in report:
  item['bytes']=strip(root/f"table-{item['tier']}.glb")
  item['maps']='Original shell and cloth maps omitted; runtime supplies replacements.'
 (root/'lod-report.json').write_text(json.dumps(report,indent=2)+'\n')
