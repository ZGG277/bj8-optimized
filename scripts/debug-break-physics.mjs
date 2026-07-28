/*
[INPUT]: 依赖 physics.ts 公开接口与命令行 Node TypeScript loader
[OUTPUT]: 输出多种随机种子开球的速度、spread 与落袋诊断数据
[POS]: 开球物理离线诊断脚本，不属于提交门禁或运行时
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {
  createInitialWorld,
  strikeCueBall,
  simulateUntilStop,
  pocketedThisShot,
  stepWorld,
  TABLE,
} from '../src/physics.ts';

function rngFactory(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function inspectBreak(seed, power = 92, angle = 0) {
  const world = createInitialWorld(rngFactory(seed));
  const cue = world.balls.find(b => b.number === 0);
  const cueStart = { x: cue.x, z: cue.z };
  strikeCueBall(world, angle, power);
  // 模拟到首次碰撞后 0.15 秒，看能量传递
  let firstContact = null;
  for (let i = 0; i < 240 * 2; i++) {
    stepWorld(world, 1/240);
    if (world.firstContact !== null && firstContact === null) {
      firstContact = {
        t: world.time,
        ball: world.firstContact,
        speeds: world.balls.map(b => ({ n: b.number, v: Math.hypot(b.vx, b.vz) })),
      };
    }
    if (firstContact && world.time > firstContact.t + 0.15) break;
  }
  simulateUntilStop(world, 90);
  const pocketed = pocketedThisShot(world);
  const active = world.balls.filter(b => b.active && b.number !== 0);
  const cx = active.reduce((s, b) => s + b.x, 0) / active.length;
  const cz = active.reduce((s, b) => s + b.z, 0) / active.length;
  const spread = active.reduce((s, b) => s + Math.hypot(b.x - cx, b.z - cz), 0) / active.length;
  const stillInRack = active.filter(b => b.z < 0).length;
  return {
    seed,
    cueStart: { x: cueStart.x.toFixed(3), z: cueStart.z.toFixed(3) },
    pocketed,
    spread,
    stillInRack,
    activeCount: active.length,
    firstContact,
    finalPositions: active.map(b => ({ n: b.number, x: b.x.toFixed(2), z: b.z.toFixed(2) })),
  };
}

console.log('diameter factor:', 2.015, 'R =', TABLE.ballRadius, 'gap mm:', ((2.015 - 2) * TABLE.ballRadius * 1000).toFixed(2));

for (const seed of [1, 2, 3, 4, 5]) {
  const r = inspectBreak(seed);
  console.log(`\nseed=${r.seed} cueStart=${JSON.stringify(r.cueStart)} pocketed=[${r.pocketed.join(',')}] spread=${r.spread.toFixed(3)} stillInRack=${r.stillInRack}/${r.activeCount}`);
  if (r.firstContact) {
    console.log('  firstContact:', r.firstContact.ball, '@ t=', r.firstContact.t.toFixed(3));
    console.log('  speeds after contact (>0.1):', r.firstContact.speeds.filter(s => s.v > 0.1).map(s => `${s.n}:${s.v.toFixed(2)}`).join(' '));
  }
}
