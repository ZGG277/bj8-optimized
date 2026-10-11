/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口、puppeteer-core 与 __bj8 调试句柄
[OUTPUT]: 独立走位/复盘开关、最高概率单方案分杆展示、默认收起复盘与显式计划轨迹对比的真实输入集成断言及截图
[POS]: planner→React→Scene3D→真实输入的浏览器出口门禁
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * P1 走位规划集成回归:固定球局 → 默认熄灭 → 💡 点亮 → 最高概率方案分杆展示 → 关闭恢复
 *   → 击球复盘:真实出杆后默认隐藏 → 灯泡打开后显示 .review-chip → 有显式计划才可 ▶ 对比 → 收起
 * 摆球经 __bj8 调试句柄(同 verify-break-group 模式),按钮点击全部走真实鼠标事件。
 * 前置:
 *   npx vite --port 5199 --strictPort &
 *   "/Applications/ego lite.app/Contents/MacOS/ego lite" --headless=new \
 *     --remote-debugging-port=9333 --user-data-dir=/tmp/ego-verify &
 * 浏览器连接地址可用 BROWSER_URL 覆盖;游戏地址可用 GAME_URL 覆盖。
 */
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';
const SHOT_DIR = process.env.SHOT_DIR || 'shots';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await puppeteer.connect({
  browserURL: BROWSER_URL,
  defaultViewport: { width: 1280, height: 800 },
});

/** 真实点击一个按文本找到的按钮 */
async function realClickButton(page, text) {
  const box = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes(t));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, text);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
}

async function realClickAria(page, label) {
  try {
    await page.click(`[aria-label="${label}"]`);
    return true;
  } catch {
    return false;
  }
}

