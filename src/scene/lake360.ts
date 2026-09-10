/*
[INPUT]: Blender Lake360 GLB and existing render callback
[OUTPUT]: Clear shallow lakebed, transparent Fresnel water and directional sky; 10Hz ripples
[POS]: Isolated local visual experiment (?lake360=1); owns assets/timer, no game state
[PROTOCOL]: Keep scene/CLAUDE.md and LAKE360_ACCEPTANCE.md aligned
*/
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import assetUrl from './assets/lake360.glb?url';
import { ownedWorldShell, type WorldShellContext, type WorldShell } from './world-shell';

export const lake360Enabled = () => {
  if (typeof location === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  return params.get('world') === 'lake' || params.get('lake360') === '1';
};
const skyFunction = /* glsl */ `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
vec3 lakeSky(vec3 d){
 d=normalize(d); float h=max(d.y,0.);
 vec3 horizon=vec3(.59,.75,.79), zenith=vec3(.16,.43,.62);
 vec3 col=mix(horizon,zenith,pow(h,.48));
 vec3 sun=normalize(vec3(-.65,.19,-.7)); float sd=max(dot(d,sun),0.);
 col+=vec3(.24,.16,.08)*pow(sd,18.);
 col+=vec3(.45,.30,.15)*smoothstep(.9994,.9998,sd);
 vec2 p=d.xz/(h+.22)*2.4;
 float n=noise2(p)*.72+noise2(p*2.3+7.)*.28;
 float cloud=smoothstep(.51,.72,n)*smoothstep(.015,.16,h)*(1.-smoothstep(.7,1.,h));
 col=mix(col,vec3(.83,.85,.80),cloud*.63);
 return mix(vec3(.28,.52,.58),col,smoothstep(-.035,.025,d.y));
}`;

export function createLake360(context: WorldShellContext): WorldShell {
 const root=new THREE.Group(); root.name='world-shell-lake360';
 const owner=ownedWorldShell(root); let disposed=false;
 const time={value:0}; const born=performance.now();
 const ready=new GLTFLoader().loadAsync(assetUrl).then(gltf=>{
   const model=gltf.scene;
   model.traverse(object=>{
     if (!(object instanceof THREE.Mesh)) return;
     const old=Array.isArray(object.material)?object.material:[object.material]; old.forEach(m=>m.dispose());
     const water=object.name==='Lake360_WaterMesh';
     const bed=object.name==='Lake360_Lakebed';
     object.material=new THREE.ShaderMaterial({
       name:water?'lake360-clear-water':bed?'lake360-sand-and-pebbles':'lake360-directional-sky',
       side:water||bed?THREE.FrontSide:THREE.BackSide,
       // The sand shelf and stones really render beneath the water, in one extra batch.
       transparent:water, depthWrite:bed, fog:false, vertexColors:bed,
       uniforms:{time},
       vertexShader: `varying vec3 worldPos; varying vec3 bedColor; varying vec3 worldNormal;
         void main(){vec4 p=modelMatrix*vec4(position,1.); worldPos=p.xyz;
          worldNormal=normalize(mat3(modelMatrix)*normal); bedColor=vec3(1.);
          #ifdef USE_COLOR
           bedColor=color.rgb;
          #endif
          gl_Position=projectionMatrix*viewMatrix*p; }`,
       fragmentShader: water ? /* glsl */ `
         uniform float time; varying vec3 worldPos; ${skyFunction}
         void main(){
          vec2 p=worldPos.xz; float t=time;
          float dist=length(cameraPosition.xz-p);
          // Warped, incommensurate wavelengths avoid parallel stripes and a repeating grid.
          float warp=noise2(p*.34+vec2(t*.026,-t*.018))*2.4;
          vec2 slope=vec2(
           sin(dot(p,vec2(1.7,.83))-t*.56+warp)*.023+
           sin(dot(p,vec2(-3.1,4.2))+t*.43-warp)*.012+
           sin(dot(p,vec2(10.3,7.7))-t*.91+warp*1.4)*.005,
           cos(dot(p,vec2(.73,2.1))-t*.47-warp)*.021+
           cos(dot(p,vec2(4.7,-2.3))+t*.38+warp)*.010+
           cos(dot(p,vec2(-8.6,12.4))+t*.78-warp)*.004);
          slope*=1./(1.+dist*.045);
          vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
          vec3 eye=normalize(cameraPosition-worldPos);
          vec3 reflected=reflect(-eye,normal);
          float facing=max(dot(eye,normal),.025);
          float fresnel=.0204+.9796*pow(1.-facing,5.);
          float radius=length(p);
          float depth=.46+.026*radius+.0025*radius*radius;
          float transmission=exp(-depth*.24/max(eye.y,.045));
          // Shelf ends at 55m; conceal its outer edge before it can appear at grazing angles.
          transmission*=1.-smoothstep(32.,48.,radius);
          float alpha=1.-(1.-fresnel)*transmission;
          vec3 reflectedSky=lakeSky(reflected);
          vec3 q=worldPos+reflected*((-.18-worldPos.y)/max(reflected.y,.001));
          float silhouette=(1.-smoothstep(.66,.94,abs(q.x)))*(1.-smoothstep(1.27,1.6,abs(q.z)));
          reflectedSky=mix(reflectedSky,vec3(.16,.24,.24),silhouette*.22*smoothstep(.02,.18,reflected.y));
          vec3 scatter=mix(vec3(.12,.46,.43),vec3(.09,.32,.39),smoothstep(.5,4.,depth));
          vec3 color=(reflectedSky*fresnel+scatter*(1.-fresnel)*(1.-transmission))/max(alpha,.001);
          color=mix(color,lakeSky(vec3(reflected.x,0.,reflected.z)),smoothstep(90.,400.,dist));
          gl_FragColor=vec4(color,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
         }` : bed ? /* glsl */ `
         uniform float time; varying vec3 worldPos; varying vec3 bedColor; varying vec3 worldNormal; ${skyFunction}
         void main(){
          vec2 p=worldPos.xz;
          float t=time;
          // Refracted-light drift is analytic; no framebuffer copy or second scene render.
          vec2 drift=vec2(sin(p.y*2.4+t*.36),cos(p.x*2.1-t*.31))*.035;
          vec2 q=p+drift;
          float broad=noise2(q*.62);
          float sandWarp=noise2(q*1.3)*2.7+noise2(q*.29)*5.;
          float ridges=.5+.5*sin(q.x*15.7+q.y*5.2+sandWarp);
          float sand=1.+(broad-.5)*.33+(ridges-.5)*.11;
          float grain=noise2(q*29.)-.5;
          float isSand=smoothstep(.44,.55,bedColor.r);
          vec3 color=bedColor*(sand+grain*.05*isSand);
          // Two crossed, warped light families make soft broken caustic cells, not a grid.
          float warp=noise2(q*1.8+vec2(t*.06,-t*.045))*3.;
          float c1=sin(q.x*6.4+q.y*2.3+warp+t*.48);
          float c2=sin(q.x*-2.8+q.y*7.1-warp-t*.39);
          float caustic=pow(max(0.,1.-abs(c1+c2)*.72),9.);
          float depth=max(-.76-worldPos.y,.1);
          color+=vec3(.18,.23,.16)*caustic*exp(-depth*.2);
          // Broad moss/silt patches stay sparse; relief and actual stones provide depth cues.
          float silt=smoothstep(.67,.85,noise2(q*.8+vec2(11.,-8.)))*isSand;
          color=mix(color,vec3(.31,.44,.31),silt*.32);
          float diffuse=.76+.24*max(dot(normalize(worldNormal),normalize(vec3(-.4,1.,-.3))),0.);
          color*=diffuse;
          float tableShade=(1.-smoothstep(.7,1.12,abs(p.x+.12)))*(1.-smoothstep(1.3,1.7,abs(p.y-.08)));
          color*=1.-tableShade*.16;
          gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
         }` : `varying vec3 worldPos; ${skyFunction} void main(){gl_FragColor=vec4(lakeSky(worldPos-cameraPosition),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
         }`,
     });
     object.raycast=()=>{}; object.castShadow=false; object.receiveShadow=false;
     object.renderOrder=water?-80:bed?-90:-100;
   });
   if(disposed){ownedWorldShell(model).dispose(); return false;}
   root.add(model);
   root.userData.assetState='ready'; context.requestRender(); return true;
 }).catch(error=>{root.userData.error=String(error); return false;});
 root.userData.assetState='loading'; root.userData.ripples=true; root.userData.clearWater=true;
 // Existing renderer coalesces requests; no new rAF/physics clock. Static preference stops ticks.
 const timer=setInterval(()=>{
   if(disposed || document.hidden || !root.userData.ripples || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
   time.value=(performance.now()-born)/1000; context.requestRender();
 },100);
 return {root,ready,dispose(){disposed=true; clearInterval(timer); owner.dispose();}};
}
