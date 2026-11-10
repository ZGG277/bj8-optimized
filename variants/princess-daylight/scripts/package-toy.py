"""Package the isolated, already-built Toy and record the exact ZIP contents."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, default=ROOT)
parser.add_argument("--dist", type=Path, default=ROOT / "dist-toy-pc")
parser.add_argument("--zip", type=Path, required=True)
parser.add_argument("--receipt", type=Path, required=True)
args = parser.parse_args()
SOURCE, DIST, ZIP = (path.resolve() for path in (args.source, args.dist, args.zip))
NOTICES = []
for name in ("react", "react-dom", "scheduler", "three"):
    package = SOURCE / "node_modules" / name
    metadata = json.loads((package / "package.json").read_text())
    NOTICES.append(dict(name=name, version=metadata["version"], license=metadata["license"],
                        licenseText=(package / "LICENSE").read_text()))
fonts = SOURCE / "src/assets/fonts"
NOTICES.append(dict(**json.loads((fonts / "provenance.json").read_text()),
                    licenseText=(fonts / "OFL.txt").read_text()))
NOTICES.append(json.loads((SOURCE / "src/assets/ambience/provenance.json").read_text()))
(DIST / "THIRD_PARTY_NOTICES.json").write_text(json.dumps(NOTICES, ensure_ascii=False, indent=2) + "\n")
landscape = json.loads((SOURCE / "src/assets/opening/landscape-provenance.json").read_text())
(DIST / "OPENING_LANDSCAPE_PROVENANCE.json").write_text(json.dumps(landscape, ensure_ascii=False, indent=2) + "\n")

entry = (DIST / "index.html").read_bytes()
if len(entry) > 1_000_000:
    raise ValueError("Entry exceeds 1 MB")
files = sorted(p for p in DIST.rglob("*") if p.is_file())
sha = lambda value: hashlib.sha256(value).hexdigest()
manifest = {}
temporary_zip = ZIP.with_suffix(".tmp")
# Bilibili Toy keeps .mp4. Xiaohongshu's packager still rejects it.
with zipfile.ZipFile(temporary_zip, "w") as bundle:
    for p in files:
        name = p.relative_to(DIST).as_posix()
        if p.suffix not in {".html", ".js", ".css", ".json", ".svg", ".webp", ".jpg", ".png", ".woff", ".mp4"}:
            raise ValueError(f"Unexpected runtime file: {name}")
        data = p.read_bytes()
        info = zipfile.ZipInfo(name, (2026, 11, 8, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        bundle.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        manifest[name] = sha(data)
if temporary_zip.stat().st_size > 50_000_000:
    raise ValueError("ZIP exceeds 50 MB")
with zipfile.ZipFile(temporary_zip) as bundle:
    assert bundle.testzip() is None
    assert {name: sha(bundle.read(name)) for name in bundle.namelist()} == manifest
temporary_zip.replace(ZIP)
receipt = dict(zip=str(ZIP), bytes=ZIP.stat().st_size, sha256=sha(ZIP.read_bytes()),
               entryBytes=len(entry), expandedBytes=sum(p.stat().st_size for p in files),
               files=manifest)
args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
print({key: value for key, value in receipt.items() if key != "files"}, len(manifest), "files")
