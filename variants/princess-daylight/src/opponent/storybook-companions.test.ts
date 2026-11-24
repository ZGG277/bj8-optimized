import { describe, expect, it, vi } from 'vitest';
import { buildTableMessages, askTableFriend, storybookReply } from '../minitool/table-chat';
import { createInitialWorld } from '../physics';
import { beginMatch, createInitialMatchState } from '../match/match-machine';
import { createCompanionDialogue } from './companion-dialogue';
import { STORYBOOK_COMPANIONS, STORYBOOK_REPLY_LIMIT } from './storybook-companions';
import { tableBrief } from './table-coach';

const world = createInitialWorld(() => .5);
const briefFor = (companionId: string) =>
  tableBrief(world, beginMatch({ ...createInitialMatchState(), companionId }), [], true, '我该打哪颗？');

describe('storybook companion handbook integration', () => {
  it('gives each companion their own prompt, seven examples and opening line', () => {
    for (const [id, role] of Object.entries(STORYBOOK_COMPANIONS)) {
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
