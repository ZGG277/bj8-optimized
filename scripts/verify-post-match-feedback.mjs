/*
[INPUT]: PM 已启动的唯一妙搭包装 Vite/Nest 入口，独立 DEV 候选 iframe 与真实 dev 数据库
[OUTPUT]: 桌面/390×844 的真实出杆→合法终局→局后留言→下一局，核对真实胜负与提交 outcome
[POS]: 反馈浏览器验收；只用 __bj8 摆结束前球位，禁止直接把 phase 写成 finished
[PROTOCOL]: 变更时更新此头部，然后检查 scripts/CLAUDE.md

只在 PM 授予串行重活时段并协调真实写入后运行。
GAME_URL 必须为包装页入口（例如 localhost 的 ?feedbackPreview=1），不是独立游戏 HTML。
ALLOW_FEEDBACK_WRITE=1 确认本次会写入带 PM-FEEDBACK-20260910 前缀的真实测试留言。
普通发布包无 __bj8，不能用本脚本代替正式发布入口验收。
*/
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const GAME_URL = process.env.GAME_URL;
if (!GAME_URL || process.env.ALLOW_FEEDBACK_WRITE !== '1') {
  throw new Error('Set GAME_URL to the approved wrapper entry and ALLOW_FEEDBACK_WRITE=1 after PM coordination.');
}
const SHOT_DIR = process.env.SHOT_DIR || 'shots/post-match-feedback';
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PREFIX = `PM-FEEDBACK-20260910-${Date.now()}`;
const results = [];
const receipts = [];
const matchEndings = [];
const submissionChecks = [];
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const check = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
  console.log(`✓ ${name}`);
};

