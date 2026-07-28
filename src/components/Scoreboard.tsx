/*
[INPUT]: 依赖 physics 世界快照与 match 对局状态
[OUTPUT]: 桌面渲染完整比分板；竖屏首行只渲染玩家球组与进球状态
[POS]: HUD 组件层，只消费世界快照计算进球数；不持有对局状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { BilliardsWorld } from '../physics';
import type { MatchState } from '../match/types';

const COLORS: Record<number, string> = {
  1: '#e8bf3f', 2: '#315eb4', 3: '#c64a3a', 4: '#6f4ba2', 5: '#e47f32', 6: '#3c8c5a', 7: '#7a2830', 8: '#171717',
  9: '#e8bf3f', 10: '#315eb4', 11: '#c64a3a', 12: '#6f4ba2', 13: '#e47f32', 14: '#3c8c5a', 15: '#7a2830',
};

interface ScoreboardProps {
  match: MatchState;
  worldView: BilliardsWorld;
}

export function Scoreboard({ match, worldView }: ScoreboardProps) {
  const activeNumbers = new Set(worldView.balls.filter(b => b.active).map(b => b.number));
  const solidPotted = 7 - worldView.balls.filter(b => b.active && b.group === 'solid').length;
  const stripePotted = 7 - worldView.balls.filter(b => b.active && b.group === 'stripe').length;

  const playerGroupLabel = match.playerGroup === 'solid' ? '全色球' : match.playerGroup === 'stripe' ? '花色球' : '开放球局';
  const opponentGroupLabel = match.playerGroup ? (match.playerGroup === 'solid' ? '花色球' : '全色球') : '等待分组';

  // 球型图标跟随实际分组：玩家分到花色时，玩家侧渲染 9-15，对手侧渲染 1-7
  const playerBalls = match.playerGroup === 'stripe' ? [9,10,11,12,13,14,15,8] : [1,2,3,4,5,6,7,8];
  const opponentBalls = match.playerGroup === 'stripe' ? [1,2,3,4,5,6,7,8] : [9,10,11,12,13,14,15,8];
  const groupClass = (n: number) => (n === 8 ? 'eight' : n < 8 ? 'solid' : 'stripe');
  const mobileLabel = match.breaking ? '开球' : playerGroupLabel;
  const mobileBalls = match.playerGroup ? playerBalls : [];

  return (
    <section className="scoreboard">
      <div className="mobile-ball-status" aria-label={`我的球组：${mobileLabel}`}>
        <strong>{mobileLabel}</strong>
        {mobileBalls.length > 0 && (
          <div className="mobile-ball-rack" aria-label="我的进球状态，灰色为已进">
            {mobileBalls.map(n => (
              <span
                key={n}
                className={`mini-ball ${groupClass(n)} ${!activeNumbers.has(n) ? 'down' : ''}`}
                style={{ '--c': COLORS[n] } as React.CSSProperties}
              >
                {n}
              </span>
            ))}
          </div>
        )}
        <small>{mobileBalls.length ? '灰色已进' : '进球后确定花色'}</small>
      </div>
      <div className="player-card">
        <div className="avatar me">我</div>
        <div className="identity">
          <span>PLAYER</span>
          <strong>你</strong>
          <small>{playerGroupLabel}</small>
        </div>
        <div className="mini-rack">
          {playerBalls.map(n => (
            <span key={n} className={`mini-ball ${groupClass(n)} ${!activeNumbers.has(n)?'down':''}`}
              style={{'--c': COLORS[n]} as React.CSSProperties}>{n}</span>
          ))}
        </div>
      </div>
      <div className="score-center">
        <span>{match.playerGroup === 'stripe' ? stripePotted : solidPotted}</span>
        <i>-</i>
        <span>{match.playerGroup === 'stripe' ? solidPotted : stripePotted}</span>
      </div>
      <div className="player-card opponent">
        <div className="mini-rack">
          {opponentBalls.map(n => (
            <span key={n} className={`mini-ball ${groupClass(n)} ${!activeNumbers.has(n)?'down':''}`}
              style={{'--c': COLORS[n]} as React.CSSProperties}>{n}</span>
          ))}
        </div>
        <div className="identity right">
          <span>SPARRING</span>
          <strong>顾燃</strong>
          <small>{opponentGroupLabel}</small>
        </div>
        <div className="avatar rival">燃</div>
      </div>
    </section>
  );
}
