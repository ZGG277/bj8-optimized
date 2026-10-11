from pathlib import Path
import hashlib
import json
import math
import re
import struct
import zipfile
from table_model import load_glb, accessor
from build import LIGHT_HOOK

ROOT=Path(__file__).resolve().parents[1]
def main():
    baseline=(ROOT/'baseline/package/assets/index-B-9jmFk4.js').read_text()
    current=(ROOT/'dist/assets/index-B-9jmFk4.js').read_text()
    for before,after in [
        ('this.scene.environmentIntensity=.32,this.scene.add(this.crystalLighting)', LIGHT_HOOK),
        ('this.tableGroup.userData.retiredJewelryMaterials=[...A],this.requestRender(!0)', 'this.tableGroup.userData.retiredJewelryMaterials=[...A],globalThis.__princessVisuals.table(this),this.requestRender(!0)'),
        ('applyGemBallSet(A){var i;const e=new Set', 'applyGemBallSet(A){globalThis.__princessVisuals.gems(this,A);var i;const e=new Set'),
        ('try{this.renderer.render(this.scene,this.camera)}catch', 'try{globalThis.__princessVisuals.frame(this),this.renderer.render(this.scene,this.camera)}catch'),
    ]:
        assert current.count(after)==1; current=current.replace(after,before)
    assert current==baseline, 'Unexpected change outside the four visual hooks'
    d,b=load_glb(ROOT/'assets/jewelry-table-daylight.glb')
    triangles=0
    for mesh in d['meshes']:
        for p in mesh['primitives']:
            points=accessor(d,b,p['attributes']['POSITION'])
            normals=accessor(d,b,p['attributes']['NORMAL'])
            assert all(math.isfinite(v) for q in points+normals for v in q)
            assert all(abs(math.sqrt(sum(v*v for v in q))-1)<.002 for q in normals)
            ix=[q[0] for q in accessor(d,b,p['indices'])] if 'indices' in p else list(range(len(points)))
            assert len(ix)%3==0 and min(ix)>=0 and max(ix)<len(points)
            triangles+=len(ix)//3
    assert triangles<250000
    old_d,old_b=load_glb(ROOT/'assets/source/jewelry-table.glb')
    # Retain the supplied cloth and wrap. The rounded cushion artwork is new;
    # the round-tripped executable above proves all original physics logic stays.
    old=next(p for p in old_d['meshes'][0]['primitives'] if p['material']==7)
    new=next(p for p in d['meshes'][0]['primitives'] if p['material']==7)
    for key,index in old['attributes'].items(): assert accessor(old_d,old_b,index)==accessor(d,b,new['attributes'][key])
    old_ix=[q[0] for q in accessor(old_d,old_b,old['indices'])]
    new_ix=[q[0] for q in accessor(d,b,new['indices'])]
    positions=accessor(old_d,old_b,old['attributes']['POSITION'])
    original_contact=[old_ix[i:i+3] for i in range(0,len(old_ix),3) if all(positions[j][1]-.718<=.000001 for j in old_ix[i:i+3])]
    assert new_ix==[i for t in original_contact for i in t]
    html=(ROOT/'dist/index.html').read_text()
    assert 'viewport-fit=cover' in html and '<base' not in html
    assert not re.search(r'<script[^>]*>\s*[^<\s]',html)
    assert not re.search(r'<(?:iframe|object)\b|\bon\w+=|javascript:',html,re.I)
    refs=re.findall(r'(?:src|href)="(\./[^\"]+)"',html)
    assert all((ROOT/'dist'/r).is_file() for r in refs)
    with zipfile.ZipFile(ROOT/'artifacts/公主请开球-小红书版-日光珠宝优化-1009.zip') as z:
        assert z.testzip() is None and 'index.html' in z.namelist()
        assert all(Path(n).suffix in ['.js','.css','.html','.webp','.svg','.json'] for n in z.namelist())
        assert not any('node_modules' in n or '.DS_Store' in n for n in z.namelist())
        for n in z.namelist(): assert z.read(n)==(ROOT/'dist'/n).read_bytes()
    provenance=json.loads((ROOT/'dist/BUILD_PROVENANCE.json').read_text())
    for name,digest in provenance['builtFiles'].items(): assert hashlib.sha256((ROOT/'dist'/name).read_bytes()).hexdigest()==digest
    report={'visualHookRoundTripAndPhysicsUnchanged':'PASS','clothAndWrapPreserved':'PASS','glbAccessors':'PASS','tableTriangles':triangles,'zipCrcAndSourceEquality':'PASS','relativeExternalScripts':'PASS','platformDeviceAcceptance':'NOT_RUN'}
    (ROOT/'evidence/static-check.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))
if __name__=='__main__': main()