let browser;
await mkdir(SHOT_DIR, { recursive: true });
try {
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--disable-dev-shm-usage'] });
  for (const viewport of [
    { name: 'desktop', width: 1280, height: 800, isMobile: false, hasTouch: false },
    { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
  ]) {
    const page = await browser.newPage();
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    const errors = [];
    const requests = [];
    let fault = null;
    let heldRequest = null;
    let lastFinished = null;
    page.on('pageerror', error => errors.push(String(error)));
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.method() !== 'POST' || !new URL(request.url()).pathname.endsWith('/api/game-feedback')) {
        void request.continue();
        return;
      }
      const payload = JSON.parse(request.postData() || '{}');
      if (!String(payload.message).startsWith(PREFIX)) {
        errors.push('Unexpected feedback payload; refused an unmarked test write');
        void request.abort();
        return;
      }
      requests.push(payload);
      const outcomeCheck = {
        viewport: viewport.name,
        submissionId: payload.submissionId,
        terminalShot: lastFinished?.shot ?? null,
        winner: lastFinished?.winner ?? null,
        messageKey: lastFinished?.messageKey ?? null,
        expectedOutcome: lastFinished?.feedbackOutcome ?? null,
        submittedOutcome: payload.outcome,
        passed: Boolean(lastFinished && payload.outcome === lastFinished.feedbackOutcome),
      };
      submissionChecks.push(outcomeCheck);
      results.push({
        name: `${viewport.name}: submitted outcome matches the actual terminal result`,
        passed: outcomeCheck.passed,
        detail: JSON.stringify(outcomeCheck),
      });
      if (!outcomeCheck.passed) {
        errors.push('Submitted feedback outcome does not match the actual match winner');
        void request.abort();
        return;
      }
      if (fault === 'offline') { fault = null; void request.abort('internetdisconnected'); return; }
      if (fault === 'login') {
        fault = null;
        void request.respond({ status: 401, contentType: 'application/json',
          body: JSON.stringify({ error: { message: '未登录' } }) });
        return;
      }
      if (fault === 'hold') { fault = null; heldRequest = request; return; }
      void request.continue();
    });
    page.on('response', async response => {
      if (response.request().method() !== 'POST'
        || !new URL(response.url()).pathname.endsWith('/api/game-feedback')) return;
      if (response.status() >= 200 && response.status() < 300) {
        const body = await response.json().catch(() => null);
        receipts.push({ viewport: viewport.name, status: response.status(), body });
      }
    });
    await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 30_000 });
    const wrapperUrl = page.url();
    const iframe = await page.waitForSelector('iframe.guagua-billiards-frame');
    const frame = await iframe.contentFrame();
    if (!frame) throw new Error('Real wrapper game iframe not found');
    await frame.waitForSelector('.start-btn');

    const tap = async element => {
      if (!element) throw new Error('Missing interactive element');
      if (viewport.hasTouch) await element.tap(); else await element.click();
    };
    await tap(await frame.$('.start-btn'));
    await frame.waitForFunction(() => window.__bj8?.scene?.current, { timeout: 45_000 });
    check(`${viewport.name}: exact wrapper establishes feedback origin`, await frame.evaluate(() =>
      new URLSearchParams(location.search).get('feedbackParentOrigin') === new URL(document.referrer).origin));

    async function finishViaRealShot() {
      // All state changes end before the shot. Only the normal physics+rules path can finish the match.
      await frame.evaluate(() => {
        const world = window.__bj8.world.current;
        const pocket = { x: 0.635, z: -1.27 };
        const direction = { x: 0.6, z: -0.8 };
        const approach = direction;
        const black = { x: pocket.x - 0.12 * direction.x, z: pocket.z - 0.12 * direction.z };
        const ghost = { x: black.x - direction.x * 0.0572, z: black.z - direction.z * 0.0572 };
        for (const ball of world.balls) {
          Object.assign(ball, { active: false, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 });
          if (ball.number === 8) Object.assign(ball, black, { active: true });
          if (ball.number === 0) Object.assign(ball, {
            x: ghost.x - approach.x * 0.31, z: ghost.z - approach.z * 0.31, active: true,
          });
        }
        world.moving = false; world.events = []; world.firstContact = null;
        window.__bj8.setMatch({ phase: 'aiming', actor: 'player', breaking: false, playerGroup: 'solid', winner: null });
        window.__bj8.sync();
      });
      await pause(450);
      const aim = await frame.evaluate(() => {
        const target = { x: 0.563, z: -1.174 };
        const scene = window.__bj8.scene.current;
        const rect = document.querySelector('.viewport').getBoundingClientRect();
        let best = null;
        const test = (x, y) => {
          const hit = scene.screenToTable(x, y);
          if (!hit) return;
          const distance = Math.hypot(hit.x - target.x, hit.z - target.z);
          if (!best || distance < best.distance) best = { x, y, distance };
        };
        for (let x = 0; x <= 32; x++) for (let y = 0; y <= 24; y++) {
          test(rect.left + rect.width * x / 32, rect.top + rect.height * y / 24);
        }
        if (!best) return null;
        const center = { ...best };
        for (let dx = -rect.width / 32; dx <= rect.width / 32; dx += 0.5) {
          for (let dy = -rect.height / 24; dy <= rect.height / 24; dy += 0.5) test(center.x + dx, center.y + dy);
        }
        return best;
      });
      if (!aim || aim.distance > 0.006) throw new Error(`Cannot project final-shot aim: ${JSON.stringify(aim)}`);
      const offset = await iframe.boundingBox();
      if (viewport.hasTouch) await page.touchscreen.tap(aim.x + offset.x, aim.y + offset.y);
      else await page.mouse.click(aim.x + offset.x, aim.y + offset.y);
      await pause(400);
      const shotBefore = await frame.evaluate(() => window.__bj8.world.current.shot);
      const pad = await frame.$('.shoot-pad');
      const bounds = await pad.boundingBox();
      const horizontal = await pad.evaluate(element => element.closest('[data-orientation="horizontal"]') !== null
        || element.classList.contains('is-horizontal'));
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      if (viewport.hasTouch) {
        await page.touchscreen.touchStart(x, y);
        for (let step = 1; step <= 3; step++) await page.touchscreen.touchMove(x + (horizontal ? step * 8 : 0), y + (horizontal ? 0 : step * 8));
        await page.touchscreen.touchEnd();
      } else {
        await page.mouse.move(x, y); await page.mouse.down();
        for (let step = 1; step <= 3; step++) await page.mouse.move(x + (horizontal ? step * 8 : 0), y + (horizontal ? 0 : step * 8));
        await page.mouse.up();
      }
      await frame.waitForFunction(previous => window.__bj8.world.current.shot > previous, {}, shotBefore);
      await frame.waitForFunction(() => window.__bj8.match.current.phase === 'finished', { timeout: 30_000 }).catch(async error => {
        const state = await frame.evaluate(() => ({
          match: window.__bj8.match.current,
          shot: window.__bj8.world.current.shot,
          moving: window.__bj8.world.current.moving,
          firstContact: window.__bj8.world.current.firstContact,
          events: window.__bj8.world.current.events,
          balls: window.__bj8.world.current.balls.filter(ball => ball.number === 0 || ball.number === 8),
        }));
        throw new Error(`Final shot did not resolve: ${JSON.stringify(state)}`, { cause: error });
      });
      const ended = await frame.evaluate(() => {
        const match = window.__bj8.match.current;
        const world = window.__bj8.world.current;
        return {
          phase: match.phase,
          winner: match.winner,
          actor: match.actor,
          messageKey: match.messageKey,
          foulReason: match.messageParams?.reason ?? null,
          shot: world.shot,
          firstContact: world.firstContact,
          cueActive: world.balls.find(ball => ball.number === 0)?.active ?? null,
          eightActive: world.balls.find(ball => ball.number === 8)?.active ?? null,
          pocketedNumbers: world.events.filter(event => event.type === 'pocket').map(event => event.ball),
          title: document.querySelector('.finish-mask h1')?.textContent ?? null,
          wonClass: Boolean(document.querySelector('.finish-mask.won')),
          feedbackEntryVisible: Boolean(document.querySelector('.finish-actions .feedback-secondary')),
          feedbackOutcome: match.winner === 'player' ? 'win' : match.winner === 'opponent' ? 'loss' : null,
        };
      });
      lastFinished = { viewport: viewport.name, shotBefore, shotsSinceFixture: ended.shot - shotBefore, ...ended };
      matchEndings.push(lastFinished);
      // The product contract is feedback after every completed match, including a legal loss.
      // Record the actual foul/shot facts first; never manufacture a winning or finished state.
      console.log(`Terminal result: ${JSON.stringify(lastFinished)}`);
      check(`${viewport.name}: real play reaches a resolved win or loss`,
        ended.phase === 'finished' && ended.shot > shotBefore && ended.feedbackOutcome !== null
        && ['win-8', 'lose-8-foul', 'lose-8-early'].includes(ended.messageKey),
        JSON.stringify(lastFinished));
      check(`${viewport.name}: terminal UI and feedback entry match the actual winner`,
        ended.feedbackEntryVisible && ended.title === (ended.winner === 'player' ? '你赢了！' : '顾燃赢了')
        && ended.wonClass === (ended.winner === 'player'), JSON.stringify(lastFinished));
    }

    async function openFeedback() {
      const button = await frame.$('.finish-actions .feedback-secondary');
      await tap(button);
      await frame.waitForSelector('#match-feedback-panel');
    }
    async function enterText(text) {
      const input = await frame.$('#match-feedback-message');
      await tap(input);
      await page.keyboard.type(text);
    }
    async function continueGame() {
      const button = await frame.$('[data-control-tip="new-match"]');
      await button.evaluate(element => element.scrollIntoView({ block: 'center' }));
      await tap(button);
      await frame.waitForFunction(() => window.__bj8.match.current.phase === 'aiming');
      check(`${viewport.name}: next game starts without stale card`, await frame.$('.match-feedback') === null);
    }
    async function submitAndExpect(state) {
      const button = await frame.$('.feedback-submit');
      await button.evaluate(element => element.scrollIntoView({ block: 'center' }));
      await tap(button);
      await frame.waitForSelector(`[data-feedback-state="${state}"]`, { timeout: 15_000 });
    }

    await finishViaRealShot();
    check(`${viewport.name}: result actions expose primary rematch and secondary feedback`, await frame.evaluate(() => {
      const actions = document.querySelector('.finish-actions');
      const buttons = [...(actions?.querySelectorAll('button') ?? [])];
      return buttons.length === 2 && buttons[0].textContent.includes('再来一局')
        && buttons[1].textContent.includes('留言') && !document.querySelector('.match-feedback');
    }));
    await openFeedback();
    check(`${viewport.name}: blank feedback disabled; rematch enabled`, await frame.evaluate(() =>
      document.querySelector('.feedback-submit').disabled
      && !document.querySelector('[data-control-tip="new-match"]').disabled));
    await enterText(`${PREFIX}-${viewport.name}-saved`);
    await submitAndExpect('saved');
    check(`${viewport.name}: server confirmed persistence`, await frame.evaluate(() =>
      document.querySelector('[role="status"]').textContent.includes('留言已保存')));
    await page.screenshot({ path: path.join(SHOT_DIR, `${viewport.name}-saved.png`) });
    check(`${viewport.name}: no horizontal overflow`, await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await continueGame();

    await finishViaRealShot();
    const countBeforeSkip = requests.length;
    await continueGame();
    check(`${viewport.name}: skip never POSTs`, requests.length === countBeforeSkip);

    await finishViaRealShot();
    const failedText = `${PREFIX}-${viewport.name}-retry`;
    await openFeedback();
    await enterText(failedText);
    fault = 'offline';
    await submitAndExpect('error');
    check(`${viewport.name}: network failure preserves text and continuation`, await frame.evaluate(expected =>
      document.querySelector('#match-feedback-message').value === expected
      && !document.querySelector('[data-control-tip="new-match"]').disabled
      && document.querySelector('[role="alert"]').textContent.includes('暂未确认保存'), failedText));
    await page.screenshot({ path: path.join(SHOT_DIR, `${viewport.name}-failed.png`) });
    const failedSubmission = requests.at(-1).submissionId;
    await submitAndExpect('saved');
    check(`${viewport.name}: retry uses the same idempotency key`, requests.at(-1).submissionId === failedSubmission);
    await continueGame();

    await finishViaRealShot();
    await openFeedback();
    await enterText(`${PREFIX}-${viewport.name}-login-fault`);
    fault = 'login';
    await submitAndExpect('error');
    check(`${viewport.name}: login error is visible without redirect`, page.url() === wrapperUrl
      && await frame.evaluate(() => document.querySelector('[role="alert"]').textContent.includes('登录后才能留言')));
    await page.screenshot({ path: path.join(SHOT_DIR, `${viewport.name}-login.png`) });
    await continueGame();

    await finishViaRealShot();
    await openFeedback();
    await enterText(`${PREFIX}-${viewport.name}-pending-cancel`);
    fault = 'hold';
    const submitButton = await frame.$('.feedback-submit');
    await submitButton.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await tap(submitButton);
    await frame.waitForSelector('[data-feedback-state="sending"]');
    await continueGame();
    if (heldRequest) { await heldRequest.abort(); heldRequest = null; }
    await pause(100);
    check(`${viewport.name}: pending result does not reopen old card`, await frame.$('.match-feedback') === null);
    check(`${viewport.name}: no uncaught page errors`, errors.length === 0, errors.join('\n'));
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  await writeFile(path.join(SHOT_DIR, 'result.json'), JSON.stringify({
    entry: GAME_URL, testPrefix: PREFIX, results, matchEndings, submissionChecks, receipts,
    limits: ['Browser receipts are not independent DB read-back evidence.',
      'Login fault is injected HTTP 401; real anonymous access still requires platform verification.',
      'DEV fixture build is not the release artifact.'],
  }, null, 2));
}
