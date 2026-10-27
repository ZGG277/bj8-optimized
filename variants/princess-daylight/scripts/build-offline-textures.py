"""Optional authoring tool: lossless PNG alternatives for immutable embedded GLB textures.

Requires Pillow only when regenerating; normal npm builds use the checked-in results.
"""
from pathlib import Path
import hashlib
import io
import json
import struct
from PIL import Image

root = Path(__file__).resolve().parent.parent
output = root / "src/assets/offline-textures"
output.mkdir(exist_ok=True)
images = {}
for model in sorted((root / "src/scene/assets").rglob("*.glb")):
    raw = model.read_bytes()
    size = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    binary = raw[28 + size:]
    for item in doc.get("images", []):
        if item.get("mimeType") != "image/png" or "bufferView" not in item:
            continue
        view = doc["bufferViews"][item["bufferView"]]
        start = view.get("byteOffset", 0)
        data = binary[start:start + view["byteLength"]]
        source_hash = hashlib.sha256(data).hexdigest()
        if source_hash in images:
            continue
        image = Image.open(io.BytesIO(data)).convert("RGBA")
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", lossless=True, quality=100, method=6, exact=True)
        packed = buffer.getvalue()
        decoded = Image.open(io.BytesIO(packed)).convert("RGBA")
        if decoded.size != image.size or decoded.tobytes() != image.tobytes():
            raise ValueError("Lossless pixel comparison failed: " + source_hash)
        if len(packed) >= len(data):
            continue
        name = source_hash[:20] + ".webp"
        (output / name).write_bytes(packed)
        images[source_hash] = {
            "file": name, "sha256": hashlib.sha256(packed).hexdigest(),
            "originalBytes": len(data), "packedBytes": len(packed),
            "width": image.width, "height": image.height,
            "rgbaSha256": hashlib.sha256(image.tobytes()).hexdigest(),
            "sourceModel": str(model.relative_to(root)),
        }
(output / "manifest.json").write_text(json.dumps({
    "encoding": "lossless WebP, exact RGBA bytes verified", "images": images,
}, indent=2, sort_keys=True) + "\n")
print(json.dumps({"images": len(images), "bytesSaved": sum(i["originalBytes"] - i["packedBytes"] for i in images.values())}))
