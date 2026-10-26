/*
[INPUT]: 依赖已启动游戏页、远程调试浏览器、puppeteer-core 与 DEV __bj8 场景句柄
[OUTPUT]: 六袋共享木框裁口/一体护口皮裙/同站点缝边的装配与最终壳体闭合检查、四机位截图及页面错误门禁；承托/面域由最终几何单测证明
[POS]: PocketGeometry 物理/视觉一体化的浏览器出口验收；只改调试页内世界，不写游戏数据
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md 与 README.md
*/
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5199/';
const SHOT_DIR = process.env.SHOT_DIR || 'shots';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

async function openGame(viewport) {
  await page.setViewport(viewport);
  await page.goto(`${GAME_URL}?theme=celadon`, {
    waitUntil: 'networkidle0',
    timeout: 20000,
  });
  await page.waitForSelector('.mode-choice.practice .mode-start', {
    timeout: 20000,
  });
  await page.click('.mode-choice.practice .mode-start');
  await wait(650);
}

async function setPocketCamera({ cueX, cueZ, angle, level }) {
  return page.evaluate(({ cueX, cueZ, angle, level }) => {
    const debug = window.__bj8;
    const scene = debug?.scene?.current;
    const world = debug?.world?.current;
    const cue = world?.balls?.find(ball => ball.number === 0);
    if (!scene || !world || !cue) return false;
    cue.x = cueX;
    cue.z = cueZ;
    cue.vx = cue.vz = cue.wx = cue.wy = cue.wz = 0;
    scene.setViewLevel(level);
    scene.setCameraAzimuth(angle);
    scene.sync(world);
    scene.update(cueX, cueZ, 0, 'aiming');
    return true;
  }, { cueX, cueZ, angle, level });
}

async function waitForCameraSettled() {
  await page.waitForFunction(() => {
    const scene = window.__bj8?.scene?.current;
    const camera = scene?.camera;
    const target = scene?.targetCameraPos;
    if (!camera || !target) return false;
    return camera.position.distanceTo(target) < 0.025;
  }, { timeout: 10000 });
}

