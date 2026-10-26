import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { TABLE } from '../physics';
import { sceneCost } from '../minitool/render-guard';
import { applyGemOptics, applyFrameOptics, setCrystalOpticsQuality, createGemVolumeFacets } from './gem-optics';
const resources:THREE.Material[]=[];
function material(number:number){const m=new THREE.MeshPhysicalMaterial();resources.push(m);applyGemOptics(m,number);return m;}
afterEach(()=>{for(const m of resources.splice(0)){for(const value of Object.values(m))if(value instanceof THREE.Texture)value.dispose();m.dispose();}});
describe('bounded whole-gem optics',()=>{
  it('refracts through the whole gem while the polished clearcoat remains smooth',()=>{
    for(const n of [1,2,7,9,10,15]){const m=material(n);
      expect(m.transmission).toBeGreaterThan(.5);expect(m.transmission).toBeLessThanOrEqual(.95);
      expect(m.thickness).toBeCloseTo(TABLE.ballRadius*1.75);expect(m.attenuationDistance).toBe(.24);
      expect(m.ior).toBe(1.72);expect(m.dispersion).toBeLessThanOrEqual(.12);
      expect(m.normalMap?.image).toMatchObject({width:256,height:128});expect(m.clearcoatNormalMap).toBeNull();
      expect(m.transparent).toBe(false);expect(m.opacity).toBe(1);
    }
  });
  it('distributes microplanes across the volume without a closed central core or exterior shards',()=>{
    const g=createGemVolumeFacets(TABLE.ballRadius),p=g.getAttribute('position');expect(p.count/3).toBe(96);
    const radii=Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i).length()/TABLE.ballRadius);
    expect(Math.max(...radii)).toBeLessThan(.91);expect(Math.max(...radii)).toBeGreaterThan(.7);expect(Math.min(...radii)).toBeLessThan(.25);g.dispose();
  });
  it('keeps every yellow topaz body transmissive and faceted through the equator without belt masks',()=>{
    const ruby=material(1),rubyNormals=(ruby.normalMap as THREE.DataTexture).image.data!;
    for(let number=9;number<=15;number++){
      const m=material(number),normals=(m.normalMap as THREE.DataTexture).image.data!;
      expect(m.transmission).toBe(.94);expect(m.roughness).toBe(.115);
      expect(m.transmissionMap).toBeNull();expect(m.roughnessMap).toBeNull();
      expect(m.attenuationColor.getHex()).toBe(0xffe4a3);
      expect(normals).toEqual(rubyNormals);
      // The old belt covered this latitude range with flat [128,128] normals.
      for(let y=43;y<=85;y++){
        const tangentNormals=new Set(Array.from({length:256},(_,x)=>`${normals[(y*256+x)*4]},${normals[(y*256+x)*4+1]}`));
        expect(tangentNormals.size).toBeGreaterThan(12);
      }
    }
  });
  it('uses a varied pearl thin-film thickness map and leaves black eight nontransmissive',()=>{
    const pearl=material(0),black=material(8);expect(pearl.iridescence).toBe(.95);expect(pearl.clearcoatRoughness).toBeGreaterThan(.2);
    expect(pearl.iridescenceThicknessMap?.image).toMatchObject({width:64,height:32});
    const values=(pearl.iridescenceThicknessMap as THREE.DataTexture).image.data!;expect(new Set(values).size).toBeGreaterThan(20);
    expect(pearl.roughness).toBe(.28);expect(pearl.metalness).toBe(.055);expect(pearl.transmission).toBe(0);
    expect(pearl.map?.image).toMatchObject({width:512,height:256});
    expect(black.roughness).toBe(.32);expect(black.metalness).toBe(.025);expect(black.clearcoat).toBe(.38);
    expect(black.clearcoatRoughness).toBe(.3);expect(black.envMapIntensity).toBe(.65);expect(black.transmission).toBe(0);expect(black.normalMap).toBeNull();
  });
  it('accounts for the shared opaque refraction prepass and removes it on fallback',()=>{
    const scene=new THREE.Scene(),geometry=new THREE.SphereGeometry(TABLE.ballRadius,24,16),opaque=new THREE.MeshStandardMaterial(),gem=material(2);
    resources.push(opaque);scene.add(new THREE.Mesh(geometry,opaque),new THREE.Mesh(geometry,gem));
    const high=sceneCost(scene);expect(high.calls).toBe(3);
    setCrystalOpticsQuality(scene,true);const low=sceneCost(scene);expect(low.calls).toBe(2);expect(high.textureBytes-low.textureBytes).toBeGreaterThan(10*1024*1024);
    setCrystalOpticsQuality(scene,false);expect(sceneCost(scene).calls).toBe(3);geometry.dispose();
  });
  it('keeps digital ivory furniture opaque and neutral at every thermal tier',()=>{
    const scene=new THREE.Scene(),g=new THREE.BoxGeometry(),m=new THREE.MeshPhysicalMaterial();resources.push(m);applyFrameOptics(m);
    scene.add(new THREE.Mesh(g,m));
    for(const low of [false,true,false]){setCrystalOpticsQuality(scene,low);expect(m.transmission).toBe(0);expect(m.dispersion).toBe(0);expect(m.iridescence).toBe(0);expect(m.transparent).toBe(false);expect(m.opacity).toBe(1);expect(m.depthWrite).toBe(true);expect(m.color.getHex()).toBe(0xf7efdf);}
    g.dispose();
  });
});
