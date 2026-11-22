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
# WOFF2 is the shipped encoding; the existing WOFF remains the canonical test fixture.
font.flavor = 'woff2'
compressed = output.with_suffix('.woff2')
font.save(compressed)
metadata['woff2Sha256'] = hashlib.sha256(compressed.read_bytes()).hexdigest()
# Free-form chat can contain any glyph in the source. Ship the remaining glyphs
# separately so loading a title never pulls in the full CJK font.
core = set(font.getBestCmap())
all_source = set(TTFont(source, lazy=True).getBestCmap())
common = set()
for n in all_source - core:
    try:
        chr(n).encode('gb2312')
        common.add(n)
    except UnicodeEncodeError:
        pass
metadata['additionalFonts'] = []
for label, points in [('common', common), ('extended', all_source - core - common)]:
    extra = TTFont(source, recalcTimestamp=False)
    options = subset.Options()
    options.hinting = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=points)
    subsetter.subset(extra)
    for record in extra['name'].names:
        value = {1:'Princess WenKai ' + label, 2:'Regular', 3:'PrincessWenKai-' + label,
                 4:'Princess WenKai ' + label, 6:'PrincessWenKai-' + label,
                 16:'Princess WenKai ' + label, 17:'Regular'}.get(record.nameID)
        if value: record.string = value.encode(record.getEncoding())
    extra.flavor = 'woff2'
    target = output.with_name('princess-wenkai-' + label + '.woff2')
    extra.save(target)
    assert points <= set(extra.getBestCmap())
    metadata['additionalFonts'].append({'asset':target.name, 'codepoints':len(points), 'bytes':target.stat().st_size,
                                        'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
metadata['totalSourceCoverage'] = len(all_source)
(root / 'src/assets/fonts/provenance.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(metadata, ensure_ascii=False))
