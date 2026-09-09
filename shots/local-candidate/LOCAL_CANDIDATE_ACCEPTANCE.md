# v1.7.2 candidate acceptance · 2026-09-10

This record captures the accepted candidate before its authorized Git and Miaoda release flow.

## Table model repair

- Blender 5.2.1 directly edited the source scene and saved `quiet-room-v1-repaired.blend`.
- The original source remained unchanged: SHA-256 `48f168d82800b1d75c722ffc32ad1818acf4a70f83559deeb62205364eaf41f5`.
- The repaired source SHA-256 is `19204591579d77f4eb980ce30c6ada4d8b7aac3bbaf454a75c12470e4a796199`.
- The runtime GLB is 781,964 bytes, 19 meshes, and 24,684 triangles; SHA-256 `bde8a27207fad0f13dde82e828b7b46a78a5b088a76b0b8eb166932c6c44ac7d`.
- `BJ8_ClothUnderlap` closes the visible strip under the cloth edge. `BJ8_MiddlePocketAprons` closes the missing outer apron at both middle pockets while preserving pocket clearance.
- `node assets/blender/billiards-room-v1/verify-repair.mjs` passed: 17 original meshes preserved, 150 cushion segments supported, two middle aprons present, two side-pocket cavity checks passed.
- Browser captures cover desktop and a simulated 390 × 844 viewport. See `assets/blender/billiards-room-v1/REPAIR_ACCEPTANCE.md` and `repair-evidence/`.

## Opponent gradient

Deterministic evidence uses practice mode, `sampleOpponentAimOffset`, a 0.01 rad tolerance, 10,000 samples per level, and mulberry32 seed 20260909.

| Level | Miss rate | Mean absolute offset | Power jitter | Candidates | Simulations | Follow-up weight |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 25 | 47.16% | 0.00916 rad | 0.1893 | 1 | 3 | 0.0243 |
| 60 | 2.26% | 0.00451 rad | 0.1143 | 3 | 9 | 0.3623 |
| 90 | 0.00% | 0.00224 rad | 0.0500 | 5 | 15 | 0.7500 |

The low, middle, and high levels now differ in aim spread, power error, tactical search depth, and follow-up positioning. Source data is `opponent-level-evidence.json`; executable evidence is `scripts/opponent-level-evidence.test.ts`.

## Public world selection

- The public entry exposes exactly three worlds: `studio`, `cloud-sea`, and `lake`.
- Selecting `lake` writes `world=lake&lake360=1`. Selecting studio or cloud sea removes the legacy `lake360` override.
- A legacy `?lake360=1` link still resolves to lake. Hidden galaxy, bamboo, and aurora assets and registry capabilities remain in source.
- ego-browser verified actual runtime states on the local candidate:
  - studio: `worldId=studio`, `world-shell-studio`, one canvas, no lake control;
  - cloud sea selected from a legacy lake URL: URL becomes `?world=cloud-sea`, `worldId=cloud-sea`, `world-shell-cloud-sea`, no lake control;
  - lake: `worldId=lake`, `world-shell-lake360`, one canvas, lake control present.
- Both repaired mesh nodes load in the cloud-sea and lake runs. The palette entry remains absent while `theme=neon` still applies.

## Verification

- Full `npm run check`: 54 test files, 393 tests passed; typecheck and production build passed; generated single HTML was 9,422,242 bytes.
- Follow-up targeted evidence: 8 tests passed across opponent evidence, public world selection, and world registry.
- `node scripts/verify-scene-asset.mjs` passed for the repaired GLB.
- `git diff --check` passed.
- Local preview: `http://127.0.0.1:5220/?world=lake&lake360=1&theme=neon` (kept running for review).

The 390 × 844 result is browser viewport simulation, not a physical-device measurement.
