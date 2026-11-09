/*
[INPUT]: 世界快照与双方分组、当前回合
[OUTPUT]: 双方姓名、球色与进球明暗；Toy 桌面可见球组、待进数和当前回合
[POS]: 纯展示层，使用已分组状态和桌面剩余球数
*/
import type { BilliardsWorld } from '../physics';
import type { MatchState } from '../match/types';
import type { OpponentProfile, PlayerSkillProfile, GameMode } from '../opponent/model';
import { companionFor } from '../opponent/companions';
import { turnDescription } from '../match/presentation';
import type { ShotReward } from '../shot-reward';
interface ScoreboardProps {
  match: MatchState; worldView: BilliardsWorld;
  playerSkill: PlayerSkillProfile; opponentProfile: OpponentProfile;
  gameMode?: GameMode; onModeChange?: (mode: GameMode) => void;
  shotReward?: ShotReward | null;
}
export function Scoreboard({ match, worldView, shotReward }: ScoreboardProps) {
  const companion = companionFor(match.companionId);
  const active = new Set(worldView.balls.filter(ball => ball.active).map(ball => ball.number));
  const solids = [1,2,3,4,5,6,7], stripes = [9,10,11,12,13,14,15];
  const player = match.playerGroup === 'stripe' ? stripes : solids;
  const opponent = match.playerGroup === 'stripe' ? solids : stripes;
  const ready = Boolean(match.playerGroup) && player.every(n => !active.has(n));
  const opponentGroup = match.playerGroup === 'solid' ? 'stripe' : match.playerGroup === 'stripe' ? 'solid' : null;
  const isCurrent = (side: MatchState['actor']) => match.actor === side && match.phase !== 'finished';
  const toyDetails = (group: MatchState['playerGroup'], numbers: number[], side: MatchState['actor']) => {
    if (import.meta.env.VITE_BILIBILI_TOY !== '1') return null;
    return <div className="toy-score-details">
      <span className="toy-score-group">{group === 'solid' ? '全色球' : group === 'stripe' ? '花色球' : '待分组'}</span>
      {group && <span className="toy-score-count">待进 {numbers.filter(n => active.has(n)).length} 球</span>}
      {isCurrent(side) && <span className="toy-score-turn">当前回合</span>}
    </div>;
  };

  const rack = (numbers: number[], owner: string) => <div className="royal-ball-rack" aria-label={match.playerGroup ? `${owner}的球，淡色为已进` : `${owner}尚未分组`}>
    {numbers.map(n => <span key={n} data-ball-number={match.playerGroup ? n : undefined}
      aria-label={match.playerGroup ? `${n}号${active.has(n) ? '待进' : '已进'}` : '待分组'}
      className={match.playerGroup ? `mini-ball ${n < 8 ? 'solid' : 'stripe'} ${active.has(n) ? '' : 'down'}${shotReward?.ballNumbers.includes(n) ? ' is-rewarded' : ''}` : 'mini-ball unassigned'} />)}
  </div>;
  return <section className="scoreboard royal-scoreboard" aria-label="公主请开球 · 对局比分">
    <div className="royal-player player" data-active={isCurrent('player')}>
      <span className="player-name">公主</span>{toyDetails(match.playerGroup, player, 'player')}{rack(player, '公主')}
    </div>
    <span className={`mini-ball eight royal-eight ${active.has(8) ? '' : 'down'} ${ready ? 'is-ready' : ''}`} data-ball-number="8" aria-label="8号球">8</span>
    <div className="royal-player opponent" data-active={isCurrent('opponent')}>
      {rack(opponent, companion.name)}{toyDetails(opponentGroup, opponent, 'opponent')}<span className="player-name">{companion.name}</span><img className="royal-companion-avatar" src={companion.avatar} alt={`${companion.name}头像`} width="26" height="26"/>
    </div>
    <span className="royal-sr-only" role={shotReward ? undefined : 'status'} aria-hidden={shotReward ? true : undefined}>{turnDescription(match, ready)}</span>
  </section>;
}
