/*
[INPUT]: 依赖 physics 物理世界快照、textures 程序化贴图与 Three.js；不读取 React 状态
[OUTPUT]: 对外提供按需且最高 60 FPS 的场景渲染、连续环绕相机、可独立开关的世界角预测线与常驻幽灵球靶点、摆球虚母球、球杆动画、走位/复盘及屏幕↔台面坐标映射
[POS]: 渲染适配层，只消费世界快照；不得决定球局结果，不得改写物理世界
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  TABLE,
  predictBallCollisionDirections,
  type BilliardsWorld,
} from './physics';
import type { PositionPlan } from './planner/search';
import type { ShotReview } from './planner/review';
import { cameraPoseAt, clampViewLevel } from './camera-view';
import {
  SCENE_RENDER_FPS,
  claimFrameSlot,
  preferredPixelRatio,
} from './render-performance';
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
const RAIL_H = 0.045;
const RAIL_W = 0.07;
const CUSHION_H = 0.038;
const CUSHION_W = 0.048;
// 视觉开孔与二维捕获半径分开调校：角袋保持既有 105mm 视觉口径，
// 中袋由约 120mm 收到 104mm，直接回应“中袋过大、过易进球”的验收反馈。
const CORNER_HOLE_R = 0.0525;
const SIDE_HOLE_R = 0.052;
const POCKET_NOSE_R = 0.012;

const POCKET_POS: [number, number][] = [
  [-W / 2, -L / 2], [W / 2, -L / 2],
  [-W / 2, 0], [W / 2, 0],
  [-W / 2, L / 2], [W / 2, L / 2],
];

/** 整链规划的分杆配色（台呢绿底可读：暖橙/青/紫），轨迹/高亮环/序号标记同色 */
const PLAN_STEP_COLORS = [0xffa03c, 0x35d6d6, 0xb478ff];

