"""Create the OFL-compliant, renamed UI subset using existing fontTools; no network."""
from pathlib import Path
import hashlib, json, re, sys
from fontTools import subset
from fontTools.ttLib import TTFont
root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1])
chars = set(chr(i) for i in range(32, 127))
for path in [root / 'index.html', *sorted((root / 'src').rglob('*.ts')), *sorted((root / 'src').rglob('*.tsx'))]:
    if '.test.' in path.name: continue
    text = path.read_text()
    text = re.sub(r'/\*.*?\*/|//[^\n]*', '', text, flags=re.S)
    chars.update(c for c in text if ord(c) >= 128)
font = TTFont(source)
version = font['name'].getDebugName(5)
opts = subset.Options()
opts.flavor = 'woff'
opts.name_IDs = ['*']
opts.name_legacy = True
sub = subset.Subsetter(options=opts)
sub.populate(unicodes={ord(c) for c in chars})
sub.subset(font)
# A subset is a modified font: do not use the upstream reserved family name.
for record in font['name'].names:
    replacement = {1:'Princess WenKai UI', 2:'Regular', 3:'PrincessWenKaiUI-Regular-20261013', 4:'Princess WenKai UI Regular', 6:'PrincessWenKaiUI-Regular', 16:'Princess WenKai UI', 17:'Regular'}.get(record.nameID)
    if replacement: record.string = replacement.encode(record.getEncoding())
font.flavor = 'woff'
output = root / 'src/assets/fonts/princess-wenkai-ui.woff'
font.save(output)
metadata = {'name':'Princess WenKai UI (subset of LXGW WenKai Lite)', 'version':version, 'license':'OFL-1.1', 'source':'https://github.com/lxgw/LxgwWenKai-Lite', 'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'subsetSha256':hashlib.sha256(output.read_bytes()).hexdigest(), 'requestedCodepoints':len(chars), 'includedCodepoints':len(font.getBestCmap()), 'bytes':output.stat().st_size}
(root / 'src/assets/fonts/provenance.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(metadata, ensure_ascii=False))
