/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口与 puppeteer-core
[OUTPUT]: 桌面/竖屏/横屏的真实指针、键盘、瞄准、近母球幽灵球稳定性、视角、蓄力、放置与跨输入原子取消断言
[POS]: 核心输入交互的浏览器出口门禁，DOM 只读不代替执行
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * 真实交互回归矩阵:桌面鼠标+键盘 / 竖屏触摸 / 横屏触摸
 * 原则:启动、视角、蓄力、放置全部走真实 mouse/touch/keyboard 事件;
 * DOM 读取只用于验证结果,不用 element.click() 执行被测动作。
 * 前置启动(ego lite 用无头模式,不弹窗不打断前台):
 *   npx vite --port 5199 --strictPort &
 *   "/Applications/ego lite.app/Contents/MacOS/ego lite" --headless=new \
 *     --remote-debugging-port=9333 --user-data-dir=/tmp/ego-verify &
 * 浏览器连接地址可用 BROWSER_URL 环境变量覆盖;游戏地址可用 GAME_URL 覆盖。
 */
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await puppeteer.connect({
  browserURL: BROWSER_URL,
  defaultViewport: { width: 1280, height: 800 },
});

/** 真实点击一个按文本找到的按钮,返回是否点到了 */
async function realClickButton(page, text) {
  const box = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent === t);
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, text);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
}

/** 纯视觉按钮没有 textContent，浏览器门禁通过无障碍名称定位并发出真实点击。 */
async function realClickAria(page, ariaLabel) {
  const box = await page.evaluate((label) => {
    const element = document.querySelector(`[aria-label="${label}"]`);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, ariaLabel);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
}

async function placeCueBallInKitchen(page) {
  // 全台视角会根据横竖屏旋转球台；用当前活相机把真实开球区坐标投到屏幕，
  // 不再假设开球区永远在屏幕下方。
  const kitchenTargets = [
    { x: 0, z: 0.98 },
    { x: -0.18, z: 0.98 },
    { x: 0.18, z: 0.98 },
  ];
  for (const target of kitchenTargets) {
    const pt = await page.evaluate(({ x, z }) =>
      window.__bj8.scene.current.tableToScreen(x, z), target);
    await page.mouse.click(pt.x, pt.y);
    await new Promise(r => setTimeout(r, 350));
    const phase = await page.evaluate(() => window.__bj8?.match?.current?.phase);
    if (phase && phase !== 'placing') break;
    const label = await page.evaluate(() => document.querySelector('.match-state p')?.textContent);
    if (label !== '放置白球') break;
  }
}

async function newGamePage(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.bringToFront(); // ego/Chrome 会节流后台标签页的 rAF 和定时器
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (
        key.startsWith('bj8-control-y:') ||
        key === 'guagua-billiards:control-layout:v3' ||
        key === 'guagua-billiards:aim-assist:v1'
      ) localStorage.removeItem(key);
    }
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await realClickButton(page, '开始对局');
  await new Promise(r => setTimeout(r, 800));
  // 处理开球放置：点击开球区后进入瞄准阶段
  const phase = await page.evaluate(() => window.__bj8?.match?.current?.phase);
  const label = await page.evaluate(() => document.querySelector('.match-state p')?.textContent);
  if (phase === 'placing' || label === '放置白球') await placeCueBallInKitchen(page);
  return { page, errors };
}

const gameState = (page) => page.evaluate(() => {
  const w = window.__bj8?.world?.current;
  return w ? { shot: w.shot, moving: w.moving } : null;
});

// 产品顶栏已删除，测试直接读取规则状态，不再依赖不存在的装饰文案。
const turnText = (page) => page.evaluate(() => {
  const match = window.__bj8?.match?.current;
  if (!match) return '';
  if (match.phase === 'placing') return '放置白球';
  if (match.phase === 'opponent') return '顾燃思考';
  if (match.phase === 'aiming' && match.actor === 'player') return '你的回合';
  return match.phase;
});

/** 输入矩阵只验证玩家控件：每杆后固定回到静止的普通瞄准回合，避免随机 AI 时长污染门禁。 */
async function stagePlayerAim(page) {
  await page.evaluate(() => {
    const world = window.__bj8.world.current;
    for (const ball of world.balls) {
      ball.vx = ball.vz = ball.wx = ball.wy = ball.wz = 0;
    }
    const cue = world.balls.find(ball => ball.number === 0);
    if (cue && !cue.active) Object.assign(cue, { active: true, x: 0, z: 0.55 });
    world.moving = false;
    window.__bj8.setMatch({
      phase: 'aiming',
      actor: 'player',
      breaking: false,
      winner: null,
    });
    window.__bj8.sync();
  });
  await new Promise(resolve => setTimeout(resolve, 120));
  return (await turnText(page)) === '你的回合';
}

