# Princess R2 pocket craft

This asset is generated from the current runtime pocket surface contract. The 75.438 mm balls and 150/153 mm mouths are shared by physics and rendering.

From the project root:

```sh
node_modules/.bin/vite-node scripts/export-table-craft-contract.ts
blender --background --factory-startup --python scripts/build-blender-table-craft.py
node_modules/.bin/vitest run scripts/table-craft-asset.test.ts src/pocket-render src/pocket-drop.test.ts src/scene/crystal-furniture-r3.test.ts
node_modules/.bin/tsc --noEmit
```

Outputs:

- `assets/blender/table-craft-v2/surface-contract.json`: deterministic JSON, embedded SHA-256 in the GLB
- `assets/blender/table-craft-v2/table-craft-v2.blend`: editable authoring source
- `src/scene/assets/table-craft-v2.glb`: production asset

The final asset has 560 stitches, 6.3 mm pitch, two meshes and 24,448 triangles: 17,920 stitching and 6,528 edge binding. Thread and binding have six smooth-shaded sides. Binding radius remains 0.44 mm and its path is unchanged. The asset is below the R1 count of 27,216 triangles and leaves space for the six closed rounded apron notches.

The procedural apron is generated separately in `src/scene/crystal-style.ts`. Its existing lower perimeter stays fixed; local upper sections dip to 4 mm below each current well bottom. The actual furniture triangles, including gold piping, are checked against all six complete pocket volumes by `apron-cavity.test.ts`. Seam caps stay 2 mm beyond the maximum well rear extent and extend 5 mm below the well bottom to meet the apron.
