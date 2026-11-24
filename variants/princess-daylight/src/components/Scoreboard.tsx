/*
[INPUT]: 世界快照与双方分组、当前回合
[OUTPUT]: 单行比分左球友、右玩家并标注「你」；8号居中，未分组只画空位
[POS]: 纯展示层；不再显示等级或球组文字，aria保留具体球号与状态
*/
import type { MouseEvent } from 'react';
import { TableAvatar } from './TableAvatar';
import type { BilliardsWorld } from '../physics';
import type { MatchState } from '../match/types';
import type { OpponentProfile, PlayerSkillProfile, GameMode } from '../opponent/model';
import { companionFor } from '../opponent/companions';
import { turnDescription } from '../match/presentation';
import type { ShotReward } from '../shot-reward';
import { scoreGroups } from '../match/memory-card';
interface ScoreboardProps {
  onProfile?: (id: string, focusAfterClose?: HTMLButtonElement) => void; disabled?: boolean;
  match: MatchState; worldView: BilliardsWorld;
  playerSkill: PlayerSkillProfile; opponentProfile: OpponentProfile;
  gameMode?: GameMode; onModeChange?: (mode: GameMode) => void;
  shotReward?: ShotReward | null;
}
export function Scoreboard({ match, worldView, shotReward, onProfile, disabled }: ScoreboardProps) {
  const companion = companionFor(match.companionId);
  const openProfile = (event: MouseEvent<HTMLButtonElement>, id: string) => {
    if (!onProfile) return;
    const button = event.currentTarget;
    if (event.detail > 0) {
      button.blur();
      onProfile(id);
    } else {
      onProfile(id, button);
    }
  };
  const active = new Set(worldView.balls.filter(ball => ball.active).map(ball => ball.number));
  const { player, opponent } = scoreGroups(match.playerGroup);
  const ready = Boolean(match.playerGroup) && player.every(n => !active.has(n));
  const rack = (numbers: readonly number[], owner: string) => <div className="royal-ball-rack" aria-label={match.playerGroup ? `${owner}的球，淡色为已进` : `${owner}尚未分组`}>
    {numbers.map(n => <span key={n} data-ball-number={match.playerGroup ? n : undefined}
      aria-label={match.playerGroup ? `${n}号${active.has(n) ? '待进' : '已进'}` : '待分组'}
      className={match.playerGroup ? `mini-ball ${n < 8 ? 'solid' : 'stripe'} ${active.has(n) ? '' : 'down'}${shotReward?.ballNumbers.includes(n) ? ' is-rewarded' : ''}` : 'mini-ball unassigned'} />)}
  </div>;
  return <section className="scoreboard royal-scoreboard" aria-label="公主请开球 · 对局比分">
    <div className="royal-player opponent" data-active={match.actor === 'opponent' && match.phase !== 'finished'}>
      <button type="button" className="score-avatar" aria-label={'选球友，当前对手'+companion.name} disabled={disabled} onClick={event => openProfile(event, companion.id)}><TableAvatar id={companion.id}/></button>
      {rack(opponent, companion.name)}
    </div>
    <span className={`mini-ball eight royal-eight ${active.has(8) ? '' : 'down'} ${ready ? 'is-ready' : ''}`} data-ball-number="8" aria-label="8号球">8</span>
    <div className="royal-player player" data-active={match.actor === 'player' && match.phase !== 'finished'}>
      {rack(player, '你')}
      <button type="button" className="score-avatar score-avatar-self" aria-label="编辑你的昵称和头像" disabled={disabled} onClick={event => openProfile(event, 'player')}>
        <TableAvatar id="player"/>
        <span className="score-avatar-you" aria-hidden="true">你</span>
      </button>
    </div>
    <span className="royal-sr-only" role={shotReward ? undefined : 'status'} aria-hidden={shotReward ? true : undefined}>{turnDescription(match, ready)}</span>
  </section>;
}
