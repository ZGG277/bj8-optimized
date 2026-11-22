import { describe, expect, it, vi } from 'vitest';
import { beginMatch, createInitialMatchState } from '../match/match-machine';
import { createInitialWorld } from '../physics';
import { tableBrief } from './table-coach';
import { askTableFriend, chatFailure } from '../minitool/table-chat';

const match = beginMatch({ ...createInitialMatchState(), companionId: 'wen-xingye' });
describe('live table conversation', () => {
  it('explains the opening without claiming a pot or a group', () => {
    const brief = tableBrief(createInitialWorld(), match, []);
    expect(brief.legal).not.toContain(8);
    expect(brief.tip).toContain('开球');
    expect(brief.balls.find(b => b.number === 14)?.appearance).toBe('绿色、中间有白带的那颗');
  });
  it('recomputes targets from the actual group and table without moving a ball', () => {
    const world = createInitialWorld();
    for (const b of world.balls) if (b.group === 'solid') b.active = false;
    const before = JSON.stringify(world);
    const brief = tableBrief(world, { ...match, breaking: false, playerGroup: 'solid' }, []);
    expect(brief.legal).toEqual([8]);

    expect(JSON.stringify(world)).toBe(before);
    for (const ball of world.balls) {
      ball.active = [0, 1, 2, 8].includes(ball.number);
      if (ball.number === 0) { ball.x = 0; ball.z = 0; }
      if (ball.number === 1) { ball.x = .43; ball.z = 0; }
      if (ball.number === 2) { ball.x = -.3; ball.z = .65; }
      if (ball.number === 8) { ball.x = -.1; ball.z = -.9; }
    }
    const layout = JSON.stringify(world);
    const line = tableBrief(world, { ...match, breaking: false, playerGroup: 'solid' }, []);
    expect(line.tip).toContain('1号到右中袋');
    expect(line.tip).toContain('模拟里白球停在');
    expect(line.tip).toContain('2号');
    expect(JSON.stringify(world)).toBe(layout);
    expect(tableBrief(world, { ...match, phase: 'placing' }, []).tip).toContain('放好后');
  });
  it('passes current facts and the companion with bounded history to the native model', async () => {
    const brief = tableBrief(createInitialWorld(), match, []);
    const generateText = vi.fn().mockResolvedValue({ choices: [{ message: { content: '先开球。' } }], request_id: 'test-id' });
    const bridge = { createModel: vi.fn(() => ({ generateText })) };
    const older = { question: '旧问题', answer: '旧回答', source: '小红书 AI' };
    const reply = await askTableFriend(bridge, brief, Array(15).fill(older), '现在打什么');
    expect(bridge.createModel).toHaveBeenCalledWith('deepseek-v4-flash');
    const messages = generateText.mock.calls[0][0].messages;
    expect(messages).toHaveLength(22);
    expect(messages[0].content).toContain(JSON.stringify(brief));
    expect(reply.requestId).toBe('test-id');
    generateText.mockResolvedValue({ choices: [] });
    await expect(askTableFriend(bridge, brief, [], '你好')).rejects.toThrow('EMPTY_REPLY');
    expect(chatFailure({ code: 'AI_NOT_ALLOWED' })).toContain('尚未获准');
  });
});

import { CHAT_EXAMPLES } from './chat-examples';
import { COMPANIONS } from './companions';
import { shortReply } from '../minitool/table-chat';
it('has three distinct voice examples for every companion and keeps complete short replies',()=>{
  expect(Object.keys(CHAT_EXAMPLES).sort()).toEqual(COMPANIONS.map(p=>p.id).sort());
  expect(new Set(Object.values(CHAT_EXAMPLES).flat()).size).toBe(30);
  expect(shortReply('先看右边。'+'很长的废话'.repeat(30))).toBe('先看右边。');
});

