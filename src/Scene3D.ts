/*
[INPUT]: 依赖 physics 物理世界快照、pocket-render 共享袋口实体、独立瞄准/相机方位、textures 程序化贴图与 Three.js
[OUTPUT]: 对外提供真实球桌、静止按需渲染、GPU 自适应温控、相机/瞄准/规划/复盘映射，以及可完整回收的几何/材质/纹理生命周期
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
  isOverheadCameraView,
  normalizeCameraAzimuth,
} from './camera-view';
import {
  aimCameraPose,
  DEFAULT_CAMERA_SAFETY,
  type CameraFraming,
  type CameraSafetyInsets,
} from './camera-framing';
import {
  makeClothMaps,
  makeWoodTexture,
  makeLeatherTexture,
  makeBallTexture,
  makeCueBallTexture,
} from './textures';
import {
  adaptiveRenderQualityFor,
  renderBudgetFor,
  type AdaptiveRenderQuality,
  type RenderBudget,
  type RenderQualityTier,
} from './render-policy';
import {
  THERMAL_IDLE_RECOVERY_MS,
  createThermalGovernor,
  type ThermalSnapshot,
} from './thermal-governor';
import { createPocketDropTrajectory, type PocketDropTrajectory } from './pocket-drop';
import { createMergedRopeGeometry, type RopeSegment } from './pocket-render/rope-net';
import { pocketRenderProfile } from './pocket-render/profile';
import { pocketSeamContract } from './pocket-render/seam-contract';
import { createPocketTrimGeometry, createPocketWeltGeometry } from './pocket-render/trim-geometry';
import { makeCushionGeometry, CUSHION_PROFILE, CUSHION_NOSE_HEIGHT, TABLE_RENDER } from './pocket-render/cushion-geometry';
import { createTableFrameGeometry } from './pocket-render/frame-geometry';

const R = TABLE.ballRadius;
const W = TABLE.width;
const L = TABLE.length;
const RAIL_W = TABLE_RENDER.railWidth;
const POCKET_POS: [number, number][] = POCKETS.map(
  pocket => [pocket.x, pocket.z],
);

/** Scene3D 可延迟装配也必须可完整卸载；共享资源用 Set 去重后统一释放。 */
function disposeSceneResources(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse(object => {
    const renderable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (renderable.geometry) geometries.add(renderable.geometry);
    const objectMaterials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    for (const material of objectMaterials) {
      materials.add(material);
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  if (scene.environment instanceof THREE.Texture) textures.add(scene.environment);
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  scene.environment = null;
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
  elapsed: number;
  trajectory: PocketDropTrajectory;
  spinAxis: THREE.Vector3;
};

type GpuTimerExtension = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
};

type Scene3DOptions = {
  onThermalQualityChange?: (quality: AdaptiveRenderQuality, snapshot: ThermalSnapshot) => void;
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
  /** 纯视觉方位；玩家回合可跟随 aimAngle 或手动环绕，观战回合由上层锁定俯视方向。 */
  private cameraAzimuth = 0;
  /** 0=第一人称，1=俯视；中间值可停留。 */
  private viewLevel = 0;
  /** 实际 HUD/视口测得的可用边缘；全台与瞄准共用，不能冻结在单次确认时。 */
  private cameraSafety: CameraSafetyInsets = DEFAULT_CAMERA_SAFETY;
  /** 幽灵球确认后的稳定目标/袋口构图；不包含杆向，杆向仍每帧由 cameraAzimuth 消费。 */
  private cameraFraming: CameraFraming | null = null;
  private phase = 'intro';
  private lastCueX = 0;
  private lastCueZ = 0;
  private lastPreviewPower = 0;
  /** 只控制预测球路；幽灵球和合法目标环始终保留基础交互。 */
  private aimAssistVisible = false;

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
  private renderFrameCount = 0;
  private shadowMapSize: 512 | 1024 | 1536;
  private keyLight: THREE.DirectionalLight | null = null;
  private renderBudget: RenderBudget;
  private adaptiveQuality: AdaptiveRenderQuality;
  private thermalGovernor: ReturnType<typeof createThermalGovernor>;
  private onThermalQualityChange?: Scene3DOptions['onThermalQualityChange'];
  private gpuTimerExtension: GpuTimerExtension | null = null;
  private pendingGpuQueries: WebGLQuery[] = [];
  private lastRenderedAt: number | null = null;
  private renderSlotMs: number | null = null;
  private thermalIdleTimer: number | null = null;

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

  constructor(element: HTMLElement, options: Scene3DOptions = {}) {
    this.element = element;

    const renderBudget = renderBudgetFor({
      width: element.clientWidth,
      height: element.clientHeight,
      devicePixelRatio: window.devicePixelRatio,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    });
    this.renderBudget = renderBudget;
    this.adaptiveQuality = adaptiveRenderQualityFor(renderBudget, 'balanced');
    this.thermalGovernor = createThermalGovernor(this.adaptiveQuality.movingPresentationFps);
    this.onThermalQualityChange = options.onThermalQualityChange;
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

    const gl = this.renderer.getContext();
    if (gl instanceof WebGL2RenderingContext) {
      this.gpuTimerExtension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimerExtension | null;
    }

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

  private setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.07));

    // 主光：略偏一侧，产生长影子
    const key = new THREE.DirectionalLight(0xfff2dd, 2.6);
    this.keyLight = key;
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
    clothGeo.rotateX(-Math.PI / 2);
    const clothMat = new THREE.MeshPhysicalMaterial({
      map: clothMaps.map,
      normalMap: clothMaps.normalMap,
      normalScale: new THREE.Vector2(0.16, 0.26),
      roughnessMap: clothMaps.roughnessMap,
      roughness: 0.94,
      metalness: 0.0,
      sheen: 0.28,
      sheenRoughness: 0.88,
      sheenColor: new THREE.Color(0x5f967c),
      envMapIntensity: 0.1,
    });
    const cloth = new THREE.Mesh(clothGeo, clothMat);
    cloth.name = 'table-cloth';
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
    // 同一边界同时生成护口与木框内裁口；孔边不再有独立袋型参数。
    const pocketSurfaces = POCKETS.map(pocket => pocketSeamContract(pocket, pocketRenderProfile(pocket)));
    const woodFrameGeometry = createTableFrameGeometry(pocketSurfaces);
    const woodFrame = new THREE.Mesh(woodFrameGeometry, woodMat);
    woodFrame.name = 'table-wood-frame';
    woodFrame.userData.pocketCutoutCount = 6;
    woodFrame.userData.sharedSurfaceContract = true;
    woodFrame.userData.roundedOuterCornerCount = 4;
    woodFrame.userData.roundedCornerPocketCount = 4;
    woodFrame.castShadow = true;
    woodFrame.receiveShadow = true;
    this.tableGroup.add(woodFrame);

    // ---- 共享库边：直线段与离散圆弧段使用同一种前探鼻尖、下沿内凹的包呢实体 ----
    const cushionMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f6a4a,
      roughness: 0.85,
      sheen: 0.5,
      sheenColor: new THREE.Color(0x88c8a8),
      sheenRoughness: 0.6,
      side: THREE.DoubleSide,
    });
    for (const segment of CUSHION_SEGMENTS) {
      const mesh = new THREE.Mesh(makeCushionGeometry(segment), cushionMat);
      mesh.name = `cushion-${segment.id}`;
      mesh.userData.profileRole = 'molded-undercut';
      mesh.userData.profilePointCount = CUSHION_PROFILE.length;
      mesh.userData.noseHeightMm = CUSHION_NOSE_HEIGHT * 1000;
      mesh.userData.noseOverhangMm = TABLE_RENDER.cushionBaseRecess * 1000;
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
      bumpScale: 0.0006,
      color: 0xd5c5a4,
      roughness: 0.86,
      clearcoat: 0.02,
      clearcoatRoughness: 0.92,
      side: THREE.DoubleSide,
    });
    // 实体乔氏袋口的外护口是机器压制牛皮 + 硬质骨架，视觉上应是薄而挺的平面，
    // 不是软包或圆绳。浅驼色用于从同色木框上读出材质边界。
    const pocketTopTrimMat = new THREE.MeshPhysicalMaterial({
      bumpMap: leatherTex,
      bumpScale: 0.0007,
      color: 0x86623f,
      roughness: 0.9,
      clearcoat: 0,
      clearcoatRoughness: 1,
      side: THREE.DoubleSide,
    });
    const pocketWallMat = new THREE.MeshStandardMaterial({
      map: leatherTex,
      bumpMap: leatherTex,
      bumpScale: 0.0018,
      color: 0x5c4936,
      roughness: 0.96,
      side: THREE.DoubleSide,
    });
    const pocketBottomMat = new THREE.MeshStandardMaterial({
      color: 0x060504,
      roughness: 0.98,
      side: THREE.DoubleSide,
    });
    const mouthCanvas = document.createElement('canvas');
    mouthCanvas.width = mouthCanvas.height = 128;
    const mouthContext = mouthCanvas.getContext('2d')!;
    const mouthGradient = mouthContext.createRadialGradient(64, 62, 5, 64, 64, 62);
    mouthGradient.addColorStop(0, 'rgba(2, 2, 1, 0.98)');
    mouthGradient.addColorStop(0.58, 'rgba(7, 5, 3, 0.94)');
    mouthGradient.addColorStop(0.82, 'rgba(24, 15, 10, 0.72)');
    mouthGradient.addColorStop(1, 'rgba(38, 24, 17, 0.12)');
    mouthContext.fillStyle = mouthGradient;
    mouthContext.fillRect(0, 0, 128, 128);
    const mouthTexture = new THREE.CanvasTexture(mouthCanvas);
    mouthTexture.colorSpace = THREE.SRGBColorSpace;
    const pocketMouthMat = new THREE.MeshBasicMaterial({
      map: mouthTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const pocketNetMat = new THREE.MeshStandardMaterial({
      color: 0xeee6d3,
      roughness: 0.78,
      metalness: 0,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const pocket of POCKETS) {
      const profile = pocketRenderProfile(pocket);
      // 可见孔洞使用 mouthWidth；dropHalfWidth 仅是球心捕获线，绝不能代替或放大孔洞。
      // 这两道椭圆同时供 pocket-drop 作完整球体安全域；不能在渲染/动画各推一套尺寸。
      const depthRadius = profile.topDepthRadius;
      const centerDepth = profile.topCenterDepth;
      const topHalfWidth = profile.topLateralRadius;
      const bottomHalfWidth = profile.bottomLateralRadius;
      const bottomDepthRadius = profile.bottomDepthRadius;
      const bottomCenterDepth = profile.bottomCenterDepth;
      const radialSteps = profile.wellRadialSteps;
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
        wallPositions.push(top.x, profile.wellTopY, top.z, lower.x, profile.wellBottomY, lower.z);
        bottomPoints.push(lower);
        mouthPoints.push(
          pocketLocalToWorld(
            pocket,
            mouthCenterDepth + Math.sin(angle) * depthRadius,
            Math.cos(angle) * profile.visibleHoleHalfWidth,
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
      bottom.position.y = profile.wellBottomY + 0.0005;
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
      const mouth = new THREE.Mesh(
        new THREE.ShapeGeometry(mouthShape),
        pocketMouthMat,
      );
      mouth.rotation.x = -Math.PI / 2;
      mouth.position.y = 0.0012;
      mouth.name = `pocket-mouth-${pocket.index}`;
      mouth.userData.captureShape = 'inward-arc';
      mouth.userData.captureInsetMm = pocket.captureInset * 1000;
      mouth.userData.visibleOpeningWidthMm = pocket.mouthWidth * 1000;
      mouth.userData.ballCenterCaptureWidthMm = profile.captureHalfWidth * 2000;
      mouth.renderOrder = 2;
      this.tableGroup.add(mouth);

      // 照片中的白色绳网从皮圈下沿开始，向下收成更窄的袋兜。
      // 两组反向斜线跨越相邻高度层，形成真正的菱形网格，而不是贴图或平行竖线。
      const netRows = 6;
      const netStrands = 18;
      const netSegments: RopeSegment[] = [];
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
        netSegments.push([a, b]);
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
      const netGeometry = createMergedRopeGeometry(netSegments);
      const net = new THREE.Mesh(netGeometry, pocketNetMat);
      net.name = `pocket-net-${pocket.index}`;
      // 保留既有门禁的角色名；新增标识明确这是实体合并绳网，不是 LineSegments。
      net.userData.materialRole = 'white-diamond-net';
      net.userData.rowCount = netRows;
      net.userData.strandCount = netStrands;
      net.userData.diamondSegmentCount = (netRows - 1) * netStrands * 2;
      net.userData.mergedRopeMesh = true;
      net.userData.ropeMesh = true;
      net.userData.ropeRadiusMm = 0.72;
      net.renderOrder = 3;
      this.tableGroup.add(net);

      // 顶盖与有厚度皮裙为单一闭壳；两个端座逐字落在既有 jaw 顶面。
      const seam = pocketSurfaces[pocket.index];
      const topTrim = new THREE.Mesh(createPocketTrimGeometry(seam), pocketTopTrimMat);
      topTrim.name = `pocket-top-trim-${pocket.index}`;
      topTrim.userData.materialRole = 'tan-leather-cap';
      topTrim.userData.widthMm = seam.width * 1000;
      topTrim.userData.heightMm = seam.thickness * 1000;
      topTrim.userData.seamlessEndCount = 2;
      topTrim.userData.jawAnchorCount = 2;
      topTrim.userData.integratedApron = true;
      topTrim.userData.sharedSeamContract = true;
      topTrim.userData.surfaceContractVersion = 2;
      topTrim.castShadow = true;
      topTrim.receiveShadow = true;
      this.tableGroup.add(topTrim);

      const weltRadius = pocket.kind === 'corner' ? 0.0018 : 0.0016;
      const lip = new THREE.Mesh(createPocketWeltGeometry(seam, weltRadius), pocketLipMat);
      lip.name = `pocket-lip-${pocket.index}`;
      lip.userData.materialRole = 'stitched-welt';
      lip.userData.radiusMm = weltRadius * 1000;
      lip.userData.jawAnchorCount = 2;
      lip.userData.sharedSeamContract = true;
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
    this.aimGhostDist = d;
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
    this.spin = spin;
    this.requestRender(true);
  }

  setLegalTargets(numbers: number[]) {
    this.legalTargets = new Set(numbers);
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
    if (!review?.planned) {
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
    setTimeout(() => {
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
    this.viewLevel = clampViewLevel(level);
    // 进入全局段就直接展示无遮挡桌面；相机继续抬升时不会穿过吊灯模型。
    if (this.lampGroup) this.lampGroup.visible = !isGlobalCameraView(this.viewLevel);
    this.requestRender();
  }

  setAim(angle: number) {
    this.aimAngle = angle;
    this.requestRender(true);
  }

  setCameraAzimuth(angle: number) {
    this.cameraAzimuth = normalizeCameraAzimuth(angle);
    this.requestRender();
  }

  /**
   * Game 只在幽灵球抬手确认时设置目标身份；null 表示回退常规相机。
   * 活相机与拾取虚拟相机都通过 cameraPoseFor 消费这一份状态，禁止两条投影路径漂移。
   */
  setCameraFraming(framing: CameraFraming | null) {
    this.cameraFraming = framing;
    this.updateCameraTarget();
    this.requestRender();
  }

  setCameraSafety(safety: CameraSafetyInsets) {
    this.cameraSafety = safety;
    this.updateCameraTarget();
    this.requestRender();
  }

  private cameraPoseFor(
    cameraAzimuth: number,
    viewLevel: number,
    aspect: number,
    previewPower = this.lastPreviewPower,
    cueX = this.lastCueX,
    cueZ = this.lastCueZ,
  ) {
    if (
      this.cameraFraming !== null &&
      this.phase === 'aiming' &&
      !isOverheadCameraView(viewLevel)
    ) {
      return aimCameraPose(this.cameraFraming, cameraAzimuth, aspect).pose;
    }
    return cameraPoseAt(
      cueX,
      cueZ,
      cameraAzimuth,
      previewPower,
      viewLevel,
      aspect,
      this.cameraSafety,
    );
  }

  private updateCameraTarget() {
    const cameraPose = this.cameraPoseFor(
      this.cameraAzimuth,
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
    this.aimAssistVisible = visible;
    this.updateAimGuide();
    this.requestRender();
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
        // 刚落袋：只消费物理事件快照。轨迹模块不改口袋规则，只把已有 entry
        // 位置/速度约束到同一 PocketGeometry 的可见袋腔中。
        const pocketEvent = [...world.events].reverse().find(
          e => e.type === 'pocket' && e.ball === ball.number
        );
        let pocket = POCKETS[0];
        let entryX = ball.x;
        let entryZ = ball.z;
        let entryVx = 0;
        let entryVz = 0;
        let entryWx = 0;
        let entryWy = 0;
        let entryWz = 0;
        if (pocketEvent && pocketEvent.type === 'pocket') {
          pocket = POCKETS[pocketEvent.pocket] ?? pocket;
          entryX = pocketEvent.entryX;
          entryZ = pocketEvent.entryZ;
          entryVx = pocketEvent.entryVx;
          entryVz = pocketEvent.entryVz;
          entryWx = pocketEvent.entryWx ?? 0;
          entryWy = pocketEvent.entryWy ?? 0;
          entryWz = pocketEvent.entryWz ?? 0;
        } else {
          // 旧快照/复盘没有 pocket event 时，降级到最近袋，但仍走同一受限轨迹。
          let bestD = Infinity;
          for (const candidate of POCKETS) {
            const d = (ball.x - candidate.x) ** 2 + (ball.z - candidate.z) ** 2;
            if (d < bestD) { bestD = d; pocket = candidate; }
          }
        }
        const trajectory = createPocketDropTrajectory({
          pocket,
          entryX,
          entryZ,
          entryVx,
          entryVz,
          entryWx,
          entryWy,
          entryWz,
        });
        const spinAxis = trajectory.sample(0).spinAxis;
        this.dropAnims.set(ball.number, {
          elapsed: 0,
          trajectory,
          spinAxis: new THREE.Vector3(spinAxis.x, spinAxis.y, spinAxis.z),
        });
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
    this.requestRender(world.moving || this.dropAnims.size > 0);
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

  update(cueX: number, cueZ: number, power: number, phase: string) {
    this.phase = phase;
    this.lastCueX = cueX;
    this.lastCueZ = cueZ;
    this.lastPreviewPower = power;
    const cue = this.ballMeshes[0];
    const cueActive = Boolean(this.lastWorld?.balls[0]?.active);
    // 摆球阶段物理世界仍保留母球作为候选状态，但画面只显示跟手的半透明预览；
    // 点击落实后下一次 sync 会恢复实体母球，避免一虚一实同时出现。
    if (cue && phase === 'placing') cue.visible = false;
    const angle = this.aimAngle;

    // ---- 相机：视觉方位与球杆瞄准解耦；高度按当前视口比例确保高位全台可见。 ----
    this.updateCameraTarget();
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
    this.requestRender(true);
  }

  /** 相机或显式动画仍未收敛时才需要下一帧；静止球桌不维持空转 rAF。 */
  private hasFrameWork(): boolean {
    const cameraMoving =
      this.camera.position.distanceToSquared(this.targetCameraPos) > 1e-8 ||
      this.smoothLookAt.distanceToSquared(this.targetLookAt) > 1e-8;
    return cameraMoving || this.strikeAnim !== null || this.dropAnims.size > 0 || this.planPlayAnim !== null;
  }

  private requestRender(refreshShadows = false) {
    if (refreshShadows) this.renderer.shadowMap.needsUpdate = true;
    if (!this.running || this.animationId !== 0) return;
    this.animationId = requestAnimationFrame((nowMs) => {
      this.animationId = 0;
      if (!this.running) return;
      const intervalMs = 1000 / this.adaptiveQuality.movingPresentationFps;
      if (this.renderSlotMs !== null && nowMs - this.renderSlotMs < intervalMs - 0.5) {
        this.requestRender();
        return;
      }
      this.renderSlotMs = nowMs;
      this.render();
      if (this.hasFrameWork()) this.requestRender(this.strikeAnim !== null || this.dropAnims.size > 0 || this.planPlayAnim !== null);
    });
  }

  private pollGpuTimer(): number | null {
    const extension = this.gpuTimerExtension;
    if (!extension || this.pendingGpuQueries.length === 0) return null;
    const gl = this.renderer.getContext();
    if (!(gl instanceof WebGL2RenderingContext)) return null;

    const query = this.pendingGpuQueries[0];
    const available = Boolean(gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE));
    if (!available) return null;
    this.pendingGpuQueries.shift();
    const disjoint = Boolean(gl.getParameter(extension.GPU_DISJOINT_EXT));
    const elapsedNs = Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
    gl.deleteQuery(query);
    return !disjoint && Number.isFinite(elapsedNs) ? elapsedNs / 1_000_000 : null;
  }

  private beginGpuTimer(): WebGLQuery | null {
    const extension = this.gpuTimerExtension;
    if (!extension || this.pendingGpuQueries.length >= 2 || this.renderFrameCount % 8 !== 0) return null;
    const gl = this.renderer.getContext();
    if (!(gl instanceof WebGL2RenderingContext)) return null;
    const query = gl.createQuery();
    if (!query) return null;
    try {
      gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
      return query;
    } catch {
      gl.deleteQuery(query);
      this.gpuTimerExtension = null;
      return null;
    }
  }

  private finishGpuTimer(query: WebGLQuery | null) {
    if (!query || !this.gpuTimerExtension) return;
    const gl = this.renderer.getContext();
    if (!(gl instanceof WebGL2RenderingContext)) return;
    try {
      gl.endQuery(this.gpuTimerExtension.TIME_ELAPSED_EXT);
      this.pendingGpuQueries.push(query);
    } catch {
      gl.deleteQuery(query);
      this.gpuTimerExtension = null;
    }
  }

  private applyThermalTier(tier: RenderQualityTier) {
    const quality = adaptiveRenderQualityFor(this.renderBudget, tier);
    if (quality.tier === this.adaptiveQuality.tier) return;
    this.adaptiveQuality = quality;
    this.shadowMapSize = quality.shadowMapSize;
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.renderer.setSize(this.element.clientWidth, this.element.clientHeight);
    if (this.keyLight) {
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
      this.keyLight.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    }
    this.thermalGovernor.setTargetFps(quality.movingPresentationFps);
    this.renderSlotMs = null;
    document.documentElement.dataset.renderQuality = quality.tier;
    this.onThermalQualityChange?.(quality, this.thermalGovernor.snapshot());
    this.requestRender(true);
  }

  private observeThermalLoad(
    nowMs: number,
    renderMs: number,
    frameIntervalMs: number | null,
    source: 'gpu-timer' | 'cpu-fallback',
  ) {
    const tier = this.thermalGovernor.sample({ nowMs, renderMs, frameIntervalMs, source });
    if (tier) this.applyThermalTier(tier);
  }

  private clearThermalIdleRecovery() {
    if (this.thermalIdleTimer === null) return;
    window.clearTimeout(this.thermalIdleTimer);
    this.thermalIdleTimer = null;
  }

  private scheduleThermalIdleRecovery() {
    if (
      !this.running ||
      this.adaptiveQuality.tier === 'balanced' ||
      this.thermalIdleTimer !== null
    ) {
      return;
    }
    this.thermalIdleTimer = window.setTimeout(() => {
      this.thermalIdleTimer = null;
      if (!this.running || this.lastWorld?.moving || this.hasFrameWork()) return;
      const tier = this.thermalGovernor.recoverAfterIdle(performance.now());
      if (tier) this.applyThermalTier(tier);
      this.scheduleThermalIdleRecovery();
    }, THERMAL_IDLE_RECOVERY_MS);
  }

  /** 渲染一帧：推进落袋/球杆/规划动画；是否续帧由 requestRender 决定。 */
  render() {
    const renderStartedAt = performance.now();
    const frameIntervalMs = this.lastRenderedAt === null
      ? null
      : renderStartedAt - this.lastRenderedAt;
    this.lastRenderedAt = renderStartedAt;
    const continuousWork = Boolean(this.lastWorld?.moving || this.hasFrameWork());
    if (continuousWork) this.clearThermalIdleRecovery();
    const gpuFrameMs = continuousWork ? this.pollGpuTimer() : null;
    if (gpuFrameMs !== null) {
      this.observeThermalLoad(
        renderStartedAt,
        gpuFrameMs,
        frameIntervalMs !== null && frameIntervalMs < 250 ? frameIntervalMs : null,
        'gpu-timer',
      );
    }
    const gpuQuery = continuousWork ? this.beginGpuTimer() : null;
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
      anim.elapsed += dt;
      const sample = anim.trajectory.sample(anim.elapsed);
      if (sample.progress >= 1) {
        mesh.visible = false;
        mesh.scale.setScalar(1);
        this.dropAnims.delete(num);
        continue;
      }
      mesh.position.set(sample.x, sample.y, sample.z);
      mesh.scale.setScalar(sample.scale);
      // 只消费 pocket event 的真实角速度；真实零旋转保持静止。
      if (sample.spinRate > 1e-9) mesh.rotateOnWorldAxis(anim.spinAxis, sample.spinRate * dt);
    }

    this.updatePlanPlay(dt);

    this.renderer.render(this.scene, this.camera);
    this.finishGpuTimer(gpuQuery);
    if (continuousWork && !this.gpuTimerExtension) {
      const renderFinishedAt = performance.now();
      this.observeThermalLoad(
        renderFinishedAt,
        renderFinishedAt - renderStartedAt,
        frameIntervalMs !== null && frameIntervalMs < 250 ? frameIntervalMs : null,
        'cpu-fallback',
      );
    }
    this.renderFrameCount += 1;
    if (!this.lastWorld?.moving && !this.hasFrameWork()) {
      this.scheduleThermalIdleRecovery();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.renderSlotMs = null;
    this.clock.start();
    this.requestRender(true);
  }

  stop() {
    this.running = false;
    this.clearThermalIdleRecovery();
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = 0;
  }

  /** 浏览器性能验收读取累计真实渲染帧数；不参与业务状态。 */
  renderedFrames(): number {
    return this.renderFrameCount;
  }

  /** 调试/验收只读快照：不暴露系统温度，只报告 WebGL 负载代理指标。 */
  thermalSnapshot(): ThermalSnapshot & { pixelRatio: number; shadowMapSize: number } {
    return {
      ...this.thermalGovernor.snapshot(),
      pixelRatio: this.adaptiveQuality.pixelRatio,
      shadowMapSize: this.adaptiveQuality.shadowMapSize,
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
    this.virtualCam.aspect = this.camera.aspect;
    this.virtualCam.updateProjectionMatrix();
    const pose = this.cameraPoseFor(
      cameraAzimuth,
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
    const nextBudget = renderBudgetFor({
      width: w,
      height: h,
      devicePixelRatio: window.devicePixelRatio,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    });
    const nextQuality = adaptiveRenderQualityFor(nextBudget, this.adaptiveQuality.tier);
    const budgetChanged =
      nextQuality.pixelRatio !== this.adaptiveQuality.pixelRatio ||
      nextQuality.shadowMapSize !== this.adaptiveQuality.shadowMapSize ||
      nextQuality.movingPresentationFps !== this.adaptiveQuality.movingPresentationFps;
    this.renderBudget = nextBudget;
    if (budgetChanged) {
      this.adaptiveQuality = nextQuality;
      this.shadowMapSize = nextQuality.shadowMapSize;
      this.renderer.setPixelRatio(nextQuality.pixelRatio);
      this.thermalGovernor.setTargetFps(nextQuality.movingPresentationFps);
      if (this.keyLight) {
        this.keyLight.shadow.map?.dispose();
        this.keyLight.shadow.map = null;
        this.keyLight.shadow.mapSize.set(nextQuality.shadowMapSize, nextQuality.shadowMapSize);
      }
      this.onThermalQualityChange?.(nextQuality, this.thermalGovernor.snapshot());
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.updateCameraTarget();
    this.requestRender();
  };

  dispose() {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
    const gl = this.renderer.getContext();
    if (gl instanceof WebGL2RenderingContext) {
      for (const query of this.pendingGpuQueries) gl.deleteQuery(query);
    }
    this.pendingGpuQueries = [];
    delete document.documentElement.dataset.renderQuality;
    disposeSceneResources(this.scene);
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.element) {
      this.element.removeChild(this.renderer.domElement);
    }
  }
}
