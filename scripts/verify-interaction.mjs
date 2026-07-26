/* 出杆交互自动化测试：鼠标拖拽 / 触摸 / 横屏手机
 * 前置启动(ego lite 用无头模式,不弹窗不打断前台):
 *   npx vite --port 5199 --strictPort &
 *   "/Applications/ego lite.app/Contents/MacOS/ego lite" --headless=new \
 *     --remote-debugging-port=9333 --user-data-dir=/tmp/ego-verify &
 */
import puppeteer from 'puppeteer-core';

const URL = 'http://localhost:5199/';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9333',
  defaultViewport: { width: 1280, height: 800 },
});

async function newGamePage(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.bringToFront(); // ego/Chrome 会节流后台标签页的 rAF 和定时器
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 20000 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('开始对局'));
    btn?.click();
  });
  await new Promise(r => setTimeout(r, 800));
  return { page, errors };
}

const gameState = (page) => page.evaluate(() => {
  const w = window.__bj8?.world?.current;
  return w ? { shot: w.shot, moving: w.moving } : null;
});

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

// ========== 场景1: 桌面鼠标 ==========
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
  // 等回到玩家回合（可能经过对手回合，AI 连杆时较久；
  // AI 犯规送出自由球时会进入"放置白球"，必须真实点击台面放置才能继续）
  {
    const deadline = Date.now() + 150000;
    let backToPlayer = false;
    while (Date.now() < deadline && !backToPlayer) {
      const turn = await page.evaluate(() => document.querySelector('.match-state p')?.textContent);
      if (turn === '你的回合') { backToPlayer = true; break; }
      if (turn === '放置白球') {
        // 在视口中下部尝试几个候选点,放到合法空位为止
        const candidates = await page.evaluate(() => {
          const r = document.querySelector('.viewport').getBoundingClientRect();
          return [0.78, 0.68, 0.58, 0.85].map(fy => ({ x: r.x + r.width / 2, y: r.y + r.height * fy }));
        });
        for (const pt of candidates) {
          await page.mouse.click(pt.x, pt.y);
          await new Promise(r => setTimeout(r, 350));
          const now = await page.evaluate(() => document.querySelector('.match-state p')?.textContent);
          if (now !== '放置白球') break;
        }
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    ok('桌面: 回到你的回合(自由球自动放置)', backToPlayer);
  }

  // 塞球盘拖到顶部 → 高杆
  await page.evaluate(() => {});
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

// ========== 场景2: 触摸(竖屏手机 390×844) ==========
{
  const { page, errors } = await newGamePage({ width: 390, height: 844, hasTouch: true, isMobile: true });
  const box = await padBox(page);
  ok('触摸: 出杆区存在且在视口内', !!box && box.x + box.w <= 390 && box.y + box.h <= 844,
    box ? `(${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.w)}x${Math.round(box.h)})` : 'missing');
  // P1-03 验收:竖屏手机控制区无溢出
  const overflow = await page.evaluate(() => {
    const deck = document.querySelector('.control-deck').getBoundingClientRect();
    return [...document.querySelector('.control-deck').children]
      .filter(c => {
        const r = c.getBoundingClientRect();
        return r.bottom > deck.bottom + 2 || r.right > deck.right + 2 || r.left < deck.left - 2;
      }).length;
  });
  ok('触摸: 控制区无溢出元素', overflow === 0, overflow ? `${overflow}个元素溢出` : '');
  const { after } = await dragStrike(page, box, true);
  ok('触摸: 下拉蓄力出杆', !!after && after.shot === 1, JSON.stringify(after));
  ok('触摸: 页面无JS错误', errors.length === 0, errors[0] || '');
  await page.screenshot({ path: 'shots/11-touch-portrait.png' });
  await page.close();
}

// ========== 场景3: 横屏手机 ==========
{
  const { page, errors } = await newGamePage({ width: 812, height: 375, hasTouch: true, isMobile: true });
  const box = await padBox(page);
  ok('横屏: 出杆区存在', !!box);
  ok('横屏: 出杆区完整在视口内', box && box.x >= 0 && box.y >= 0 && box.x + box.w <= 812 && box.y + box.h <= 375,
    box ? `(${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.w)}x${Math.round(box.h)})` : 'missing');
  // 出杆区应在右下四分之一区域
  ok('横屏: 出杆区位于右下角', box && box.cx > 812 * 0.6 && box.cy > 375 * 0.5, box ? `cx=${Math.round(box.cx)} cy=${Math.round(box.cy)}` : '');

  // P1-03 验收:视角按钮不被顶栏遮挡,elementFromPoint 命中按钮自身(开球前必为玩家回合)
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

  // P1-03 验收:点击视角按钮不会改变 aim
  if (viewBtn) {
    const aimBefore = await page.evaluate(() => window.__bj8.aim.current);
    await page.mouse.click(viewBtn.cx, viewBtn.cy);
    await new Promise(r => setTimeout(r, 300));
    const aimAfter = await page.evaluate(() => window.__bj8.aim.current);
    ok('横屏: 点击视角按钮不改变瞄准角', aimBefore === aimAfter, `before=${aimBefore} after=${aimAfter}`);
    // 切回第一人称,继续出杆测试
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.view-switcher button')].find(b => b.textContent === '第一人称');
      btn?.click();
    });
    await new Promise(r => setTimeout(r, 300));
  }

  // P1-03 验收:横屏真实拖拽可产生至少 95 力(可用行程归一化后小行程也能满力)
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
process.exit(failed.length ? 1 : 0);