it('keeps earlier settled strokes and cumulative counts available locally and on explicit native requests',async()=>{
  const {settledShot}=await import('../match/shot-log');
  const shots=Array.from({length:14},(_,i)=>settledShot(match,{shotId:i+1,firstContact:i===0?2:1,pocketed:i===0?[2]:[],cueScratch:false,cushionAfterFirstContact:true,remainingSolids:6,remainingStripes:7},{shotId:i+1,next:match,effects:[]}));
  const b=tableBrief(createInitialWorld(),match,shots);
  expect(b.shots[0].first).toBe(2);
  expect(b.totals.player.potted).toBe(1);
  const generateText=vi.fn().mockResolvedValue({choices:[{message:{content:'第一杆先碰了2号。'}}]});
  await askTableFriend({createModel:()=>({generateText})},b,[],'第一杆进了什么？');
  const prompt=generateText.mock.calls[0][0].messages[0].content;
  expect(prompt).toContain('"index":1,');expect(prompt).toContain('"index":14,');expect(prompt).not.toContain('"index":5,');
});

it('sends the prior recommendation alongside the actual ball appearance and current position', async () => {
  const world = createInitialWorld();
  for (const ball of world.balls) {
    ball.active = [0,8,14].includes(ball.number);
    if (ball.number === 0) { ball.x = 0; ball.z = 0; }
    if (ball.number === 8) { ball.x = -.1; ball.z = -.9; }
  }
  const ball = world.balls.find(ball => ball.number === 14)!;
  ball.x = .43; ball.z = 0;
  const brief = tableBrief(world, { ...match, breaking:false }, []);
  expect(brief.playerGroup).toBeNull();
  expect(brief.route).toMatchObject({target:14,pocket:'右中袋',verified:true});
  const generateText = vi.fn()
    .mockResolvedValueOnce({choices:[{message:{content:'试试14号，瞄右中袋。'}}]})
    .mockResolvedValueOnce({choices:[{message:{content:'右边那颗绿色的，中间有白带。'}}]});
  const bridge = {createModel:()=>({generateText})};
  const previous = await askTableFriend(bridge, brief, [], '我该打哪个球？');
  await askTableFriend(bridge, brief, [previous], '它是哪颗？', ['该我打啦。']);
  const messages = generateText.mock.calls[1][0].messages;
  expect(messages.slice(1).map((m:{content:string})=>m.content)).toEqual([previous.question, previous.answer, '它是哪颗？']);
  expect(messages[0].content).toContain('该我打啦。');
  expect(brief.balls.find(b=>b.number===14)).toMatchObject({appearance:'绿色、中间有白带的那颗',area:'中段右侧'});
  ball.active = false;
  expect(tableBrief(world, match, []).balls.some(b=>b.number===14)).toBe(false);
});

it('preserves actionable platform diagnostics and handles wrapped native responses',async()=>{
  expect(chatFailure({data:{error:{code:'AI_NOT_ALLOWED'}},request_id:'req-17'})).toMatch(/尚未获准.*AI_NOT_ALLOWED.*req-17/);
  expect(chatFailure({errCode:6101,errMsg:'服务繁忙'})).toMatch(/服务繁忙.*6101/);
  expect(chatFailure({error:{status:503}})).toContain('AI 服务暂时不可用');
  const brief=tableBrief(createInitialWorld(),match,[]);
  const generateText=vi.fn().mockResolvedValue({data:{choices:[{message:{content:'先瞄准最前面那颗。'}}],request_id:'r-ok'}});
  const bridge={createModel:()=>({generateText})};
  expect(await askTableFriend(bridge,brief,[],'我该打哪个球')).toMatchObject({requestId:'r-ok',answer:'先瞄准最前面那颗。'});
  const failure={data:{error:{code:'AI_QUOTA_EXCEEDED'}},request_id:'r-bad'};
  generateText.mockResolvedValue(failure);
  await expect(askTableFriend(bridge,brief,[],'我该打哪个球')).rejects.toBe(failure);
});
