"""Rebuild a local candidate from immutable, checksum-anchored supplied assets."""
from pathlib import Path
import base64
import hashlib
import json
import re
import shutil
import zipfile
from table_model import build_table

ROOT=Path(__file__).resolve().parents[1]
BASELINE=ROOT/'baseline/package'
DIST=ROOT/'dist'
LIGHT_TYPES='DirectionalLight:sQ,CanvasTexture:bi,SRGBColorSpace:ie,RepeatWrapping:Nt,MeshBasicMaterial:Ce,PlaneGeometry:Fr,InstancedMesh:Kr,Matrix4:i0,Color:NA,stats:_P'
LIGHT_HOOK='this.scene.environmentIntensity=.32,globalThis.__princessVisuals.light(this,{'+LIGHT_TYPES+'}),this.scene.add(this.crystalLighting)'
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def replace_once(text, before, after):
    assert text.count(before)==1, ('Baseline hook mismatch', before, text.count(before))
    return text.replace(before,after)

def main():
    assert sha(ROOT/'baseline/公主请开球-预览-1009.html')=='77446d3294d51f7bf5ceda0b66af84db38e031132a57620dd6823381b53fb7bc'
    raw,report=build_table()
    # Only this project's regenerated output is replaced; baseline stays intact.
    if DIST.exists(): shutil.rmtree(DIST)
    shutil.copytree(BASELINE,DIST)
    for p in (DIST/'glb-chunks').glob('jewelry-table.*.js'):p.unlink()
    text=base64.b64encode(raw).decode();chunks=[text[i:i+1000000] for i in range(0,len(text),1000000)]
    for i,chunk in enumerate(chunks):
        (DIST/f'glb-chunks/jewelry-table.{i}.js').write_text('globalThis.__bj8GlbChunks=globalThis.__bj8GlbChunks||{};(globalThis.__bj8GlbChunks["jewelry-table"]=globalThis.__bj8GlbChunks["jewelry-table"]||[]).push('+json.dumps(chunk)+');\n')
    bundle=DIST/'assets/index-B-9jmFk4.js';code=bundle.read_text()
    code=replace_once(code,'this.scene.environmentIntensity=.32,this.scene.add(this.crystalLighting)', LIGHT_HOOK)
    code=replace_once(code,'this.tableGroup.userData.retiredJewelryMaterials=[...A],this.requestRender(!0)', 'this.tableGroup.userData.retiredJewelryMaterials=[...A],globalThis.__princessVisuals.table(this),this.requestRender(!0)')
    code=replace_once(code,'applyGemBallSet(A){var i;const e=new Set', 'applyGemBallSet(A){globalThis.__princessVisuals.gems(this,A);var i;const e=new Set')
    code=replace_once(code,'try{this.renderer.render(this.scene,this.camera)}catch', 'try{globalThis.__princessVisuals.frame(this),this.renderer.render(this.scene,this.camera)}catch')
    bundle.write_text(code)
    shutil.copy2(ROOT/'src/royal-visuals.js',DIST/'assets/royal-visuals.js')
    html=(BASELINE/'index.html').read_text()
    html=re.sub(r'\s*<script defer src="./glb-chunks/jewelry-table\.\d+\.js"></script>', '',html)
    tags='\n'.join(f'    <script defer src="./glb-chunks/jewelry-table.{i}.js"></script>' for i in range(len(chunks)))
    html=html.replace('    <script defer src="./assets/index-B-9jmFk4.js"></script>',tags+'\n    <script defer src="./assets/royal-visuals.js"></script>\n    <script defer src="./assets/index-B-9jmFk4.js"></script>')
    (DIST/'index.html').write_text(html)
    provenance={'product':'公主请开球','visualRevision':'royal-daylight-1009-v1','sourceKind':'supplied built ZIP plus readable local enhancement sources; original source repository unavailable','baselineHtmlSha256':sha(ROOT/'baseline/公主请开球-预览-1009.html'),'baselineZipSha256':sha(ROOT/'baseline/公主请开球-小红书版-预览-1009.zip'),'enhancementSources':{str(p.relative_to(ROOT)):sha(p) for p in [ROOT/'src/royal-visuals.js',ROOT/'scripts/build.py',ROOT/'scripts/table_model.py']},'model':report,'builtFiles':{str(p.relative_to(DIST)):sha(p) for p in sorted(DIST.rglob('*')) if p.is_file() and p.name!='BUILD_PROVENANCE.json'},'status':'local candidate; no platform or device acceptance'}
    (DIST/'BUILD_PROVENANCE.json').write_text(json.dumps(provenance,indent=2,ensure_ascii=False)+'\n')
    artifact=ROOT/'artifacts/公主请开球-小红书版-日光珠宝优化-1009.zip'
    with zipfile.ZipFile(artifact,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(DIST.rglob('*')):
            if p.is_file():z.write(p,p.relative_to(DIST).as_posix())
    # Separate standalone preview; the Mini Tool ZIP keeps all scripts external.
    inline=html
    for match in list(re.finditer(r'<script defer src="(\./[^\"]+)"></script>',inline)):
        js=(DIST/match[1]).read_text()
        for image in (DIST/'assets').glob('*.webp'):
            data='data:image/webp;base64,'+base64.b64encode(image.read_bytes()).decode()
            js=js.replace('./assets/'+image.name,data)
            asset_url='new URL('+json.dumps(image.name)+',document.currentScript&&document.currentScript.tagName.toUpperCase()==="SCRIPT"&&document.currentScript.src||document.baseURI).href'
            js=js.replace(asset_url,json.dumps(data))
        inline=inline.replace(match[0],'<script>'+js.replace('</script','<\\/script')+'</script>')
    inline=re.sub(r'<link rel="stylesheet" href="(\./[^\"]+)">',lambda m:'<style>'+(DIST/m[1]).read_text()+'</style>',inline)
    inline=re.sub(r'<link rel="icon" href="(\./[^\"]+)" />',lambda m:'<link rel="icon" href="data:image/svg+xml;base64,'+base64.b64encode((DIST/m[1]).read_bytes()).decode()+'" />',inline)
    # Inline scripts execute in order after the mount target exists.
    scripts=re.findall(r'<script>.*?</script>',inline,re.S)
    inline=re.sub(r'<script>.*?</script>','',inline,flags=re.S)
    inline=inline.replace('</body>','\n'+'\n'.join(scripts)+'\n</body>')
    preview=ROOT/'artifacts/公主请开球-日光珠宝优化-1009.html';preview.write_text(inline)
    manifest={'zip':{'name':artifact.name,'bytes':artifact.stat().st_size,'sha256':sha(artifact)},'html':{'name':preview.name,'bytes':preview.stat().st_size,'sha256':sha(preview)}}
    (ROOT/'artifacts/manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'artifacts':manifest,'model':report},ensure_ascii=False))
if __name__=='__main__':main()
