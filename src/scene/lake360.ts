/*
[INPUT]: Blender Lake360 GLB and existing render callback
[OUTPUT]: Full spherical sky and authored lake with analytic sky reflection; optional 10Hz ripples
[POS]: Isolated local visual experiment (?lake360=1); owns assets/timer, no game state
[PROTOCOL]: Keep scene/CLAUDE.md and LAKE360_ACCEPTANCE.md aligned
*/
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import assetUrl from './assets/lake360.glb?url';
import { ownedWorldShell, type WorldShellContext, type WorldShell } from './world-shell';

export const lake360Enabled = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('lake360') === '1';
const skyFunction = /* glsl */ `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
vec3 lakeSky(vec3 d){
 d=normalize(d); float h=max(d.y,0.);
 vec3 horizon=vec3(.47,.62,.67), zenith=vec3(.075,.255,.43);
 vec3 col=mix(horizon,zenith,pow(h,.48));
 vec3 sun=normalize(vec3(-.65,.19,-.7)); float sd=max(dot(d,sun),0.);
 col+=vec3(.24,.16,.08)*pow(sd,18.);
 col+=vec3(.45,.30,.15)*smoothstep(.9994,.9998,sd);
 vec2 p=d.xz/(h+.22)*2.4;
 float n=noise2(p)*.72+noise2(p*2.3+7.)*.28;
 float cloud=smoothstep(.51,.72,n)*smoothstep(.015,.16,h)*(1.-smoothstep(.7,1.,h));
 col=mix(col,vec3(.83,.85,.80),cloud*.63);
 return mix(vec3(.25,.43,.50),col,smoothstep(-.035,.025,d.y));
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
     object.material=new THREE.ShaderMaterial({
       name:water?'lake360-reflective-water':'lake360-directional-sky',
       side:water?THREE.DoubleSide:THREE.BackSide, depthWrite:water, fog:false,
       uniforms:{time},
       vertexShader: `varying vec3 worldPos; void main(){ vec4 p=modelMatrix*vec4(position,1.); worldPos=p.xyz; gl_Position=projectionMatrix*viewMatrix*p; }`,
       fragmentShader: water ? /* glsl */ `
         uniform float time; varying vec3 worldPos; ${skyFunction}
         void main(){
          vec2 p=worldPos.xz; float t=time;
          float dist=length(cameraPosition.xz-p); float atten=1./(1.+dist*.065);
          vec2 slope=vec2(cos(p.x*2.8+p.y*1.1-t*.65)*.018+cos(p.x*7.-p.y*3.+t*.42)*.007,
           cos(p.x*1.4+p.y*3.9-t*.5)*.017+cos(p.x*4.+p.y*6.+t*.32)*.006)*atten;
          vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
          vec3 eye=normalize(cameraPosition-worldPos); vec3 reflected=reflect(-eye,normal);
          float fresnel=.22+.78*pow(1.-max(dot(eye,normal),0.),4.);
          vec3 color=mix(vec3(.11,.28,.34),lakeSky(reflected),fresnel);
          // Dark, softened table silhouette anchors the feet without a ground platform.
          vec3 q=worldPos+reflected*((-.18-worldPos.y)/max(reflected.y,.001));
          float shadow=(1.-smoothstep(.66,.88,abs(q.x)))*(1.-smoothstep(1.27,1.52,abs(q.z)));
          color=mix(color,vec3(.13,.20,.20),shadow*.34*smoothstep(.02,.18,reflected.y));
          color=mix(color,lakeSky(vec3(reflected.x,.0,reflected.z)),smoothstep(90.,400.,dist));
          gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
         }` : `varying vec3 worldPos; ${skyFunction} void main(){gl_FragColor=vec4(lakeSky(worldPos-cameraPosition),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
         }`,
     });
     object.raycast=()=>{}; object.castShadow=false; object.receiveShadow=false;
     object.renderOrder=water?-90:-100;
   });
   if(disposed){ownedWorldShell(model).dispose(); return false;}
   root.add(model);
   root.userData.assetState='ready'; context.requestRender(); return true;
 }).catch(error=>{root.userData.error=String(error); return false;});
 root.userData.assetState='loading'; root.userData.ripples=true;
 // Existing renderer coalesces requests; no new rAF/physics clock. Static preference stops ticks.
 const timer=setInterval(()=>{
   if(disposed || document.hidden || !root.userData.ripples || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
   time.value=(performance.now()-born)/1000; context.requestRender();
 },100);
 return {root,ready,dispose(){disposed=true; clearInterval(timer); owner.dispose();}};
}