const padBox = (page) => page.evaluate(() => {
  const el = document.querySelector('.shoot-pad');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});

async function dragStrike(page, box, useTouch) {
  const before = await gameState(page);
  if (useTouch) {
    await page.touchscreen.touchStart(box.cx, box.cy);
    for (let i = 1; i <= 6; i++) await page.touchscreen.touchMove(box.cx, box.cy + i * 20);
    await page.touchscreen.touchEnd();
  } else {
    await page.mouse.move(box.cx, box.cy);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(box.cx, box.cy + i * 20);
    await page.mouse.up();
  }
  // 松开瞬间物理应还没击球(等球杆触球动画)
  const immediate = await gameState(page);
  await new Promise(r => setTimeout(r, 500));
  const after = await gameState(page);
  return { before, immediate, after };
}

/** 等回到玩家回合;AI 犯规送自由球时先切俯视再真实点击台面放置 */
async function waitPlayerTurn(page, timeoutMs = 150000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const turn = await turnText(page);
    if (turn === '你的回合') return true;
    if (turn === '放置白球') {
      await realClickAria(page, '进入全台观察');
      await new Promise(r => setTimeout(r, 400));
      const candidates = await page.evaluate(() => {
        const r = document.querySelector('.viewport').getBoundingClientRect();
        return [0.75, 0.65, 0.55, 0.45].map(fy => ({ x: r.x + r.width / 2, y: r.y + r.height * fy }));
      });
      for (const pt of candidates) {
        await page.mouse.click(pt.x, pt.y);
        await new Promise(r => setTimeout(r, 350));
        if ((await turnText(page)) !== '放置白球') break;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

// ========== 场景1: 桌面 1280×800 鼠标 + 键盘 ==========
{
  const { page, errors } = await newGamePage({ width: 1280, height: 800 });

  const box = await padBox(page);
  ok('桌面: 出杆区存在', !!box);
  ok('桌面: 出杆区在视口内', box && box.x >= 0 && box.y >= 0 && box.x + box.w <= 1280 && box.y + box.h <= 800,
    box ? `(${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.w)}x${Math.round(box.h)})` : 'missing');

  // 控制区四元素不溢出底部栏
  const layout = await page.evaluate(() => {
    const deck = document.querySelector('.control-deck').getBoundingClientRect();
    const items = [...document.querySelector('.control-deck').children].map(c => c.getBoundingClientRect());
    return { deck: { y: deck.y, h: deck.height }, items: items.map(r => ({ y: r.y, bottom: r.bottom })) };
  });
  const overflow = layout.items.filter(r => r.bottom > layout.deck.y + layout.deck.h + 2);
  ok('桌面: 控制区无溢出元素', overflow.length === 0, overflow.length ? `${overflow.length}个元素溢出` : '');

  // 纯视觉端点按钮仍保留 aria；真实点击后状态翻转，且不改变瞄准角。
  const aimBeforeSwitch = await page.evaluate(() => window.__bj8.aim.current);
  await realClickAria(page, '进入全台观察');
  await new Promise(r => setTimeout(r, 400));
  const pressed = await page.evaluate(() => ({
    shot: document.querySelector('[aria-label="进入击球视角"]')?.getAttribute('aria-pressed'),
    tactical: document.querySelector('[aria-label="进入全台观察"]')?.getAttribute('aria-pressed'),
  }));
  ok('桌面: 切视角 aria-pressed 翻转', pressed.shot === 'false' && pressed.tactical === 'true', JSON.stringify(pressed));
  const aimAfterSwitch = await page.evaluate(() => window.__bj8.aim.current);
  ok('桌面: 切视角不改变瞄准角', aimBeforeSwitch === aimAfterSwitch, `before=${aimBeforeSwitch} after=${aimAfterSwitch}`);
  await realClickAria(page, '进入击球视角');
  await new Promise(r => setTimeout(r, 400));

  // 鼠标拖拽出杆
  const { before, immediate, after } = await dragStrike(page, box, false);
  ok('桌面: 鼠标下拉蓄力出杆', !!after && after.shot === 1, JSON.stringify({ before, after }));
  ok('桌面: 松开瞬间球未动(等杆头触球)', !!immediate && immediate.shot === 0, JSON.stringify(immediate));

  // 等球停并回到玩家回合，再轻点出杆（最低力度）；对手回合控件按契约禁用。
  await page.waitForFunction(() => !window.__bj8.world.current.moving, { timeout: 30000 });
  ok('桌面: 固定回到你的回合', await stagePlayerAim(page));
  const tapBox = await padBox(page);
  await page.mouse.move(tapBox.cx, tapBox.cy);
  await page.mouse.down();
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 300));
  const tapState = await gameState(page);
  ok('桌面: 轻点也能出杆(保底力度)', tapState && tapState.shot >= 1, JSON.stringify(tapState));

  ok('桌面: 轻点后再次回到你的回合', await stagePlayerAim(page));

  // 键盘:空格按住 1350ms → 最终力度 81±2(真实 keyboard 事件,与帧率无关)
  await page.keyboard.down('Space');
  await new Promise(r => setTimeout(r, 1350));
  const holdPower = await page.evaluate(() =>
    Number(document.querySelector('[role="meter"][aria-label="出杆力度"]')?.getAttribute('aria-valuenow') ?? 0));
  await page.keyboard.up('Space');
  await new Promise(r => setTimeout(r, 250));
  ok('桌面: 空格1350ms力度81±2', Math.abs(holdPower - 81) <= 2, `power=${holdPower}`);
  ok('桌面: 空格出杆后回到你的回合', await stagePlayerAim(page));

  // 交叉输入：按住台面不松手时用键盘出杆，旧 pointerup 不得在 rolling 里复活瞄准拨轮。
  const heldAimPoint = await page.evaluate(() => {
    const r = document.querySelector('.viewport').getBoundingClientRect();
    return { x: r.x + r.width * 0.62, y: r.y + r.height * 0.48 };
  });
  await page.mouse.move(heldAimPoint.x, heldAimPoint.y);
  await page.mouse.down();
  await page.keyboard.down('Space');
  await new Promise(r => setTimeout(r, 120));
  await page.keyboard.up('Space');
  await new Promise(r => setTimeout(r, 700));
  const heldShotBeforeUp = await page.evaluate(() => ({
    phase: window.__bj8.match.current.phase,
    cameraPhase: window.__bj8.cameraState.current.phase.kind,
    dial: Boolean(document.querySelector('.aim-dial')),
  }));
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 100));
  const heldShotAfterUp = await page.evaluate(() => {
    const dial = document.querySelector('.aim-dial');
    return {
      phase: window.__bj8.match.current.phase,
      cameraPhase: window.__bj8.cameraState.current.phase.kind,
      dial: Boolean(dial),
      dialParent: dial?.parentElement?.className ?? null,
      shootDisabled: document.querySelector('.shoot-pad')?.getAttribute('aria-disabled'),
    };
  });
  ok('桌面: 键盘出杆原子取消未松手的台面手势',
    heldShotBeforeUp.phase === 'rolling' && !heldShotBeforeUp.dial,
    JSON.stringify(heldShotBeforeUp));
  ok('桌面: 迟到 pointerup 不复活拨轮且镜头进入结果全景',
    heldShotAfterUp.phase === 'rolling' &&
      heldShotAfterUp.cameraPhase === 'outcome-overview' &&
      !heldShotAfterUp.dial,
    JSON.stringify(heldShotAfterUp));
  ok('桌面: 交叉输入后再次回到你的回合', await stagePlayerAim(page));

  // 紧凑击球点先展开，再把大母球拖到顶部 → 高杆
  const spinPreview = await page.evaluate(() => {
    const r = document.querySelector('.spin-preview')?.getBoundingClientRect();
    return r ? { cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null;
  });
  if (spinPreview) await page.mouse.click(spinPreview.cx, spinPreview.cy);
  await new Promise(r => setTimeout(r, 120));
  const spinBox = await page.evaluate(() => {
    const r = document.querySelector('.mobile-spin-pad .spin-ball').getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });
  await page.mouse.move(spinBox.cx, spinBox.cy);
  await page.mouse.down();
  await page.mouse.move(spinBox.cx, spinBox.cy - 18, { steps: 4 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 200));
  const spinLabel = await page.evaluate(() =>
    document.querySelector('.mobile-spin-pad')?.getAttribute('aria-valuetext'));
  ok('桌面: 塞球盘上拖=高杆', spinLabel === '高杆', spinLabel || '');

  // 瞄准拖拽不报错
  const vp = await page.evaluate(() => {
    const r = document.querySelector('.viewport').getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });
  await page.mouse.move(vp.cx, vp.cy);
  await page.mouse.down();
  await page.mouse.move(vp.cx + 60, vp.cy, { steps: 5 });
  await page.mouse.up();

  ok('桌面: 页面无JS错误', errors.length === 0, errors[0] || '');
  await page.screenshot({ path: 'shots/10-desktop-controls.png' });
  await page.close();
}