try {
await openGame({ width: 1280, height: 800 });
const hasDebug = await page.evaluate(() => Boolean(window.__bj8?.scene?.current));
ok('开发页暴露可复现视觉场景', hasDebug);
const pocketAnatomy = await page.evaluate(() => {
  const root = window.__bj8?.scene?.current?.scene;
  const counts = {
    outerWoodFrames: 0,
    pocketCutouts: 0,
    roundedOuterCorners: 0,
    roundedCornerPockets: 0,
    cushions: 0,
    undercutCushions: 0,
    minCushionProfilePoints: Number.POSITIVE_INFINITY,
    minNoseOverhangMm: Number.POSITIVE_INFINITY,
    minNoseHeightMm: Number.POSITIVE_INFINITY,
    pocketWraps: 0,
    mouths: 0,
    inwardArcMouths: 0,
    minCaptureInsetMm: Number.POSITIVE_INFINITY,
    maxCaptureInsetMm: 0,
    topTrims: 0,
    topTrimJawAnchors: 0,
    seamlessTrimEnds: 0,
    sharedFrameContracts: 0,
    integratedAprons: 0,
    closedTrimShells: 0,
    tanLeatherCaps: 0,
    minTrimWidthMm: Number.POSITIVE_INFINITY,
    minTrimHeightMm: Number.POSITIVE_INFINITY,
    aprons: 0,
    trimColor: null,
    lips: 0,
    stitchedWelts: 0,
    maxWeltRadiusMm: 0,
    cornerLipJawAnchors: 0,
    nets: 0,
    whiteDiamondNets: 0,
    netRows: 0,
    netStrands: 0,
    netDiamondSegments: 0,
    netColor: null,
    wells: 0,
    bottoms: 0,
  };
  // 检查浏览器装配后的实际三角形，不把 userData 自报当闭壳证据。
  const isClosedFiniteShell = geometry => {
    const position = geometry?.getAttribute('position');
    if (!position || position.count < 4) return false;
    const index = geometry.getIndex();
    const count = index?.count ?? position.count;
    if (count % 3) return false;
    const edges = new Map();
    const point = i => [position.getX(i), position.getY(i), position.getZ(i)];
    for (let i = 0; i < count; i += 3) {
      const p = [0, 1, 2].map(j => point(index ? index.getX(i + j) : i + j));
      if (!p.flat().every(Number.isFinite)) return false;
      const a = p[1].map((v, k) => v - p[0][k]);
      const b = p[2].map((v, k) => v - p[0][k]);
      const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      if (cross.reduce((sum, v) => sum + v * v, 0) <= 1e-24) return false;
      const keys = p.map(v => v.map(n => n.toFixed(7)).join(','));
      for (let j = 0; j < 3; j++) {
        const ends = [keys[j], keys[(j + 1) % 3]];
        if (ends[0] === ends[1]) return false;
        const key = ends.sort().join('|');
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    return edges.size > 0 && [...edges.values()].every(count => count === 2);
  };
  root?.traverse(object => {
    if (object.name.startsWith('cushion-')) {
      counts.cushions += 1;
      counts.undercutCushions += Number(object.userData.profileRole === 'molded-undercut');
      counts.minCushionProfilePoints = Math.min(
        counts.minCushionProfilePoints,
        Number(object.userData.profilePointCount ?? 0),
      );
      counts.minNoseOverhangMm = Math.min(
        counts.minNoseOverhangMm,
        Number(object.userData.noseOverhangMm ?? 0),
      );
      counts.minNoseHeightMm = Math.min(
        counts.minNoseHeightMm,
        Number(object.userData.noseHeightMm ?? 0),
      );
    }
    if (object.name === 'table-wood-frame') {
      counts.outerWoodFrames += 1;
      counts.sharedFrameContracts += Number(object.userData.sharedSurfaceContract === true);
      counts.pocketCutouts += Number(object.userData.pocketCutoutCount ?? 0);
      counts.roundedOuterCorners += Number(
        object.userData.roundedOuterCornerCount ?? 0,
      );
      counts.roundedCornerPockets += Number(
        object.userData.roundedCornerPocketCount ?? 0,
      );
    }
    if (
      object.name.startsWith('pocket-wood-') ||
      object.name.startsWith('pocket-leather-wrap-')
    ) counts.pocketWraps += 1;
    if (object.name.startsWith('pocket-mouth-')) {
      counts.mouths += 1;
      if (object.userData.captureShape === 'inward-arc') {
        counts.inwardArcMouths += 1;
        const insetMm = Number(object.userData.captureInsetMm ?? 0);
        counts.minCaptureInsetMm = Math.min(counts.minCaptureInsetMm, insetMm);
        counts.maxCaptureInsetMm = Math.max(counts.maxCaptureInsetMm, insetMm);
      }
    }
    if (object.name.startsWith('pocket-top-trim-')) {
      counts.topTrims += 1;
      counts.seamlessTrimEnds += Number(object.userData.seamlessEndCount ?? 0);
      counts.topTrimJawAnchors += Number(object.userData.jawAnchorCount ?? 0);
      counts.tanLeatherCaps += Number(
        object.userData.materialRole === 'tan-leather-cap',
      );
      counts.minTrimWidthMm = Math.min(
        counts.minTrimWidthMm,
        Number(object.userData.widthMm ?? 0),
      );
      counts.minTrimHeightMm = Math.min(
        counts.minTrimHeightMm,
        Number(object.userData.heightMm ?? 0),
      );
      counts.integratedAprons += Number(object.userData.integratedApron === true && object.userData.surfaceContractVersion === 2);
      counts.closedTrimShells += Number(isClosedFiniteShell(object.geometry));
      counts.trimColor = object.material?.color?.getHex?.() ?? null;
    }
    if (object.name.startsWith('pocket-leather-apron-')) {
      counts.aprons += 1;
    }
    if (object.name.startsWith('pocket-lip-')) {
      counts.lips += 1;
      counts.stitchedWelts += Number(
        object.userData.materialRole === 'stitched-welt',
      );
      counts.maxWeltRadiusMm = Math.max(
        counts.maxWeltRadiusMm,
        Number(object.userData.radiusMm ?? Number.POSITIVE_INFINITY),
      );
      const jawAnchorCount = Number(object.userData.jawAnchorCount ?? 0);
      if (jawAnchorCount > 0) {
        counts.cornerLipJawAnchors += jawAnchorCount;
      }
    }
    if (object.name.startsWith('pocket-net-')) {
      counts.nets += 1;
      counts.whiteDiamondNets += Number(
        object.userData.materialRole === 'white-diamond-net',
      );
      counts.netRows += Number(object.userData.rowCount ?? 0);
      counts.netStrands += Number(object.userData.strandCount ?? 0);
      counts.netDiamondSegments += Number(
        object.userData.diamondSegmentCount ?? 0,
      );
      counts.netColor = object.material?.color?.getHex?.() ?? null;
    }
    if (object.name.startsWith('pocket-well-')) counts.wells += 1;
    if (object.name.startsWith('pocket-bottom-')) counts.bottoms += 1;
  });
  return counts;
});
ok(
  '同源木框六袋与六个最终闭合护口壳体，保留原库边和袋腔结构',
  pocketAnatomy.outerWoodFrames === 1 &&
    pocketAnatomy.pocketCutouts === 6 &&
    pocketAnatomy.roundedOuterCorners === 4 &&
    pocketAnatomy.roundedCornerPockets === 4 &&
    pocketAnatomy.cushions === 150 &&
    pocketAnatomy.undercutCushions === 150 &&
    pocketAnatomy.minCushionProfilePoints >= 9 &&
    pocketAnatomy.minNoseOverhangMm >= 18.99 &&
    pocketAnatomy.minNoseHeightMm >= 35 &&
    pocketAnatomy.pocketWraps === 0 &&
    pocketAnatomy.mouths === 6 &&
    pocketAnatomy.inwardArcMouths === 6 &&
    pocketAnatomy.minCaptureInsetMm >= 7 &&
    pocketAnatomy.maxCaptureInsetMm <= 8.01 &&
    pocketAnatomy.topTrims === 6 &&
    pocketAnatomy.topTrimJawAnchors === 12 &&
    pocketAnatomy.seamlessTrimEnds === 12 &&
    pocketAnatomy.sharedFrameContracts === 1 &&
    pocketAnatomy.integratedAprons === 6 &&
    pocketAnatomy.closedTrimShells === 6 &&
    pocketAnatomy.tanLeatherCaps === 6 &&
    pocketAnatomy.minTrimWidthMm >= 19 &&
    pocketAnatomy.minTrimHeightMm >= 6.99 &&
    pocketAnatomy.trimColor === 0x86623f &&
    pocketAnatomy.aprons === 0 &&
    pocketAnatomy.lips === 6 &&
    pocketAnatomy.stitchedWelts === 6 &&
    pocketAnatomy.maxWeltRadiusMm <= 1.8 &&
    pocketAnatomy.cornerLipJawAnchors === 12 &&
    pocketAnatomy.nets === 6 &&
    pocketAnatomy.whiteDiamondNets === 6 &&
    pocketAnatomy.netRows === 36 &&
    pocketAnatomy.netStrands === 108 &&
    pocketAnatomy.netDiamondSegments === 1080 &&
    pocketAnatomy.netColor === 0xeee6d3 &&
    pocketAnatomy.wells === 6 &&
    pocketAnatomy.bottoms === 6,
  JSON.stringify(pocketAnatomy),
);

ok('俯视相机可定位', await setPocketCamera({
  cueX: 0,
  cueZ: 0.6,
  angle: 0,
  level: 1,
}));
await waitForCameraSettled();
await page.screenshot({ path: `${SHOT_DIR}/pocket-overhead.png` });

ok('角袋近景相机可定位', await setPocketCamera({
  cueX: 0.34,
  cueZ: 0.95,
  angle: Math.PI,
  level: 0.18,
}));
await waitForCameraSettled();
await page.screenshot({ path: `${SHOT_DIR}/pocket-corner-close.png` });

ok('中袋近景相机可定位', await setPocketCamera({
  cueX: 0.34,
  cueZ: 0,
  angle: Math.PI / 2,
  level: 0.18,
}));
await waitForCameraSettled();
await page.screenshot({ path: `${SHOT_DIR}/pocket-side-close.png` });

await openGame({ width: 390, height: 844, isMobile: true, hasTouch: true });
ok('竖屏俯视相机可定位', await setPocketCamera({
  cueX: 0,
  cueZ: 0.6,
  angle: 0,
  level: 1,
}));
await waitForCameraSettled();
const portrait = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')?.getBoundingClientRect();
  return {
    canvasVisible: Boolean(canvas && canvas.width > 0 && canvas.height > 0),
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});
ok('390×844 全台无横向溢出', portrait.canvasVisible && !portrait.overflow);
await page.screenshot({ path: `${SHOT_DIR}/pocket-portrait.png` });

ok('袋口视觉回归无页面脚本错误', errors.length === 0, errors[0] ?? '');
} finally {
  try { await page.close(); } finally { await browser.disconnect(); }
}

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length > 0) process.exitCode = 1;
