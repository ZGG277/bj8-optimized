import { describe, expect, it, vi } from 'vitest';
import { buildTableMessages, askTableFriend, coreTableReply, isTableChat, localTableAnswer, storybookReply } from '../minitool/table-chat';
import { createInitialWorld } from '../physics';
import { beginMatch, createInitialMatchState } from '../match/match-machine';
import { createCompanionDialogue } from './companion-dialogue';
import { STORYBOOK_COMPANIONS, STORYBOOK_REPLY_LIMIT } from './storybook-companions';
import { tableBrief } from './table-coach';
import { CORE_COMPANIONS, coreCompanion } from './core-companions';
import { skillForTable } from './companion-memory';
import { emptyCareer } from './career';
import { createPlayerSkillProfile } from './model';

const world = createInitialWorld(() => .5);
const skill = skillForTable(createPlayerSkillProfile(), emptyCareer());
const briefFor = (companionId: string) =>
  tableBrief(world, beginMatch({ ...createInitialMatchState(), companionId }), [], true, '我该打哪颗？');

describe('listening when the player wants company', () => {
  it('gives every featured character their own conversational voice without sending shot prompts', () => {
    const first = { question: '明天要交方案，我有点紧张。', answer: '是最难的那部分还没弄完吗？', source: '小红书 AI' };
    const tip = { question: '我该打哪颗？', answer: '先瞄准球堆最前端。', source: '球桌提示' };
    const question = '对，我怕方案讲不清楚。';
    for (const role of CORE_COMPANIONS) {
      const [system, ...chat] = buildTableMessages(briefFor(role.id), [tip, first], question, ['到你出杆了。']);
      expect(system.content).toContain(role.name);
      expect(system.content).toContain(role.chatStyle);
      expect(system.content).toContain(role.lines.casual);
      expect(system.content).not.toMatch(/游戏规则|"balls":|到你出杆了|先瞄准球堆/u);
      expect(chat.map(message => message.content)).toEqual([first.question, first.answer, question]);
    }
  });

  it('keeps previous personal conversations and does not treat work performance as a skill request', () => {
    const oldMessage = { rackId: 'previous', question: '我上次和同事吵架了。', answer: '后来你们说开了吗？', at: 1, source: '小红书 AI' };
    const context = {
      rackId: 'current', nickname: '美女', shots: [],
      skill,
      relationship: { visits: 2, completed: 1, lastRackId: 'current', lastFinishedRackId: 'previous', lastSeenAt: 2, exchanges: [oldMessage], highlights: [] },
    };
    const brief = briefFor('m05');
    const [system] = buildTableMessages(brief, [], '你记得我昨天跟你说的事吗？', [], context);
    expect(system.content).toContain(oldMessage.question);
    expect(system.content).toContain('美女');
    expect(buildTableMessages(brief, [], '早上好。', [], context)[0].content).not.toContain(oldMessage.question);
    expect(localTableAnswer('最近工作表现不好。', brief)).toBeNull();
    expect(isTableChat('先不打球，我只想聊聊。')).toBe(false);
    expect(isTableChat('那怎么打？')).toBe(true);
    expect(isTableChat('黑八什么时候能打？')).toBe(true);
  });

  it('keeps the relevant response, removes play prompts and gives space when asked', async () => {
    const generateText = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: '听起来很累。先打一杆放松一下吧！' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '嗯，我在听。刚刚发生了什么？' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '轮到你啦，准备好就出杆！' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '被同事当众质疑，很难受吧。你最在意他说的哪一句？' } }] });
    const bridge = { createModel: () => ({ generateText }) };
    const brief = briefFor('zhou-yang');
    const context = { rackId: 'rack', nickname: '美女', shots: [], skill };
    expect(await askTableFriend(bridge, brief, [], '我今天好累。', [], context)).toMatchObject({ answer: '美女，听起来很累。', source: '小红书 AI' });
    expect(await askTableFriend(bridge, brief, [], '我只想安静一下。')).toMatchObject({ answer: '嗯，我在听。' });
    expect(await askTableFriend(bridge, brief, [], '聊聊吧。')).toMatchObject({ answer: '没事，我听着呢。', source: '球友回应' });
    expect(await askTableFriend(bridge, brief, [], '我刚刚被同事当众质疑。')).toMatchObject({
      answer: '被同事当众质疑，很难受吧。你最在意他说的哪一句？',
    });
  });
});

