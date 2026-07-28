/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口与 puppeteer-core
[OUTPUT]: 桌面/竖屏/横屏的真实指针、键盘、瞄准、视角、蓄力与放置断言
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

async function placeCueBallInKitchen(page) {
  const candidates = await page.evaluate(() => {
    const r = document.querySelector('.viewport').getBoundingClientRect();
    // 俯视下开球区在屏幕下方（head string 之后，z >= L/4），取几个候选点
    return [0.72, 0.78, 0.84, 0.90].map(fy => ({ x: r.x + r.width / 2, y: r.y + r.height * fy }));
  });
  for (const pt of candidates) {
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

const turnText = (page) => page.evaluate(() => document.querySelector('.match-state p')?.textContent);

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
      await realClickButton(page, '俯视');
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

  // 切视角:真实点击,aria-pressed 状态翻转,且不改变瞄准角
  const aimBeforeSwitch = await page.evaluate(() => window.__bj8.aim.current);
  await realClickButton(page, '俯视');
  await new Promise(r => setTimeout(r, 400));
  const pressed = await page.evaluate(() => ({
    first: document.querySelector('.view-switcher button:nth-child(1)')?.getAttribute('aria-pressed'),
    overhead: document.querySelector('.view-switcher button:nth-child(2)')?.getAttribute('aria-pressed'),
  }));
  ok('桌面: 切视角 aria-pressed 翻转', pressed.first === 'false' && pressed.overhead === 'true', JSON.stringify(pressed));
  const aimAfterSwitch = await page.evaluate(() => window.__bj8.aim.current);
  ok('桌面: 切视角不改变瞄准角', aimBeforeSwitch === aimAfterSwitch, `before=${aimBeforeSwitch} after=${aimAfterSwitch}`);
  await realClickButton(page, '第一人称');
  await new Promise(r => setTimeout(r, 400));

  // 鼠标拖拽出杆
  const { before, immediate, after } = await dragStrike(page, box, false);
  ok('桌面: 鼠标下拉蓄力出杆', !!after && after.shot === 1, JSON.stringify({ before, after }));
  ok('桌面: 松开瞬间球未动(等杆头触球)', !!immediate && immediate.shot === 0, JSON.stringify(immediate));

  // 等球停，再轻点出杆（最低力度）
  await page.waitForFunction(() => !window.__bj8.world.current.moving, { timeout: 30000 });
  await page.mouse.move(box.cx, box.cy);
  await page.mouse.down();
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 300));
  const tapState = await gameState(page);
  ok('桌面: 轻点也能出杆(保底力度)', tapState && tapState.shot >= 1, JSON.stringify(tapState));

  ok('桌面: 回到你的回合(自由球自动放置)', await waitPlayerTurn(page));

  // 键盘:空格按住 1350ms → 最终力度 81±2(真实 keyboard 事件,与帧率无关)
  await page.keyboard.down('Space');
  await new Promise(r => setTimeout(r, 1350));
  await page.keyboard.up('Space');
  await new Promise(r => setTimeout(r, 250));
  const holdPower = await page.evaluate(() => parseInt(document.querySelector('.power-num')?.textContent ?? '0', 10));
  ok('桌面: 空格1350ms力度81±2', Math.abs(holdPower - 81) <= 2, `power=${holdPower}`);
  ok('桌面: 空格出杆后回到你的回合', await waitPlayerTurn(page));

  // 塞球盘拖到顶部 → 高杆
  const spinBox = await page.evaluate(() => {
    const r = document.querySelector('.spin-ball').getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });
  await page.mouse.move(spinBox.cx, spinBox.cy);
  await page.mouse.down();
  await page.mouse.move(spinBox.cx, spinBox.cy - 18, { steps: 4 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 200));
  const spinLabel = await page.evaluate(() => document.querySelector('.spin-pad small')?.textContent);
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
    const deck = document.querySelector('.control-deck').getBoundingClientRect();
    return [...document.querySelector('.control-deck').children]
      .filter(c => {
        const r = c.getBoundingClientRect();
        return r.bottom > deck.bottom + 2 || r.right > deck.right + 2 || r.left < deck.left - 2;
      }).length;
  });
  ok('触摸: 控制区无溢出元素', overflow === 0, overflow ? `${overflow}个元素溢出` : '');

  // 第一人称粗调杆向按钮：真实命中，并直接改变唯一世界瞄准角
  const rotateBtn = await page.evaluate(() => {
    const btn = document.querySelector('.view-switcher button[aria-label="杆向向左转 45 度"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    return { cx, cy, hitIsSelf: document.elementFromPoint(cx, cy) === btn };
  });
  ok('触摸: 旋转按钮真实命中', !!rotateBtn && rotateBtn.hitIsSelf, rotateBtn ? '' : '按钮不存在或被遮挡');
  if (rotateBtn) {
    const aimBefore = await page.evaluate(() => window.__bj8.aim.current);
    await page.touchscreen.tap(rotateBtn.cx, rotateBtn.cy);
    await new Promise(r => setTimeout(r, 300));
    const aimAfter = await page.evaluate(() => window.__bj8.aim.current);
    ok(
      '触摸: 粗调按钮改变世界杆向',
      aimAfter < aimBefore - 0.6,
      `before=${aimBefore} after=${aimAfter}`,
    );
  }

  // 触摸拖拽出杆(开球),同时验证满力可达
  await page.touchscreen.touchStart(box.cx, box.cy);
  for (let i = 1; i <= 6; i++) await page.touchscreen.touchMove(box.cx, box.cy + i * 20);
  const peak = await page.evaluate(() => document.querySelector('.power-num')?.textContent);
  await page.touchscreen.touchEnd();
  ok('触摸: 竖屏满力可达(≥95)', !!peak && parseInt(peak, 10) >= 95, `peak=${peak}`);
  await new Promise(r => setTimeout(r, 600));
  const after = await gameState(page);
  ok('触摸: 下拉蓄力出杆', !!after && after.shot === 1, JSON.stringify(after));

  // 自由球放置:等对手回合,摆"AI 必连杆落袋"的几何,AI 犯规后触摸放置白球
  await page.waitForFunction(() => !window.__bj8.world.current.moving, { timeout: 30000 }).catch(() => {});
  {
    // 若开球进了(玩家继续),用轻触空杆把回合交出去
    let turn = await turnText(page);
    if (turn === '你的回合') {
      await page.touchscreen.touchStart(box.cx, box.cy);
      await page.touchscreen.touchEnd();
      await page.waitForFunction(() => !window.__bj8.world.current.moving, { timeout: 30000 }).catch(() => {});
      turn = await turnText(page);
    }
    // 等到对手思考,立即摆球:唯一目标球放在 白球→右下袋口 连线上,距袋口 0.35m
    const deadline = Date.now() + 40000;
    while ((await turnText(page)) !== '顾燃思考' && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 400));
    }
    const stagedOk = await page.evaluate(() => {
      const world = window.__bj8.world.current;
      const cue = world.balls[0];
      if (!cue.active) return false;
      const pocket = { x: 0.635, z: 1.27 };
      for (const b of world.balls) {
        if (b.number === 0) continue;
        b.active = false; b.vx = 0; b.vz = 0;
      }
      const dx = pocket.x - cue.x, dz = pocket.z - cue.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.6) return false;
      const ball = world.balls.find(b => b.number === 1);
      ball.active = true;
      ball.x = pocket.x - (dx / len) * 0.35;
      ball.z = pocket.z - (dz / len) * 0.35;
      ball.vx = 0; ball.vz = 0; ball.wx = 0; ball.wy = 0; ball.wz = 0;
      return true;
    });
    ok('触摸: 对手回合摆出 AI 犯规几何', stagedOk);
    // AI 击球(约 900ms 后),无论打中连带进袋还是空杆,犯规后都是玩家自由球
    const placingDeadline = Date.now() + 20000;
    let placing = false;
    while (Date.now() < placingDeadline) {
      const t = await turnText(page);
      if (t === '放置白球') { placing = true; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    ok('触摸: AI 犯规进入自由球放置', placing);
    if (placing) {
      // 放置 effect 已切到俯视;先粗网格反查,再利用俯视映射的仿射性
      // (屏幕像素→台面坐标近似线性)解出精确像素,把偏差压到亚球半径级
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
        // 以最优点为原点估计局部雅可比(米/像素),一步牛顿解出目标像素
        const h0 = scene.screenToTable(best.cx, best.cy);
        const hx = scene.screenToTable(best.cx + 20, best.cy);
        const hy = scene.screenToTable(best.cx, best.cy + 20);
        if (!h0 || !hx || !hy) return best;
        const a = (hx.x - h0.x) / 20, b = (hy.x - h0.x) / 20; // dx/dpx, dx/dpy
        const c = (hx.z - h0.z) / 20, e = (hy.z - h0.z) / 20; // dz/dpx, dz/dpy
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
        await page.touchscreen.tap(spot.cx, spot.cy);
        await new Promise(r => setTimeout(r, 500));
        const placed = await page.evaluate(() => ({
          turn: document.querySelector('.match-state p')?.textContent,
          cue: { x: window.__bj8.world.current.balls[0].x, z: window.__bj8.world.current.balls[0].z, active: window.__bj8.world.current.balls[0].active },
        }));
        ok('触摸: 自由球放置成功回到你的回合', placed.turn === '你的回合' && placed.cue.active,
          `turn=${placed.turn} cue=(${placed.cue.x.toFixed(2)},${placed.cue.z.toFixed(2)})`);
      }
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

  // 视角按钮不被顶栏遮挡,elementFromPoint 命中按钮自身(开球前必为玩家回合)
  const viewBtn = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.view-switcher button')].find(b => b.textContent === '俯视');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return { cx, cy, top: r.y, hitIsSelf: hit === btn, hitTag: hit ? `${hit.tagName}.${hit.className}` : 'null' };
  });
  ok('横屏: 视角按钮不被遮挡(elementFromPoint)', !!viewBtn && viewBtn.hitIsSelf,
    viewBtn ? `top=${Math.round(viewBtn.top)} hit=${viewBtn.hitTag}` : '按钮不存在');

  // 真实点击切视角:aria-pressed 翻转,瞄准角不变
  if (viewBtn) {
    const aimBefore = await page.evaluate(() => window.__bj8.aim.current);
    await page.mouse.click(viewBtn.cx, viewBtn.cy);
    await new Promise(r => setTimeout(r, 300));
    const aimAfter = await page.evaluate(() => window.__bj8.aim.current);
    ok('横屏: 点击视角按钮不改变瞄准角', aimBefore === aimAfter, `before=${aimBefore} after=${aimAfter}`);
    const pressed = await page.evaluate(() => document.querySelector('.view-switcher button:nth-child(2)')?.getAttribute('aria-pressed'));
    ok('横屏: 视角按钮状态变化(aria-pressed)', pressed === 'true', `aria-pressed=${pressed}`);
    await realClickButton(page, '第一人称');
    await new Promise(r => setTimeout(r, 300));
  }

  // 横屏真实拖拽可产生至少 95 力(可用行程归一化后小行程也能满力)
  // 这次拖拽同时就是开球,复用为出杆断言
  if (box) {
    const before = await gameState(page);
    await page.touchscreen.touchStart(box.cx, box.cy);
    for (let i = 1; i <= 10; i++) await page.touchscreen.touchMove(box.cx, box.cy + i * 10);
    const peak = await page.evaluate(() => document.querySelector('.power-num')?.textContent);
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

  // 点台面右侧 vs 左侧,瞄准角应变号(点哪打哪)
  const vp = await page.evaluate(() => {
    const r = document.querySelector('.viewport').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const tapAim = async (fx, fy) => {
    await page.mouse.move(vp.x + vp.w * fx, vp.y + vp.h * fy);
    await page.mouse.down();
    await new Promise(r => setTimeout(r, 120));
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 120));
    return page.evaluate(() => window.__bj8.aim.current);
  };
  const aimRight = await tapAim(0.85, 0.45);
  const aimLeft = await tapAim(0.15, 0.45);
  ok('瞄准: 点左右两侧瞄准角异号(点哪打哪)',
    aimRight !== aimLeft && aimRight * aimLeft < 0,
    `右=${aimRight?.toFixed(3)} 左=${aimLeft?.toFixed(3)}`);

  // 拖拽也应直接映射位置而非增量
  await page.mouse.move(vp.x + vp.w * 0.8, vp.y + vp.h * 0.4);
  await page.mouse.down();
  await page.mouse.move(vp.x + vp.w * 0.2, vp.y + vp.h * 0.4, { steps: 8 });
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