async function toggleGuidance(page) {
  const hasOption = await page.$('.guidance-option');
  if (!hasOption) {
    try {
      await page.click('.plan-button');
    } catch {
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  try {
    await page.click('.guidance-option');
    return true;
  } catch {
    return false;
  }
}

async function toggleReview(page) {
  const hasOption = await page.$('.review-option');
  if (!hasOption) {
    try {
      await page.click('.plan-button');
    } catch {
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  try {
    await page.click('.review-option');
    return true;
  } catch {
    return false;
  }
}

const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
ok('开始对局真实点击', await realClickButton(page, '开始对局'));
await new Promise(r => setTimeout(r, 800));

// 开球流程适配：开局进入 placing 阶段（点击开球区放置白球）→ 放球后才到 aiming。
// 网格扫描 screenToTable 找一个 z ≥ headString 的屏幕点，真实移鼠标+点击放置
const wasPlacing = await page.evaluate(() => !!document.querySelector('.viewport.placing'));
if (wasPlacing) {
  const spot = await page.evaluate(() => {
    const scene = window.__bj8.scene.current;
    const headString = 2.54 * 0.25; // TABLE.length * 0.25
    for (let py = 100; py < 780; py += 20) {
      for (let px = 200; px < 1100; px += 20) {
        const hit = scene.screenToTable(px, py);
        if (hit && Math.abs(hit.x) < 0.3 && hit.z > headString + 0.15 && hit.z < headString + 0.6) {
          return { px, py };
        }
      }
    }
    return null;
  });
  if (spot) {
    await page.mouse.move(spot.px, spot.py);
    await new Promise(r => setTimeout(r, 200));
    await page.mouse.click(spot.px, spot.py);
    await new Promise(r => setTimeout(r, 500));
  }
  const stillPlacing = await page.evaluate(() => !!document.querySelector('.viewport.placing'));
  ok('开球放置白球（placing→aiming）', !stillPlacing, `spot=${JSON.stringify(spot)}`);
}

// 摆固定球局(与 planner.test.ts 的三球局面一致):1→右中袋、2→左中袋、3→右下底袋,均可下
const staged = await page.evaluate(() => {
  const world = window.__bj8.world.current;
  const placements = [
    { n: 0, x: 0, z: 0.55 },
    { n: 1, x: 0.5, z: 0 },
    { n: 2, x: -0.5, z: 0 },
    { n: 3, x: 0.45, z: 1.05 },
  ];
  const map = new Map(placements.map(p => [p.n, p]));
  for (const b of world.balls) {
    const p = map.get(b.number);
    if (p) { b.active = true; b.x = p.x; b.z = p.z; }
    else { b.active = false; b.x = 0; b.z = 0; }
    b.vx = 0; b.vz = 0; b.wx = 0; b.wy = 0; b.wz = 0;
  }
  world.moving = false;
  world.events = [];
  world.firstContact = null;
  window.__bj8.sync();
  return world.balls.filter(b => b.active).length;
});
ok('摆球同步(4 颗 active)', staged === 4, `active=${staged}`);

// 默认不启动规划；灯泡保持熄灭但辅助入口可打开。
const buttonFlow = await page.evaluate(() => new Promise((resolve) => {
  const seen = new Set();
  const deadline = Date.now() + 20000;
  const timer = setInterval(() => {
    const btn = document.querySelector('.plan-button');
    if (!btn) return;
    const visible = getComputedStyle(btn).visibility === 'visible';
    if (visible && btn.disabled) seen.add('computing');
    if (visible && !btn.disabled) {
      seen.add('ready');
      clearInterval(timer);
      resolve([...seen]);
    }
    if (Date.now() > deadline) {
      clearInterval(timer);
      resolve([...seen, 'timeout']);
    }
  }, 120);
}));
ok('💡 默认熄灭且辅助入口可打开', buttonFlow.includes('ready') && await page.evaluate(
  () => document.querySelector('.plan-button')?.classList.contains('is-off') === true &&
    document.querySelector('.plan-button')?.getAttribute('aria-expanded') === 'false'
), `flow=${buttonFlow.join('→')}`);

const viewBeforePlan = await page.evaluate(() =>
  Number(document.querySelector('.viewport')?.getAttribute('data-view-level')));
// 真实点击打开规划提示条
ok('点击 💡 提示按钮', await toggleGuidance(page));
await page.waitForSelector('.plan-bar', { timeout: 6000 }).catch(() => {});
const overlay = await page.evaluate(() => {
  const bar = document.querySelector('.plan-bar');
  const panel = document.querySelector('.plan-panel');
  const chips = [...document.querySelectorAll('.plan-chip')].map(c => c.textContent ?? '');
  const prob = document.querySelector('.plan-bar-prob')?.textContent ?? '';
  return { bar: !!bar, panel: !!panel, chips, prob };
});
ok('提示条出现且无旧面板', overlay.bar && !overlay.panel, `bar=${overlay.bar} panel=${overlay.panel}`);
ok('最高概率方案只显示当前一杆 chip', overlay.chips.length === 1, `chips=${overlay.chips.length}`);
ok('chip 含杆法与力档', overlay.chips.every(t => /^(高杆|低杆|中杆)(右塞|左塞)?(小力|中力|发力)$/.test(t)), overlay.chips.join(' | '));
ok('当前杆概率文案存在', /本杆 \d+%/.test(overlay.prob), overlay.prob);

// 💡 三态 toggle：展开中按钮为 is-open，再点 = 关闭（与 ✕ 等价），再点重开
ok('引导展开中按钮为 is-open', await page.evaluate(
  () => document.querySelector('.plan-button')?.classList.contains('is-open') ?? false));
ok('再点 💡 关闭引导', await toggleGuidance(page));
await new Promise(r => setTimeout(r, 500));
const afterToggleClose = await page.evaluate(() => ({
  bar: !!document.querySelector('.plan-bar'),
  off: document.querySelector('.plan-button')?.classList.contains('is-off') ?? false,
}));
ok('toggle 关闭后提示条消失且按钮熄灭', !afterToggleClose.bar && afterToggleClose.off, JSON.stringify(afterToggleClose));
ok('再点 💡 重开引导', await toggleGuidance(page));
await page.waitForSelector('.plan-bar', { timeout: 6000 }).catch(() => {});
ok('重开后提示条恢复', await page.evaluate(() => !!document.querySelector('.plan-bar')));

// 场景默认只渲染第 1 杆；点击第 2/3 杆标签才切换对应预览。
const planObjects = await page.evaluate(() => window.__bj8.scene.current.planObjectCount());
ok('场景规划对象上屏(单杆轨迹/标记)', planObjects > 0, `planObjectCount=${planObjects}`);
const stepSwitch = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.plan-step-tabs button')];
  if (tabs.length < 2) return { available: false, selected: null };
  tabs[1].click();
  return { available: true, selected: tabs[1].getAttribute('aria-selected') };
});
await new Promise(r => setTimeout(r, 250));
ok('点击第 2 杆后才切换后续路线', !stepSwitch.available || await page.evaluate(
  () => document.querySelectorAll('.plan-bar-chips .plan-chip').length === 1 &&
    document.querySelectorAll('.plan-step-tabs button[aria-selected="true"]').length === 1
), JSON.stringify(stepSwitch));

// 提示条出现期间瞄准被禁用(canAim 压低:拖拽不改瞄准角)
const aimBefore = await page.evaluate(() => window.__bj8.aim.current);
const vpBox = await page.evaluate(() => {
  const r = document.querySelector('.viewport').getBoundingClientRect();
  return { cx: r.x + r.width * 0.4, cy: r.y + r.height * 0.5 };
});
await page.mouse.move(vpBox.cx, vpBox.cy);
await page.mouse.down();
await page.mouse.move(vpBox.cx + 80, vpBox.cy, { steps: 5 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 200));
const aimAfter = await page.evaluate(() => window.__bj8.aim.current);
ok('提示条出现期间瞄准输入禁用', aimBefore === aimAfter, `aim=${aimBefore}→${aimAfter}`);

ok('规划层不再自动播放整链', !await page.evaluate(
  () => document.querySelector('.plan-bar-play') || window.__bj8.scene.current.planPlaying()
));
await page.screenshot({ path: `${SHOT_DIR}/38-position-plan.png` });

// 关闭:提示条消失、场景规划渲染清除、视角恢复第一人称、瞄准恢复
ok('点击 ✕ 关闭', await realClickButton(page, '✕'));
await new Promise(r => setTimeout(r, 600));
const restored = await page.evaluate(() => ({
  bar: !!document.querySelector('.plan-bar'),
  planObjects: window.__bj8.scene.current.planObjectCount(),
  viewLevel: Number(document.querySelector('.viewport')?.getAttribute('data-view-level')),
}));
ok('关闭后提示条消失且场景清除', !restored.bar && restored.planObjects === 0, JSON.stringify(restored));
ok('关闭后恢复打开前视角', Math.abs(restored.viewLevel - viewBeforePlan) < 0.01,
  `view=${viewBeforePlan}→${restored.viewLevel}`);

// 瞄准恢复:点台面右侧应改变瞄准角
const aimRestore = await (async () => {
  const before = await page.evaluate(() => window.__bj8.aim.current);
  const r = await page.evaluate(() => {
    const rect = document.querySelector('.viewport').getBoundingClientRect();
    return { x: rect.x + rect.width * 0.85, y: rect.y + rect.height * 0.45 };
  });
  await page.mouse.move(r.x, r.y);
  await page.mouse.down();
  await new Promise(s => setTimeout(s, 120));
  await page.mouse.up();
  const after = await page.evaluate(() => window.__bj8.aim.current);
  return { before, after };
})();
ok('关闭后瞄准输入恢复', aimRestore.before !== aimRestore.after, `aim=${aimRestore.before}→${aimRestore.after?.toFixed?.(3)}`);

// ── 击球复盘：摆一颗直球短杆，真实出杆 → .review-chip → ▶ 对比 → 收起 ──
// 短直球（1 号 10cm 入右中袋）保证进球不犯规、玩家继续回合，复盘 chip 有充足断言窗口
const restaged = await page.evaluate(() => {
  const world = window.__bj8.world.current;
  const placements = [
    { n: 0, x: 0.33, z: 0 },
    { n: 1, x: 0.53, z: 0 },
    { n: 2, x: -0.5, z: -0.8 },
    { n: 3, x: -0.5, z: 0.8 },
  ];
  const map = new Map(placements.map(p => [p.n, p]));
  for (const b of world.balls) {
    const p = map.get(b.number);
    if (p) { b.active = true; b.x = p.x; b.z = p.z; }
    else { b.active = false; b.x = 0; b.z = 0; }
    b.vx = 0; b.vz = 0; b.wx = 0; b.wy = 0; b.wz = 0;
  }
  world.moving = false;
  world.events = [];
  world.firstContact = null;
  window.__bj8.sync();
  return world.balls.filter(b => b.active).length;
});
ok('复盘摆球同步(4 颗 active)', restaged === 4, `active=${restaged}`);

// 主动点亮并等待新局面计划；关闭展示后方案仍保留，下一杆可做计划/实际对比。
ok('新局面主动点亮 💡', await toggleGuidance(page));
const relit = await page.evaluate(() => new Promise((resolve) => {
  const deadline = Date.now() + 20000;
  const timer = setInterval(() => {
    if (document.querySelector('.plan-bar')) {
      clearInterval(timer);
      resolve(true);
    }
    if (Date.now() > deadline) {
      clearInterval(timer);
      resolve(false);
    }
  }, 120);
}));
ok('新局面规划就绪并展开', relit);
if (relit) {
  await realClickButton(page, '✕');
  await new Promise(r => setTimeout(r, 400));
}

// 瞄准不能写 __bj8.aim（ref 会被蓄力预览的 React 同步覆盖回状态值）——
// 走真实点击：网格扫描 screenToTable 找台面 (0.62, 0)（母球→1 号延长线上）的屏幕点，点击设 aim
const aimSpot = await page.evaluate(() => {
  const scene = window.__bj8.scene.current;
  const level = Number(document.querySelector('.viewport')?.getAttribute('data-view-level'));
  const azimuth = window.__bj8.cameraViewAzimuth.current;
  const point = scene.tableToScreenAt(0.62, 0, azimuth, level);
  return Number.isFinite(point?.x) && Number.isFinite(point?.y)
    ? { px: point.x, py: point.y }
    : null;
});
if (aimSpot) {
  await page.mouse.move(aimSpot.px, aimSpot.py);
  await page.mouse.down();
  await new Promise(r => setTimeout(r, 120));
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 300));
}
const aimSet = await page.evaluate(() => window.__bj8.aim.current);
ok('真实点击瞄准 1 号直线', !!aimSpot && Math.abs(aimSet - Math.PI / 2) < 0.1, `spot=${JSON.stringify(aimSpot)} aim=${aimSet?.toFixed?.(3)}`);