describe('storybook companion handbook integration', () => {
  it('gives each companion their own prompt, seven examples and opening line', () => {
    for (const [id, role] of Object.entries(STORYBOOK_COMPANIONS)) {
      if (coreCompanion(id)) continue;
      const brief = briefFor(id);
      const messages = buildTableMessages(brief, [], '我该打哪颗？');
      expect(brief).toMatchObject({ roleId: id, companion: role.name });
      expect(messages[0].content).toContain('角色「' + role.name + '」');
      expect(messages[0].content).toContain('事件：玩家求助');
      expect(messages[0].content).not.toContain('{{');
      expect(messages[messages.length - 1]).toEqual({ role: 'user', content: '我该打哪颗？' });
      expect(Object.values(role.lines)).toHaveLength(7);
      expect(Object.values(role.lines).every(line => Array.from(line).length <= STORYBOOK_REPLY_LIMIT)).toBe(true);
      const greeting = createCompanionDialogue(() => 0).ready(id, 0);
      expect(greeting).toMatchObject({ companionId: id, text: role.lines.opening });
    }
  });

  it('uses the new persona, goal and authored opening for each featured companion', () => {
    for (const role of CORE_COMPANIONS) {
      const prompt = buildTableMessages(briefFor(role.id), [], '你打得漂亮！')[0].content;
      for (const value of [role.name, role.personality, role.goal, role.style, role.lines.compliment]) {
        expect(prompt).toContain(value);
      }
      expect(prompt).toContain('含标点和昵称最多20字');
      expect(createCompanionDialogue(() => 0).ready(role.id, 0)?.text).toBe(role.lines.opening);
      expect([...Object.values(role.lines).flat(), ...role.streak].every(line => Array.from(line).length <= STORYBOOK_REPLY_LIMIT)).toBe(true);
    }
  });

  it('uses the actual role and nickname in a short reply, including grounded fallbacks', async () => {
    const generateText = vi.fn(async () => ({
      choices: [{ message: { content: '（点头）你应该听我的，我教你打。' } }],
    }));
    const result = await askTableFriend({ createModel: () => ({ generateText }) }, briefFor('m05'), [], '你打得漂亮！', [], {
      rackId: 'rack-core', nickname: '美女', shots: [],
      skill: { completed: 0, recentMatches: 0, bestRecentRun: 0, confidence: 0,
        accuracy: { attempts: 0, successes: 0 }, position: { attempts: 0, successes: 0 }, fouls: { count: 0, attempts: 0 } },
    });
    expect(result.answer).toBe('美女，嗯。谢了。');
    const longName = '一二三四五六七八九十甲乙';
    const long = coreTableReply('这句没有标点而且长得真的不能发出去'.repeat(2), 'f01', '你打得漂亮！', longName);
    expect(long?.startsWith(longName + '，')).toBe(true);
    expect(Array.from(long ?? '').length).toBeLessThanOrEqual(20);
  });

  it('sends the last three turns and uses a grounded fallback for an unusable reply', async () => {
    const generateText = vi.fn(async (_input: { messages: { role: string; content: string }[] }) => ({
      request_id: 'qa-1',
      choices: [{ message: { content: '（点头）喝酒！' } }],
    }));
    const history = Array.from({ length: 5 }, (_, i) => ({ question: '测试' + i, answer: '试试吧', source: '小红书 AI' }));
    const result = await askTableFriend({ createModel: () => ({ generateText }) }, briefFor('f03'), history, '我该打哪颗？');
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      temperature: .75, max_output_tokens: 40,
      messages: expect.arrayContaining([{ role: 'user', content: '测试2' }]),
    }));
    const [input] = generateText.mock.calls[0];
    expect(input.messages).toHaveLength(8);
    expect(input.messages.some(message => message.content === '测试1')).toBe(false);
    expect(result.answer).toBe('先瞄球堆最前头那颗，把球堆打散。');
    expect(result.requestId).toBe('qa-1');
  });

  it('strips actions and keeps a whole short sentence or a role fallback', () => {
    expect(storybookReply('（点头）*微笑*这一杆很稳。')).toBe('这一杆很稳。');
    expect(storybookReply('这杆稳。' + '慢'.repeat(30))).toBe('这杆稳。');
    expect(storybookReply('长'.repeat(30), '下杆慢慢来。')).toBe('下杆慢慢来。');
  });
});
