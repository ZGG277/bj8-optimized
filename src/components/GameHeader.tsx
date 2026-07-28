/*
[INPUT]: 依赖 match 对局状态与当前杆数
[OUTPUT]: 渲染顶部状态栏（品牌标识 + 回合状态 + 杆数）
[POS]: HUD 组件层，只渲染纯展示性头部；不持有对局状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { MatchState } from '../match/types';

interface GameHeaderProps {
  match: MatchState;
  shot: number;
}

export function GameHeader({ match, shot }: GameHeaderProps) {
  const phaseLabel =
    match.phase === 'aiming' ? (match.actor === 'player' ? '你的回合' : '顾燃回合') :
    match.phase === 'opponent' ? '顾燃思考' :
    match.phase === 'rolling' ? '物理结算' :
    match.phase === 'placing' ? '放置白球' :
    '陪练局';

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-glyph">净</span>
        <div>
          <strong>净息</strong>
          <small>中式八球</small>
        </div>
      </div>
      <div className="match-state">
        <span className={`turn-light ${match.phase === 'aiming' ? 'live' : ''}`} />
        <p>{phaseLabel}</p>
        <strong>第 {shot + 1} 杆</strong>
      </div>
    </header>
  );
}