// ========== 场景2: 竖屏手机 390×844 触摸 ==========
{
  const { page, errors } = await newGamePage({ width: 390, height: 844, hasTouch: true, isMobile: true });
  const box = await padBox(page);
  ok('触摸: 出杆区存在且在视口内', !!box && box.x + box.w <= 390 && box.y + box.h <= 844,
    box ? `(${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.w)}x${Math.round(box.h)})` : 'missing');
  const overflow = await page.evaluate(() => {
    return [...document.querySelectorAll('.control-slot')]
      .filter(c => {
        const r = c.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || getComputedStyle(c).display === 'none') return false;
        return r.top < -2 || r.bottom > window.innerHeight + 2
          || r.right > window.innerWidth + 2 || r.left < -2;
      }).length;
  });
  ok('触摸: 控制区无溢出元素', overflow === 0, overflow ? `${overflow}个元素溢出` : '');

  // 开球母球落实后立即提供无边界方向拨轮；显式粗/精切档由专项门禁覆盖。
  ok('触摸: 开球落位后方向拨轮可用', Boolean(await page.$('.aim-dial')));

  // 触摸拖拽出杆(开球),同时验证满力可达
  const portraitStartY = box.y + 30;
  const portraitEndY = 842;
  await page.touchscreen.touchStart(box.cx, portraitStartY);
  for (let i = 1; i <= 8; i++) {
    await page.touchscreen.touchMove(box.cx, portraitStartY + (portraitEndY - portraitStartY) * i / 8);
  }
  const peak = await page.evaluate(() =>
    document.querySelector('[role="meter"][aria-label="出杆力度"]')?.getAttribute('aria-valuenow'));
  await page.touchscreen.touchEnd();
  ok('触摸: 竖屏满力可达(≥95)', !!peak && parseInt(peak, 10) >= 95, `peak=${peak}`);
  await new Promise(r => setTimeout(r, 600));
  const after = await gameState(page);
  ok('触摸: 下拉蓄力出杆', !!after && after.shot === 1, JSON.stringify(after));

  // 自由球放置：直接固定规则阶段，隔离随机开球与 AI 时序，只验证真实触摸输入出口。
  await page.waitForFunction(() => !window.__bj8.world.current.moving, { timeout: 30000 }).catch(() => {});
  {
    await realClickAria(page, '进入全台观察');
    await page.evaluate(() => {
      const world = window.__bj8.world.current;
      const cue = world.balls[0];
      Object.assign(cue, { active: true, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 });
      for (const b of world.balls) {
        if (b.number === 0) continue;
        b.active = false;
        b.vx = b.vz = b.wx = b.wy = b.wz = 0;
      }
      world.moving = false;
      window.__bj8.setMatch({
        phase: 'placing',
        actor: 'player',
        breaking: false,
        winner: null,
      });
      window.__bj8.sync();
    });
    await new Promise(r => setTimeout(r, 300));
    const placingVisual = await page.evaluate(() => ({
      phase: window.__bj8.match.current.phase,
      ...window.__bj8.scene.current.cuePlacementVisualState(),
    }));
    ok('触摸: 固定进入自由球放置且实体母球隐藏',
      placingVisual.phase === 'placing' && !placingVisual.realVisible,
      JSON.stringify(placingVisual));

    // 先粗网格反查，再用俯视映射的局部仿射性把偏差压到亚球半径级。
    const spot = await page.evaluate(() => {
      const scene = window.__bj8.scene.current;
      const rect = document.querySelector('.viewport').getBoundingClientRect();
      const TX = -0.3, TZ = 0.2;
      let best = null;
      for (let ix = 0; ix <= 24; ix++) for (let iy = 0; iy <= 18; iy++) {
        const cx = rect.left + rect.width * ix / 24, cy = rect.top + rect.height * iy / 18;
        const hit = scene.screenToTable(cx, cy);
        if (!hit) continue;
        const d = Math.hypot(hit.x - TX, hit.z - TZ);
        if (!best || d < best.d) best = { cx, cy, d };
      }
      if (!best) return null;
      const h0 = scene.screenToTable(best.cx, best.cy);
      const hx = scene.screenToTable(best.cx + 20, best.cy);
      const hy = scene.screenToTable(best.cx, best.cy + 20);
      if (!h0 || !hx || !hy) return best;
      const a = (hx.x - h0.x) / 20, b = (hy.x - h0.x) / 20;
      const c = (hx.z - h0.z) / 20, e = (hy.z - h0.z) / 20;
      const det = a * e - b * c;
      if (Math.abs(det) < 1e-12) return best;
      const mx = TX - h0.x, mz = TZ - h0.z;
      const px = (mx * e - b * mz) / det, py = (a * mz - mx * c) / det;
      const cx = best.cx + px, cy = best.cy + py;
      const hv = scene.screenToTable(cx, cy);
      if (!hv) return best;
      const d = Math.hypot(hv.x - TX, hv.z - TZ);
      return d < best.d ? { cx, cy, d } : best;
    });
    ok('触摸: 反查到放置空位', !!spot && spot.d < 0.03, spot ? `偏差${spot.d.toFixed(3)}m` : '未命中');
    if (spot) {
      await page.touchscreen.touchStart(spot.cx - 16, spot.cy);
      await page.touchscreen.touchMove(spot.cx, spot.cy);
      await new Promise(r => setTimeout(r, 120));
      const preview = await page.evaluate(() => window.__bj8.scene.current.cuePlacementVisualState());
      ok('触摸: 自由球虚影随手移动且实体保持隐藏',
        preview.ghostVisible && !preview.realVisible,
        JSON.stringify(preview));
      await page.touchscreen.touchEnd();
      await new Promise(r => setTimeout(r, 500));
      const placed = await page.evaluate(() => ({
        phase: window.__bj8.match.current.phase,
        actor: window.__bj8.match.current.actor,
        dial: Boolean(document.querySelector('.aim-dial')),
        cue: { x: window.__bj8.world.current.balls[0].x, z: window.__bj8.world.current.balls[0].z, active: window.__bj8.world.current.balls[0].active },
      }));
      ok('触摸: 自由球落实后回到你的回合并呼出拨轮',
        placed.phase === 'aiming' && placed.actor === 'player' && placed.cue.active && placed.dial,
        `phase=${placed.phase}/${placed.actor} dial=${placed.dial} cue=(${placed.cue.x.toFixed(2)},${placed.cue.z.toFixed(2)})`);
    }
  }

  ok('触摸: 页面无JS错误', errors.length === 0, errors[0] || '');
  await page.screenshot({ path: 'shots/11-touch-portrait.png' });
  await page.close();
}

