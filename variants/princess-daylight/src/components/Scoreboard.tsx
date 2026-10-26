/*
[INPUT]: 世界快照与双方分组、当前回合
[OUTPUT]: 单行双方姓名、球色与进球明暗；8号居中，未分组只画空位
[POS]: 纯展示层；不再显示等级或球组文字，aria保留具体球号与状态
*/
import type { BilliardsWorld } from '../physics';
import type { MatchState } from '../match/types';
import type { OpponentProfile, PlayerSkillProfile, GameMode } from '../opponent/model';
import { companionFor } from '../opponent/companions';
import { turnDescription } from '../match/presentation';
interface ScoreboardProps {
  match: MatchState; worldView: BilliardsWorld;
  playerSkill: PlayerSkillProfile; opponentProfile: OpponentProfile;
  gameMode?: GameMode; onModeChange?: (mode: GameMode) => void;
}
export function Scoreboard({ match, worldView }: ScoreboardProps) {
  const companion = companionFor(match.companionId);
  const active = new Set(worldView.balls.filter(ball => ball.active).map(ball => ball.number));
  const solids = [1,2,3,4,5,6,7], stripes = [9,10,11,12,13,14,15];
  const player = match.playerGroup === 'stripe' ? stripes : solids;
  const opponent = match.playerGroup === 'stripe' ? solids : stripes;
  const ready = Boolean(match.playerGroup) && player.every(n => !active.has(n));
  const rack = (numbers: number[], owner: string) => <div className="royal-ball-rack" aria-label={match.playerGroup ? `${owner}的球，淡色为已进` : `${owner}尚未分组`}>
    {numbers.map(n => <span key={n} data-ball-number={match.playerGroup ? n : undefined}
      aria-label={match.playerGroup ? `${n}号${active.has(n) ? '待进' : '已进'}` : '待分组'}
      className={match.playerGroup ? `mini-ball ${n < 8 ? 'solid' : 'stripe'} ${active.has(n) ? '' : 'down'}` : 'mini-ball unassigned'} />)}
  </div>;
  return <section className="scoreboard royal-scoreboard" aria-label="公主请开球 · 对局比分">
    <div className="royal-player player" data-active={match.actor === 'player' && match.phase !== 'finished'}>
      <span className="player-name">公主</span>{rack(player, '公主')}
    </div>
    <span className={`mini-ball eight royal-eight ${active.has(8) ? '' : 'down'} ${ready ? 'is-ready' : ''}`} data-ball-number="8" aria-label="8号球">8</span>
    <div className="royal-player opponent" data-active={match.actor === 'opponent' && match.phase !== 'finished'}>
      {rack(opponent, companion.name)}<span className="player-name">{companion.name}</span><img className="royal-companion-avatar" src={companion.avatar} alt={`${companion.name}头像`} width="26" height="26"/>
    </div>
    <span className="royal-sr-only" role="status">{turnDescription(match, ready)}</span>
  </section>;
}
