import { FRIENDLY_STYLE_DESCRIPTION } from '../opponent/friendly-style';
/*
[INPUT]: 依赖 physics 世界快照、match 对局状态与双方 0–100 实力画像
[OUTPUT]: 桌面/手机渲染双方姓名下的动态水平、球组与进球状态
[POS]: HUD 组件层，只消费世界快照计算进球数；不持有对局状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { BilliardsWorld } from '../physics';
import type { MatchState } from '../match/types';
import type { OpponentProfile, PlayerSkillProfile, GameMode } from '../opponent/model';


interface ScoreboardProps {
  match: MatchState;
  worldView: BilliardsWorld;
  playerSkill: PlayerSkillProfile;
  opponentProfile: OpponentProfile;
  gameMode?: GameMode;
  onModeChange?: (mode: GameMode) => void;
}

export function Scoreboard({
  match,
  worldView,
  playerSkill,
  opponentProfile,
  gameMode = 'practice',
  onModeChange,
}: ScoreboardProps) {
  const activeNumbers = new Set(worldView.balls.filter(b => b.active).map(b => b.number));
  const solidPotted = 7 - worldView.balls.filter(b => b.active && b.group === 'solid').length;
  const stripePotted = 7 - worldView.balls.filter(b => b.active && b.group === 'stripe').length;

  const playerGroupLabel = match.playerGroup === 'solid' ? '红宝石球' : match.playerGroup === 'stripe' ? '黄宝石球' : '开放球局';
  const opponentGroupLabel = match.playerGroup ? (match.playerGroup === 'solid' ? '黄宝石球' : '红宝石球') : '等待分组';

  // 球型图标跟随实际分组：玩家分到花色时，玩家侧渲染 9-15，对手侧渲染 1-7
  const playerBalls = match.playerGroup === 'stripe' ? [9,10,11,12,13,14,15,8] : [1,2,3,4,5,6,7,8];
  const opponentBalls = match.playerGroup === 'stripe' ? [1,2,3,4,5,6,7,8] : [9,10,11,12,13,14,15,8];
  const groupClass = (n: number) => (n === 8 ? 'eight' : n < 8 ? 'solid' : 'stripe');
  const mobileLabel = match.breaking ? '开球' : playerGroupLabel;
  const mobileBalls = match.playerGroup ? playerBalls : [1, 9, 8];
  const playerLevel = Math.round(playerSkill.level);
  const opponentLevel = Math.round(opponentProfile.effectiveLevel);

  return (
    <section className="scoreboard" aria-label="公主请开球 · 对局比分">
      {onModeChange && match.breaking && worldView.shot === 0 && (
        <label className="princess-mode" title={FRIENDLY_STYLE_DESCRIPTION}>
          <span>公主请开球</span>
          <select aria-label="本局模式" value={gameMode} onChange={event => onModeChange(event.target.value as GameMode)}>
            <option value="practice">友好陪练</option><option value="challenge">轻松挑战</option>
          </select>
        </label>
      )}
      <div className="mobile-score-strip">
        <div className="mobile-identity">
          <strong>公主</strong>
          <span key={playerLevel} className="skill-level">{playerLevel}</span>
        </div>
        <div className="mobile-ball-status" aria-label={`我的球组：${mobileLabel}`}>
          <strong>{mobileLabel}</strong>
          {mobileBalls.length > 0 && (
            <div className="mobile-ball-rack" aria-label="我的进球状态，灰色为已进">
              {mobileBalls.map(n => (
                <span
                  key={n}
                  className={`mini-ball ${groupClass(n)} ${!activeNumbers.has(n) ? 'down' : ''}`}
                >
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mobile-identity opponent">
          <strong>谢不赢</strong>
          <span key={opponentLevel} className="skill-level">{opponentLevel}</span>
        </div>
      </div>
      <div className="player-card">
        <div className="avatar me">♛</div>
        <div className="identity">
          <strong>公主</strong>
          <span key={playerLevel} className="skill-level">{playerLevel}</span>
          <small>{playerGroupLabel}</small>
        </div>
        <div className="mini-rack">
          {playerBalls.map(n => (
            <span key={n} className={`mini-ball ${groupClass(n)} ${!activeNumbers.has(n)?'down':''}`}
>{n}</span>
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
>{n}</span>
          ))}
        </div>
        <div className="identity right">
          <strong>谢不赢</strong>
          <span key={opponentLevel} className="skill-level">{opponentLevel}</span>
          <small>{opponentGroupLabel}</small>
        </div>
        <div className="avatar rival">♔</div>
      </div>
    </section>
  );
}
