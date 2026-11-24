import { describe, expect, it } from 'vitest';
import { beginMatch, createInitialMatchState } from '../match/match-machine';
import { createInitialWorld } from '../physics';
import { buildTableMessages, localTableAnswer } from '../minitool/table-chat';
import { emptyCompanionMemory, readCompanionMemory, rememberExchange, rememberFinish, rememberShot, skillForTable, type ShotEvidence } from './companion-memory';
import { memoryGreeting } from './companion-role';
import { emptyCareer } from './career';
import { createPlayerSkillProfile } from './model';
import { tableBrief } from './table-coach';

const first = 'gu-yanchuan';
const second = 'wen-xingye';
const shot: ShotEvidence = {
  rackId: 'rack-one', shotId: 3, companionId: first, at: 1, mode: 'practice', breaking: false,
  angle: 0, power: 42, spin: { x: 0, y: 0 }, cueStart: { x: 0, z: 0 },
  cueEnd: { x: .4, z: .4 }, inferredTarget: null, legalTargets: [1, 2],
  openNextTargets: [], firstContact: 1, pockets: [{ ball: 1, pocket: 3 }], legalPots: [1],
  result: 'pot-continue', foul: null, scoringRun: 3,
  observation: { tolerance: .01, pocketed: true, foul: false, assisted: false, position: 'miss' },
};
const profile = skillForTable({
  ...createPlayerSkillProfile(), accuracyTotals: { successes: 8, attempts: 12 }, positionAttempts: 8, positionSuccesses: 3,
}, emptyCareer(2));
const brief = tableBrief(createInitialWorld(), beginMatch(createInitialMatchState()), [], false);

describe('companion continuity', () => {
  it('counts unique interactions, restores proven memories and keeps a separate history for each companion', () => {
    let memory = rememberShot(emptyCompanionMemory(), shot);
    expect(rememberShot(memory, shot)).toBe(memory);
    memory = rememberExchange(memory, first, { rackId: shot.rackId, at: 2, question: '记住我想练低杆。', answer: '我记下了。', source: '球桌提示' });
    memory = rememberFinish(memory, first, shot.rackId, 3);
    expect(rememberFinish(memory, first, shot.rackId, 4)).toBe(memory);
    memory = rememberExchange(memory, first, { rackId: 'rack-two', at: 5, question: '早上好', answer: '在。', source: '小红书 AI' });
    memory = rememberExchange(memory, second, { rackId: 'rack-three', at: 6, question: '你好', answer: '你好！', source: '小红书 AI' });
    const restored = readCompanionMemory(JSON.stringify(memory));
    expect(restored.friends[first]).toMatchObject({ visits: 2, completed: 1, practiceGoal: { text: '低杆' } });
    expect(memoryGreeting(first, restored.friends[first])?.text).toContain('连进3杆');
    expect(memoryGreeting(second, restored.friends[second])?.text).not.toContain('连进3杆');
    expect(restored.shots[0]).toMatchObject({ spin: { x: 0, y: 0 }, cueEnd: { x: .4, z: .4 } });
    expect(() => readCompanionMemory('{"version":1,"friends":{},"shots":[null]}')).toThrow();
  });

  it('sends relevant memories and shared skill with room for the real current question', () => {
    const memory = rememberShot(emptyCompanionMemory(), shot);
    const history = Array.from({ length: 20 }, (_, index) => ({
      question: `问题${index}` + '旧'.repeat(300), answer: '答'.repeat(300), source: '小红书 AI',
    }));
    const question = '你记得我以前的准度吗？';
    const base = { rackId: 'rack-new', skill: profile, shots: memory.shots };
    const known = buildTableMessages({ ...brief, roleId: first }, history, question, [], { ...base, relationship: memory.friends[first] });
    const newFriend = buildTableMessages({ ...brief, roleId: second }, history, question, [], base);
    expect(known[0].content).toContain('连进3杆');
    expect(newFriend[0].content).not.toContain('连进3杆');
    expect(newFriend[0].content).toContain('"successes":8');
    expect(known[known.length - 1].content).toBe(question);
    expect(known.reduce((total, message) => total + message.content.length, 0)).toBeLessThanOrEqual(6000);
  });

  it('reviews the current rack from real shot data and gives a bounded answer without AI', () => {
    const context = { rackId: shot.rackId, skill: profile, shots: [shot] };
    expect(localTableAnswer('复盘我的上一杆', brief, context)).toContain('没留下顺手的直线');
    expect(localTableAnswer('复盘我的上一杆', brief, { ...context, rackId: 'another-rack' })).toContain('没有找到');
    expect(localTableAnswer('看看我的水平', brief, context)).toContain('白球留哪');
    expect(localTableAnswer('你今天过得怎么样？', brief, context)).toBeNull();
  });
});
