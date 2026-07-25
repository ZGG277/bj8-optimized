/*
[INPUT]: 依赖 physics 物理世界快照、textures 程序化贴图与 Three.js；不读取 React 状态
[OUTPUT]: 对外提供场景渲染、双视角相机、瞄准辅助、合法目标环、球杆动画、自由球幽灵与 screenToTable 映射
[POS]: 渲染适配层，只消费世界快照；不得决定球局结果，不得改写物理世界
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { TABLE, type BilliardsWorld } from './physics';
import {
  makeClothMaps,
  makeWoodTexture,
  makeLeatherTexture,
  makeBallTexture,
  makeCueBallTexture,
} from './textures';

const R = TABLE.ballRadius;
const W = TABLE.width;
const L = TABLE.length;
const RAIL_H = 0.05;
const RAIL_W = 0.085;
const CUSHION_H = 0.038;
const CUSHION_W = 0.048;
const CORNER_R = TABLE.cornerPocketRadius;
const SIDE_R = TABLE.sidePocketRadius;

const POCKET_POS: [number, number][] = [
  [-W / 2, -L / 2], [W / 2, -L / 2],
  [-W / 2, 0], [W / 2, 0],
  [-W / 2, L / 2], [W / 2, L / 2],
];

type DropAnim = {
  t: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
};

export class Scene3D {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  element: HTMLElement;

  private ballMeshes: THREE.Mesh[] = [];
  private ballQuats: THREE.Quaternion[] = [];
  private dropAnims = new Map<number, DropAnim>();
  private cueGroup = new THREE.Group();
  private tableGroup = new THREE.Group();
  private aimGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private aimAngle = 0;
  private cameraAngle = 0;
  private viewMode: 'first' | 'overhead' = 'first';
  private phase = 'intro';

  private targetCameraPos = new THREE.Vector3();
  private targetLookAt = new THREE.Vector3();
  private smoothLookAt = new THREE.Vector3();
  private cuePull = 0;
  private clock = new THREE.Clock();
  private lastSyncTime = 0;
  private syncDt = 1 / 60;
  private lastWorld: BilliardsWorld | null = null;

  private aimLine!: THREE.Line;
  private objLine!: THREE.Line;
  private tanLine!: THREE.Line;
  private ghostRing!: THREE.Mesh;
  private lampGroup?: THREE.Group;
  private ghostCue!: THREE.Mesh;
  private targetRings: THREE.Mesh[] = [];
  private legalTargets = new Set<number>();
  private spin: { x: number; y: number } = { x: 0, y: 0 };
  /** 出杆动画：拉杆位置 → 触球点（加速）→ 送杆（减速），触球瞬间回调 onContact */
  private strikeAnim: {
    t: number;
    dur1: number;
    dur2: number;
    from: THREE.Vector3;
    contact: THREE.Vector3;
    through: THREE.Vector3;
    fired: boolean;
    onContact?: () => void;
  } | null = null;

  private animationId = 0;
  private running = false;

  constructor(element: HTMLElement) {
    this.element = element;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090a);
    this.scene.fog = new THREE.Fog(0x07090a, 4, 11);

    this.camera = new THREE.PerspectiveCamera(46, element.clientWidth / element.clientHeight, 0.01, 60);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(element.clientWidth, element.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    element.appendChild(this.renderer.domElement);

    // 环境反射：程序化房间，给球体真实高光
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    RectAreaLightUniformsLib.init();
    this.setupLights();
    this.buildTable();
    this.buildBalls();
    this.buildCue();
    this.buildAimGuide();

    this.scene.add(this.tableGroup);
    this.scene.add(this.aimGroup);

    const cueZ = TABLE.length * 0.25;
    this.targetCameraPos.set(0, 0.26, cueZ + 0.5);
    this.targetLookAt.set(0, 0.025, cueZ - 0.4);
    this.camera.position.copy(this.targetCameraPos);
    this.smoothLookAt.copy(this.targetLookAt);
    this.camera.lookAt(this.smoothLookAt);

    window.addEventListener('resize', this.handleResize);
  }

  private setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.07));

    // 主光：略偏一侧，产生长影子
    const key = new THREE.DirectionalLight(0xfff2dd, 2.6);
    key.position.set(0.6, 2.6, 0.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 6;
    key.shadow.camera.left = -1.4;
    key.shadow.camera.right = 1.4;
    key.shadow.camera.top = 2.6;
    key.shadow.camera.bottom = -2.6;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 3;
    key.shadow.camera.updateProjectionMatrix();
    this.scene.add(key);

    // 台球灯：桌面上方的矩形面光，形成绒布高光带
    const rect = new THREE.RectAreaLight(0xffe6c0, 1.8, 1.3, 2.2);
    rect.position.set(0, 1.45, 0);
    rect.lookAt(0, 0, 0);
    this.scene.add(rect);

    // 冷色轮廓补光
    const rim = new THREE.PointLight(0xa8cfff, 0.35, 8);
    rim.position.set(-1.8, 1.2, -1.6);
    this.scene.add(rim);
  }

  private buildTable() {
    const clothMaps = makeClothMaps();
    const woodTex = makeWoodTexture();
    const leatherTex = makeLeatherTexture();

    // ---- 呢面：真实挖洞的台面（任何视角都能看到袋口纵深） ----
    const clothShape = new THREE.Shape();
    clothShape.moveTo(-W / 2, -L / 2);
    clothShape.lineTo(W / 2, -L / 2);
    clothShape.lineTo(W / 2, L / 2);
    clothShape.lineTo(-W / 2, L / 2);
    clothShape.closePath();
    for (const [px, pz] of POCKET_POS) {
      const isSide = pz === 0;
      const r = (isSide ? SIDE_R : CORNER_R) * 0.99;
      const hole = new THREE.Path();
      hole.absarc(px, -pz, r, 0, Math.PI * 2, true); // shape 坐标 y 对应 -z
      clothShape.holes.push(hole);
    }
    const clothGeo = new THREE.ShapeGeometry(clothShape, 24);
    clothGeo.rotateX(-Math.PI / 2);
    const clothMat = new THREE.MeshPhysicalMaterial({
      map: clothMaps.map,
      normalMap: clothMaps.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: clothMaps.roughnessMap,
      roughness: 1.0,
      metalness: 0.0,
      sheen: 0.35,
      sheenRoughness: 0.65,
      sheenColor: new THREE.Color(0x6fae8e),
      envMapIntensity: 0.15,
    });
    const cloth = new THREE.Mesh(clothGeo, clothMat);
    cloth.receiveShadow = true;
    this.tableGroup.add(cloth);

    // 呢面包边（台呢向下包住的侧边）
    const wrapMat = new THREE.MeshStandardMaterial({ color: 0x0b5c40, roughness: 0.95 });
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.012, 0.05, L + 0.012), wrapMat);
    wrap.position.y = -0.027;
    this.tableGroup.add(wrap);

    // ---- 木质台帮 ----
    woodTex.repeat.set(2, 0.5);
    const woodMat = new THREE.MeshPhysicalMaterial({
      map: woodTex,
      color: 0x8a6547,
      roughness: 0.5,
      metalness: 0.0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.3,
    });

    const railJoin = (CUSHION_W + RAIL_W) * 2;
    const railLong = new THREE.BoxGeometry(RAIL_W, RAIL_H, L + railJoin);
    const railShort = new THREE.BoxGeometry(W + railJoin, RAIL_H, RAIL_W);
    // 台帮内缘贴着库边外侧（库边嵌在台帮与台面之间，绿色斜坡可见）
    const railOffset = CUSHION_W + RAIL_W / 2;
    const rails: THREE.Mesh[] = [];
    for (const [geo, x, z] of [
      [railLong, -(W / 2 + railOffset), 0],
      [railLong, W / 2 + railOffset, 0],
      [railShort, 0, -(L / 2 + railOffset)],
      [railShort, 0, L / 2 + railOffset],
    ] as const) {
      const mesh = new THREE.Mesh(geo, woodMat);
      mesh.position.set(x, RAIL_H / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.tableGroup.add(mesh);
      rails.push(mesh);
    }

    // ---- 库边（斜坡剖面 + 袋口角形衬垫） ----
    const cushionMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f6a4a,
      roughness: 0.85,
      sheen: 0.5,
      sheenColor: new THREE.Color(0x88c8a8),
      sheenRoughness: 0.6,
    });
    // 梯形剖面：内侧斜面（指向台面）
    const profile = new THREE.Shape();
    profile.moveTo(0, 0);
    profile.lineTo(CUSHION_W, 0);
    profile.lineTo(CUSHION_W, RAIL_H);
    profile.lineTo(CUSHION_W - 0.012, CUSHION_H);
    profile.lineTo(0, CUSHION_H - 0.01);
    profile.closePath();

    const cornerGap = CORNER_R * 0.88;
    const sideGap = SIDE_R * 0.82;

    const makeCushionSeg = (length: number) => {
      // 剖面在 XY 平面（x: 内侧0→外侧CUSHION_W，y: 高），挤出沿 +z 方向 length
      return new THREE.ExtrudeGeometry(profile, { depth: length, bevelEnabled: false });
    };

    const addCushion = (length: number, cx: number, cz: number, rotY: number) => {
      const mesh = new THREE.Mesh(makeCushionSeg(length), cushionMat);
      mesh.rotation.y = rotY;
      // 段中心对齐（挤出方向经 rotY 旋转后的单位向量）
      const dir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, rotY, 0));
      mesh.position.set(cx - dir.x * length / 2, 0, cz - dir.z * length / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.tableGroup.add(mesh);
      return mesh;
    };

    // 左库(x=-W/2)：rotY=π 使剖面向 -x 外侧延伸；右库 rotY=0 向 +x 外侧
    const longSegLen = L / 2 - cornerGap - sideGap;
    for (const side of [-1, 1]) {
      const x = side * (W / 2 + 0.001);
      const rotY = side === -1 ? Math.PI : 0;
      const z1 = -(L / 2) + cornerGap + longSegLen / 2;
      const z2 = sideGap + longSegLen / 2;
      addCushion(longSegLen, x, z1, rotY);
      addCushion(longSegLen, x, z2, rotY);
    }
    // 底库(z=-L/2)：rotY=π/2 剖面向 -z 外侧；顶库 rotY=-π/2 向 +z
    const shortSegLen = W - cornerGap * 2;
    for (const side of [-1, 1]) {
      const z = side * (L / 2 + 0.001);
      addCushion(shortSegLen, 0, z, side === -1 ? Math.PI / 2 : -Math.PI / 2);
    }

    // ---- 袋口 ----
    const linerMat = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 1, side: THREE.BackSide });
    const leatherMat = new THREE.MeshPhysicalMaterial({
      map: leatherTex,
      color: 0x8a6844,
      roughness: 0.75,
      clearcoat: 0.25,
      clearcoatRoughness: 0.5,
    });
    const brassMat = new THREE.MeshPhysicalMaterial({
      color: 0xb08d3e,
      metalness: 0.9,
      roughness: 0.32,
      envMapIntensity: 1.2,
    });

    for (const [px, pz] of POCKET_POS) {
      const isSide = pz === 0;
      const pr = isSide ? SIDE_R : CORNER_R;
      const group = new THREE.Group();
      group.position.set(px, 0, pz);
      // 袋口朝外方向（朝向库边/台帮一侧）的角度
      const outAngle = Math.atan2(pz, px);

      // 袋内衬（内壁）：只到呢面以下，洞口上方由角衬和台帮遮蔽
      const liner = new THREE.Mesh(
        new THREE.CylinderGeometry(pr * 0.98, pr * 0.7, 0.16, 28, 1, true),
        linerMat
      );
      liner.position.y = -0.08;
      group.add(liner);
      // 袋底
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(pr * 0.72, 28), new THREE.MeshStandardMaterial({ color: 0x020202 }));
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = -0.158;
      group.add(bottom);
      // 皮口唇边：中袋不用圆环（会读成"马蹄铁"），靠角衬+黑洞收边；
      // 角袋留一小段朝外的唇边，隐在铜饰板下
      if (!isSide) {
        const lipArc = Math.PI * 0.85;
        const lipGeo = new THREE.TorusGeometry(pr * 0.9, 0.0075, 10, 36, lipArc);
        lipGeo.rotateZ(outAngle - lipArc / 2); // 弧中心对准袋口外侧
        const rim = new THREE.Mesh(lipGeo, leatherMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.0015;
        rim.castShadow = true;
        group.add(rim);
      }

      if (!isSide) {
        // 角袋铜饰板：盖板贴住台帮顶 + 向下延伸的立边裙板，形成金属袋口压板
        const capArc = Math.PI * 0.7;
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(pr * 1.05, pr * 1.15, 0.012, 24, 1, false,
          Math.atan2(-pz, -px) - capArc / 2, capArc), brassMat);
        cap.position.y = RAIL_H + 0.001;
        group.add(cap);
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(pr * 1.06, pr * 1.1, 0.016, 24, 1, true,
          Math.atan2(-pz, -px) - capArc / 2, capArc), brassMat);
        skirt.position.y = RAIL_H - 0.007;
        group.add(skirt);
      }

      // 袋口上方内阴影环（增强洞口纵深感）；中袋洞口半藏在台帮下，
      // 平面的阴影环会在呢面上读成深色"C 形"，只对角袋使用
      if (!isSide) {
        const shade = new THREE.Mesh(
          new THREE.RingGeometry(pr * 0.55, pr * 0.97, 28),
          new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
        );
        shade.rotation.x = -Math.PI / 2;
        shade.position.y = 0.0015;
        group.add(shade);
      }

      this.tableGroup.add(group);
    }

    // ---- 袋口角衬（jaws）：楔形块，斜面朝向袋口，与库边同高同质 ----
    // 真实球台的袋口两侧是库边尽头的斜切角衬，不是方形块。
    // 这里用顶视三角形挤出成立柱：直角顶点在库边尽头内侧，
    // 斜边（hypotenuse）形成袋口漏斗面。
    const jawMat = cushionMat.clone();
    jawMat.side = THREE.DoubleSide; // 部分朝向的形状为顺时针，防止斜面被剔除
    const jawDepth = CUSHION_W;     // 与库边同宽
    const addJaw = (pts: [number, number][]) => {
      const shape = new THREE.Shape();
      shape.moveTo(pts[0][0], -pts[0][1]); // shape.y 与 world.z 反号（rotateX(-90°) 映射）
      for (const [x, z] of pts.slice(1)) shape.lineTo(x, -z);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: CUSHION_H, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2); // 挤出方向转为 +y 高度
      const mesh = new THREE.Mesh(geo, jawMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.tableGroup.add(mesh);
    };

    for (const [px, pz] of POCKET_POS) {
      const isSide = pz === 0;
      const sx = Math.sign(px);
      if (isSide) {
        // 中袋：库边沿 z 走向，袋口两侧各一块楔形角衬
        for (const dz of [-1, 1]) {
          const A: [number, number] = [sx * W / 2, dz * sideGap]; // 库边尽头内角
          addJaw([A, [A[0], A[1] - dz * SIDE_R * 0.95], [A[0] + sx * jawDepth, A[1]]]);
        }
      } else {
        const sz = Math.sign(pz);
        // 角袋：沿 x 库边的角衬（斜面朝袋口）
        const AX: [number, number] = [sx * (W / 2 - cornerGap), sz * L / 2];
        addJaw([AX, [AX[0] + sx * CORNER_R * 0.95, AX[1]], [AX[0], AX[1] + sz * jawDepth]]);
        // 角袋：沿 z 库边的角衬
        const AZ: [number, number] = [sx * W / 2, sz * (L / 2 - cornerGap)];
        addJaw([AZ, [AZ[0], AZ[1] + sz * CORNER_R * 0.95], [AZ[0] + sx * jawDepth, AZ[1]]]);
      }
    }

    // ---- 台裙与桌腿 ----
    const skirtMat = new THREE.MeshPhysicalMaterial({ map: woodTex, color: 0x6b4630, roughness: 0.5, clearcoat: 0.3 });
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(W + RAIL_W * 1.4, 0.16, L + RAIL_W * 1.4), skirtMat);
    skirt.position.y = -0.11;
    this.tableGroup.add(skirt);

    const legMat = new THREE.MeshPhysicalMaterial({ map: woodTex, color: 0x50331f, roughness: 0.55 });
    const legGeo = new THREE.CylinderGeometry(0.055, 0.075, 0.62, 12);
    for (const [lx, lz] of [
      [-(W / 2 + 0.02), -(L / 2 - 0.15)], [W / 2 + 0.02, -(L / 2 - 0.15)],
      [-(W / 2 + 0.02), L / 2 - 0.15], [W / 2 + 0.02, L / 2 - 0.15],
    ]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, -0.5, lz);
      leg.castShadow = true;
      this.tableGroup.add(leg);
    }

    // ---- 吊灯 ----
    const lampGroup = new THREE.Group();
    this.lampGroup = lampGroup;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    cord.position.y = 2.4;
    lampGroup.add(cord);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 1.5), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.4 }));
    bar.position.y = 2.0;
    lampGroup.add(bar);
    const shadeMat = new THREE.MeshPhysicalMaterial({ color: 0x1d4028, metalness: 0.4, roughness: 0.35, side: THREE.DoubleSide });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
    for (const sz of [-0.55, 0, 0.55]) {
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.13, 24, 1, true), shadeMat);
      shade.position.set(0, 1.95, sz);
      lampGroup.add(shade);
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), glowMat);
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(0, 1.9, sz);
      lampGroup.add(bulb);
    }
    this.tableGroup.add(lampGroup);

    // ---- 地板 ----
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x101312, roughness: 0.92 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.82;
    floor.receiveShadow = true;
    this.tableGroup.add(floor);
  }

  private buildBalls() {
    const geometry = new THREE.SphereGeometry(R, 48, 32);
    for (let i = 0; i <= 15; i++) {
      const tex = i === 0 ? makeCueBallTexture() : makeBallTexture(i, i >= 9 ? 'stripe' : 'solid');
      const mat = new THREE.MeshPhysicalMaterial({
        map: tex,
        roughness: 0.16,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        envMapIntensity: 0.5,
      });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      this.ballMeshes[i] = mesh;
      this.ballQuats[i] = new THREE.Quaternion();
    }
  }

  private buildCue() {
    const group = this.cueGroup;

    // 前节（枫木，锥形）
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0105, 0.75, 20),
      new THREE.MeshPhysicalMaterial({ color: 0xd8b184, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 })
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.395;
    shaft.castShadow = true;
    group.add(shaft);

    // 皮头 + 先角
    const ferrule = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, 0.02, 16),
      new THREE.MeshPhysicalMaterial({ color: 0xe8e2d0, roughness: 0.4 })
    );
    ferrule.rotation.x = Math.PI / 2;
    ferrule.position.z = 0.03;
    group.add(ferrule);
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0058, 0.012, 16),
      new THREE.MeshStandardMaterial({ color: 0x3a6d94, roughness: 0.85 })
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.012;
    group.add(tip);

    // 后把（深色缠线握把）
    const butt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0115, 0.0145, 0.62, 20),
      new THREE.MeshPhysicalMaterial({ color: 0x2a1a10, roughness: 0.45, clearcoat: 0.5 })
    );
    butt.rotation.x = Math.PI / 2;
    butt.position.z = 1.08;
    butt.castShadow = true;
    group.add(butt);

    // 中段装饰环
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0112, 0.0112, 0.03, 20),
      new THREE.MeshPhysicalMaterial({ color: 0xc8c0b0, metalness: 0.7, roughness: 0.3 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.z = 0.78;
    group.add(ring);

    group.visible = false;
    this.scene.add(group);
  }

  private buildAimGuide() {
    const mkLine = (color: number, opacity: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineDashedMaterial({ color, dashSize: 0.03, gapSize: 0.02, transparent: true, opacity });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      this.aimGroup.add(line);
      return line;
    };
    this.aimLine = mkLine(0xffffff, 0.75);
    this.objLine = mkLine(0xffd24d, 0.9);
    this.tanLine = mkLine(0x7db4ff, 0.5);

    this.ghostRing = new THREE.Mesh(
      new THREE.RingGeometry(R * 0.72, R * 0.98, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    this.ghostRing.rotation.x = -Math.PI / 2;
    this.ghostRing.visible = false;
    this.aimGroup.add(this.ghostRing);

    // 合法目标高亮环（16 颗球各一个，按回合显隐）
    const ringGeo = new THREE.RingGeometry(R * 1.12, R * 1.4, 28);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x9fe8c0,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (let i = 0; i <= 15; i++) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.0025;
      ring.visible = false;
      this.aimGroup.add(ring);
      this.targetRings[i] = ring;
    }

    // 自由球放置幽灵白球
    this.ghostCue = new THREE.Mesh(
      new THREE.SphereGeometry(R, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false })
    );
    this.ghostCue.visible = false;
    this.scene.add(this.ghostCue);
  }

  setGhostCue(x: number, z: number, show: boolean) {
    this.ghostCue.visible = show;
    if (show) {
      this.ghostCue.position.set(
        Math.min(W / 2 - R, Math.max(-W / 2 + R, x)),
        R,
        Math.min(L / 2 - R, Math.max(-L / 2 + R, z))
      );
    }
  }

  setSpin(spin: { x: number; y: number }) {
    this.spin = spin;
  }

  setLegalTargets(numbers: number[]) {
    this.legalTargets = new Set(numbers);
  }

  legalTargetCount(): number {
    return this.legalTargets.size;
  }

  /** 调试用:球杆当前是否可见 */
  cueGroupVisible(): boolean {
    return this.cueGroup.visible;
  }

  /** 调试用:皮头(球杆原点)到白球的水平距离 */
  debugTipGap(): number | null {
    const c = this.lastWorld?.balls[0];
    if (!c) return null;
    const p = this.cueGroup.position;
    return Math.hypot(p.x - c.x, p.z - c.z);
  }

  /**
   * 出杆动画：球杆从拉杆位置加速冲向白球，皮头接触球面瞬间触发 onContact，
   * 随后短暂送杆再收起。保证视觉上"杆头真的打到球"，且球在接触瞬间才开始动。
   */
  triggerStrike(opts?: {
    cueX?: number;
    cueZ?: number;
    angle?: number;
    power?: number;
    spin?: { x: number; y: number };
    onContact?: () => void;
  }) {
    const cueBall = this.lastWorld?.balls[0];
    const cueX = opts?.cueX ?? cueBall?.x;
    const cueZ = opts?.cueZ ?? cueBall?.z;
    if (cueX == null || cueZ == null) return;
    const angle = opts?.angle ?? this.cueGroup.rotation.y;
    const spin = opts?.spin ?? this.spin;
    const power = opts?.power ?? 20;

    // 击球方向（与瞄准一致，水平分量）
    const dx = Math.sin(angle);
    const dz = -Math.cos(angle);
    // 加塞横向偏移（与 update() 中球杆定位公式一致）
    const side = -spin.y * R * 0.55;
    const px = Math.cos(angle) * side;
    const pz = Math.sin(angle) * side;
    const y = R + 0.012 + spin.x * R * 0.25;

    // 触球点：皮头贴在球面上（留 2mm 间隙）
    const contact = new THREE.Vector3(
      cueX - dx * (R + 0.002) + px,
      y,
      cueZ - dz * (R + 0.002) + pz
    );
    // 送杆终点：顺势穿过原球位一小段
    const through = contact.clone().addScaledVector(new THREE.Vector3(dx, 0, dz), R * 0.55);
    // 起点：玩家出杆用当前拉杆位置；AI 出杆按力度解析一个拉杆位
    const pull = 0.02 + power * 0.0032;
    const analyticFrom = new THREE.Vector3(contact.x - dx * pull, y, contact.z - dz * pull);
    const from = this.cueGroup.visible ? this.cueGroup.position.clone() : analyticFrom;

    this.cueGroup.rotation.set(-0.1, angle, 0, 'YXZ');
    // 加速时长随拉杆距离变化：轻杆快、重杆行程长一点
    const dist = from.distanceTo(contact);
    const dur1 = Math.min(0.22, Math.max(0.08, dist * 0.55));
    const anim: NonNullable<Scene3D['strikeAnim']> = {
      t: 0,
      dur1,
      dur2: 0.13,
      from,
      contact,
      through,
      fired: false,
      onContact: opts?.onContact,
    };
    this.strikeAnim = anim;
    this.cueGroup.visible = true;
    // 兜底：rAF 被浏览器节流（后台标签页）时，按墙钟时间到点直接触球，
    // 保证"松手必出杆"，动画只是表现层
    setTimeout(() => {
      if (this.strikeAnim === anim && !anim.fired) {
        this.cueGroup.position.copy(anim.contact);
        this.cueGroup.visible = false;
        this.strikeAnim = null;
        anim.fired = true;
        anim.onContact?.();
      }
    }, dur1 * 1000 + 100);
  }

  setViewMode(mode: 'first' | 'overhead') {
    this.viewMode = mode;
    // 俯视时吊灯会挡住台面，隐藏
    if (this.lampGroup) this.lampGroup.visible = mode !== 'overhead';
  }

  setCameraAngle(angle: number) {
    this.cameraAngle = angle;
  }

  setAim(angle: number) {
    this.aimAngle = angle;
  }

  /** 瞄准总角度（含第一人称相机旋转） */
  private totalAim(): number {
    return this.viewMode === 'first' ? this.aimAngle + this.cameraAngle : this.aimAngle;
  }

  sync(world: BilliardsWorld) {
    this.lastWorld = world;
    const now = performance.now();
    this.syncDt = this.lastSyncTime ? Math.min(0.05, (now - this.lastSyncTime) / 1000) : 1 / 60;
    this.lastSyncTime = now;
    const dt = this.syncDt;

    for (const ball of world.balls) {
      const mesh = this.ballMeshes[ball.number];
      if (!mesh) continue;

      const dropping = this.dropAnims.has(ball.number);

      if (ball.active && dropping) {
        // 球被重置回台面（白球犯规重置）——取消落袋动画
        this.dropAnims.delete(ball.number);
        mesh.visible = true;
        mesh.scale.setScalar(1);
      } else if (!ball.active && mesh.visible && !dropping) {
        // 刚落袋：启动落袋动画
        const pocketEvent = [...world.events].reverse().find(
          e => e.type === 'pocket' && e.ball === ball.number
        );
        let target: THREE.Vector3;
        if (pocketEvent && pocketEvent.type === 'pocket') {
          const [px, pz] = POCKET_POS[pocketEvent.pocket];
          target = new THREE.Vector3(px, -0.2, pz);
        } else {
          // 找最近袋口
          let best: [number, number] = POCKET_POS[0];
          let bestD = Infinity;
          for (const [px, pz] of POCKET_POS) {
            const d = (ball.x - px) ** 2 + (ball.z - pz) ** 2;
            if (d < bestD) { bestD = d; best = [px, pz]; }
          }
          target = new THREE.Vector3(best[0], -0.2, best[1]);
        }
        this.dropAnims.set(ball.number, { t: 0, from: mesh.position.clone(), to: target });
      }

      if (ball.active && !dropping) {
        mesh.visible = true;
        mesh.position.set(ball.x, R, ball.z);
        // 按角速度积分旋转（四元数，避免欧拉角万向锁）
        const wx = ball.wx, wy = ball.wy, wz = ball.wz;
        const wLen = Math.hypot(wx, wy, wz);
        if (wLen > 1e-6) {
          const dq = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(wx / wLen, wy / wLen, wz / wLen),
            wLen * dt
          );
          this.ballQuats[ball.number].premultiply(dq);
          mesh.quaternion.copy(this.ballQuats[ball.number]);
        }
      }
    }

    // 合法目标高亮环跟随球位
    for (const ball of world.balls) {
      const ring = this.targetRings[ball.number];
      if (!ring) continue;
      ring.visible = ball.active && this.legalTargets.has(ball.number) && this.phase === 'playing' && !world.moving;
      if (ring.visible) ring.position.set(ball.x, 0.0025, ball.z);
    }

    this.updateAimGuide();
  }

  /** 瞄准辅助线：射线求首个交点（球/库），绘制主视线+目标球线+分离线+幽灵球 */
  private updateAimGuide() {
    const world = this.lastWorld;
    const show = this.phase === 'playing' && world && !world.moving && world.balls[0].active;
    this.aimLine.visible = this.objLine.visible = this.tanLine.visible = this.ghostRing.visible = !!show;
    if (!show || !world) return;

    const cue = world.balls[0];
    const angle = this.totalAim();
    const dx = Math.sin(angle);
    const dz = -Math.cos(angle);
    const px = cue.x, pz = cue.z;

    // 最近球球交点（射线-圆）
    let bestT = Infinity;
    let hitBall: number | null = null;
    for (const b of world.balls) {
      if (!b.active || b.number === 0) continue;
      const ox = b.x - px, oz = b.z - pz;
      const proj = ox * dx + oz * dz;
      if (proj <= 0) continue;
      const perp2 = ox * ox + oz * oz - proj * proj;
      const rr = (R * 2) ** 2;
      if (perp2 >= rr) continue;
      const t = proj - Math.sqrt(rr - perp2);
      if (t < bestT) { bestT = t; hitBall = b.number; }
    }

    // 库边交点
    const xL = W / 2 - R, zL = L / 2 - R;
    let cushionT = Infinity;
    let cushionAxis: 'x' | 'z' = 'x';
    if (dx > 1e-9) { const t = (xL - px) / dx; if (t < cushionT) { cushionT = t; cushionAxis = 'x'; } }
    if (dx < -1e-9) { const t = (-xL - px) / dx; if (t < cushionT) { cushionT = t; cushionAxis = 'x'; } }
    if (dz > 1e-9) { const t = (zL - pz) / dz; if (t < cushionT) { cushionT = t; cushionAxis = 'z'; } }
    if (dz < -1e-9) { const t = (-zL - pz) / dz; if (t < cushionT) { cushionT = t; cushionAxis = 'z'; } }

    const y = 0.004;
    const setLine = (line: THREE.Line, x1: number, z1: number, x2: number, z2: number) => {
      const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      pos.setXYZ(0, x1, y, z1);
      pos.setXYZ(1, x2, y, z2);
      pos.needsUpdate = true;
      line.computeLineDistances();
    };

    if (hitBall !== null && bestT < cushionT) {
      // 击中目标球
      const cx = px + dx * bestT;
      const cz = pz + dz * bestT;
      setLine(this.aimLine, px, pz, cx, cz);

      const target = world.balls[hitBall];
      let nx = target.x - cx, nz = target.z - cz;
      const nLen = Math.hypot(nx, nz) || 1;
      nx /= nLen; nz /= nLen;
      // 目标球走向线
      setLine(this.objLine, target.x, target.z, target.x + nx * 0.5, target.z + nz * 0.5);
      this.objLine.visible = true;
      // 白球分离线（切向）
      const dot = dx * nx + dz * nz;
      let tx = dx - dot * nx, tz = dz - dot * nz;
      const tLen = Math.hypot(tx, tz);
      if (tLen > 0.05) {
        tx /= tLen; tz /= tLen;
        setLine(this.tanLine, cx, cz, cx + tx * 0.32, cz + tz * 0.32);
        this.tanLine.visible = true;
      } else {
        this.tanLine.visible = false;
      }
      // 幽灵球环
      this.ghostRing.position.set(cx, y, cz);
      this.ghostRing.visible = true;
    } else if (cushionT < Infinity) {
      // 直击库边：画反射段
      const hx = px + dx * cushionT;
      const hz = pz + dz * cushionT;
      setLine(this.aimLine, px, pz, hx, hz);
      let rx = dx, rz = dz;
      if (cushionAxis === 'x') rx = -rx; else rz = -rz;
      setLine(this.tanLine, hx, hz, hx + rx * 0.35, hz + rz * 0.35);
      this.tanLine.visible = true;
      this.objLine.visible = false;
      this.ghostRing.visible = false;
    } else {
      setLine(this.aimLine, px, pz, px + dx * 1.2, pz + dz * 1.2);
      this.objLine.visible = this.tanLine.visible = this.ghostRing.visible = false;
    }
  }

  update(cueX: number, cueZ: number, power: number, phase: string) {
    this.phase = phase;
    const cue = this.ballMeshes[0];
    const cueActive = cue?.visible ?? false;
    const angle = this.totalAim();

    // ---- 相机 ----
    if (this.viewMode === 'overhead') {
      this.targetCameraPos.set(0, 3.7, 0.85);
      this.targetLookAt.set(0, 0, 0.05);
    } else {
      // 过肩视角：相机抬高拉远并略偏右，让整条球杆入画指向白球——
      // 玩家能看到杆头对白球哪个点，才有"对准球"的感觉
      const dist = 0.66 + power * 0.0022;
      const side = 0.085;
      this.targetCameraPos.set(
        cueX - Math.sin(angle) * dist + Math.cos(angle) * side,
        0.37 + power * 0.0004,
        cueZ + Math.cos(angle) * dist + Math.sin(angle) * side
      );
      this.targetLookAt.set(
        cueX + Math.sin(angle) * 0.42,
        0.03,
        cueZ - Math.cos(angle) * 0.42
      );
    }
    const lerpK = 1 - Math.pow(0.0001, this.syncDt);
    this.camera.position.lerp(this.targetCameraPos, Math.min(0.25, lerpK * 3));
    this.smoothLookAt.lerp(this.targetLookAt, Math.min(0.3, lerpK * 4));
    this.camera.lookAt(this.smoothLookAt);

    // ---- 球杆：蓄力拉杆 ----
    if (this.strikeAnim) {
      // 出杆动画期间由 render() 接管球杆
      this.cueGroup.visible = true;
    } else {
      const showCue = cueActive && phase === 'playing' && !this.lastWorld?.moving;
      this.cueGroup.visible = showCue;
      if (showCue) {
        const targetPull = power * 0.0032;
        this.cuePull += (targetPull - this.cuePull) * 0.35;
        const gap = R + 0.025 + this.cuePull;
        // 加塞时球杆横向偏移（视觉对齐击球点）
        const side = -this.spin.y * R * 0.55;
        const px = Math.cos(angle) * side;
        const pz = Math.sin(angle) * side;
        this.cueGroup.position.set(
          cueX - Math.sin(angle) * gap + px,
          R + 0.012 + this.spin.x * R * 0.25,
          cueZ + Math.cos(angle) * gap + pz
        );
        this.cueGroup.rotation.set(-0.1, angle, 0, 'YXZ');
      } else {
        this.cuePull = 0;
      }
    }
  }

  /** 渲染循环：推进落袋动画并渲染 */
  render() {
    const dt = Math.min(0.05, this.clock.getDelta());

    // 出杆动画：加速冲向白球 → 触球瞬间回调 → 减速送杆 → 收起
    if (this.strikeAnim) {
      const a = this.strikeAnim;
      if (!a.fired) {
        a.t += dt / a.dur1;
        if (a.t >= 1) {
          // 皮头接触球面：这一帧才触发真实击球
          this.cueGroup.position.copy(a.contact);
          a.fired = true;
          a.t = 0;
          a.onContact?.();
        } else {
          const ease = a.t * a.t * a.t; // 加速前冲
          this.cueGroup.position.lerpVectors(a.from, a.contact, ease);
        }
        this.cueGroup.visible = true;
      } else {
        a.t += dt / a.dur2;
        if (a.t >= 1) {
          this.cueGroup.visible = false;
          this.strikeAnim = null;
        } else {
          const ease = 1 - Math.pow(1 - a.t, 3); // 减速送杆
          this.cueGroup.position.lerpVectors(a.contact, a.through, ease);
          this.cueGroup.visible = true;
        }
      }
    }

    for (const [num, anim] of this.dropAnims) {
      const mesh = this.ballMeshes[num];
      anim.t += dt / 0.45;
      if (anim.t >= 1) {
        mesh.visible = false;
        mesh.scale.setScalar(1);
        this.dropAnims.delete(num);
        continue;
      }
      const t = anim.t;
      const ease = t * t;
      mesh.position.lerpVectors(anim.from, anim.to, ease);
      mesh.position.y = R * (1 - ease) + anim.to.y * ease;
      mesh.scale.setScalar(1 - ease * 0.25);
      // 落袋翻滚
      mesh.rotation.x += dt * 6;
    }

    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.animationId = requestAnimationFrame(loop);
      this.render();
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }

  screenToTable(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const target = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.tablePlane, target)) {
      return { x: target.x, z: target.z };
    }
    return null;
  }

  handleResize = () => {
    const w = this.element.clientWidth;
    const h = this.element.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  dispose() {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.element) {
      this.element.removeChild(this.renderer.domElement);
    }
  }
}
