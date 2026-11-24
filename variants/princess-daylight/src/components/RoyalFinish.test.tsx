import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoyalFinish, ROYAL_CELEBRATION_MS, ROYAL_CELEBRATION_PARTICLES } from './RoyalFinish';
import { TableStage } from './TableStage';
import { createInitialMatchState } from '../match/match-machine';
import { createInitialWorld } from '../physics';

describe('royal match ending', () => {
  it('uses one editable card with the real score, chronological chat and restart', () => {
    const html = renderToStaticMarkup(<RoyalFinish winner="player" companionId="f01" onRestart={() => {}}
      score={{ group: 'solid', active: [9, 10, 12] }}
      chatLines={[{ id: 1, side: 'opponent', text: '真是优雅的一杆！' }, { id: 2, side: 'player', text: '下次再一起打。' }]}/>);
    expect(html).toContain('你赢了');
    expect(html).toContain('余 3 球');
    expect(html).toContain('余 0 球');
    expect(html.indexOf('安娜</p>')).toBeLessThan(html.indexOf('你</p>'));
    expect(html.indexOf('真是优雅的一杆！')).toBeLessThan(html.indexOf('下次再一起打。'));
    expect(html.indexOf('>分享<')).toBeLessThan(html.indexOf('>再来一局<'));
    for (const text of ['本局亮点', '排行榜', '赞美卡', '给作者留言']) expect(html).not.toContain(text);
    expect(ROYAL_CELEBRATION_MS).toBeLessThanOrEqual(3500);
    expect(ROYAL_CELEBRATION_PARTICLES).toBeLessThanOrEqual(32);
  });

  it('reports the actual winner and preserves a black-eight loss explanation', () => {
    const html = renderToStaticMarkup(<RoyalFinish winner="opponent" companionId="f01" onRestart={() => {}}
      resultExplanation="得先清完本组球，下一杆才能打黑八。"/>);
    expect(html).toContain('安娜胜');
    expect(html).toContain('得先清完本组球，下一杆才能打黑八。');
    expect(html).not.toContain('你赢了');
    expect(html).not.toContain('royal-petals');
  });

  it('does not mount a card during play', () => {
    const html = renderToStaticMarkup(<TableStage viewLevel={1} spectatorActive={false} manualCameraActive={false}
      firstMatchGuideActive={false} match={createInitialMatchState()} rackId="test" worldView={createInitialWorld()}
      trainingSummary={null} gameMode="practice" containerRef={null}
      onPointerDown={() => {}} onPointerMove={() => {}} onPointerUp={() => {}} onPointerCancel={() => {}} onResetGame={() => {}}/>);
    expect(html).not.toContain('royal-finish');
  });
});
