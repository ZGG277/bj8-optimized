/** Continuous six-pocket collars from the unchanged rail/jaw boundary. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POCKETS } from '../physics';
import { pocketSeamContract } from '../pocket-render/seam-contract';
import { pocketRenderProfile } from '../pocket-render/profile';
import { createPocketTrimGeometry } from '../pocket-render/trim-geometry';
import { applyLeatherUV } from './table-surfaces';

export function createPocketCollars(leather: THREE.Material) {
  const root = new THREE.Group(); root.name = 'continuous-pocket-collars';
  const caps: THREE.BufferGeometry[] = [], skirts: THREE.BufferGeometry[] = [];
  for (const pocket of POCKETS) {
    const profile = pocketRenderProfile(pocket), seam = pocketSeamContract(pocket, profile);
    // The same round rear curve and jaw end seats form both parts. The cap is
    // closed at its seat; only the thin leather skirt continues into the well.
    caps.push(createPocketTrimGeometry({ ...seam,
      stations: seam.stations.map(s => ({ ...s, apronBottomY: s.seatY })),
    }));
    const skirt = createPocketTrimGeometry({ ...seam, width: .0015, thickness: .0015,
      stations: seam.stations.map(s => ({ ...s,
        outer: { x: s.inner.x + s.outward.x * .0015, z: s.inner.z + s.outward.z * .0015 },
        topY: s.seatY, seatY: s.seatY - .0015,
        apronBottomY: s.supported ? s.seatY - .0015 : Math.min(s.apronBottomY, profile.wellTopY),
      })),
    });
    applyLeatherUV(skirt); skirts.push(skirt);
  }
  const capGeometry = mergeGeometries(caps, false)!, skirtGeometry = mergeGeometries(skirts, false)!;
  caps.forEach(g => g.dispose()); skirts.forEach(g => g.dispose());
  const cap = new THREE.Mesh(capGeometry, new THREE.MeshPhysicalMaterial({
    name: 'Champagne | continuous rounded collars', color: 0xc8ac75, metalness: .82,
    roughness: .34, clearcoat: .08, clearcoatRoughness: .3, envMapIntensity: .72,
    side: THREE.FrontSide,
  }));
  const skirt = new THREE.Mesh(skirtGeometry, leather);
  cap.name = 'continuous-pocket-caps'; skirt.name = 'continuous-pocket-leather';
  cap.receiveShadow = skirt.receiveShadow = true;
  root.add(cap, skirt); return root;
}
