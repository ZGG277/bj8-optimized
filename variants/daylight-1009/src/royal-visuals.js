/* Readable local enhancements to the supplied 1009 build.
 * Hooks receive its existing Three.js classes; no second engine or network assets.
 */
(function () {
  'use strict';
  const api = {};
  function canvasTexture(T, width, height, paint) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    paint(context,width,height);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }
  function makeCaustic(app,T) {
    const map = canvasTexture(T,128,128,function (context,w,h) {
      const image=context.createImageData(w,h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const u=(x-w/2)/(w/2),v=(y-h/2)/(h/2);
        const r=Math.hypot(u,v),angle=Math.atan2(v,u);
        const ring=Math.exp(-Math.pow((r-.38)/.065,2))*(.35+.65*Math.pow(Math.cos(angle*3+.45),2));
        const rays=Math.exp(-Math.pow(Math.sin(angle*3+.25)*r/.032,2))*Math.exp(-Math.pow((r-.55)/.23,2));
        const glow=Math.exp(-Math.pow(r/.34,2))*.10;
        const i=(y*w+x)*4;
        image.data[i]=image.data[i+1]=image.data[i+2]=255;
        image.data[i+3]=Math.round(Math.min(.68,(ring*.60+rays*.40+glow)) * 255);
      }
      context.putImageData(image,0,0);
    });
    const geometry=new T.PlaneGeometry(.17,.13);geometry.rotateX(-Math.PI/2);
    const material=new T.MeshBasicMaterial({map:map,transparent:true,opacity:.42,depthWrite:false,blending:2,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const mesh=new T.InstancedMesh(geometry,material,16);
    mesh.name='gem-daylight-caustics';mesh.frustumCulled=false;mesh.renderOrder=2;
    for(let i=0;i<16;i++)mesh.setColorAt(i,new T.Color(i===0?0xe4f0ff:i===8?0x2d3455:i<8?0xff1748:0xffc33a));
    const matrix=new T.Matrix4();
    for(let i=0;i<16;i++){matrix.makeScale(0,0,0);mesh.setMatrixAt(i,matrix);}
    sceneAdd(app,mesh);
    app._royalCaustic={mesh:mesh,matrix:matrix};
  }
  function sceneAdd(app,mesh){app.scene.add(mesh);}
  api.frame=function(app){
    const item=app._royalCaustic;
    if(!item)return;
    for(let i=0;i<16;i++){
      const ball=app.ballMeshes[i];
      const visible=ball&&ball.visible&&i!==0&&i!==8&&Math.abs(ball.position.y-.028575)<.003;
      const scale=visible?Math.max(0,ball.scale.x):0;
      item.matrix.makeScale(scale,1,scale);
      item.matrix.setPosition(ball?ball.position.x+.022:0,-.0045,ball?ball.position.z+.030:0);
      item.mesh.setMatrixAt(i,item.matrix);
    }
    item.mesh.instanceMatrix.needsUpdate=true;
  };
  api.light = function (app, T) {
    app._royalThree=T;
    const scene = app.scene;
    scene.environmentIntensity = 0.58;
    scene.environmentRotation.set(0, 0.48, 0);
    app.renderer.toneMappingExposure = 1.0;
    app.keyLight.name = 'lake-morning-sun';
    app.keyLight.color.set(0xfff1db);
    app.keyLight.intensity = 1.20;
    app.keyLight.position.set(-2.8, 4.6, -1.8);
    app.keyLight.shadow.radius = 4;
    scene.traverse(function (item) {
      if (item.isAmbientLight) item.intensity = 0.23;
      if (item.isHemisphereLight) {
        item.color.set(0xe2f2ff);
        item.groundColor.set(0xb9dfd1);
        item.intensity = 0.48;
      }
    });
    const bounce = new T.DirectionalLight(0xe8f6ff, 0.32);
    bounce.name = 'lake-sky-reflection';
    bounce.position.set(2.5, 2.8, 1.5);
    bounce.castShadow = false;
    scene.add(bounce);
    // The original suspended spotlights remain as very gentle jewelry accents.
    app.crystalLighting.traverse(function (item) {
      if (item.isSpotLight) item.intensity *= 0.55;
    });
    makeCaustic(app,T);
    app.renderer.domElement.dataset.visualVersion = 'royal-daylight-1009-v1';
    // Local, opt-in capture handle; never used for gameplay or default UI.
    if (new URLSearchParams(location.search).get('review') === '1') {
      window.__princessReview = app;
      app._royalBudget=function(){return T.stats(app.scene);};
    }
  };
  api.table = function (app) {
    const T=app._royalThree;
    const shellMap=canvasTexture(T,512,256,function(context,w,h){
      const image=context.createImageData(w,h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const u=x/w,v=y/h;
        const warp=2.4*Math.sin(u*6.283+v*3.5)+1.1*Math.sin(v*12.56-u*4.2);
        const band=Math.sin(u*21+v*15+warp),fine=Math.sin(u*50+v*26+warp*2.1);
        const cool=Math.sin(u*12-v*9+warp)*.5+.5;
        const shade=band*11+fine*2;
        const i=(y*w+x)*4;
        image.data[i]=226+shade-cool*4;
        image.data[i+1]=226+shade+cool*2;
        image.data[i+2]=215+shade+cool*13;
        image.data[i+3]=255;
      }
      context.putImageData(image,0,0);
    });
    shellMap.wrapS=shellMap.wrapT=T.RepeatWrapping;
    shellMap.anisotropy=Math.min(4,app.renderer.capabilities.getMaxAnisotropy());
    app.jewelryTable.root.traverse(function (mesh) {
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(function (material) {
        const name = material.name || '';
        if (/Champagne gold/.test(name)) {
          material.color.setRGB(0.76, 0.51, 0.19);
          material.roughness = 0.22;
          material.metalness = 0.88;
          material.clearcoat = 0.75;
          material.clearcoatRoughness = 0.1;
        } else if (/Pearl|shell|inlay/.test(name)) {
          material.map=shellMap;
          material.bumpMap=shellMap;
          material.bumpScale=.00035;
          material.iridescence = 0.28;
          material.iridescenceIOR = 1.32;
          material.iridescenceThicknessRange = [210, 470];
          material.clearcoat = 0.9;
          material.clearcoatRoughness = 0.13;
          material.roughness = 0.24;
        }
        material.needsUpdate = true;
      });
    });
  };
  api.gems = function (app, set) {
    set.materials.forEach(function (material, number) {
      if (!material.isMeshPhysicalMaterial) return;
      material.clearcoat = 1;
      material.clearcoatRoughness = number === 0 ? 0.14 : 0.025;
      if (number === 0) {
        material.roughness = Math.min(material.roughness, 0.3);
        return;
      }
      // Extreme transmission in the supplied model mostly showed the green cloth.
      // Restore gemstone color while keeping a glassy core and readable gold numbers.
      if (material.transmission > 0) {
        material.transmission = number === 8 ? 0.06 : 0.86;
        material.thickness = 0.038;
        material.ior = 1.68;
        material.dispersion = 0.13;
        material.attenuationColor.set(number < 8 ? 0xf24467 : 0xffc93e);
        material.attenuationDistance=.075;
      }
      material.envMap = app.scene.environment;
      material.envMapIntensity = number === 8 ? 0.30 : 0.46;
      if (number === 8) material.color.setRGB(0.48, 0.48, 0.55);
      else if (number >= 9) material.color.setRGB(1, 0.83, 0.42);
      material.emissive.set(number === 8 ? 0x101b30 : number < 8 ? 0x9a0828 : 0xb87b09);
      material.emissiveIntensity = number === 8 ? 0.018 : 0.035;
      material.emissiveMap = material.map;
      material.roughness = Math.min(material.roughness, 0.65);
      material.userData.crystalOptics = {
        transmission: material.transmission,
        dispersion: material.dispersion,
      };
      material.needsUpdate = true;
    });
  };
  globalThis.__princessVisuals = api;
})();
