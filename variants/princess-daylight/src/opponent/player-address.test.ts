import { describe, expect, it, vi } from 'vitest';
import { addressPlayer, callPlayerByName, companionPetName, greetPlayer } from './player-address';
import { askTableFriend, buildTableMessages } from '../minitool/table-chat';
import { tableBrief } from './table-coach';
import { beginMatch, createInitialMatchState } from '../match/match-machine';
import { createInitialWorld } from '../physics';
import { emptyCareer } from './career';
import { skillForTable } from './companion-memory';
import { createPlayerSkillProfile } from './model';

describe('companion address', () => {
  it('uses a natural neutral address in rule calls, old lines and titles', () => {
    expect(addressPlayer('公主殿下，请开球。')).toBe('请开球。');
    expect(addressPlayer('这一杆给公主。')).toBe('这一杆给你。');
    expect(addressPlayer('公主，轮到你了。')).toBe('轮到你了。');
    expect(addressPlayer('这款游戏叫《公主请开球》。')).toBe('这款游戏叫《公主请开球》。');
  });
  it('allows affectionate names only in the suitable character voices', () => {
    expect(companionPetName('gu-yanchuan')).toBeUndefined();
    expect(addressPlayer('宝宝，这杆很稳。', 'gu-yanchuan')).toBe('这杆很稳。');
    expect(addressPlayer('宝宝，这杆很稳。', 'f02')).toBe('宝宝，这杆很稳。');
    expect(addressPlayer('亲爱的，这杆很稳。', 'm10')).toBe('亲爱的，这杆很稳。');
    expect(addressPlayer('亲爱的，这杆很稳。', 'f02')).toBe('这杆很稳。');
  });
  it('keeps the player message intact while addressing model output and older assistant history', async () => {
    const brief = tableBrief(createInitialWorld(), beginMatch({ ...createInitialMatchState(), companionId: 'gu-yanchuan' }), [], false);
    const user = '以前你叫我公主。';
    const messages = buildTableMessages(brief, [{ source: 'AI', question: user, answer: '公主殿下，慢慢来。' }], user);
    expect(messages[0].content).toContain('称呼玩家用“你”');
    expect(messages[2].content).toBe('慢慢来。');
    expect(messages[1].content).toBe(user);
    const generateText = vi.fn().mockResolvedValue({ choices: [{ message: { content: '公主殿下，现在轮到你。' } }] });
    await expect(askTableFriend({ createModel: () => ({ generateText }) }, brief, [], user))
      .resolves.toMatchObject({ question: user, answer: '现在轮到你。' });
  });

  it('uses the saved nickname in greetings and replies, including a nickname that looks like a title', async () => {
    expect(greetPlayer('我还记得你的低杆。今天接着练？', 'gu-yanchuan', '帅哥'))
      .toBe('帅哥，我还记得你的低杆。今天接着练？');
    expect(greetPlayer('请开球。', 'gu-yanchuan', '开球')).toBe('开球，请开球。');
    expect(greetPlayer('帅哥，请开球。', 'gu-yanchuan', '帅哥')).toBe('帅哥，请开球。');
    expect(addressPlayer('宝宝，到你啦。', 'f02', '小.*宝')).toBe('小.*宝，到你啦。');
    expect(addressPlayer('帅哥，请开球。')).toBe('请开球。');
    const brief = tableBrief(createInitialWorld(), beginMatch({ ...createInitialMatchState(), companionId: 'f02' }), [], false);
    const context = { rackId: 'rack-1', nickname: '帅哥', skill: skillForTable(createPlayerSkillProfile(), emptyCareer()), shots: [] };
    const generateText = vi.fn().mockResolvedValue({ choices: [{ message: { content: '帅哥，今天一起练低杆。' } }] });
    const question = '今天聊聊吧！';
    await expect(askTableFriend({ createModel: () => ({ generateText }) }, brief, [], question, [], context))
      .resolves.toMatchObject({ question, answer: '帅哥，今天一起练低杆。' });
    expect(generateText.mock.calls[0][0].messages[0].content).toContain('{"nickname":"帅哥"}');
    expect(generateText.mock.calls[0][0].messages[0].content).not.toContain('性格许可');
  });

  it('lets Rosa call the player by their nickname even when the model only says 你', async () => {
    expect(callPlayerByName('你这杆收得漂亮。', '美女')).toBe('美女，这杆收得漂亮。');
    expect(callPlayerByName('轮到你开球。', '美女')).toBe('美女，轮到你开球。');
    expect(callPlayerByName('好球，美女！', '美女', true)).toBe('好球，美女！');
    expect(callPlayerByName('轮到我啦。', '美女')).toBe('轮到我啦。');
    expect(callPlayerByName('你这杆收得漂亮。', undefined, true)).toBe('你这杆收得漂亮。');
    const brief = tableBrief(createInitialWorld(), beginMatch({ ...createInitialMatchState(), companionId: 'f05' }), [], false);
    const context = { rackId: 'rack-1', nickname: '美女', skill: skillForTable(createPlayerSkillProfile(), emptyCareer()), shots: [] };
    const generateText = vi.fn().mockResolvedValue({ choices: [{ message: { content: '你这杆挺稳，接着打。' } }] });
    await expect(askTableFriend({ createModel: () => ({ generateText }) }, brief, [], '刚才打得怎么样？', [], context))
      .resolves.toMatchObject({ answer: '美女，这杆挺稳，接着打。' });
  });
});
