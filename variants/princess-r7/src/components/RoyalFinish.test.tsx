import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoyalFinish, ROYAL_CELEBRATION_MS, ROYAL_CELEBRATION_PARTICLES } from './RoyalFinish';
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
  it('prince result includes actual local artwork and only encouragement', () => {
    const html=renderToStaticMarkup(<RoyalFinish winner="opponent" onRestart={()=>{}} />);
    expect(html).toContain('谢不赢与白马');expect(html).toContain('再接再厉');expect(html).toContain('再来一局');expect(html).not.toContain('你输了');expect(html).not.toContain('royal-petals');
  });
  it('normal play does not mount a result or illustration', () => {
    const html=renderToStaticMarkup(<TableStage viewLevel={1} spectatorActive={false} manualCameraActive={false} firstMatchGuideActive={false} match={createInitialMatchState()} trainingSummary={null} gameMode="practice" containerRef={null} onPointerDown={()=>{}} onPointerMove={()=>{}} onPointerUp={()=>{}} onPointerCancel={()=>{}} onResetGame={()=>{}} />);
    expect(html).not.toContain('royal-finish');expect(html).not.toContain('prince-white-horse');
  });
});
