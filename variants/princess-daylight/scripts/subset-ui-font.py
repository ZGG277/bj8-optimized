"""[INPUT]: Existing OFL font and TS/TSX UI literal codepoints, no network.
[OUTPUT]: Renamed web subset and coverage/provenance receipt.
[POS]: Offline font build; fail on any missing Han character.
[PROTOCOL]: Update this header and CLAUDE.md when changing.
"""
from pathlib import Path
import hashlib, json, sys, subprocess
from fontTools import subset
from fontTools.ttLib import TTFont
root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1])
codepoints = set(json.loads(subprocess.run(['node', str(root/'scripts/ui-font-characters.mjs')], check=True, capture_output=True, text=True).stdout))
font = TTFont(source, recalcTimestamp=False)
unsupported = sorted(codepoints - set(font.getBestCmap()))
missing_han = [n for n in unsupported if 0x3400 <= n <= 0x9fff]
if missing_han: raise RuntimeError('Source font missing UI Han codepoints: '+repr(missing_han))
version = font['name'].getDebugName(5)
opts = subset.Options()
opts.flavor = 'woff'
opts.name_IDs = ['*']
opts.name_legacy = True
sub = subset.Subsetter(options=opts)
sub.populate(unicodes=codepoints)
sub.subset(font)
# A subset is a modified font: do not use the upstream reserved family name.
for record in font['name'].names:
    replacement = {1:'Princess WenKai UI', 2:'Regular', 3:'PrincessWenKaiUI-Regular-'+hashlib.sha256(json.dumps(sorted(codepoints)).encode()).hexdigest()[:12], 4:'Princess WenKai UI Regular', 6:'PrincessWenKaiUI-Regular', 16:'Princess WenKai UI', 17:'Regular'}.get(record.nameID)
    if replacement: record.string = replacement.encode(record.getEncoding())
font.flavor = 'woff'
output = root / 'src/assets/fonts/princess-wenkai-ui.woff'
font.save(output)
metadata = {'name':'Princess WenKai UI (subset of LXGW WenKai Lite)', 'version':version, 'license':'OFL-1.1', 'source':'https://github.com/lxgw/LxgwWenKai-Lite', 'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'subsetSha256':hashlib.sha256(output.read_bytes()).hexdigest(), 'requestedCodepoints':len(codepoints), 'includedCodepoints':len(font.getBestCmap()), 'unsupportedCodepoints':unsupported, 'missingHanCodepoints':missing_han, 'coverageSource':'TS/TSX literal AST + CSS content + title; UI and canonical cards', 'bytes':output.stat().st_size}
(root / 'src/assets/fonts/provenance.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(metadata, ensure_ascii=False))