// ========== 场景3: 横屏手机 812×375 触摸 ==========
{
  const { page, errors } = await newGamePage({ width: 812, height: 375, hasTouch: true, isMobile: true });
  const box = await padBox(page);
  ok('横屏: 出杆区存在', !!box);
  ok('横屏: 出杆区完整在视口内', box && box.x >= 0 && box.y >= 0 && box.x + box.w <= 812 && box.y + box.h <= 375,
    box ? `(${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.w)}x${Math.round(box.h)})` : 'missing');
  // 出杆区应在右下四分之一区域
  ok('横屏: 出杆区位于右下角', box && box.cx > 812 * 0.6 && box.cy > 375 * 0.5, box ? `cx=${Math.round(box.cx)} cy=${Math.round(box.cy)}` : '');

  // 纯视觉视角端点不被比分栏遮挡，命中自身或其图形子节点。
  const viewBtn = await page.evaluate(() => {
    const btn = document.querySelector('[aria-label="进入全台观察"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      cx,
      cy,
      top: r.y,
      hitIsSelf: hit === btn || btn.contains(hit),
      hitTag: hit ? `${hit.tagName}.${hit.className}` : 'null',
    };
  });
  ok('横屏: 纯视觉视角端点不被遮挡(elementFromPoint)', !!viewBtn && viewBtn.hitIsSelf,
    viewBtn ? `top=${Math.round(viewBtn.top)} hit=${viewBtn.hitTag}` : '按钮不存在');

  // 真实点击切视角:aria-pressed 翻转,瞄准角不变
  if (viewBtn) {
    const aimBefore = await page.evaluate(() => window.__bj8.aim.current);
    await page.mouse.click(viewBtn.cx, viewBtn.cy);
    await new Promise(r => setTimeout(r, 300));
    const aimAfter = await page.evaluate(() => window.__bj8.aim.current);
    ok('横屏: 点击视角端点不改变瞄准角', aimBefore === aimAfter, `before=${aimBefore} after=${aimAfter}`);
    const pressed = await page.evaluate(() => document.querySelector('[aria-label="进入全台观察"]')?.getAttribute('aria-pressed'));
    ok('横屏: 视角端点状态变化(aria-pressed)', pressed === 'true', `aria-pressed=${pressed}`);
    await realClickAria(page, '进入击球视角');
    await new Promise(r => setTimeout(r, 300));
  }

  // 横屏真实拖拽可产生至少 95 力(可用行程归一化后小行程也能满力)
  // 这次拖拽同时就是开球,复用为出杆断言
  if (box) {
    const before = await gameState(page);
    const landscapeStartY = box.y + 1;
    // 触屏内核会丢弃越过视口边缘的最后一个 move；在控件底边内收 2px 可稳定采到满行程。
    const landscapeEndY = box.y + box.h - 2;
    await page.touchscreen.touchStart(box.cx, landscapeStartY);
    for (let i = 1; i <= 8; i++) {
      await page.touchscreen.touchMove(box.cx, landscapeStartY + (landscapeEndY - landscapeStartY) * i / 8);
    }
    // 横屏行程短，给 React 一帧提交最后一次 pointermove 的预览值再读 meter。
    await new Promise(r => setTimeout(r, 50));
    const peak = await page.evaluate(() =>
      document.querySelector('[role="meter"][aria-label="出杆力度"]')?.getAttribute('aria-valuenow'));
    await page.touchscreen.touchEnd();
    ok('横屏: 真实拖拽力度≥95', !!peak && parseInt(peak, 10) >= 95, `peak=${peak}`);
    await new Promise(r => setTimeout(r, 600));
    const after = await gameState(page);
    ok('横屏: 触摸下拉出杆', !!after && after.shot === 1, JSON.stringify({ before, after }));
  }

  ok('横屏: 页面无JS错误', errors.length === 0, errors[0] || '');
  await page.screenshot({ path: 'shots/12-landscape-phone.png' });
  await page.close();
}

