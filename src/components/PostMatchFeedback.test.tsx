/*
[INPUT]: 局后卡片和 TableStage 的真实 SSR 结构
[OUTPUT]: 保留自由继续、可选留言、长度/隐私提示，局内不出现卡片
[POS]: 反馈入口结构回归；可操作性与触屏滚动另由浏览器验收
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PostMatchFeedback } from './PostMatchFeedback';
import { TableStage } from './TableStage';
import { createInitialMatchState } from '../match/match-machine';

describe('局后留言入口', () => {
  it('结果层先把留言作为再来一局旁的次级动作，不抢占结果内容', () => {
    const html = renderToStaticMarkup(<PostMatchFeedback outcome="win" mode="practice" onContinue={() => {}} />);
    expect(html).toContain('aria-label="本局结束操作"');
    expect(html).toContain('>再来一局</button>');
    expect(html).toContain('class="feedback-secondary"');
    expect(html).toContain('>留言</button>');
    expect(html).not.toContain('<textarea');
  });

  it('卡片接入真实结束覆层，未结束时不存在', () => {
    const match = createInitialMatchState();
    const render = (finished: boolean) => renderToStaticMarkup(
      <TableStage
        viewLevel={1} spectatorActive={false} manualCameraActive={false} firstMatchGuideActive={false}
        match={finished ? { ...match, phase: 'finished', winner: 'player' } : match}
        trainingSummary={null} gameMode="challenge" containerRef={null}
        onPointerDown={() => {}} onPointerMove={() => {}} onPointerUp={() => {}}
        onPointerCancel={() => {}} onResetGame={() => {}}
      />,
    );
    expect(render(false)).not.toContain('本局留言');
    const html = render(true);
    expect(html).toContain('你赢了！');
    expect(html).toContain('本局结束操作');
    expect(html).toContain('>留言</button>');
    expect(html).toContain('data-match-finished="true"');
  });
});
