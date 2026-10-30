import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resultCardLine, RoyalFinish, ROYAL_CELEBRATION_MS, ROYAL_CELEBRATION_PARTICLES } from './RoyalFinish';
import { TableStage } from './TableStage';
import { createInitialMatchState } from '../match/match-machine';

describe('royal match ending', () => {
  it('player result is concise and always exposes restart', () => {
    const html=renderToStaticMarkup(<RoyalFinish winner="player" onRestart={()=>{}} />);
    expect(html).toContain('公主赢了');expect(html).toContain('再来一局');
    for(const text of ['GAME OVER','本局重点','下一局目标','谢不赢','victory-share'])expect(html).not.toContain(text);
    expect(html).not.toContain('谢不赢与白马');
    expect(ROYAL_CELEBRATION_MS).toBeLessThanOrEqual(3500);expect(ROYAL_CELEBRATION_PARTICLES).toBeLessThanOrEqual(32);
  });
  it('loss uses the same result shell with honest encouragement', () => {
    const html=renderToStaticMarkup(<RoyalFinish winner="opponent" onRestart={()=>{}} />);
    expect(html).not.toContain('谢不赢与白马');expect(html).toContain('下局再赢回来');expect(html).not.toContain('惜败');expect(html).toContain('再来一局');expect(html).not.toContain('你输了');expect(html).not.toContain('royal-petals');
  });
  it('comforts an early black-eight finish with one short line and no rule explanation', () => {
    const html=renderToStaticMarkup(<RoyalFinish winner="opponent" messageKey="lose-8-early" reason="公主还没清空本组球，8号已落袋。" onRestart={()=>{}} />);
    expect(html).toContain('没关系，我陪你');
    for(const text of ['差一点','惜败','还没清空','收到','新赞美卡'])expect(html).not.toContain(text);
    expect(Array.from(resultCardLine('opponent','','lose-8-early'))).toHaveLength(7);
    expect(html.indexOf('>分享<')).toBeLessThan(html.indexOf('>再来一局<'));
  });
  it('normal play does not mount a result or illustration', () => {
    const html=renderToStaticMarkup(<TableStage viewLevel={1} spectatorActive={false} manualCameraActive={false} firstMatchGuideActive={false} match={createInitialMatchState()} trainingSummary={null} gameMode="practice" containerRef={null} onPointerDown={()=>{}} onPointerMove={()=>{}} onPointerUp={()=>{}} onPointerCancel={()=>{}} onResetGame={()=>{}} />);
    expect(html).not.toContain('royal-finish');expect(html).not.toContain('prince-white-horse');
  });
});