// 真实拖拽蓄力出杆（.shoot-pad 下拉 ~100px 松开；该控件是 div[role=button] 非 <button>）
const shootBox = await page.evaluate(() => {
  const pad = document.querySelector('.shoot-pad');
  if (!pad) return null;
  const r = pad.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (shootBox) {
  await page.mouse.move(shootBox.x, shootBox.y);
  await page.mouse.down();
  await page.mouse.move(shootBox.x, shootBox.y + 100, { steps: 8 });
  await new Promise(r => setTimeout(r, 150));
  await page.mouse.up();
}
await page.waitForFunction(() => window.__bj8.world.current.shot >= 1, { timeout: 8000 }).catch(() => {});
const shotCommitted = await page.evaluate(() => window.__bj8.world.current.shot >= 1);
ok('真实拖拽出杆', !!shootBox && shotCommitted);

// 等物理停稳；复盘已生成，但默认保持收起，不主动打扰玩家。
await page.waitForFunction(() => !window.__bj8.world.current.moving, { timeout: 15000 }).catch(() => {});
await new Promise(r => setTimeout(r, 300));
ok('击球结算后复盘默认收起', !await page.$('.review-chip'));
ok('从灯泡打开复盘', await toggleReview(page));
await new Promise(r => setTimeout(r, 180));
const chipText = await page.evaluate(() => new Promise((resolve) => {
  const deadline = Date.now() + 15000;
  const timer = setInterval(() => {
    const chip = document.querySelector('.review-chip');
    if (chip) {
      clearInterval(timer);
      resolve(chip.textContent ?? '');
    }
    if (Date.now() > deadline) {
      clearInterval(timer);
      resolve(null);
    }
  }, 200);
}));
ok('复盘以中性“复盘”开头且不使用顾燃口吻',
  !!chipText && chipText.startsWith('复盘：') && !chipText.includes('顾燃：'),
  `text=${chipText}`);

// ▶ 对比：展开 .review-bar + 场景叠加（计划虚线/实际实线/停位标记）
ok('点击 ▶ 对比', await realClickButton(page, '▶ 对比'));
await new Promise(r => setTimeout(r, 800));
const reviewShown = await page.evaluate(() => ({
  bar: !!document.querySelector('.review-bar'),
  objects: window.__bj8.scene.current.reviewObjectCount(),
}));
ok('对比条展开且场景叠加上屏', reviewShown.bar && reviewShown.objects >= 2, JSON.stringify(reviewShown));
await page.screenshot({ path: `${SHOT_DIR}/43-shot-review.png` });

// ✕ 收起：对比条消失、场景叠加清除
ok('点击 ✕ 收起复盘', await realClickButton(page, '✕'));
await new Promise(r => setTimeout(r, 500));
const reviewClosed = await page.evaluate(() => ({
  bar: !!document.querySelector('.review-bar'),
  objects: window.__bj8.scene.current.reviewObjectCount(),
}));
ok('收起后对比条消失且场景清除', !reviewClosed.bar && reviewClosed.objects === 0, JSON.stringify(reviewClosed));

ok('页面无JS错误', errors.length === 0, errors[0] || '');
await page.close();

// ── 挑战模式：更强对手不再强制关闭规划，玩家仍可主动查看并在赛后对比 ──
const challengePage = await browser.newPage();
const challengeErrors = [];
challengePage.on('pageerror', error => challengeErrors.push(String(error)));
await challengePage.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
ok('挑战模式真实点击', await realClickButton(challengePage, '开始挑战'));
await challengePage.waitForFunction(() => window.__bj8?.scene?.current, { timeout: 10000 });
await challengePage.evaluate(() => {
  const world = window.__bj8.world.current;
  const placements = [
    { n: 0, x: 0.33, z: 0 },
    { n: 1, x: 0.53, z: 0 },
    { n: 2, x: -0.5, z: -0.8 },
  ];
  const map = new Map(placements.map(item => [item.n, item]));
  for (const ball of world.balls) {
    const placement = map.get(ball.number);
    if (placement) Object.assign(ball, { active: true, x: placement.x, z: placement.z });
    else Object.assign(ball, { active: false, x: 0, z: 0 });
    ball.vx = ball.vz = ball.wx = ball.wy = ball.wz = 0;
  }
  world.moving = false;
  world.events = [];
  world.firstContact = null;
  window.__bj8.setMatch({ phase: 'aiming', actor: 'player', breaking: false, winner: null });
  window.__bj8.sync();
});
await new Promise(resolve => setTimeout(resolve, 250));
await challengePage.click('.plan-button');
await challengePage.waitForSelector('.guidance-option', { timeout: 3000 });
const challengeGate = await challengePage.evaluate(() => ({
  disabled: document.querySelector('.guidance-option')?.disabled ?? false,
  planVisible: Boolean(document.querySelector('.plan-bar')),
}));
ok('挑战模式走位入口可用', !challengeGate.disabled && !challengeGate.planVisible,
  JSON.stringify(challengeGate));
await challengePage.click('.guidance-option');
await challengePage.waitForSelector('.plan-bar', { timeout: 15000 }).catch(() => {});
ok('挑战模式点击走位后显示可靠路线', Boolean(await challengePage.$('.plan-bar')));
ok('挑战模式可关闭走位路线', await realClickAria(challengePage, '关闭走位规划'));
await new Promise(resolve => setTimeout(resolve, 180));
ok('挑战模式可独立打开复盘', await toggleReview(challengePage));
await new Promise(resolve => setTimeout(resolve, 120));
const challengeReviewEnabled = await challengePage.evaluate(() =>
  document.querySelector('.review-option')?.getAttribute('aria-checked') === 'true');
ok('挑战模式复盘开关已点亮', challengeReviewEnabled);
if (await challengePage.$('.assist-menu')) await challengePage.click('.plan-button');

const challengeAim = await challengePage.evaluate(() => {
  const scene = window.__bj8.scene.current;
  const level = Number(document.querySelector('.viewport')?.getAttribute('data-view-level'));
  const point = scene.tableToScreenAt(0.62, 0, window.__bj8.cameraViewAzimuth.current, level);
  return { x: point.x, y: point.y };
});
await challengePage.mouse.click(challengeAim.x, challengeAim.y);
const challengeShoot = await challengePage.$eval('.shoot-pad', element => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
});
const challengeShotBefore = await challengePage.evaluate(() => window.__bj8.world.current.shot);
await challengePage.mouse.move(challengeShoot.x, challengeShoot.y);
await challengePage.mouse.down();
await challengePage.mouse.move(challengeShoot.x, challengeShoot.y + 100, { steps: 8 });
await challengePage.mouse.up();
await challengePage.waitForFunction(
  before => window.__bj8.world.current.shot > before,
  { timeout: 8000 },
  challengeShotBefore,
).catch(() => {});
ok('挑战模式真实出杆',
  await challengePage.evaluate(before => window.__bj8.world.current.shot > before, challengeShotBefore));
await challengePage.waitForFunction(() => !window.__bj8.world.current.moving, { timeout: 15000 }).catch(() => {});
await challengePage.waitForSelector('.review-chip', { timeout: 20000 }).catch(() => {});
const challengeReview = await challengePage.evaluate(() => ({
  text: document.querySelector('.review-chip')?.textContent ?? '',
  compare: document.querySelector('.review-chip')?.textContent?.includes('▶ 对比') ?? false,
}));
ok('挑战模式查看走位后可做中性计划复盘',
  challengeReview.text.startsWith('复盘：') && !challengeReview.text.includes('顾燃：') && challengeReview.compare,
  JSON.stringify(challengeReview));
ok('挑战模式页面无JS错误', challengeErrors.length === 0, challengeErrors[0] || '');
await challengePage.close();

await browser.disconnect();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length === 0 ? 0 : 1);
