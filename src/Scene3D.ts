/*
[INPUT]: 依赖 physics 物理世界快照、独立瞄准/相机方位、textures 确定性台呢/袋口贴图与 Three.js
[OUTPUT]: 对外提供正确归一贴图的真实六袋场景、分离的 world/cue/camera 同步、活相机手势冻结、完整资源释放、按需阴影/渲染统计、纵横屏全台视角、瞄准辅助、摆球、球杆动画、走位/复盘及屏幕↔台面映射
[POS]: 渲染适配层，只消费世界快照；不得决定球局结果，不得改写物理世界
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  CUSHION_SEGMENTS,
  POCKETS,
  TABLE,
  pocketLocalToWorld,
  worldToPocketLocal,
  predictBallCollisionDirections,
  type BilliardsWorld,
  type Point2,
  type PocketGeometry,
} from './physics';
import type { PositionPlan } from './planner/search';
import type { ShotReview } from './planner/review';
import {
  CAMERA_FOV_DEGREES,
  cameraPoseAt,
  clampViewLevel,
  isGlobalCameraView,
  normalizeCameraAzimuth,
} from './camera-view';
import {
  makeClothMaps,
  makeWoodTexture,
  makeLeatherTexture,
  makePocketMouthTexture,
  makeBallTexture,
  makeCueBallTexture,
} from './textures';
import { renderBudgetFor } from './render-policy';

const R = TABLE.ballRadius;
const W = TABLE.width;
const L = TABLE.length;
const RAIL_H = 0.045;
const RAIL_W = 0.07;
const CUSHION_H = 0.038;
const CUSHION_W = 0.048;
const POCKET_POS: [number, number][] = POCKETS.map(
  pocket => [pocket.x, pocket.z],
);

/** ShapeGeometry 默认把形状坐标直接当 UV；这里在旋转前显式映射世界台面坐标。 */
function remapShapeGeometryUv(
  geometry: THREE.ShapeGeometry,
  mapPoint: (point: Point2) => [u: number, v: number],
  uvSpace: string,
): void {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const [u, v] = mapPoint({
      x: position.getX(index),
      z: -position.getY(index),
    });
    uv.setXY(index, u, v);
  }
  uv.needsUpdate = true;
  geometry.userData.uvSpace = uvSpace;
}

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
  /** 纯视觉方位；玩家回合可跟随 aimAngle，观战回合由用户独立环绕。 */
  private cameraAzimuth = 0;
  /** 0=第一人称，1=俯视；中间值可停留。 */
  private viewLevel = 0;
  private phase = 'intro';
  private lastCueX = 0;
  private lastCueZ = 0;
  private lastPreviewPower = 0;
  /** 只控制预测球路；幽灵球和合法目标环始终保留基础交互。 */
  private aimAssistVisible = false;

  private targetCameraPos = new THREE.Vector3();
  private targetLookAt = new THREE.Vector3();
  private smoothLookAt = new THREE.Vector3();
  /** 指针手势期间冻结实际可见相机；状态仍可更新，松手后再追向最新目标。 */
  private cameraGestureActive = false;
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
  /** 后台 rAF 被节流时的触球墙钟兜底；卸载或正常触球都必须取消。 */
  private strikeFallbackTimer: number | null = null;

  private animationId = 0;
  private running = false;
  private renderFrameCount = 0;
  private worldSyncCount = 0;
  private aimSyncCount = 0;
  private cameraSyncCount = 0;
  private shadowInvalidationCount = 0;
  private shadowFrameCount = 0;
  private shadowMapSize: 1024 | 2048;
  private environmentTarget: THREE.WebGLRenderTarget | null = null;

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

    const renderBudget = renderBudgetFor({
      width: element.clientWidth,
      height: element.clientHeight,
      devicePixelRatio: window.devicePixelRatio,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    });
    this.shadowMapSize = renderBudget.shadowMapSize;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090a);
    this.scene.fog = new THREE.Fog(0x07090a, 4, 11);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, element.clientWidth / element.clientHeight, 0.01, 60);
    this.virtualCam = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, element.clientWidth / element.clientHeight, 0.01, 60);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: renderBudget.powerPreference,
    });
    this.renderer.setSize(element.clientWidth, element.clientHeight);
    this.renderer.setPixelRatio(renderBudget.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 阴影只在球/球杆/规划动画实际变化时刷新；静止镜头移动复用同一张光照图。
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    element.appendChild(this.renderer.domElement);

    // 环境反射：程序化房间，给球体真实高光
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnvironment = new RoomEnvironment();
    this.environmentTarget = pmrem.fromScene(roomEnvironment, 0.04);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = 0.55;
    roomEnvironment.dispose();
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

  private setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.07));

    // 主光：略偏一侧，产生长影子
    const key = new THREE.DirectionalLight(0xfff2dd, 2.6);
    key.position.set(0.6, 2.6, 0.4);
    key.castShadow = true;
    key.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
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

    // ---- 呢面：沿共享库边/圆弧角衬生成连续外轮廓 ----
    const railById = new Map(
      CUSHION_SEGMENTS
        .filter(segment => segment.role === 'rail')
        .map(segment => [segment.id, segment]),
    );
    const distanceSq = (a: Point2, b: Point2) =>
      (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
    const jawPaths = (pocket: PocketGeometry): [Point2[], Point2[]] => {
      const half = pocket.jawSegments.length / 2;
      return [
        pocket.jawSegments.slice(0, half),
        pocket.jawSegments.slice(half),
      ].map(segments => [
        segments[0].a,
        ...segments.map(segment => segment.b),
      ]) as [Point2[], Point2[]];
    };
    const clothBoundary: Point2[] = [];
    const appendPoint = (point: Point2) => {
      const previous = clothBoundary[clothBoundary.length - 1];
      if (!previous || distanceSq(previous, point) > 1e-12) clothBoundary.push(point);
    };
    const appendRail = (id: string, reverse = false) => {
      const segment = railById.get(id)!;
      appendPoint(reverse ? segment.b : segment.a);
      appendPoint(reverse ? segment.a : segment.b);
    };
    const appendPocket = (pocket: PocketGeometry) => {
      const paths = jawPaths(pocket);
      const current = clothBoundary[clothBoundary.length - 1];
      const firstIndex = distanceSq(current, paths[0][0]) <= distanceSq(current, paths[1][0])
        ? 0
        : 1;
      for (const point of paths[firstIndex]) appendPoint(point);
      for (const point of [...paths[1 - firstIndex]].reverse()) appendPoint(point);
    };

    appendRail('rail-z--1');
    appendPocket(POCKETS[1]);
    appendRail('rail-x-1-top');
    appendPocket(POCKETS[3]);
    appendRail('rail-x-1-bottom');
    appendPocket(POCKETS[5]);
    appendRail('rail-z-1', true);
    appendPocket(POCKETS[4]);
    appendRail('rail-x--1-bottom', true);
    appendPocket(POCKETS[2]);
    appendRail('rail-x--1-top', true);
    appendPocket(POCKETS[0]);

    const clothShape = new THREE.Shape();
    clothShape.moveTo(clothBoundary[0].x, -clothBoundary[0].z);
    for (const point of clothBoundary.slice(1)) {
      clothShape.lineTo(point.x, -point.z);
    }
    clothShape.closePath();
    const clothGeo = new THREE.ShapeGeometry(clothShape, 24);
    const clothBounds = clothBoundary.reduce(
      (bounds, point) => ({
        minX: Math.min(bounds.minX, point.x),
        maxX: Math.max(bounds.maxX, point.x),
        minZ: Math.min(bounds.minZ, point.z),
        maxZ: Math.max(bounds.maxZ, point.z),
      }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    );
    const clothSpanX = clothBounds.maxX - clothBounds.minX;
    const clothSpanZ = clothBounds.maxZ - clothBounds.minZ;
    remapShapeGeometryUv(
      clothGeo,
      point => [
        (point.x - clothBounds.minX) / clothSpanX,
        (point.z - clothBounds.minZ) / clothSpanZ,
      ],
      'table-world-bounds-0-1',
    );
    clothGeo.rotateX(-Math.PI / 2);
    const clothMat = new THREE.MeshPhysicalMaterial({
      map: clothMaps.map,
      normalMap: clothMaps.normalMap,
      // 纵向法线略强于横向，与真实台呢梳毛方向一致，不靠放大凹凸假装“织物”。
      normalScale: new THREE.Vector2(0.22, 0.38),
      roughnessMap: clothMaps.roughnessMap,
      roughness: 0.96,
      metalness: 0.0,
      sheen: 0.58,
      sheenRoughness: 0.78,
      sheenColor: new THREE.Color(0x78b99a),
      envMapIntensity: 0.12,
    });
    const cloth = new THREE.Mesh(clothGeo, clothMat);
    cloth.name = 'table-cloth';
    cloth.userData.surfaceRole = 'directional-worsted-cloth';
    cloth.userData.textureSeed = '42a11ce/8f31d07';
    cloth.receiveShadow = true;
    this.tableGroup.add(cloth);

    // 呢面包边（台呢向下包住的侧边）
    const wrapMat = new THREE.MeshStandardMaterial({ color: 0x0b5c40, roughness: 0.95 });
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.012, 0.05, L + 0.012), wrapMat);
    wrap.position.y = -0.06;
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
    // 一体式木质外框：材质与桌体完全一致，外轮廓只在四角圆弧过渡。
    // 六个袋口只从内侧读形，不再为每个袋口添加独立外凸木圈/皮圈。
    const outerHalfW = W / 2 + CUSHION_W + RAIL_W;
    const outerHalfL = L / 2 + CUSHION_W + RAIL_W;
    const innerHalfW = W / 2 + CUSHION_W;
    const innerHalfL = L / 2 + CUSHION_W;
    // 实体中式台的角部不是方框斜切：外沿约等于整段台帮宽度的一次连续圆角。
    const outerCornerRadius = CUSHION_W + RAIL_W - 0.003;
    const appendRoundedRect = (
      path: THREE.Path,
      halfW: number,
      halfL: number,
      radius: number,
    ) => {
      path.moveTo(-halfW + radius, -halfL);
      path.lineTo(halfW - radius, -halfL);
      path.quadraticCurveTo(halfW, -halfL, halfW, -halfL + radius);
      path.lineTo(halfW, halfL - radius);
      path.quadraticCurveTo(halfW, halfL, halfW - radius, halfL);
      path.lineTo(-halfW + radius, halfL);
      path.quadraticCurveTo(-halfW, halfL, -halfW, halfL - radius);
      path.lineTo(-halfW, -halfL + radius);
      path.quadraticCurveTo(-halfW, -halfL, -halfW + radius, -halfL);
      path.closePath();
    };
    const appendPocketedOpening = (path: THREE.Path) => {
      const sidePocketHalfWidth = POCKETS[2].mouthHalfWidth + 0.014;
      const sidePocketDepth = RAIL_W - 0.018;
      const cornerPocketSpan = POCKETS[0].mouthHalfWidth * Math.SQRT2 + 0.008;
      const cornerPocketOffset = 0.029;
      const appendRoundedCornerCutout = (
        centerX: number,
        centerY: number,
        endX: number,
        endY: number,
      ) => {
        const current = path.currentPoint;
        const startX = current.x - centerX;
        const startY = current.y - centerY;
        const endLocalX = endX - centerX;
        const endLocalY = endY - centerY;
        const startAngle = Math.atan2(startY, startX);
        let endAngle = Math.atan2(endLocalY, endLocalX);
        while (endAngle >= startAngle) endAngle -= Math.PI * 2;
        const startRadius = Math.hypot(startX, startY);
        const endRadius = Math.hypot(endLocalX, endLocalY);
        const outerRadius = Math.SQRT2 * (CUSHION_W + cornerPocketOffset);
        const points: THREE.Vector2[] = [];
        const steps = 10;

        // 沿袋心画一段鼓出的光滑弧：两端顺接直库，中段向木框圆角收进去。
        // 半径用正弦缓动增大，避免旧版两段二次曲线在角点形成可见折痕。
        for (let step = 1; step <= steps; step += 1) {
          const t = step / steps;
          const angle = THREE.MathUtils.lerp(startAngle, endAngle, t);
          const edgeRadius = THREE.MathUtils.lerp(startRadius, endRadius, t);
          const radius = edgeRadius + (outerRadius - edgeRadius) * Math.sin(Math.PI * t);
          points.push(new THREE.Vector2(
            centerX + Math.cos(angle) * radius,
            centerY + Math.sin(angle) * radius,
          ));
        }
        path.splineThru(points);
      };

      // 顺时针走内孔：四个角袋圆润收肩，中袋在左右内沿形成浅半圆凹口。
      path.moveTo(-innerHalfW + cornerPocketSpan, -innerHalfL);
      appendRoundedCornerCutout(
        -W / 2,
        -L / 2,
        -innerHalfW,
        -innerHalfL + cornerPocketSpan,
      );
      path.lineTo(-innerHalfW, -sidePocketHalfWidth);
      path.quadraticCurveTo(
        -innerHalfW - sidePocketDepth,
        -sidePocketHalfWidth,
        -innerHalfW - sidePocketDepth,
        0,
      );
      path.quadraticCurveTo(
        -innerHalfW - sidePocketDepth,
        sidePocketHalfWidth,
        -innerHalfW,
        sidePocketHalfWidth,
      );
      path.lineTo(-innerHalfW, innerHalfL - cornerPocketSpan);
      appendRoundedCornerCutout(
        -W / 2,
        L / 2,
        -innerHalfW + cornerPocketSpan,
        innerHalfL,
      );
      path.lineTo(innerHalfW - cornerPocketSpan, innerHalfL);
      appendRoundedCornerCutout(
        W / 2,
        L / 2,
        innerHalfW,
        innerHalfL - cornerPocketSpan,
      );
      path.lineTo(innerHalfW, sidePocketHalfWidth);
      path.quadraticCurveTo(
        innerHalfW + sidePocketDepth,
        sidePocketHalfWidth,
        innerHalfW + sidePocketDepth,
        0,
      );
      path.quadraticCurveTo(
        innerHalfW + sidePocketDepth,
        -sidePocketHalfWidth,
        innerHalfW,
        -sidePocketHalfWidth,
      );
      path.lineTo(innerHalfW, -innerHalfL + cornerPocketSpan);
      appendRoundedCornerCutout(
        W / 2,
        -L / 2,
        innerHalfW - cornerPocketSpan,
        -innerHalfL,
      );
      path.lineTo(-innerHalfW + cornerPocketSpan, -innerHalfL);
      path.closePath();
    };
    const woodFrameShape = new THREE.Shape();
    appendRoundedRect(
      woodFrameShape,
      outerHalfW,
      outerHalfL,
      outerCornerRadius,
    );
    const woodFrameOpening = new THREE.Path();
    appendPocketedOpening(woodFrameOpening);
    woodFrameShape.holes.push(woodFrameOpening);
    const woodFrameGeometry = new THREE.ExtrudeGeometry(woodFrameShape, {
      depth: RAIL_H,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.003,
      bevelThickness: 0.002,
    });
    woodFrameGeometry.rotateX(-Math.PI / 2);
    const woodFrame = new THREE.Mesh(woodFrameGeometry, woodMat);
    woodFrame.name = 'table-wood-frame';
    woodFrame.userData.pocketCutoutCount = 6;
    woodFrame.userData.roundedOuterCornerCount = 4;
    woodFrame.userData.roundedCornerPocketCount = 4;
    woodFrame.castShadow = true;
    woodFrame.receiveShadow = true;
    this.tableGroup.add(woodFrame);

    // ---- 共享库边：直线段与离散圆弧段使用同一种连续包呢实体 ----
    const cushionMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f6a4a,
      roughness: 0.85,
      sheen: 0.5,
      sheenColor: new THREE.Color(0x88c8a8),
      sheenRoughness: 0.6,
      side: THREE.DoubleSide,
    });
    for (const segment of CUSHION_SEGMENTS) {
      const outerA = {
        x: segment.a.x - segment.inward.x * CUSHION_W,
        z: segment.a.z - segment.inward.z * CUSHION_W,
      };
      const outerB = {
        x: segment.b.x - segment.inward.x * CUSHION_W,
        z: segment.b.z - segment.inward.z * CUSHION_W,
      };
      const shape = new THREE.Shape();
      shape.moveTo(segment.a.x, -segment.a.z);
      shape.lineTo(segment.b.x, -segment.b.z);
      shape.lineTo(outerB.x, -outerB.z);
      shape.lineTo(outerA.x, -outerA.z);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: CUSHION_H,
        bevelEnabled: false,
      });
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, cushionMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.tableGroup.add(mesh);
    }

    // ---- 袋腔：浅驼皮圈 + 白色菱形网袋 + 深处暗底 ----
    // 物理仍完全消费 PocketGeometry；这里仅把同一开口做成立体结构，
    // 避免库边断开后只剩一块平面暗色，看起来像台帮缺了一截。
    // 真实中式球台的袋口由浅色皮圈和白网主导，黑暗只应退到网袋后方。
    const pocketLipMat = new THREE.MeshPhysicalMaterial({
      map: leatherTex,
      bumpMap: leatherTex,
      bumpScale: 0.00045,
      color: 0xd5c5a4,
      roughness: 0.74,
      clearcoat: 0.055,
      clearcoatRoughness: 0.82,
      envMapIntensity: 0.2,
      side: THREE.DoubleSide,
    });
    // 实体乔氏袋口的外护口是机器压制牛皮 + 硬质骨架，视觉上应是薄而挺的平面，
    // 不是软包或圆绳。浅驼色用于从同色木框上读出材质边界。
    const pocketTopTrimMat = new THREE.MeshPhysicalMaterial({
      map: leatherTex,
      bumpMap: leatherTex,
      bumpScale: 0.00055,
      color: 0x86623f,
      roughness: 0.8,
      clearcoat: 0.035,
      clearcoatRoughness: 0.88,
      envMapIntensity: 0.16,
      side: THREE.DoubleSide,
    });
    const pocketWallMat = new THREE.MeshStandardMaterial({
      map: leatherTex,
      bumpMap: leatherTex,
      bumpScale: 0.00135,
      color: 0x5c4936,
      roughness: 0.93,
      side: THREE.DoubleSide,
    });
    const pocketBottomMat = new THREE.MeshStandardMaterial({
      color: 0x060504,
      roughness: 0.98,
      side: THREE.DoubleSide,
    });
    const mouthTexture = makePocketMouthTexture();
    const pocketMouthMat = new THREE.MeshBasicMaterial({
      map: mouthTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const pocketNetMat = new THREE.LineBasicMaterial({
      color: 0xeee6d3,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    for (const pocket of POCKETS) {
      const halfWidth = pocket.mouthHalfWidth;
      const depthRadius = pocket.shelfDepth + (pocket.kind === 'corner' ? 0.016 : 0.014);
      const centerDepth = depthRadius + 0.002;
      const topHalfWidth = halfWidth * 1.1;
      const bottomHalfWidth = topHalfWidth * 0.66;
      const bottomDepthRadius = depthRadius * 0.64;
      const bottomCenterDepth = centerDepth + 0.012;
      const radialSteps = 36;
      const wallPositions: number[] = [];
      const wallIndices: number[] = [];
      const bottomPoints: Point2[] = [];
      const mouthPoints: Point2[] = [];
      // 暗口的最内缘严格复用物理捕获深度：从台内看是一小段圆弧凹口，
      // 球心越过视觉弧线时，物理也在同一位置开始下坠。
      const mouthCenterDepth = depthRadius - pocket.captureInset;

      for (let step = 0; step < radialSteps; step += 1) {
        const angle = (step / radialSteps) * Math.PI * 2;
        const top = pocketLocalToWorld(
          pocket,
          centerDepth + Math.sin(angle) * depthRadius,
          Math.cos(angle) * topHalfWidth,
        );
        const lower = pocketLocalToWorld(
          pocket,
          bottomCenterDepth + Math.sin(angle) * bottomDepthRadius,
          Math.cos(angle) * bottomHalfWidth,
        );
        wallPositions.push(top.x, -0.006, top.z, lower.x, -0.072, lower.z);
        bottomPoints.push(lower);
        mouthPoints.push(
          pocketLocalToWorld(
            pocket,
            mouthCenterDepth + Math.sin(angle) * depthRadius,
            Math.cos(angle) * topHalfWidth * 0.94,
          ),
        );
        const next = (step + 1) % radialSteps;
        wallIndices.push(
          step * 2,
          next * 2,
          step * 2 + 1,
          next * 2,
          next * 2 + 1,
          step * 2 + 1,
        );
      }
      const wallGeometry = new THREE.BufferGeometry();
      wallGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(wallPositions, 3),
      );
      wallGeometry.setIndex(wallIndices);
      wallGeometry.computeVertexNormals();
      const wall = new THREE.Mesh(wallGeometry, pocketWallMat);
      wall.name = `pocket-well-${pocket.index}`;
      wall.receiveShadow = true;
      this.tableGroup.add(wall);

      const bottomShape = new THREE.Shape();
      bottomShape.moveTo(bottomPoints[0].x, -bottomPoints[0].z);
      for (const point of bottomPoints.slice(1)) {
        bottomShape.lineTo(point.x, -point.z);
      }
      bottomShape.closePath();
      const bottom = new THREE.Mesh(
        new THREE.ShapeGeometry(bottomShape),
        pocketBottomMat,
      );
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = -0.0715;
      bottom.name = `pocket-bottom-${pocket.index}`;
      bottom.receiveShadow = true;
      this.tableGroup.add(bottom);

      // 俯视读形层：把袋腔暗部轻微带入台面，使远景仍是椭圆袋口而不是直库缺口。
      // 半透明边缘保留台呢纹理与下方斜壁的层次，不参与深度写入。
      const mouthShape = new THREE.Shape();
      mouthShape.moveTo(mouthPoints[0].x, -mouthPoints[0].z);
      for (const point of mouthPoints.slice(1)) {
        mouthShape.lineTo(point.x, -point.z);
      }
      mouthShape.closePath();
      const mouthGeometry = new THREE.ShapeGeometry(mouthShape);
      const mouthHalfWidth = topHalfWidth * 0.94;
      remapShapeGeometryUv(
        mouthGeometry,
        point => {
          const local = worldToPocketLocal(pocket, point);
          return [
            THREE.MathUtils.clamp(
              0.5 + local.lateral / (mouthHalfWidth * 2),
              0,
              1,
            ),
            THREE.MathUtils.clamp(
              0.5 + (local.depth - mouthCenterDepth) / (depthRadius * 2),
              0,
              1,
            ),
          ];
        },
        'pocket-local-bounds-0-1',
      );
      const mouth = new THREE.Mesh(
        mouthGeometry,
        pocketMouthMat,
      );
      mouth.rotation.x = -Math.PI / 2;
      mouth.position.y = 0.0012;
      mouth.name = `pocket-mouth-${pocket.index}`;
      mouth.userData.captureShape = 'inward-arc';
      mouth.userData.captureInsetMm = pocket.captureInset * 1000;
      mouth.renderOrder = 2;
      this.tableGroup.add(mouth);

      // 照片中的白色绳网从皮圈下沿开始，向下收成更窄的袋兜。
      // 两组反向斜线跨越相邻高度层，形成真正的菱形网格，而不是贴图或平行竖线。
      const netRows = 6;
      const netStrands = 18;
      const netPositions: number[] = [];
      const netPoint = (row: number, strand: number) => {
        const rowT = row / (netRows - 1);
        const angle = (strand / netStrands) * Math.PI * 2;
        const rowCenterDepth = THREE.MathUtils.lerp(
          centerDepth,
          bottomCenterDepth,
          rowT,
        );
        const rowDepthRadius = THREE.MathUtils.lerp(
          depthRadius * 0.91,
          bottomDepthRadius * 0.72,
          rowT,
        );
        const rowHalfWidth = THREE.MathUtils.lerp(
          topHalfWidth * 0.88,
          bottomHalfWidth * 0.78,
          rowT,
        );
        const point = pocketLocalToWorld(
          pocket,
          rowCenterDepth + Math.sin(angle) * rowDepthRadius,
          Math.cos(angle) * rowHalfWidth,
        );
        return new THREE.Vector3(
          point.x,
          THREE.MathUtils.lerp(-0.004, -0.069, rowT),
          point.z,
        );
      };
      const appendNetSegment = (a: THREE.Vector3, b: THREE.Vector3) => {
        netPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      };
      for (let strand = 0; strand < netStrands; strand += 1) {
        appendNetSegment(
          netPoint(0, strand),
          netPoint(0, (strand + 1) % netStrands),
        );
      }
      for (let row = 0; row < netRows - 1; row += 1) {
        for (let strand = 0; strand < netStrands; strand += 1) {
          appendNetSegment(
            netPoint(row, strand),
            netPoint(row + 1, (strand + 1) % netStrands),
          );
          appendNetSegment(
            netPoint(row, strand),
            netPoint(row + 1, (strand - 1 + netStrands) % netStrands),
          );
        }
      }
      const netGeometry = new THREE.BufferGeometry();
      netGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(netPositions, 3),
      );
      const net = new THREE.LineSegments(netGeometry, pocketNetMat);
      net.name = `pocket-net-${pocket.index}`;
      net.userData.materialRole = 'white-diamond-net';
      net.userData.rowCount = netRows;
      net.userData.strandCount = netStrands;
      net.userData.diamondSegmentCount = (netRows - 1) * netStrands * 2;
      net.renderOrder = 3;
      this.tableGroup.add(net);

      // 只包住袋口外半圈，不做悬浮的完整圆环；中间沿袋腔向外回弯，
      // 现在只模拟真实皮圈内沿的一道浅色缝边；黑暗退到网袋与袋底之后。
      const trimSourceLocalPoints: Array<[number, number]> = [
        [-pocket.captureInset * 0.16, -halfWidth * 0.98],
        [pocket.shelfDepth * 0.58, -halfWidth * 1.06],
        [centerDepth + depthRadius * 0.52, -halfWidth * 0.72],
        [centerDepth + depthRadius, 0],
        [centerDepth + depthRadius * 0.52, halfWidth * 0.72],
        [pocket.shelfDepth * 0.58, halfWidth * 1.06],
        [-pocket.captureInset * 0.16, halfWidth * 0.98],
      ];
      // 四个角袋的浅色缝边显式穿过两侧 jaw 入口，并继续向台内藏入约 8mm。
      // 曲线若直接从 jaw 附近起步，Tube 端帽与圆弧库边在斜视角会露出一小段断缝。
      // 增加“隐藏端点 → 精确 jaw 锚点”后，端帽被库边覆盖，曲线切向仍连续。
      const cornerJoinExtension = R * 0.275;
      const lipLocalPoints: Array<[number, number]> = pocket.kind === 'corner'
        ? [
            [-cornerJoinExtension, -halfWidth * 0.94],
            [0, -halfWidth],
            ...trimSourceLocalPoints.slice(1, -1),
            [0, halfWidth],
            [-cornerJoinExtension, halfWidth * 0.94],
          ]
        : trimSourceLocalPoints;
      const lipCurve = new THREE.CatmullRomCurve3(
        lipLocalPoints.map(([depth, lateral]) => {
          const point = pocketLocalToWorld(pocket, depth, lateral);
          return new THREE.Vector3(point.x, 0.0045, point.z);
        }),
        false,
        'centripetal',
      );

      // 木框顶面的薄皮护口：沿袋口外半圈铺一条扁平硬挺的带状实体。
      // 顶面宽度足以在全台俯视中识别，厚度仅 1.6mm，避免再次出现软、厚、外凸的感觉。
      // 护口使用独立曲线，把两端藏进木帮一小段；袋腔内的深色袋唇仍沿原曲线落到 jaw 入口。
      const trimLocalPoints = trimSourceLocalPoints.map(([depth, lateral], index) => {
        const isEnd = index === 0 || index === trimSourceLocalPoints.length - 1;
        return [
          isEnd ? pocket.shelfDepth * 0.5 : depth,
          lateral,
        ] as [number, number];
      });
      const trimCurve = new THREE.CatmullRomCurve3(
        trimLocalPoints.map(([depth, lateral]) => {
          const point = pocketLocalToWorld(pocket, depth, lateral);
          return new THREE.Vector3(point.x, 0, point.z);
        }),
        false,
        'centripetal',
      );
      const trimPoints = trimCurve.getPoints(48);
      const trimWidth = pocket.kind === 'corner' ? 0.019 : 0.015;
      const trimTopY = RAIL_H + 0.007;
      const trimBottomY = trimTopY - 0.006;
      const trimPositions: number[] = [];
      const trimIndices: number[] = [];
      for (let index = 0; index < trimPoints.length; index += 1) {
        const point = trimPoints[index];
        const previous = trimPoints[Math.max(0, index - 1)];
        const next = trimPoints[Math.min(trimPoints.length - 1, index + 1)];
        const dx = next.x - previous.x;
        const dz = next.z - previous.z;
        const length = Math.hypot(dx, dz) || 1;
        let normalX = -dz / length;
        let normalZ = dx / length;
        // 护口只压在木框一侧：内沿贴袋腔曲线，外沿朝远离台心的方向展开。
        // 若以曲线为中心对称铺带，一半会悬在洞口上，低机位就会误读成 U 形软圈。
        if (normalX * point.x + normalZ * point.z < 0) {
          normalX *= -1;
          normalZ *= -1;
        }
        const t = index / (trimPoints.length - 1);
        const edgeDistance = Math.min(t, 1 - t);
        const endBlend = 1 - THREE.MathUtils.smoothstep(edgeDistance, 0, 0.18);
        normalX = THREE.MathUtils.lerp(normalX, pocket.outward.x, endBlend);
        normalZ = THREE.MathUtils.lerp(normalZ, pocket.outward.z, endBlend);
        const blendedNormalLength = Math.hypot(normalX, normalZ) || 1;
        normalX /= blendedNormalLength;
        normalZ /= blendedNormalLength;
        // 实体皮圈接近库边时会自然收窄；保留 35% 宽度避免归零尖角，
        // 同时消除旧版全宽直截面在低机位形成的两块方形小舌。
        const widthScale = THREE.MathUtils.lerp(
          0.35,
          1,
          THREE.MathUtils.smoothstep(edgeDistance, 0, 0.2),
        );
        const capWidth = trimWidth * widthScale;
        const leftX = point.x + normalX * capWidth;
        const leftZ = point.z + normalZ * capWidth;
        const rightX = point.x;
        const rightZ = point.z;
        trimPositions.push(
          leftX, trimTopY, leftZ,
          rightX, trimTopY, rightZ,
          leftX, trimBottomY, leftZ,
          rightX, trimBottomY, rightZ,
        );
        if (index === 0) continue;
        const previousBase = (index - 1) * 4;
        const currentBase = index * 4;
        trimIndices.push(
          previousBase, currentBase, previousBase + 1,
          currentBase, currentBase + 1, previousBase + 1,
          previousBase + 2, previousBase + 3, currentBase + 2,
          currentBase + 2, previousBase + 3, currentBase + 3,
          previousBase, previousBase + 2, currentBase,
          currentBase, previousBase + 2, currentBase + 2,
          previousBase + 1, currentBase + 1, previousBase + 3,
          currentBase + 1, currentBase + 3, previousBase + 3,
        );
      }
      const lastTrimBase = (trimPoints.length - 1) * 4;
      trimIndices.push(
        0, 1, 2, 1, 3, 2,
        lastTrimBase, lastTrimBase + 2, lastTrimBase + 1,
        lastTrimBase + 1, lastTrimBase + 2, lastTrimBase + 3,
      );
      const trimGeometry = new THREE.BufferGeometry();
      trimGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(trimPositions, 3),
      );
      trimGeometry.setIndex(trimIndices);
      trimGeometry.computeVertexNormals();
      const topTrim = new THREE.Mesh(trimGeometry, pocketTopTrimMat);
      topTrim.name = `pocket-top-trim-${pocket.index}`;
      topTrim.userData.materialRole = 'tan-leather-cap';
      topTrim.userData.widthMm = trimWidth * 1000;
      topTrim.userData.heightMm = (trimTopY - trimBottomY) * 1000;
      topTrim.userData.seamlessEndCount = 2;
      topTrim.castShadow = true;
      topTrim.receiveShadow = true;
      this.tableGroup.add(topTrim);

      const lip = new THREE.Mesh(
        new THREE.TubeGeometry(
          lipCurve,
          44,
          pocket.kind === 'corner' ? 0.0018 : 0.0016,
          8,
          false,
        ),
        pocketLipMat,
      );
      lip.name = `pocket-lip-${pocket.index}`;
      lip.userData.materialRole = 'stitched-welt';
      lip.userData.radiusMm = pocket.kind === 'corner' ? 1.8 : 1.6;
      lip.userData.jawAnchorCount = pocket.kind === 'corner' ? 2 : 0;
      lip.userData.joinExtensionMm = pocket.kind === 'corner'
        ? cornerJoinExtension * 1000
        : 0;
      lip.castShadow = true;
      lip.receiveShadow = true;
      this.tableGroup.add(lip);
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
    if (d === this.aimGhostDist) return;
    this.aimGhostDist = d;
    this.updateAimGuide();
    this.requestRender();
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
    this.requestRender();
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
    if (this.spin.x === spin.x && this.spin.y === spin.y) return;
    this.spin = spin;
    this.requestRender();
  }

  setLegalTargets(numbers: number[]) {
    const next = new Set(numbers);
    if (
      next.size === this.legalTargets.size &&
      [...next].every(number => this.legalTargets.has(number))
    ) return;
    this.legalTargets = next;
    this.updateLegalTargetRings();
    this.requestRender();
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
    const pocketHoleRadius = POCKETS[candidate.pocket].mouthHalfWidth;
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
    if (!plan || plan.steps.length === 0) {
      this.updateAimGuide();
      this.requestRender();
      return;
    }

    plan.steps.forEach((step, i) => {
      this.renderPlanStep(step, i, i === 0);
    });

    this.updateAimGuide(); // planActive 置位后隐藏常规瞄准辅助
    this.requestRender();
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
    if (!plan || !validIndex) {
      this.updateAimGuide();
      this.requestRender();
      return;
    }

    if (stepIndex > 0) {
      this.planStepPreviewWorld = plan.steps[stepIndex - 1]?.endWorld ?? null;
      this.snapBallsTo(this.planStepPreviewWorld);
    }
    this.renderPlanStep(plan.steps[stepIndex], stepIndex, true);
    this.updateAimGuide();
    this.requestRender();
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
    if (!review) {
      this.requestRender();
      return;
    }

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
    this.requestRender();
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
    this.requestRender(true);
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
    if (this.strikeFallbackTimer !== null) {
      window.clearTimeout(this.strikeFallbackTimer);
      this.strikeFallbackTimer = null;
    }
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
    this.requestRender(true);
    // 兜底：rAF 被浏览器节流（后台标签页）时，按墙钟时间到点直接触球，
    // 保证"松手必出杆"，动画只是表现层
    this.strikeFallbackTimer = window.setTimeout(() => {
      this.strikeFallbackTimer = null;
      if (this.strikeAnim === anim && !anim.fired) {
        this.cueGroup.position.copy(anim.contact);
        this.cueGroup.visible = false;
        this.strikeAnim = null;
        anim.fired = true;
        anim.onContact?.();
        this.requestRender(true);
      }
    }, dur1 * 1000 + 100);
  }

  setViewLevel(level: number) {
    const next = clampViewLevel(level);
    if (next === this.viewLevel) return;
    this.viewLevel = next;
    // 进入全局段就直接展示无遮挡桌面；相机继续抬升时不会穿过吊灯模型。
    if (this.lampGroup) this.lampGroup.visible = !isGlobalCameraView(this.viewLevel);
    this.updateCameraTarget();
    this.requestRender();
  }

  setAim(angle: number) {
    if (angle === this.aimAngle) return;
    this.aimAngle = angle;
    this.updateAimGuide();
    this.requestRender();
  }

  setCameraAzimuth(angle: number) {
    const next = normalizeCameraAzimuth(angle);
    if (next === this.cameraAzimuth) return;
    this.cameraAzimuth = next;
    this.updateCameraTarget();
    this.requestRender();
  }

  /**
   * 原子更新相机通道。纯相机变化不触碰世界、球杆或阴影；冻结手势期间只记住
   * 最新事实，松手后才更新目标位姿。
   */
  syncCamera(
    level: number,
    azimuth: number,
    cueX: number,
    cueZ: number,
    previewPower: number,
  ) {
    const nextLevel = clampViewLevel(level);
    const nextAzimuth = normalizeCameraAzimuth(azimuth);
    const nextPower = Math.max(0, previewPower);
    if (
      nextLevel === this.viewLevel &&
      nextAzimuth === this.cameraAzimuth &&
      cueX === this.lastCueX &&
      cueZ === this.lastCueZ &&
      nextPower === this.lastPreviewPower
    ) return;

    this.viewLevel = nextLevel;
    this.cameraAzimuth = nextAzimuth;
    this.lastCueX = cueX;
    this.lastCueZ = cueZ;
    this.lastPreviewPower = nextPower;
    if (this.lampGroup) this.lampGroup.visible = !isGlobalCameraView(this.viewLevel);
    this.updateCameraTarget();
    this.cameraSyncCount += 1;
    this.requestRender();
  }

  /** 指针落下时冻结活相机，而不是冻结尚未到达的目标位姿。 */
  beginCameraGesture() {
    if (this.cameraGestureActive) return;
    this.cameraGestureActive = true;
    this.targetCameraPos.copy(this.camera.position);
    this.targetLookAt.copy(this.smoothLookAt);
    this.requestRender();
  }

  /** 指针结束后以最新相机事实重新计算目标，平滑追上但不改变刚完成的世界输入。 */
  endCameraGesture() {
    if (!this.cameraGestureActive) return;
    this.cameraGestureActive = false;
    this.updateCameraTarget();
    this.requestRender();
  }

  private updateCameraTarget() {
    if (this.cameraGestureActive) return;
    const cameraPose = cameraPoseAt(
      this.lastCueX,
      this.lastCueZ,
      this.cameraAzimuth,
      this.lastPreviewPower,
      this.viewLevel,
      this.camera.aspect,
    );
    this.targetCameraPos.set(
      cameraPose.position.x,
      cameraPose.position.y,
      cameraPose.position.z,
    );
    this.targetLookAt.set(cameraPose.lookAt.x, cameraPose.lookAt.y, cameraPose.lookAt.z);
  }

  setAimAssistVisible(visible: boolean) {
    if (visible === this.aimAssistVisible) return;
    this.aimAssistVisible = visible;
    this.updateAimGuide();
    this.requestRender();
  }

  sync(world: BilliardsWorld) {
    this.worldSyncCount += 1;
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
          const entrySpeed = Math.hypot(pocketEvent.entryVx, pocketEvent.entryVz);
          const travel = 0.06;
          const dirX = entrySpeed > 1e-6
            ? pocketEvent.entryVx / entrySpeed
            : POCKETS[pocketEvent.pocket].outward.x;
          const dirZ = entrySpeed > 1e-6
            ? pocketEvent.entryVz / entrySpeed
            : POCKETS[pocketEvent.pocket].outward.z;
          target = new THREE.Vector3(
            pocketEvent.entryX + dirX * travel,
            -0.2,
            pocketEvent.entryZ + dirZ * travel,
          );
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

    this.updateLegalTargetRings();

    // 规划选中第 2/3 杆时，真实 world 仍是当前球局；同步完成后重新覆盖
    // 虚拟起始球位，直到 showPlanStep(null/越界) 或 clearPlan 恢复真实局面。
    if (this.planStepPreviewWorld) this.snapBallsTo(this.planStepPreviewWorld);

    this.updateAimGuide();
    // world 快照意味着球位/显隐事实可能变化；静态重置同样需要一帧正确球影。
    this.requestRender(true);
  }

  /** 合法目标环由 world、phase、targets 三种事实共同决定，任一通道变化都可独立刷新。 */
  private updateLegalTargetRings() {
    const world = this.lastWorld;
    if (!world) return;
    for (const ball of world.balls) {
      const ring = this.targetRings[ball.number];
      if (!ring) continue;
      ring.visible = ball.active && this.legalTargets.has(ball.number) && this.phase === 'aiming' && !world.moving && !this.planActive;
      if (ring.visible) ring.position.set(ball.x, 0.0025, ball.z);
    }
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
    const angle = this.aimAngle;
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

  /** 球杆/瞄准展示通道；不更新相机锚点，避免纯镜头操作重放 cue 与阴影工作。 */
  updateCue(cueX: number, cueZ: number, power: number, phase: string) {
    this.aimSyncCount += 1;
    this.phase = phase;
    const cue = this.ballMeshes[0];
    const cueActive = Boolean(this.lastWorld?.balls[0]?.active);
    // 摆球阶段物理世界仍保留母球作为候选状态，但画面只显示跟手的半透明预览；
    // 点击落实后下一次 sync 会恢复实体母球，避免一虚一实同时出现。
    if (cue && phase === 'placing') cue.visible = false;
    const angle = this.aimAngle;

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

    this.updateLegalTargetRings();
    this.updateAimGuide();
    this.requestRender(true);
  }

  /** 兼容既有脚本：业务层应分别调用 updateCue() 与 syncCamera()。 */
  update(cueX: number, cueZ: number, power: number, phase: string) {
    this.updateCue(cueX, cueZ, power, phase);
    this.syncCamera(this.viewLevel, this.cameraAzimuth, cueX, cueZ, power);
  }

  /** 相机或显式动画仍未收敛时才需要下一帧；静止球桌不维持空转 rAF。 */
  private hasFrameWork(): boolean {
    const cameraMoving =
      this.camera.position.distanceToSquared(this.targetCameraPos) > 1e-8 ||
      this.smoothLookAt.distanceToSquared(this.targetLookAt) > 1e-8;
    return cameraMoving || this.strikeAnim !== null || this.dropAnims.size > 0 || this.planPlayAnim !== null;
  }

  private requestRender(refreshShadows = false) {
    if (refreshShadows) {
      this.shadowInvalidationCount += 1;
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (!this.running || this.animationId !== 0) return;
    this.animationId = requestAnimationFrame(() => {
      this.animationId = 0;
      if (!this.running) return;
      this.render();
      if (this.hasFrameWork()) this.requestRender(this.strikeAnim !== null || this.dropAnims.size > 0 || this.planPlayAnim !== null);
    });
  }

  /** 渲染一帧：推进落袋/球杆/规划动画；是否续帧由 requestRender 决定。 */
  render() {
    const dt = Math.min(0.05, this.clock.getDelta());

    // 相机平滑收敛:随 rAF 每帧向目标位姿推进,脱离 React 渲染节奏——
    // 拖拽/点击瞄准后即使 React 不再渲染,相机也能滑行就位
    const lerpK = 1 - Math.pow(0.0001, dt);
    this.camera.position.lerp(this.targetCameraPos, Math.min(0.25, lerpK * 3));
    this.smoothLookAt.lerp(this.targetLookAt, Math.min(0.3, lerpK * 4));
    this.camera.lookAt(this.smoothLookAt);
    // 按相机的实际高度显隐，而不是按先一步更新的目标视角显隐。
    // 这样俯视与低机位平滑切换时，镜头不会在尚未越过灯体前看到吊灯穿模。
    if (this.lampGroup) this.lampGroup.visible = this.camera.position.y < 1.7;

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
          if (this.strikeFallbackTimer !== null) {
            window.clearTimeout(this.strikeFallbackTimer);
            this.strikeFallbackTimer = null;
          }
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

    if (this.renderer.shadowMap.needsUpdate) this.shadowFrameCount += 1;
    this.renderer.render(this.scene, this.camera);
    this.renderFrameCount += 1;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.requestRender(true);
  }

  stop() {
    this.running = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = 0;
  }

  /** 浏览器性能验收读取累计真实渲染帧数；不参与业务状态。 */
  renderedFrames(): number {
    return this.renderFrameCount;
  }

  /** 浏览器性能门禁读取复制后的通道/阴影统计，不暴露内部可写计数。 */
  debugRenderStats() {
    return {
      renderedFrames: this.renderFrameCount,
      worldSyncs: this.worldSyncCount,
      aimSyncs: this.aimSyncCount,
      cameraSyncs: this.cameraSyncCount,
      shadowInvalidations: this.shadowInvalidationCount,
      shadowFrames: this.shadowFrameCount,
    };
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

  private positionVirtualCamera(cameraAzimuth: number, viewLevel = this.viewLevel): boolean {
    const cue = this.ballMeshes[0];
    if (!cue) return false;
    const cueX = cue.position.x;
    const cueZ = cue.position.z;
    this.virtualCam.aspect = this.camera.aspect;
    this.virtualCam.updateProjectionMatrix();
    const pose = cameraPoseAt(
      cueX,
      cueZ,
      cameraAzimuth,
      0,
      viewLevel,
      this.virtualCam.aspect,
    );
    this.virtualCam.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.virtualCam.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    this.virtualCam.updateMatrixWorld(true);
    return true;
  }

  /** 以指定视觉相机方位的目标位姿，把台面坐标投影到屏幕。 */
  tableToScreenAt(x: number, z: number, cameraAzimuth: number, viewLevel = this.viewLevel): { x: number; y: number } | null {
    if (!this.positionVirtualCamera(cameraAzimuth, viewLevel)) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const projected = new THREE.Vector3(x, 0, z).project(this.virtualCam);
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    };
  }

  /**
   * 以指定视觉方位和视角高度的目标相机位姿做射线(不经过平滑滞后的活相机)。
   * 活相机 lerp 就位后与该位姿一致,用于确定性反算"屏幕点对应的台面点"
   * (回归测试的基准真值)。位姿公式与 update() 一致(静止瞄准态,power=0)。
   */
  screenToTableAt(
    clientX: number,
    clientY: number,
    cameraAzimuth: number,
    viewLevel = this.viewLevel,
  ): { x: number; z: number } | null {
    if (!this.positionVirtualCamera(cameraAzimuth, viewLevel)) {
      return this.screenToTable(clientX, clientY);
    }

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
    this.updateCameraTarget();
    this.requestRender();
  };

  dispose() {
    this.stop();
    if (this.strikeFallbackTimer !== null) {
      window.clearTimeout(this.strikeFallbackTimer);
      this.strikeFallbackTimer = null;
    }
    this.strikeAnim = null;
    window.removeEventListener('resize', this.handleResize);

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse(object => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry?.isBufferGeometry) geometries.add(renderable.geometry);
      const objectMaterials = renderable.material;
      if (Array.isArray(objectMaterials)) objectMaterials.forEach(material => materials.add(material));
      else if (objectMaterials?.isMaterial) materials.add(objectMaterials);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if ((value as THREE.Texture | undefined)?.isTexture) {
          textures.add(value as THREE.Texture);
        }
      }
    }
    textures.forEach(texture => texture.dispose());
    materials.forEach(material => material.dispose());
    geometries.forEach(geometry => geometry.dispose());
    this.scene.environment = null;
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.element) {
      this.element.removeChild(this.renderer.domElement);
    }
  }
}
