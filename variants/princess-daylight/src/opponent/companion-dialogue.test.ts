/*
[INPUT]: 真实八球规则结算与固定随机数
[OUTPUT]: 台词事实优先级、计数、取消/展示、去重和限频边界回归
[POS]: 陪练表现层测试；不以参考库自测代替本产品规则验证
[PROTOCOL]: 变更时更新此头部，然后检查CLAUDE.md
*/
import { describe, expect, it, vi } from 'vitest';
import { createCompanionDialogue } from './companion-dialogue';
import { DIALOGUE_SCENES } from './companion-dialogue-bank';
import { beginMatch, createInitialMatchState, resolveStoppedShot } from '../match/match-machine';
import type { MatchState, ShotFacts } from '../match/types';
import { createInitialWorld, POCKETS, TABLE, type PhysicsEvent } from '../physics';

const before = (patch: Partial<MatchState> = {}): MatchState => ({ ...beginMatch(createInitialMatchState()), phase: 'rolling', breaking: false, playerGroup: 'solid', ...patch });
const facts = (id: number, patch: Partial<ShotFacts> = {}): ShotFacts => ({ shotId: id, firstContact: 1, pocketed: [1], cueScratch: false, cushionAfterFirstContact: true, remainingSolids: 6, remainingStripes: 7, ...patch });
function shot(d: ReturnType<typeof createCompanionDialogue>, id: number, patch: Partial<ShotFacts> = {}, state: Partial<MatchState> = {}, now = id * 20000) {
  const b = before(state), f = facts(id, patch);
  return d.settle(b, f, resolveStoppedShot(b, f), now);
}
describe('facts-first companion dialogue', () => {
  it('keeps 60 short, unique optional lines alongside deterministic progress', () => {
    const lines = DIALOGUE_SCENES.flatMap(s => s.lines.map(l => l.text));
    expect(DIALOGUE_SCENES).toHaveLength(20); expect(lines).toHaveLength(60);
    expect(new Set(lines).size).toBe(60);
    expect(lines.every(text => Array.from(text).length <= 10)).toBe(true);
    expect(DIALOGUE_SCENES.some(s => s.id.includes('BANK') || s.id.includes('NEAR_MISS'))).toBe(false);
  });
  it.each([
    ['scratch', { cueScratch: true, pocketed: [0, 1] }, 'P_SCRATCH'],
    ['no contact', { firstContact: null }, 'P_NO_CONTACT'],
    ['wrong first', { firstContact: 9 }, 'P_WRONG_FIRST'],
    ['no cushion', { pocketed: [], cushionAfterFirstContact: false }, 'P_FOUL_OTHER'],
  ] as const)('%s always outranks a pot or miss', (_label, f, expected) => {
    const d = createCompanionDialogue(() => 0);
    expect(shot(d, 1, { ...f, pocketed: 'pocketed' in f ? [...f.pocketed] : [1] })?.sceneId).toBe(expected);
    expect(d.snapshot().pots).toBe(0);
  });
  it('speaks for the real shooter and distinguishes illegal first contact from a legal opponent-only pot', () => {
    const random = vi.fn(() => .99);
    const d = createCompanionDialogue(random);
    expect(shot(d, 1, { firstContact: 9, pocketed: [9] })).toMatchObject({
      kind: 'rule', sceneId: 'P_WRONG_FIRST', text: '公主先碰到我的球啦，该我打咯。',
    });
    expect(shot(d, 2, { pocketed: [9, 10] })).toMatchObject({ kind: 'rule', sceneId: 'P_OPPONENT_ONLY' });
    expect(shot(d, 3, { cueScratch: true, firstContact: 9, pocketed: [0] }, { actor: 'opponent' })?.text).toContain('公主来摆球');
    expect(shot(d, 4, { firstContact: 9, pocketed: [9] }, { actor: 'opponent', playerGroup: null })?.text).toContain('公主这局打全色球');
    expect(d.snapshot().spoken).toHaveLength(0);
    expect(random).not.toHaveBeenCalled();
  });
  it('admits distance, speed and free-ball lines only for a recorded legal scoring shot', () => {
    const world = createInitialWorld(() => .5);
    const ball = world.balls.find(b => b.number === 1)!;
    const pocket = POCKETS[0];
    const b = before();
    function pick(shotFacts: ShotFacts, event: PhysicsEvent, freeBall = false) {
      const director = createCompanionDialogue(() => 0);
      if (freeBall && shotFacts.shotId === 2) shot(director, 1, {}, { breaking: true, playerGroup: null });
      return director.settle(b, shotFacts, resolveStoppedShot(b, shotFacts), 40000,
        { worldBefore: world, events: [event], startedWithFreeBall: freeBall });
    }
    const event: PhysicsEvent = { type: 'pocket', ball: 1, pocket: 0, time: world.time + 2.2, speed: .02,
      entryX: pocket.x, entryZ: pocket.z, entryVx: .02, entryVz: 0 };
    ball.x = pocket.x; ball.z = pocket.z + .7 * TABLE.length;
    expect(pick(facts(1), { ...event, speed: .4 })?.sceneId).toBe('P_LONG');
    ball.z = pocket.z + .1 * TABLE.length;
    expect(pick(facts(1), event)?.sceneId).toBe('P_SLOW');
    expect(pick(facts(1, { cueScratch: true }), event, true)?.sceneId).toBe('P_SCRATCH');
    expect(pick(facts(1), { ...event, ball: 9 })?.sceneId).toBe('P_FIRST_POT');
    expect(pick(facts(2), event)?.sceneId).toBe('P_FIRST_POT');
    world.shot = 1;
    expect(pick(facts(2), { ...event, time: world.time + 1 }, true)?.sceneId).toBe('P_BALL_IN_HAND');
  });
  it('uses witnessed rare pots only for the actual legal ball and pocket', () => {
    const world = createInitialWorld(() => .5);
    const ball = world.balls.find(b => b.number === 1)!;
    const pocket = POCKETS[0];
    Object.assign(ball, { x: pocket.x, z: pocket.z + .1 * TABLE.length });
    const intent = { target: 1, pocket: 0, centerAngle: 0, halfWidth: .002 };
    const event = { type: 'pocket', ball: 1, pocket: 0, time: world.time + 1, speed: .4,
      entryX: pocket.x, entryZ: pocket.z, entryVx: .4, entryVz: 0 } as const;
    const b = before();
    const d = createCompanionDialogue(() => 0);
    const pick = (patch: Partial<ShotFacts> = {}, pot: PhysicsEvent = event, sigma = .02, id = world.shot + 1) => {
      const f = facts(id, patch);
      return d.settle(b, f, resolveStoppedShot(b, f), id * 1000,
        { worldBefore: world, events: [pot], startedWithFreeBall: false, intent, executionSigma: sigma });
    };
    const precision = pick();
    expect(precision).toMatchObject({ sceneId: 'P_RARE_PRECISION', kind: 'progress' });
    expect(d.shown(precision!.id, 1000)).toBe(true);
    world.shot = 1;
    expect(pick({}, { ...event, time: world.time + 3, speed: .02 }, .001)?.sceneId).toBe('P_RARE_SLOW');
    world.shot = 2;
    ball.z = pocket.z + .9 * TABLE.length;
    expect(pick({}, event, .001)?.sceneId).toBe('P_RARE_LONG');
    world.shot = 3;
    expect(pick({ cueScratch: true, pocketed: [0, 1] })?.sceneId).toBe('P_SCRATCH');
    world.shot = 4;
    ball.z = pocket.z + .1 * TABLE.length;
    expect(pick({}, { ...event, pocket: 1 })?.sceneId).not.toBe('P_RARE_PRECISION');
    expect(pick({}, event, .02, 6)?.sceneId).not.toBe('P_RARE_PRECISION');
  });
  it('deduplicates pocket numbers and counts one scoring shot for a double pot', () => {
    const d = createCompanionDialogue(() => 0);
    expect(shot(d, 1, { pocketed: [1, 1, 2] })?.sceneId).toBe('P_TWO');
    expect(d.snapshot()).toMatchObject({ pots: 2, runs: { player: 1 } });
    expect(shot(d, 2, { pocketed: [3] })?.sceneId).toBe('P_STREAK_2');
  });
  it('does not count the break as a consecutive scoring shot', () => {
    const d = createCompanionDialogue(() => 0);
    expect(shot(d, 1, { pocketed: [1, 2] }, { breaking: true, playerGroup: null })?.sceneId).toBe('P_BREAK_MULTI');
    expect(shot(d, 2)?.sceneId).toBe('P_ONE');
    expect(d.snapshot().runs.player).toBe(1);
  });
  it('a duplicate settlement neither reselects nor increments stats', () => {
    const random = vi.fn(() => 0), d = createCompanionDialogue(random);
    const choice = shot(d, 1)!; expect(d.shown(choice.id, 20000)).toBe(true);
    const count = random.mock.calls.length;
    expect(shot(d, 1)).toBeNull(); expect(random).toHaveBeenCalledTimes(count);
    expect(d.snapshot()).toMatchObject({ shot: 1, pots: 1 });
    expect(d.shown(choice.id, 20000)).toBe(false);
  });
  it('draws only the highest-priority scene probability with no fallback', () => {
    const random = vi.fn(() => .99), d = createCompanionDialogue(random);
    expect(shot(d, 1, { pocketed: [1, 2, 3] })).toBeNull();
    expect(random).toHaveBeenCalledTimes(1);
  });
  it('commits only displayed lines; cancellation does not consume the speech budget', () => {
    const d = createCompanionDialogue(() => 0), choice = shot(d, 1)!;
    expect(d.snapshot().spoken).toHaveLength(0); d.cancel();
    expect(d.shown(choice.id, 20000)).toBe(false); expect(d.snapshot().spoken).toHaveLength(0);
    expect(shot(d, 1)).toBeNull();
  });
  it('enforces a 12-second cooldown and two-shot gap, including thinking', () => {
    const d = createCompanionDialogue(() => 0), first = shot(d, 1)!;
    d.shown(first.id, 20000);
    expect(shot(d, 2, { pocketed: [] }, {}, 40000)).toBeNull(); // Shot gap, even with enough time.
    expect(d.thinking('lu-jingchen', 40001)).toBeNull();
    const next = shot(d, 3, { firstContact: 9, pocketed: [9] }, { actor: 'opponent' }, 40002)!; expect(next).not.toBeNull(); d.shown(next.id, 40002);
    expect(shot(d, 4, { firstContact: 9, pocketed: [] }, { actor: 'opponent' }, 41000)).toBeNull();
    expect(shot(d, 5, {}, {}, 42000)).toBeNull(); // Enough shots, too little time.
  });
  it('supports one thinking line without delaying an AI action and shares the cooldown', () => {
    const d = createCompanionDialogue(() => 0), c = d.thinking('lu-jingchen', 0)!;
    expect(c.sceneId).toBe('THINKING'); d.shown(c.id, 0);
    expect(d.thinking('lu-jingchen', 20000)).toBeNull();
    expect(shot(d, 1, {}, {}, 1000)).toBeNull();
  });
  it('keeps dry-player-shot statistics across intervening NPC turns', () => {
    const d = createCompanionDialogue(() => 0);
    for (let n = 1; n <= 3; n++) {
      shot(d, n * 2, { pocketed: [] });
      shot(d, n * 2 + 1, { firstContact: 9, pocketed: [] }, { actor: 'opponent' });
    }
    expect(d.snapshot().empty).toBe(3);
    expect(shot(d, 10)?.sceneId).toBe('P_RECOVER');
  });
  it('handles opponent-only balls and derives the final-eight phase from the actual group', () => {
    expect(shot(createCompanionDialogue(() => 0), 1, { pocketed: [9] })?.sceneId).toBe('P_OPPONENT_ONLY');
    expect(shot(createCompanionDialogue(() => 0), 1, { remainingSolids: 0 })?.sceneId).toBe('P_FINAL_READY');
    expect(shot(createCompanionDialogue(() => 0), 1, { firstContact: 8, pocketed: [], remainingSolids: 0 })?.sceneId).toBe('P_FINAL_MISS');
    expect(shot(createCompanionDialogue(() => 0), 1, { pocketed: [], remainingSolids: 0 }, { playerGroup: null })?.sceneId).not.toBe('P_FINAL_MISS');
  });
  it.each(['player', 'opponent'] as const)('a terminal %s black-eight event never yields an ordinary compliment', actor => {
    const d = createCompanionDialogue(() => 0);
    expect(shot(d, 1, { firstContact: 8, pocketed: [8], remainingSolids: 4 }, { actor })).toBeNull();
    expect(d.snapshot().ended).toBe(true); expect(d.thinking(undefined, 90000)).toBeNull();
  });
  it('starts rematch only after explicit replay and never repeats the same line within a rack', () => {
    const d = createCompanionDialogue(() => 0), initial = d.ready(undefined, 0)!;
    expect(initial.sceneId).toBe('OPEN_PLAYER');d.shown(initial.id, 0);expect(d.ready(undefined, 1)).toBeNull();
    d.reset(true); const second = d.ready(undefined, 20000)!;
    expect(second.sceneId).toBe('REMATCH'); d.shown(second.id, 20000);
    const a = shot(d, 1, {}, {}, 40000)!;d.shown(a.id, 40000);
    shot(d, 2, { pocketed: [] });
    const b = shot(d, 3, {}, {}, 80000)!; expect(b.text).not.toBe(a.text);
  });
  it('keeps both shooters’ misses separate and escalates only after legal black-eight attempts', () => {
    const d = createCompanionDialogue(() => .99);
    const playerEight = { firstContact: 8, pocketed: [], remainingSolids: 0 };
    const opponentEight = { firstContact: 8, pocketed: [], remainingStripes: 0 };
    const first = shot(d, 1, playerEight, {}, 1000)!;
    expect(first).toMatchObject({ sceneId: 'P_FINAL_MISS', kind: 'progress' });
    expect(d.shown(first.id, 1000)).toBe(true);
    expect(shot(d, 2, opponentEight, { actor: 'opponent' }, 1100)?.sceneId).toBe('N_FINAL_MISS');
    expect(shot(d, 3, { ...playerEight, firstContact: null }, {}, 1200)?.sceneId).toBe('P_NO_CONTACT');
    expect(shot(d, 4, opponentEight, { actor: 'opponent' }, 1300)?.sceneId).toBe('N_FINAL_MISS_2');
    const second = shot(d, 5, playerEight, {}, 1400)!;
    expect(second.sceneId).toBe('P_FINAL_MISS_2');
    expect(d.shown(second.id, 1400)).toBe(true);
    shot(d, 6, opponentEight, { actor: 'opponent' }, 1500);
    const third = shot(d, 7, playerEight, {}, 1600)!;
    expect(third.sceneId).toBe('P_FINAL_MISS_LATER');
    expect(new Set([first.text, second.text, third.text]).size).toBe(3);
    expect(d.snapshot().shots[2]).toMatchObject({ actor: 'player', blackEightAtStart: true, blackEightMiss: false, foul: 'no-contact' });
    expect(d.snapshot().shots.filter(s => s.actor === 'player' && s.blackEightMiss)).toHaveLength(3);
    expect(d.snapshot().ordinaryCount).toBe(0);
  });

  it.each(['player', 'opponent'] as const)('praises each %s milestone on consecutive scoring shots without a cooldown gap', actor => {
    const d = createCompanionDialogue(() => .99);
    const prefix = actor === 'player' ? 'P' : 'N';
    const choices = [];
    for (let run = 1; run <= 7; run++) {
      const ball = actor === 'player' ? run : run + 8;
      const remaining = actor === 'player' ? { remainingSolids: 7 - run } : { remainingStripes: 7 - run };
      const choice = shot(d, run, { firstContact: ball, pocketed: [ball], ...remaining }, { actor }, run * 100);
      if (choice) {
        choices.push(choice);
        expect(d.shown(choice.id, run * 100)).toBe(true);
      }
    }
    expect(choices.map(c => c.sceneId)).toEqual([2, 3, 5, 7].map(run => `${prefix}_STREAK_${run}`));
    expect(d.snapshot().shots[6]).toMatchObject({ scoringRun: 7, blackEightAtStart: false });
    if (actor === 'player') expect(choices[3].text).toContain('下一杆打黑八');
    expect(d.snapshot().ordinaryCount).toBe(0);
  });

  it('starts a new scoring run after a handoff and records the actual terminal shot', () => {
    const d = createCompanionDialogue(() => 0);
    shot(d, 1);
    shot(d, 2, { firstContact: 2, pocketed: [2] });
    shot(d, 3, { firstContact: 3, pocketed: [] });
    shot(d, 4, { firstContact: 9, pocketed: [] }, { actor: 'opponent' });
    shot(d, 5, { firstContact: 3, pocketed: [3], remainingSolids: 0 });
    expect(shot(d, 6, { firstContact: 8, pocketed: [8], remainingSolids: 0 })).toBeNull();
    const log = d.snapshot().shots;
    expect(log.map(s => s.scoringRun)).toEqual([1, 2, 0, 0, 1, 0]);
    expect(log[3]).toMatchObject({ actor: 'opponent', nextActor: 'player', legalPots: [] });
    expect(log[5]).toMatchObject({ legalPots: [8], nextActor: null, winner: 'player', result: 'win-8' });
    d.reset(true);
    expect(d.snapshot().shots).toEqual([]);
    expect(d.snapshot().shot).toBe(0);
  });

  it('reserves the ending budget and stops at seven gameplay lines in one rack', () => {
    const d = createCompanionDialogue(() => 0), initial = d.ready(undefined, 0)!;
    d.shown(initial.id, 0);
    let shown = 1;
    for (let id = 1; id < 70; id++) {
      const player = id % 2 === 1;
      const choice = shot(d, id, { firstContact: player ? 1 : 9, pocketed: id % 6 < 2 ? [] : player ? [1] : [9] }, { actor: player ? 'player' : 'opponent' });
      if (choice) { expect(d.shown(choice.id, id * 20000)).toBe(true); shown++; }
    }
    expect(shown).toBe(7); expect(d.snapshot().spoken).toHaveLength(7);
    expect(d.thinking(undefined, 9999999)).toBeNull();
  });
  it('a spent final-phase milestone does not fall back to ordinary praise', () => {
    const d = createCompanionDialogue(() => 0), first = shot(d, 1, { remainingSolids: 0 })!;
    d.shown(first.id, 20000);
    shot(d, 2, { pocketed: [] });
    expect(shot(d, 3, { remainingSolids: 0 })).toBeNull();
  });
});