// ========== 场景4: 点哪打哪瞄准 + 合法目标环 ==========
{
  const { page, errors } = await newGamePage({ width: 1280, height: 800 });

  // 开球前未分组 → 合法目标应为 14 颗(1-7 和 9-15)
  const ringCount = await page.evaluate(() => window.__bj8?.scene?.current?.legalTargetCount?.() ?? -1);
  ok('瞄准: 开球前合法目标=14', ringCount === 14, `legalTargetCount=${ringCount}`);

  // 全台模式下分别点母球前方右/左世界点；每次有效落位都会自动回 shot，
  // 所以下一个样本必须重新进入 tactical 并用该模式的目标相机投影。
  const vp = await page.evaluate(() => {
    const r = document.querySelector('.viewport').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const enterGlobalAndProjectAim = async (lateral) => {
    await realClickAria(page, '进入全台观察');
    await new Promise(r => setTimeout(r, 300));
    const sample = await page.evaluate(offset => {
      const debug = window.__bj8;
      const cue = debug.world.current.balls[0];
      const target = { x: cue.x + offset, z: cue.z - 0.4 };
      const level = Number(document.querySelector('.viewport')?.dataset.viewLevel);
      return {
        screen: debug.scene.current.tableToScreenAt(
          target.x,
          target.z,
          debug.cameraViewAzimuth.current,
          level,
        ),
        camera: {
          mode: debug.cameraState.current.mode,
          level,
        },
      };
    }, lateral);
    return sample;
  };
  const tapProjectedAim = async (sample) => {
    await page.mouse.move(sample.screen.x, sample.screen.y);
    await page.mouse.down();
    await new Promise(r => setTimeout(r, 120));
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 120));
    return page.evaluate(() => window.__bj8.aim.current);
  };
  const rightSample = await enterGlobalAndProjectAim(0.32);
  const cameraBeforeAim = rightSample.camera;
  const aimRight = await tapProjectedAim(rightSample);
  const cameraAfterAim = await page.evaluate(() => ({
    mode: window.__bj8.cameraState.current.mode,
    level: Number(document.querySelector('.viewport')?.dataset.viewLevel),
  }));
  ok('瞄准: 全局落位幽灵球后自动进入第一人称',
    cameraBeforeAim.mode === 'tactical' &&
      cameraAfterAim.mode === 'shot' &&
      cameraAfterAim.level < 0.01,
    JSON.stringify({ before: cameraBeforeAim, after: cameraAfterAim }));
  const leftSample = await enterGlobalAndProjectAim(-0.32);
  const aimLeft = await tapProjectedAim(leftSample);
  ok('瞄准: 点左右两侧瞄准角异号(点哪打哪)',
    aimRight !== aimLeft && aimRight * aimLeft < 0,
    `右=${aimRight?.toFixed(3)} 左=${aimLeft?.toFixed(3)}`);

  // 拖拽也应使用按下时的 tactical 坐标系直接映射末端位置，而非累计增量。
  const dragRight = await enterGlobalAndProjectAim(0.32);
  const dragLeft = await page.evaluate(() => {
    const debug = window.__bj8;
    const cue = debug.world.current.balls[0];
    const level = Number(document.querySelector('.viewport')?.dataset.viewLevel);
    return debug.scene.current.tableToScreenAt(
      cue.x - 0.32,
      cue.z - 0.4,
      debug.cameraViewAzimuth.current,
      level,
    );
  });
  await page.mouse.move(dragRight.screen.x, dragRight.screen.y);
  await page.mouse.down();
  await page.mouse.move(dragLeft.x, dragLeft.y, { steps: 8 });
  const aimDrag = await page.evaluate(() => window.__bj8.aim.current);
  await page.mouse.up();
  ok('瞄准: 拖拽末端位置决定瞄准角', aimDrag * aimRight < 0,
    `拖拽末=${aimDrag?.toFixed(3)} 应偏左(负号相对右=${aimRight?.toFixed(3)})`);

  // 单点点击确定性:第一人称相机绕白球刚性随转,按下时刻的活相机单次映射
  // 即为正解(探针实测屏幕点方位偏移 φ 与瞄准角无关,无不动点可求)。
  // 等相机就位后用目标位姿(screenToTableAt)反算屏幕点真值,
  // 纯 down/up 点击(零位移)的瞄准角应与之吻合(取未钳制区间)。
  const expectedAt = (cx, cy) => page.evaluate((x, y) => {
    const s = window.__bj8.scene.current;
    const cue = window.__bj8.world.current.balls[0];
    const hit = s.screenToTableAt(x, y, window.__bj8.aim.current);
    if (!hit) return null;
    const worldAngle = Math.atan2(hit.x - cue.x, -(hit.z - cue.z));
    return Math.min(0.72, Math.max(-0.72, worldAngle));
  }, cx, cy);
  {
    await new Promise(r => setTimeout(r, 900)); // 等相机平滑就位(期间瞄准不变)
    const px = vp.x + vp.w * 0.58, py = vp.y + vp.h * 0.5;
    const expected = await expectedAt(px, py);
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.up();
    const got = await page.evaluate(() => window.__bj8.aim.current);
    ok('瞄准: 单点点击指向所点(未钳制区间)',
      expected !== null && Math.abs(expected) < 0.7 && got !== null && Math.abs(got - expected) < 0.01,
      `aim=${got?.toFixed(4)} 真值=${expected?.toFixed(4)}`);
  }

  // 轻点附带 3px 微抖:8px 死区内不得二次采样(相机过渡期内二次采样会
  // 把瞄准带偏几度),结果应与零位移点击一致
  {
    await new Promise(r => setTimeout(r, 900));
    const px = vp.x + vp.w * 0.45, py = vp.y + vp.h * 0.55;
    const expected = await expectedAt(px, py);
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px + 3, py + 2);
    await page.mouse.up();
    const got = await page.evaluate(() => window.__bj8.aim.current);
    ok('瞄准: 轻点微抖不带偏瞄准(拖拽死区)',
      expected !== null && Math.abs(expected) < 0.7 && got !== null && Math.abs(got - expected) < 0.01,
      `aim=${got?.toFixed(4)} 真值=${expected?.toFixed(4)}`);
  }

  // 击球视角抓幽灵球贴近母球：整次手势必须使用按下瞬间的活相机坐标系。
  // 否则每次 pointermove 都会把新杆向反馈给屏幕反算，在母球附近累加成快速旋转。
  {
    await stagePlayerAim(page);
    await realClickAria(page, '进入击球视角');
    await page.evaluate(() => {
      const world = window.__bj8.world.current;
      for (const ball of world.balls) {
        ball.active = ball.number === 0;
        ball.vx = ball.vz = ball.wx = ball.wy = ball.wz = 0;
      }
      Object.assign(world.balls[0], { active: true, x: 0, z: 0.55 });
      world.moving = false;
      window.__bj8.setMatch({ phase: 'aiming', actor: 'player', breaking: false });
      window.__bj8.sync();
    });
    await new Promise(r => setTimeout(r, 1000));

    // 先用真实点击把幽灵球放到母球前方，再从球体上按下，
    // 确保本段验证的是 ghost drag，而不是普通点哪打哪。
    const seedGhostScreen = await page.evaluate(() => {
      const debug = window.__bj8;
      const cue = debug.world.current.balls[0];
      return debug.scene.current.tableToScreen(cue.x + 0.18, cue.z - 0.3);
    });
    await page.mouse.click(seedGhostScreen.x, seedGhostScreen.y);
    await new Promise(r => setTimeout(r, 250));

    const gestureStart = await page.evaluate(() => {
      const debug = window.__bj8;
      const scene = debug.scene.current;
      const cue = debug.world.current.balls[0];
      const ghost = scene.aimGhostPos();
      return {
        ghostScreen: scene.tableToScreen(ghost.x, ghost.z),
      };
    });

    await page.mouse.move(gestureStart.ghostScreen.x, gestureStart.ghostScreen.y);
    await page.mouse.down();

    // pointerdown 会冻结当前活相机；在冻结之后再投影本次手势采样点，
    // 避免把按下前最后一帧平滑过渡误算成瞄准偏差。
    const gesture = await page.evaluate(() => {
      const debug = window.__bj8;
      const scene = debug.scene.current;
      const cue = debug.world.current.balls[0];
      const azimuth = debug.cameraViewAzimuth.current;
      const radius = 0.07;
      return {
        cue: { x: cue.x, z: cue.z },
        azimuth,
        cueScreen: scene.tableToScreen(cue.x, cue.z),
        points: [-0.9, -0.45, 0, 0.45, 0.9].map(angle => {
          const target = {
            x: cue.x + Math.sin(angle) * radius,
            z: cue.z - Math.cos(angle) * radius,
          };
          const screen = scene.tableToScreen(target.x, target.z);
          const hit = scene.screenToTable(screen.x, screen.y);
          return {
            screen,
            expected: Math.atan2(hit.x - cue.x, -(hit.z - cue.z)),
          };
        }),
      };
    });

    const samples = [];
    for (const point of gesture.points) {
      await page.mouse.move(point.screen.x, point.screen.y);
      await new Promise(r => setTimeout(r, 60));
      samples.push(await page.evaluate(expected => ({
        expected,
        aim: window.__bj8.aim.current,
        camera: window.__bj8.cameraViewAzimuth.current,
      }), point.expected));
    }
    const beforeDeadZone = samples.at(-1);
    await page.mouse.move(gesture.cueScreen.x, gesture.cueScreen.y, { steps: 6 });
    await new Promise(r => setTimeout(r, 60));
    const inDeadZone = await page.evaluate(cue => {
      const ghost = window.__bj8.scene.current.aimGhostPos();
      return {
        aim: window.__bj8.aim.current,
        camera: window.__bj8.cameraViewAzimuth.current,
        configuredDistance: window.__bj8.scene.current.aimGhostDist,
        distance: Math.hypot(ghost.x - cue.x, ghost.z - cue.z),
      };
    }, gesture.cue);
    await page.mouse.up();

    const angleError = (left, right) => Math.abs(Math.atan2(
      Math.sin(left - right),
      Math.cos(left - right),
    ));
    const maxAimError = Math.max(...samples.map(sample =>
      angleError(sample.aim, sample.expected)));
    const maxCameraDrift = Math.max(...samples.map(sample =>
      angleError(sample.camera, gesture.azimuth)));

    ok('瞄准: 幽灵球近母球拖拽使用固定坐标系',
      maxAimError < 0.015,
      `最大角度误差=${maxAimError.toFixed(5)}rad`);
    ok('瞄准: 幽灵球拖拽期间相机不反馈旋转',
      maxCameraDrift < 1e-6,
      `最大相机漂移=${maxCameraDrift.toFixed(8)}rad`);
    ok('瞄准: 指针穿入母球时保留杆向并钳在两球直径外',
      beforeDeadZone &&
        angleError(inDeadZone.aim, beforeDeadZone.aim) < 1e-6 &&
        Math.abs(inDeadZone.distance - 0.05715) < 5e-4,
      `杆向差=${beforeDeadZone ? angleError(inDeadZone.aim, beforeDeadZone.aim).toFixed(8) : 'missing'}rad 距离=${inDeadZone.distance.toFixed(5)}m 配置=${inDeadZone.configuredDistance}`);
  }

  // 出杆动画:触球瞬间皮头应贴到白球面上(gap ≈ R+2mm ≈ 0.0306m)
  const contactGap = await page.evaluate(() => new Promise(res => {
    const s = window.__bj8.scene.current;
    s.triggerStrike({ power: 60, spin: { x: 0, y: 0 }, onContact: () => res(s.debugTipGap()) });
  }));
  ok('出杆: 触球瞬间皮头贴到球面', contactGap !== null && Math.abs(contactGap - 0.030575) < 0.004,
    `gap=${contactGap === null ? 'null' : contactGap.toFixed(4)}m (期望≈0.0306)`);

  // 动画期间球杆可见,结束后隐藏
  await page.evaluate(() => window.__bj8.scene.current.triggerStrike({ power: 40, spin: { x: 0, y: 0 } }));
  await new Promise(r => setTimeout(r, 100));
  const cueVisibleDuring = await page.evaluate(() => window.__bj8.scene.current.cueGroupVisible());
  await new Promise(r => setTimeout(r, 500));
  const cueVisibleAfter = await page.evaluate(() => window.__bj8.scene.current.cueGroupVisible());
  ok('出杆: 动画期间可见后隐藏', cueVisibleDuring === true && cueVisibleAfter === false,
    `期间=${cueVisibleDuring} 之后=${cueVisibleAfter}`);

  ok('瞄准: 页面无JS错误', errors.length === 0, errors[0] || '');
  await page.screenshot({ path: 'shots/13-legal-rings.png' });
  await page.close();
}

await browser.disconnect();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length === 0 ? 0 : 1);