/** 袋口旁序号标记：杆色圆底 + 白色数字的 CanvasTexture sprite（始终面向相机） */
function mkStepBadge(n: number, color: number, x: number, z: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 68);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }),
  );
  sprite.scale.setScalar(0.055);
  sprite.position.set(x, 0.055, z);
  return sprite;
}

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
  /** 点哪打哪迭代求解用的虚拟相机(不渲染,只取投影几何) */
  private virtualCam: THREE.PerspectiveCamera;

  private aimAngle = 0;
  /** 预测线默认关闭；幽灵球作为基础直接操作锚点仍保留。 */
  private aimAssistVisible = false;
  /** 0=第一人称，1=俯视；中间值可停留，并在所有高度共享世界杆向。 */
  private viewLevel = 0;
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
  /** 瞄准幽灵球靶点：白球影子球 + 定位环，玩家点击台面定位 */
  private aimGhost = new THREE.Group();
  /** 玩家指定的靶点距离（白球心到影子球心）；null = 自动取首触点 */
  private aimGhostDist: number | null = null;
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
  /** WebGL 只在场景脏或动画进行中绘制；rAF 本身保持轻量以响应下一次失效。 */
  private needsRender = true;
  /** 阴影与相机无关；只在物体/灯光变化时刷新，避免相机平滑期间重复跑 shadow pass。 */
  private needsShadowUpdate = true;
  private renderSlotMs: number | null = null;

  // ---- 走位规划渲染 ----
  /** 规划图层：瞄准线/轨迹/走位区域/序号标记，showPlanChain(null) 整体清空 */
  private planGroup = new THREE.Group();
  /** 复盘图层：计划（虚线）vs 实际（实线）轨迹对比，showReviewOverlay(null) 整体清空 */
  private reviewGroup = new THREE.Group();
  /** 规划展示期间隐藏常规瞄准辅助与球杆，避免与规划图层互相干扰 */
  private planActive = false;
  /** 单杆预览的虚拟起始局面；React 同步真实 world 时仍需保持第 2/3 杆球位。 */
  private planStepPreviewWorld: BilliardsWorld | null = null;
  /** 整链播放：逐杆沿 display 路径插值移动真实球网格，杆间按 endWorld 衔接球位 */
  private planPlayAnim: {
    plan: PositionPlan;
    stepIdx: number;
    t: number;                       // 当前杆进度 0..1
    phase: 'anim' | 'pause' | 'hold';
    phaseT: number;                  // pause/hold 累计秒
    snapped: boolean;                // 当前杆起点球位是否已摆放
  } | null = null;

  constructor(element: HTMLElement) {
    this.element = element;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090a);
    this.scene.fog = new THREE.Fog(0x07090a, 4, 11);

    this.camera = new THREE.PerspectiveCamera(46, element.clientWidth / element.clientHeight, 0.01, 60);
    this.virtualCam = new THREE.PerspectiveCamera(46, element.clientWidth / element.clientHeight, 0.01, 60);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setSize(element.clientWidth, element.clientHeight);
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.renderer.setPixelRatio(preferredPixelRatio(window.devicePixelRatio, coarsePointer));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
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
    this.scene.add(this.planGroup);
    this.scene.add(this.reviewGroup);

    const cueZ = TABLE.length * 0.25;
    this.targetCameraPos.set(0, 0.26, cueZ + 0.5);
    this.targetLookAt.set(0, 0.025, cueZ - 0.4);
    this.camera.position.copy(this.targetCameraPos);
    this.smoothLookAt.copy(this.targetLookAt);
    this.camera.lookAt(this.smoothLookAt);

    window.addEventListener('resize', this.handleResize);
  }

  private invalidate(shadows = true) {
    this.needsRender = true;
    if (shadows) this.needsShadowUpdate = true;
    this.scheduleFrame();
  }

  private scheduleFrame() {
    if (!this.running || this.animationId) return;
    this.animationId = requestAnimationFrame(this.onAnimationFrame);
  }

  private onAnimationFrame = (now: number) => {
    this.animationId = 0;
    if (!this.running) return;

    const slot = claimFrameSlot(now, this.renderSlotMs, SCENE_RENDER_FPS);
    if (slot === null) {
      this.scheduleFrame();
      return;
    }
    if (!this.needsRender && !this.animationIsActive()) return;

    this.renderSlotMs = slot;
    this.needsRender = false;
    this.render();
    if (this.needsRender || this.animationIsActive()) this.scheduleFrame();
  };

  private cameraIsMoving(): boolean {
    return this.camera.position.distanceToSquared(this.targetCameraPos) > 1e-8
      || this.smoothLookAt.distanceToSquared(this.targetLookAt) > 1e-8;
  }

  private animationIsActive(): boolean {
    return Boolean(
      this.lastWorld?.moving
      || this.strikeAnim
      || this.dropAnims.size
      || this.planPlayAnim
      || this.cameraIsMoving(),
    );
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
      const r = isSide ? SIDE_HOLE_R : CORNER_HOLE_R;
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
      bumpMap: woodTex,
      bumpScale: 0.0012,
      roughness: 0.28,
      metalness: 0.0,
      clearcoat: 0.78,
      clearcoatRoughness: 0.16,
      envMapIntensity: 0.85,
    });

    const railJoin = (CUSHION_W + RAIL_W) * 2;
    const railLong = new RoundedBoxGeometry(RAIL_W, RAIL_H, L + railJoin, 5, 0.011);
    const railShort = new RoundedBoxGeometry(W + railJoin, RAIL_H, RAIL_W, 5, 0.011);
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

    // 圆鼻中心比开口边缘外移一个鼻头半径，库边段在同一点收束，不露尖锐绿楔。
    const cornerGap = CORNER_HOLE_R + POCKET_NOSE_R;
    const sideGap = SIDE_HOLE_R + POCKET_NOSE_R;

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

    // ---- 袋口（皮口唇边 + 喉管 + 金属件） ----
    // 袋口视觉口径独立于二维捕获半径：既能把中袋收窄，也不让黑洞尺寸
    // 直接决定规划器与物理内核的球心容错。
    const LIP_OVERHANG = 0.0065;     // 皮口唇边外扩，盖住洞口呢料切边
    const THROAT_DEPTH = 0.14;       // 皮口喉管纵深

    const linerMat = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 1, side: THREE.BackSide });
    const throatMat = new THREE.MeshStandardMaterial({
      map: leatherTex,
      bumpMap: leatherTex,
      bumpScale: 0.0015,
      color: 0x54402a, // 深棕皮革，远壁能接到灯光，不是纯黑死洞
      roughness: 0.82,
      side: THREE.BackSide, // 从袋口俯视看到的是喉管内壁
    });
    const lipMat = new THREE.MeshPhysicalMaterial({
      map: leatherTex,
      bumpMap: leatherTex,
      bumpScale: 0.001,
      color: 0x5d3f28,
      roughness: 0.68,
      clearcoat: 0.32,
      clearcoatRoughness: 0.42,
      side: THREE.DoubleSide, // 车削剖面外降段法线朝下，双面渲染避免唇边读成黑色
    });
    const brassMat = new THREE.MeshPhysicalMaterial({
      color: 0x8a6f34, // 仿古铜，降低金属眩光
      metalness: 0.85,
      roughness: 0.45,
      envMapIntensity: 0.9,
    });
    const seamMat = new THREE.MeshStandardMaterial({
      color: 0xb99a65,
      roughness: 0.62,
      metalness: 0.05,
    });
    // 皮口唇边剖面：从喉管内壁向上卷起、微凸后落回呢面，形成包边滚边
    const lipProfile = (mouthR: number) => [
      new THREE.Vector2(mouthR * 0.97, -0.004),
      new THREE.Vector2(mouthR, 0.001),
      new THREE.Vector2(mouthR + 0.005, 0.0045),
      new THREE.Vector2(mouthR + LIP_OVERHANG, 0.0005),
    ];

    for (const [px, pz] of POCKET_POS) {
      const isSide = pz === 0;
      const pr = isSide ? SIDE_HOLE_R : CORNER_HOLE_R;
      const sx = Math.sign(px);
      const mouthR = pr;
      const group = new THREE.Group();
      group.position.set(px, 0, pz);

      // 皮口唇边：车削滚边压住洞口呢料切边，把视觉开口收到真实尺寸；
      // 中袋用弧形唇边（弧心朝向台面），两端藏进圆鼻与库边之下
      const lipArc = isSide ? Math.PI * 1.1 : Math.PI * 2;
      const lipStart = isSide ? -sx * Math.PI / 2 - lipArc / 2 : 0;
      const lip = new THREE.Mesh(
        new THREE.LatheGeometry(lipProfile(mouthR), 28, lipStart, lipArc),
        lipMat
      );
      lip.castShadow = true;
      lip.receiveShadow = true;
      group.add(lip);

      // 皮口压线：略高于滚边的一圈浅色细线，在近景提供真实缝制层次。
      const seam = new THREE.Mesh(
        new THREE.TorusGeometry(mouthR + 0.0038, 0.00075, 5, 36, lipArc),
        seamMat,
      );
      seam.rotation.x = Math.PI / 2;
      seam.rotation.z = lipStart;
      seam.position.y = 0.0048;
      group.add(seam);

      // 皮口喉管：深色皮革漏斗，上沿接唇边、下接袋底
      const throat = new THREE.Mesh(
        new THREE.CylinderGeometry(mouthR * 0.965, mouthR * 0.78, THROAT_DEPTH, 36, 2, true),
        throatMat
      );
      throat.position.y = 0.001 - THROAT_DEPTH / 2;
      group.add(throat);

      // 袋腔背壁：洞口外半沿的皮面立墙，从呢面升到台帮底，
      // 把袋口后方的黑色空腔封闭成皮革衬里的袋腔
      const wallArc = Math.PI * 0.9;
      const wallThetaC = Math.atan2(isSide ? sx : px, isSide ? 0 : pz); // 朝库边/台帮方向
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(pr, pr, RAIL_H + 0.006, 20, 1, true, wallThetaC - wallArc / 2, wallArc),
        throatMat
      );
      wall.position.y = (RAIL_H + 0.006) / 2 - 0.001;
      group.add(wall);

      // 喉管之下的黑色纵深（内衬 + 袋底）
      const liner = new THREE.Mesh(
        new THREE.CylinderGeometry(pr * 0.98, pr * 0.7, 0.16, 28, 1, true),
        linerMat
      );
      liner.position.y = -0.08;
      group.add(liner);
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(pr * 0.72, 28), new THREE.MeshStandardMaterial({ color: 0x020202 }));
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = -0.158;
      group.add(bottom);

      if (!isSide) {
        // 角袋金属唇环：袋口朝外半沿的黄铜包边（弧心对准台帮转角）
        const rimArc = Math.PI * 0.85;
        const rimGeo = new THREE.TorusGeometry(mouthR + 0.007, 0.004, 8, 32, rimArc);
        rimGeo.rotateZ(Math.atan2(pz, px) - rimArc / 2);
        const rim = new THREE.Mesh(rimGeo, brassMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.0045;
        group.add(rim);

        // 台帮转角金属护板：盖住两条台帮在袋口上方留出的小缺口，
        // 3/4 扇形、缺口朝台面——小尺寸 + 仿古铜，不抢戏
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 0.003, 24, 1, false,
            Math.atan2(-sx, -Math.sign(pz)) + Math.PI / 4, Math.PI * 1.5),
          brassMat
        );
        plate.position.set(sx * CUSHION_W, RAIL_H + 0.0015, Math.sign(pz) * CUSHION_W);
        group.add(plate);

        // 袋口上方内阴影环（增强洞口纵深感）；中袋洞口半藏在圆鼻与
        // 台帮下，平面阴影环会在呢面上读成深色"C 形"，只对角袋使用
        const shade = new THREE.Mesh(
          new THREE.RingGeometry(pr * 0.55, pr * 0.97, 28),
          new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
        );
        shade.rotation.x = -Math.PI / 2;
        shade.position.y = 0.0012;
        group.add(shade);
      }

      this.tableGroup.add(group);
    }

    // ---- 袋口角衬（jaws）+ 库边圆鼻 ----
    // 真实球台袋口两侧是包呢的圆鼻库边尽头：中袋漏斗面近直角（约 103°），
    // 角袋漏斗面约 45°。角衬本体用顶视多边形挤出与库边同高同质，
    // 库边尽头内侧再各压一颗圆鼻短圆柱，消除尖锐绿楔的读感。
    const SIDE_JAW_TILT = 0.011; // 中袋漏斗面内倾量 ≈ CUSHION_W·tan(103°−90°)
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
    // 圆鼻：包呢短圆柱，半埋在库边尽头，朝袋口一侧鼓起
    const noseGeo = new THREE.CylinderGeometry(POCKET_NOSE_R, POCKET_NOSE_R, CUSHION_H, 20);
    const addNose = (x: number, z: number) => {
      const nose = new THREE.Mesh(noseGeo, cushionMat);
      nose.position.set(x, CUSHION_H / 2, z);
      nose.castShadow = true;
      nose.receiveShadow = true;
      this.tableGroup.add(nose);
    };

    for (const [px, pz] of POCKET_POS) {
      const isSide = pz === 0;
      const sx = Math.sign(px);
      if (isSide) {
        // 中袋：库边沿 z 走向，袋口两侧角衬漏斗面近直角，尽头压圆鼻
        for (const dz of [-1, 1]) {
          const A: [number, number] = [sx * W / 2, dz * sideGap]; // 库边尽头内角
          addJaw([A, [A[0] + sx * jawDepth, A[1]], [A[0] + sx * jawDepth, A[1] - dz * SIDE_JAW_TILT]]);
          addNose(sx * (W / 2 + 0.002), dz * sideGap);
        }
      } else {
        const sz = Math.sign(pz);
        // 角袋：沿 x 库边的角衬（斜面朝袋口）+ 圆鼻
        const AX: [number, number] = [sx * (W / 2 - cornerGap), sz * L / 2];
        addJaw([AX, [AX[0] + sx * CORNER_HOLE_R * 0.95, AX[1]], [AX[0], AX[1] + sz * jawDepth]]);
        addNose(sx * (W / 2 - cornerGap), sz * (L / 2 + 0.002));
        // 角袋：沿 z 库边的角衬 + 圆鼻
        const AZ: [number, number] = [sx * W / 2, sz * (L / 2 - cornerGap)];
        addJaw([AZ, [AZ[0], AZ[1] + sz * CORNER_HOLE_R * 0.95], [AZ[0] + sx * jawDepth, AZ[1]]]);
        addNose(sx * (W / 2 + 0.002), sz * (L / 2 - cornerGap));
      }
    }

    // ---- 台裙与桌腿 ----
    const skirtMat = new THREE.MeshPhysicalMaterial({
      map: woodTex,
      bumpMap: woodTex,
      bumpScale: 0.001,
      color: 0x6b4630,
      roughness: 0.36,
      clearcoat: 0.58,
      clearcoatRoughness: 0.24,
    });
    const skirt = new THREE.Mesh(
      new RoundedBoxGeometry(W + RAIL_W * 1.4, 0.16, L + RAIL_W * 1.4, 5, 0.022),
      skirtMat,
    );
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

    const woodMat = new THREE.MeshPhysicalMaterial({ color: 0xd8b184, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 });

    // 前节分两截锥形拼接:向皮头方向逐渐收细(radiusTop 朝向杆尾)
    const shaftFront = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.0055, 0.42, 20),
      woodMat
    );
    shaftFront.rotation.x = Math.PI / 2;
    shaftFront.position.z = 0.25;
    shaftFront.castShadow = true;
    group.add(shaftFront);

    const shaftRear = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0105, 0.008, 0.31, 20),
      woodMat
    );
    shaftRear.rotation.x = Math.PI / 2;
    shaftRear.position.z = 0.615;
    shaftRear.castShadow = true;
    group.add(shaftRear);

    // 皮头 + 先角(皮头前端保持在 z=0.006,出杆贴球判定依赖该值)
    const ferrule = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, 0.02, 16),
      new THREE.MeshPhysicalMaterial({ color: 0xe8e2d0, roughness: 0.4 })
    );
    ferrule.rotation.x = Math.PI / 2;
    ferrule.position.z = 0.03;
    group.add(ferrule);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x375a7a, roughness: 0.95 });
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0059, 0.012, 16),
      tipMat
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.012;
    group.add(tip);
    // 皮头端面微凸的弧面,最前端仍在 z=0.006
    const tipCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.0059, 16, 12),
      tipMat
    );
    tipCap.scale.z = 0.45;
    tipCap.position.z = 0.006 + 0.0059 * 0.45;
    group.add(tipCap);

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

    // 瞄准幽灵球靶点：影子球 + 定位环，玩家点击台面即把靶点放到所点处，
    // 白球过靶点中心的延长线就是杆向（ghost-ball 瞄准法）
    const ghostBall = new THREE.Mesh(
      new THREE.SphereGeometry(R, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false })
    );
    ghostBall.position.y = R;
    this.aimGhost.add(ghostBall);
    const ghostHalo = new THREE.Mesh(
      new THREE.RingGeometry(R * 1.12, R * 1.38, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    ghostHalo.rotation.x = -Math.PI / 2;
    ghostHalo.position.y = 0.003;
    this.aimGhost.add(ghostHalo);
    this.aimGhost.visible = false;
    this.aimGroup.add(this.aimGhost);
  }

  /** 设置瞄准幽灵球靶点距离（白球心起算）；null = 自动取首触点距离 */
  setAimGhostDist(d: number | null) {
    this.aimGhostDist = d;
    this.invalidate(false);
  }

  /** 瞄准幽灵球当前台面位置（不可见时 null），供输入层做抓取命中判定 */
  aimGhostPos(): { x: number; z: number } | null {
    if (!this.aimGhost.visible) return null;
    return { x: this.aimGhost.position.x, z: this.aimGhost.position.z };
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
    this.invalidate();
  }

  /** 浏览器门禁读取摆球阶段虚/实母球显隐，不作为业务状态来源。 */
  cuePlacementVisualState(): {
    realVisible: boolean;
    ghostVisible: boolean;
    ghostX: number;
    ghostZ: number;
  } {
    return {
      realVisible: this.ballMeshes[0]?.visible ?? false,
      ghostVisible: this.ghostCue.visible,
      ghostX: this.ghostCue.position.x,
      ghostZ: this.ghostCue.position.z,
    };
  }

  setSpin(spin: { x: number; y: number }) {
    this.spin = spin;
    this.invalidate();
  }

  setLegalTargets(numbers: number[]) {
    this.legalTargets = new Set(numbers);
    this.invalidate(false);
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

  // ---- 走位规划渲染 ----

  /** 调试用：规划图层当前对象数（验证轨迹/区域已上屏） */
  planObjectCount(): number {
    return this.planGroup.children.length;
  }

  /** 调试用：规划轨迹是否正在播放 */
  planPlaying(): boolean {
    return this.planPlayAnim !== null;
  }

  /** 清空规划图层并复位球网格到真实球局（播放动画会移动网格，必须恢复） */
  private clearPlan() {
    this.planPlayAnim = null;
    this.planStepPreviewWorld = null;
    for (const child of [...this.planGroup.children]) {
      this.planGroup.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const disposeOne = (m: THREE.Material) => {
        (m as THREE.SpriteMaterial).map?.dispose?.(); // 序号 sprite 的 CanvasTexture
        m.dispose();
      };
      if (Array.isArray(material)) material.forEach(disposeOne);
      else if (material) disposeOne(material);
    }
    if (this.lastWorld) this.sync(this.lastWorld); // 恢复被播放动画挪动/隐藏的球
  }

  private addPlanPolyline(
    points: { x: number; z: number }[],
    color: number,
    opacity: number,
  ) {
    if (points.length < 2) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map((point) => new THREE.Vector3(point.x, 0.005, point.z)),
    );
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    line.frustumCulled = false;
    this.planGroup.add(line);
  }

  private addPlanRing(
    inner: number,
    outer: number,
    color: number,
    opacity: number,
    x: number,
    z: number,
  ) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.004, z);
    this.planGroup.add(ring);
  }

  /** 把一杆的瞄准/轨迹/停位/目标袋画进 planGroup；是否显示 zone 由调用方控制。 */
  private renderPlanStep(
    step: PositionPlan['steps'][number],
    stepIndex: number,
    showAimAndZone: boolean,
  ) {
    const candidate = step.candidate;
    const cueStart = step.display.cuePath[0];
    if (!cueStart) return;
    const color = PLAN_STEP_COLORS[stepIndex] ?? PLAN_STEP_COLORS[PLAN_STEP_COLORS.length - 1];

    if (showAimAndZone) {
      const dirX = Math.sin(candidate.angle);
      const dirZ = -Math.cos(candidate.angle);
      const ghostX = cueStart.x + dirX * candidate.cueDistance;
      const ghostZ = cueStart.z + dirZ * candidate.cueDistance;
      const aimGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cueStart.x, 0.005, cueStart.z),
        new THREE.Vector3(ghostX, 0.005, ghostZ),
      ]);
      const aimLine = new THREE.Line(
        aimGeometry,
        new THREE.LineDashedMaterial({
          color: 0xffffff,
          dashSize: 0.03,
          gapSize: 0.02,
          transparent: true,
          opacity: 0.75,
        }),
      );
      aimLine.computeLineDistances();
      aimLine.frustumCulled = false;
      this.planGroup.add(aimLine);
      this.addPlanRing(R * 0.72, R * 0.98, 0xffffff, 0.55, ghostX, ghostZ);

      if (step.zone.length >= 3) {
        const shape = new THREE.Shape();
        step.zone.forEach((point, index) => {
          if (index === 0) shape.moveTo(point.x, -point.z);
          else shape.lineTo(point.x, -point.z);
        });
        shape.closePath();
        const zone = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.14,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        zone.rotation.x = -Math.PI / 2;
        zone.position.y = 0.001;
        this.planGroup.add(zone);
      }
    }

    this.addPlanPolyline(step.display.cuePath, color, 0.85);
    this.addPlanPolyline(step.display.objectPath, color, 0.95);
    this.addPlanRing(R * 0.35, R * 0.62, color, 0.8, step.cueEnd.x, step.cueEnd.z);

    const objectStart = step.display.objectPath[0];
    if (objectStart) {
      this.addPlanRing(R * 1.12, R * 1.45, color, 0.85, objectStart.x, objectStart.z);
    }

    const pocketPosition = POCKET_POS[candidate.pocket];
    if (!pocketPosition) return;
    const [pocketX, pocketZ] = pocketPosition;
    const pocketHoleRadius = candidate.pocket === 2 || candidate.pocket === 3
      ? SIDE_HOLE_R
      : CORNER_HOLE_R;
    this.addPlanRing(
      pocketHoleRadius * 1.04,
      pocketHoleRadius * 1.24,
      color,
      0.7,
      pocketX,
      pocketZ,
    );
    this.planGroup.add(mkStepBadge(stepIndex + 1, color, pocketX, pocketZ));
  }

  /**
   * 渲染整链走位规划：三杆同屏，每杆一个区分色（PLAN_STEP_COLORS）——
   * 母球/目标球预测轨迹、目标球与目标袋口高亮环、袋口旁序号 sprite；
   * 第 1 杆额外画瞄准虚线/ghost 定位环与走位区域。
   * zone 只画第 1 杆：三杆同屏已含 3 组轨迹+标记，多层 zone 叠加在台呢上
   * 互相染色不可读，且玩家当下要决策的只有第 1 杆的走位。
   * 传 null 清除全部规划渲染并恢复常规瞄准辅助。
   */
  showPlanChain(plan: PositionPlan | null) {
    this.clearPlan();
    this.planActive = plan !== null;
    this.invalidate();
    if (!plan || plan.steps.length === 0) {
      this.updateAimGuide();
      return;
    }

    plan.steps.forEach((step, i) => {
      this.renderPlanStep(step, i, i === 0);
    });

    this.updateAimGuide(); // planActive 置位后隐藏常规瞄准辅助
  }

  /**
   * 只展示选中的一杆。第 2/3 杆先把球网格贴到上一杆 endWorld，
   * 使轨迹起点与画面球位一致；清除、越界或空计划都会恢复真实球局。
   */
  showPlanStep(plan: PositionPlan | null, stepIndex: number) {
    this.clearPlan();
    const validIndex = Number.isInteger(stepIndex)
      && stepIndex >= 0
      && stepIndex < (plan?.steps.length ?? 0);
    this.planActive = plan !== null && validIndex;
    this.invalidate();
    if (!plan || !validIndex) {
      this.updateAimGuide();
      return;
    }

    if (stepIndex > 0) {
      this.planStepPreviewWorld = plan.steps[stepIndex - 1]?.endWorld ?? null;
      this.snapBallsTo(this.planStepPreviewWorld);
    }
    this.renderPlanStep(plan.steps[stepIndex], stepIndex, true);
    this.updateAimGuide();
  }

  // ---- 击球复盘渲染（计划 vs 实际） ----

  /** 调试用：复盘图层当前对象数（验证对比轨迹已上屏） */
  reviewObjectCount(): number {
    return this.reviewGroup.children.length;
  }

  /** 清空复盘图层（dispose 含 ✕ sprite 的 CanvasTexture，同 clearPlan 写法） */
  private clearReview() {
    for (const child of [...this.reviewGroup.children]) {
      this.reviewGroup.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const disposeOne = (m: THREE.Material) => {
        (m as THREE.SpriteMaterial).map?.dispose?.();
        m.dispose();
      };
      if (Array.isArray(material)) material.forEach(disposeOne);
      else if (material) disposeOne(material);
    }
  }

  /**
   * 复盘对比渲染：计划 = 虚线（沿用第 1 杆暖橙）+ 计划停位圆环；
   * 实际 = 实线（母球白 / 目标球红）+ 实际停位 ✕ sprite。
   * zone 不画——两组轨迹+两组停位标记信息密度已够。传 null 清除。
   */
  showReviewOverlay(review: ShotReview | null) {
    this.clearReview();
    this.invalidate(false);
    if (!review) return;

    const y = 0.006; // 比规划图层(0.005)略高，防同屏 z-fighting
    const PLAN_COLOR = PLAN_STEP_COLORS[0];
    const mkLine = (points: { x: number; z: number }[], color: number, opacity: number, dashed: boolean) => {
      if (points.length < 2) return;
      const geo = new THREE.BufferGeometry().setFromPoints(
        points.map((p) => new THREE.Vector3(p.x, y, p.z)),
      );
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: 0.03, gapSize: 0.02, transparent: true, opacity })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      line.frustumCulled = false;
      this.reviewGroup.add(line);
    };
    const mkRing = (inner: number, outer: number, color: number, opacity: number, x: number, z: number) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.004, z);
      this.reviewGroup.add(ring);
    };

    // 计划：虚线 + 停位圆环
    mkLine(review.planned.display.cuePath, PLAN_COLOR, 0.7, true);
    mkLine(review.planned.display.objectPath, PLAN_COLOR, 0.8, true);
    mkRing(R * 0.35, R * 0.62, PLAN_COLOR, 0.8, review.planned.cueEnd.x, review.planned.cueEnd.z);

    // 实际：实线（母球白 / 目标球红）
    mkLine(review.actual.cuePath, 0xffffff, 0.9, false);
    mkLine(review.actual.objectPath, 0xff4444, 0.95, false);

    // 实际停位 ✕（洗袋则无停位，不画）
    if (review.actual.cueEnd) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(34, 34);
      ctx.lineTo(94, 94);
      ctx.moveTo(94, 34);
      ctx.lineTo(34, 94);
      ctx.stroke();
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }),
      );
      sprite.scale.setScalar(0.05);
      sprite.position.set(review.actual.cueEnd.x, 0.055, review.actual.cueEnd.z);
      this.reviewGroup.add(sprite);
    }
  }

  /** 把球网格直接贴合到指定世界的球位（整链播放的杆间衔接；不走落袋动画、不改 lastWorld） */
  private snapBallsTo(world: BilliardsWorld | null | undefined) {
    if (!world) return;
    for (const ball of world.balls) {
      const mesh = this.ballMeshes[ball.number];
      if (!mesh) continue;
      this.dropAnims.delete(ball.number);
      mesh.position.set(ball.x, R, ball.z);
      mesh.visible = ball.active;
      mesh.scale.setScalar(1);
    }
  }

  /**
   * 整链连续播放：按链条顺序逐杆动画（每杆 1.3s，杆间停顿 0.3s，总时长 ≈4.7s），
   * 每杆起点把全部球网格贴合到上一杆 endWorld（被带动的他球也正确衔接），
   * 播完停留 0.8s 最终局面后复位当前真实球局（复位而非停留——规划只是演示，
   * 停留虚拟终态会让玩家误以为球局已变）。
   */
  playPlanChain(plan: PositionPlan) {
    if (!this.planActive || plan.steps.length === 0) return;
    this.planStepPreviewWorld = null;
    this.planPlayAnim = { plan, stepIdx: 0, t: 0, phase: 'anim', phaseT: 0, snapped: false };
    this.invalidate();
  }

  /** 整链播放推进（render 每帧调用） */
  private updatePlanPlay(dt: number) {
    const anim = this.planPlayAnim;
    if (!anim) return;
    const steps = anim.plan.steps;
    const step = steps[anim.stepIdx];

    if (anim.phase === 'pause') {
      anim.phaseT += dt;
      if (anim.phaseT >= 0.3) {
        anim.stepIdx += 1;
        if (anim.stepIdx >= steps.length) {
          anim.phase = 'hold';
          anim.phaseT = 0;
        } else {
          anim.phase = 'anim';
          anim.t = 0;
          anim.snapped = false;
        }
      }
      return;
    }
    if (anim.phase === 'hold') {
      anim.phaseT += dt;
      if (anim.phaseT >= 0.8) {
        if (this.lastWorld) this.sync(this.lastWorld); // 复位真实球局
        this.planPlayAnim = null;
      }
      return;
    }

    // phase === 'anim'：本杆动画
    if (!anim.snapped) {
      this.snapBallsTo(anim.stepIdx === 0 ? this.lastWorld : steps[anim.stepIdx - 1].endWorld);
      anim.snapped = true;
    }
    anim.t = Math.min(1, anim.t + dt / 1.3);
    const { cuePath, objectPath } = step.display;

    const sample = (points: { x: number; z: number }[], progress: number) => {
      const idx = progress * (points.length - 1);
      const i = Math.min(points.length - 2, Math.floor(idx));
      const frac = idx - i;
      const a = points[i];
      const b = points[i + 1];
      return { x: a.x + (b.x - a.x) * frac, z: a.z + (b.z - a.z) * frac };
    };

    const cueMesh = this.ballMeshes[0];
    if (cueMesh && cuePath.length >= 2) {
      const p = sample(cuePath, anim.t);
      cueMesh.position.set(p.x, R, p.z);
    }
    const targetMesh = this.ballMeshes[step.candidate.target];
    if (targetMesh && objectPath.length >= 2) {
      const p = sample(objectPath, anim.t);
      targetMesh.position.set(p.x, R, p.z);
    }
    if (anim.t >= 1) {
      this.snapBallsTo(step.endWorld); // 落袋隐藏/被带动他球一次贴合终态
      anim.phase = 'pause';
      anim.phaseT = 0;
    }
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

    // 杆身局部 +z 是杆尾方向，须指向瞄准反方向 (-sin, +cos)，
    // 故 yaw 取 -angle——取 +angle 杆身会左右镜像，读成"斜着拨球"
    this.cueGroup.rotation.set(-0.1, -angle, 0, 'YXZ');
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
    this.invalidate();
    // 兜底：rAF 被浏览器节流（后台标签页）时，按墙钟时间到点直接触球，
    // 保证"松手必出杆"，动画只是表现层
    setTimeout(() => {
      if (this.strikeAnim === anim && !anim.fired) {
        this.cueGroup.position.copy(anim.contact);
        this.cueGroup.visible = false;
        this.strikeAnim = null;
        this.invalidate();
        anim.fired = true;
        anim.onContact?.();
      }
    }, dur1 * 1000 + 100);
  }

  setViewLevel(level: number) {
    this.viewLevel = clampViewLevel(level);
    // 高位时吊灯会挡住台面；在进入灯体高度前隐藏，避免穿模。
    if (this.lampGroup) this.lampGroup.visible = this.viewLevel < 0.78;
    this.invalidate();
  }

  setAim(angle: number) {
    this.aimAngle = angle;
    this.invalidate();
  }

  setAimAssistVisible(visible: boolean) {
    this.aimAssistVisible = visible;
    this.updateAimGuide();
    this.invalidate();
  }

  /** 全局唯一瞄准事实：所有视角高度均消费同一个世界角。 */
  private totalAim(): number {
    return this.aimAngle;
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
      ring.visible = ball.active && this.legalTargets.has(ball.number) && this.phase === 'aiming' && !world.moving && !this.planActive;
      if (ring.visible) ring.position.set(ball.x, 0.0025, ball.z);
    }

    // 规划选中第 2/3 杆时，真实 world 仍是当前球局；同步完成后重新覆盖
    // 虚拟起始球位，直到 showPlanStep(null/越界) 或 clearPlan 恢复真实局面。
    if (this.planStepPreviewWorld) this.snapBallsTo(this.planStepPreviewWorld);

    this.updateAimGuide();
    this.invalidate();
  }

  /** 瞄准辅助线：射线求首个交点（球/库），绘制主视线+目标球线+分离线+幽灵球+靶点影子球 */
  private updateAimGuide() {
    const world = this.lastWorld;
    const show = this.phase === 'aiming' && world && !world.moving && world.balls[0].active && !this.planActive;
    const showPrediction = Boolean(show && this.aimAssistVisible);
    this.aimLine.visible = this.objLine.visible = this.tanLine.visible =
      this.ghostRing.visible = showPrediction;
    this.aimGhost.visible = !!show;
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

    // 辅助线障碍裁剪：沿 (rdx,rdz) 找最近的球（半径 2R 的圆）或库边，
    // 线长到首个障碍为止——与 8 Ball Pool 等成熟游戏一致，不画穿球/穿库的线
    const clipRay = (ox: number, oz: number, rdx: number, rdz: number, maxLen: number, exclude: number) => {
      let t = maxLen;
      for (const b of world.balls) {
        if (!b.active || b.number === exclude) continue;
        const bx = b.x - ox, bz = b.z - oz;
        const proj = bx * rdx + bz * rdz;
        if (proj <= 0) continue;
        const perp2 = bx * bx + bz * bz - proj * proj;
        const rr = (R * 2) ** 2;
        if (perp2 >= rr) continue;
        const hit = proj - Math.sqrt(rr - perp2);
        if (hit < t) t = hit;
      }
      if (rdx > 1e-9) t = Math.min(t, (xL - ox) / rdx);
      if (rdx < -1e-9) t = Math.min(t, (-xL - ox) / rdx);
      if (rdz > 1e-9) t = Math.min(t, (zL - oz) / rdz);
      if (rdz < -1e-9) t = Math.min(t, (-zL - oz) / rdz);
      return Math.max(0, t);
    };

    // 瞄准幽灵球靶点：默认贴首触点（球或库）；玩家点击定位过则取点击距离，
    // 钳到首触点——点在目标球后就自动贴成标准 ghost-ball 触点球位，
    // 点在近处则白球过靶心的延长线仍是杆向
    const contactDist = hitBall !== null && bestT < cushionT ? bestT
      : cushionT < Infinity ? cushionT : 1.2;
    const ghostDist = Math.min(this.aimGhostDist ?? contactDist, contactDist);
    this.aimGhost.position.set(px + dx * ghostDist, 0, pz + dz * ghostDist);

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

      const target = world.balls.find(b => b.number === hitBall)!;
      let nx = target.x - cx, nz = target.z - cz;
      const nLen = Math.hypot(nx, nz) || 1;
      nx /= nLen; nz /= nLen;
      // 与物理内核共享恢复/throw 预测，避免大切角时理想法线与真实出射方向错位。
      const predicted = predictBallCollisionDirections(dx, dz, nx, nz);
      const objLen = clipRay(
        target.x,
        target.z,
        predicted.object.x,
        predicted.object.z,
        0.8,
        hitBall,
      );
      setLine(
        this.objLine,
        target.x,
        target.z,
        target.x + predicted.object.x * objLen,
        target.z + predicted.object.z * objLen,
      );
      this.objLine.visible = showPrediction && objLen > 0.01;
      // 白球分离线同样取冲量后的真实预测方向；正碰残速过小时隐藏。
      if (predicted.cueSpeedRatio > 0.05) {
        const tanLen = clipRay(cx, cz, predicted.cue.x, predicted.cue.z, 0.32, hitBall);
        setLine(
          this.tanLine,
          cx,
          cz,
          cx + predicted.cue.x * tanLen,
          cz + predicted.cue.z * tanLen,
        );
        this.tanLine.visible = showPrediction && tanLen > 0.01;
      } else {
        this.tanLine.visible = false;
      }
      // 幽灵球环
      this.ghostRing.position.set(cx, y, cz);
      this.ghostRing.visible = showPrediction;
    } else if (cushionT < Infinity) {
      // 直击库边：画反射段
      const hx = px + dx * cushionT;
      const hz = pz + dz * cushionT;
      setLine(this.aimLine, px, pz, hx, hz);
      let rx = dx, rz = dz;
      if (cushionAxis === 'x') rx = -rx; else rz = -rz;
      setLine(this.tanLine, hx, hz, hx + rx * 0.35, hz + rz * 0.35);
      this.tanLine.visible = showPrediction;
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
    const cueActive = Boolean(this.lastWorld?.balls[0]?.active);
    // 摆球阶段物理世界仍保留母球作为候选状态，但画面只显示跟手的半透明预览；
    // 点击落实后下一次 sync 会恢复实体母球，避免一虚一实同时出现。
    if (cue && phase === 'placing') cue.visible = false;
    const angle = this.totalAim();

    // ---- 相机：高度、轴心与方位角共用纯几何，滑杆和全局转向都不会触发模式跳变。 ----
    const cameraPose = cameraPoseAt(cueX, cueZ, angle, power, this.viewLevel);
    this.targetCameraPos.set(
      cameraPose.position.x,
      cameraPose.position.y,
      cameraPose.position.z,
    );
    this.targetLookAt.set(cameraPose.lookAt.x, cameraPose.lookAt.y, cameraPose.lookAt.z);
    // 相机只设目标位姿;平滑收敛在 render() 每帧执行。
    // 若在此处随 React 渲染推进,松手后 React 不再渲染,相机会冻结在半途。

    // ---- 球杆：蓄力拉杆 ----
    if (this.strikeAnim) {
      // 出杆动画期间由 render() 接管球杆
      this.cueGroup.visible = true;
    } else {
      const showCue = cueActive && phase === 'aiming' && !this.lastWorld?.moving && !this.planActive;
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
        this.cueGroup.rotation.set(-0.1, -angle, 0, 'YXZ'); // yaw 取负：杆尾指向瞄准反向，理由见 triggerStrike
      } else {
        this.cuePull = 0;
      }
    }

    // sync() 先于本方法被调用，updateAimGuide 依赖的 phase 在此刻才更新——
    // 用最新 phase 重算一次瞄准辅助，避免开局幽灵球要等下一次交互才显示
    this.updateAimGuide();
    this.invalidate();
  }

  /** 渲染循环：推进落袋动画并渲染 */
  render() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const animatedShadows = Boolean(
      this.lastWorld?.moving || this.strikeAnim || this.dropAnims.size || this.planPlayAnim,
    );

    // 相机平滑收敛：只在目标未到位时继续申请帧，脱离 React 渲染节奏——
    // 拖拽/点击瞄准后即使 React 不再渲染,相机也能滑行就位
    const lerpK = 1 - Math.pow(0.0001, dt);
    this.camera.position.lerp(this.targetCameraPos, Math.min(0.25, lerpK * 3));
    this.smoothLookAt.lerp(this.targetLookAt, Math.min(0.3, lerpK * 4));
    if (this.camera.position.distanceToSquared(this.targetCameraPos) <= 1e-8) {
      this.camera.position.copy(this.targetCameraPos);
    }
    if (this.smoothLookAt.distanceToSquared(this.targetLookAt) <= 1e-8) {
      this.smoothLookAt.copy(this.targetLookAt);
    }
    this.camera.lookAt(this.smoothLookAt);

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

    this.updatePlanPlay(dt);

    this.renderer.shadowMap.needsUpdate = this.needsShadowUpdate || animatedShadows;
    this.needsShadowUpdate = false;
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.renderSlotMs = null;
    this.clock.start();
    this.invalidate();
  }

  stop() {
    this.running = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = 0;
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

  /** 台面坐标投影到当前活相机的屏幕坐标，供真实交互回归定位，不参与执行。 */
  tableToScreen(x: number, z: number): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const projected = new THREE.Vector3(x, 0, z).project(this.camera);
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    };
  }

  private positionVirtualCamera(aimAngle: number, viewLevel = this.viewLevel): boolean {
    const cue = this.ballMeshes[0];
    if (!cue) return false;
    const cueX = cue.position.x;
    const cueZ = cue.position.z;
    this.virtualCam.aspect = this.camera.aspect;
    this.virtualCam.updateProjectionMatrix();
    const pose = cameraPoseAt(cueX, cueZ, aimAngle, 0, viewLevel);
    this.virtualCam.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.virtualCam.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    this.virtualCam.updateMatrixWorld(true);
    return true;
  }

  /** 以指定世界瞄准角的目标相机位姿，把台面坐标投影到屏幕。 */
  tableToScreenAt(x: number, z: number, aimAngle: number, viewLevel = this.viewLevel): { x: number; y: number } | null {
    if (!this.positionVirtualCamera(aimAngle, viewLevel)) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const projected = new THREE.Vector3(x, 0, z).project(this.virtualCam);
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    };
  }

  /**
   * 以指定瞄准角和视角高度的目标相机位姿做射线(不经过平滑滞后的活相机)。
   * 活相机 lerp 就位后与该位姿一致,用于确定性反算"屏幕点对应的台面点"
   * (回归测试的基准真值)。位姿公式与 update() 一致(静止瞄准态,power=0)。
   */
  screenToTableAt(
    clientX: number,
    clientY: number,
    aimAngle: number,
    viewLevel = this.viewLevel,
  ): { x: number; z: number } | null {
    if (!this.positionVirtualCamera(aimAngle, viewLevel)) return this.screenToTable(clientX, clientY);

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.virtualCam);
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
    this.invalidate();
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
