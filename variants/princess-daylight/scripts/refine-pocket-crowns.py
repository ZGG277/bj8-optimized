"""Restore authored pocket crown curves from the preserved full table.

Only small, upper gold crown components and leather inserts are replaced.
Rail panels, inlays, legs, collision geometry and both source GLBs are unchanged.
CPU-only, deterministic GLB derivative; no Blender or external dependencies.
"""
import copy
import hashlib
import json
import math
import struct
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'src/scene/assets/daylight'


def load(name):
    data = (ASSETS / name).read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + size]), data[28 + size:]


def read(doc, blob, index):
    a = doc['accessors'][index]
    v = doc['bufferViews'][a['bufferView']]
    fmt = {5126: 'f', 5125: 'I', 5123: 'H'}[a['componentType']]
    count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    stride = v.get('byteStride', struct.calcsize('<' + fmt) * count)
    offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<' + fmt * count, blob, offset + i * stride)
            for i in range(a['count'])]


def triangles(doc, blob, p):
    indices = [i[0] for i in read(doc, blob, p['indices'])]
    return [indices[i:i + 3] for i in range(0, len(indices), 3)]


def crowns(doc, blob, p):
    """Connected components survive different LOD indexing and normal seams."""
    positions = read(doc, blob, p['attributes']['POSITION'])
    world = [(-z - .81006, y - .718, x - 1.44506) for x, y, z in positions]
    unique = {}
    ids = [unique.setdefault(tuple(round(v, 5) for v in point), len(unique)) for point in world]
    parent = list(range(len(unique)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    tris = triangles(doc, blob, p)
    for tri in tris:
        for i in tri[1:]:
            parent[find(ids[i])] = find(ids[tri[0]])
    groups = defaultdict(list)
    for tri in tris:
        groups[find(ids[tri[0]])].append(tri)
    selected = []
    retained = []
    count = 0
    for group in groups.values():
        pts = [world[i] for tri in group for i in tri]
        low = [min(p[k] for p in pts) for k in range(3)]
        high = [max(p[k] for p in pts) for k in range(3)]
        x, z = (low[0] + high[0]) / 2, (low[2] + high[2]) / 2
        is_crown = (low[1] >= .060 and high[1] <= .071
                    and high[0] - low[0] < .31 and high[2] - low[2] < .31
                    and abs(x) > .59 and (abs(z) > 1.17 or abs(z) < .04))
        (selected if is_crown else retained).extend(group)
        count += int(is_crown)
    assert count == 6, ('Expected upper inner rolled edge on each of six pockets', count)
    return selected, retained


def build():
    base, binary = load('table-balanced.glb')
    full, full_binary = load('table-original.glb')
    result = copy.deepcopy(base)
    result['accessors'], result['bufferViews'] = [], []
    packed = bytearray()

    def append(values, kind, integer=False):
        offset = len(packed)
        flat = [v for value in values for v in value]
        assert all(math.isfinite(v) for v in flat)
        component = 'H' if integer and max(flat) < 65536 else 'I' if integer else 'f'
        packed.extend(struct.pack('<' + component * len(flat), *flat))
        view = len(result['bufferViews'])
        result['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(packed) - offset})
        packed.extend(b'\0' * (-len(packed) % 4))
        a = {'bufferView': view, 'componentType': {'H':5123,'I':5125,'f':5126}[component], 'count': len(values), 'type': kind}
        if kind == 'VEC3':
            a.update(min=[min(p[i] for p in values) for i in range(3)], max=[max(p[i] for p in values) for i in range(3)])
        result['accessors'].append(a)
        return len(result['accessors']) - 1

    primitives, report = [], []
    for p in base['meshes'][0]['primitives']:
        name = base['materials'][p['material']]['name']
        parts = [(base, binary, p, triangles(base, binary, p))]
        if 'gold' in name.lower() or name.startswith('Pocket'):
            fp = next(q for q in full['meshes'][0]['primitives'] if full['materials'][q['material']]['name'] == name)
            if 'gold' in name.lower():
                old, keep = crowns(base, binary, p)
                restored, _ = crowns(full, full_binary, fp)
                parts = [(base, binary, p, keep), (full, full_binary, fp, restored)]
                report.append({'material': name, 'removedTriangles': len(old), 'restoredTriangles': len(restored)})
            else:
                parts = [(full, full_binary, fp, triangles(full, full_binary, fp))]
        # Runtime rebuilds crease-aware normals after resizing; omit redundant normals.
        # No source material uses a second UV set.
        assert 'texCoord' not in json.dumps(base['materials'])
        attrs = {key: [] for key in p['attributes'] if key not in ['NORMAL', 'TEXCOORD_1']}
        indices = []
        for doc, blob, source, tris in parts:
            used = sorted({i for tri in tris for i in tri})
            offset = len(attrs['POSITION'])
            mapping = {v: offset + i for i, v in enumerate(used)}
            for key in attrs:
                data = read(doc, blob, source['attributes'][key])
                attrs[key].extend(data[i] for i in used)
            indices.extend((mapping[i],) for tri in tris for i in tri)
        prim = copy.deepcopy(p)
        prim['attributes'] = {key: append(values, base['accessors'][p['attributes'][key]]['type']) for key, values in attrs.items()}
        prim['indices'] = append(indices, 'SCALAR', True)
        primitives.append(prim)
    result['meshes'][0]['primitives'] = primitives
    result['buffers'] = [{'byteLength': len(packed)}]
    result['asset']['extras'] = {'revision': 'rounded-pocket-crowns-20261015', 'collisionChange': False}
    text = json.dumps(result, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    data = struct.pack('<4sII', b'glTF', 2, 28 + len(text) + len(packed)) + struct.pack('<I4s', len(text), b'JSON') + text + struct.pack('<I4s', len(packed), b'BIN\0') + packed
    out = ASSETS / 'table-refined.glb'
    out.write_bytes(data)
    total = sum(result['accessors'][p['indices']]['count'] // 3 for p in primitives)
    assert total < 32000, total
    info = {'sources': {name: hashlib.sha256((ASSETS / name).read_bytes()).hexdigest() for name in ['table-balanced.glb', 'table-original.glb']}, 'output': str(out.relative_to(ROOT)), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'triangles': total, 'replacements': report, 'physicsChanged': False}
    (ROOT / 'artifacts/gem-craft-20261015/model-provenance.json').write_text(json.dumps(info, indent=2) + '\n')
    print(json.dumps(info, indent=2))


if __name__ == '__main__':
    build()
