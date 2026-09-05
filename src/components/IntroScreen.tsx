/*
[INPUT]: 依赖玩家能力画像与 onStart(mode) 回调
[OUTPUT]: 渲染开机界面：深空月面开球动效（纯 CSS 组装动画）、当前水平一行摘要与陪练/挑战双模式入口
[POS]: HUD 组件层，只展示模式差异并提交选择，不持有对局状态；开机页保持零 WebGL 零程序化纹理
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

import {
  levelLabel,
  opponentTierFor,
  type GameMode,
  type PlayerSkillProfile,
} from '../opponent/model';

interface IntroScreenProps {
  playerSkill: PlayerSkillProfile;
  onStart: (mode: GameMode) => void;
}

export function IntroScreen({ playerSkill, onStart }: IntroScreenProps) {
  const confidenceText =
    playerSkill.confidence < 0.35
      ? '评估中'
      : playerSkill.confidence < 0.75
        ? '逐渐稳定'
        : '稳定';
  const practiceLevel = opponentTierFor(playerSkill, 'practice');
  const challengeLevel = opponentTierFor(playerSkill, 'challenge');

  return (
    <div className="intro-backdrop">
      <div className="intro-card">
        <div className="intro-stage" aria-hidden="true">
          <i className="star star-a" />
          <i className="star star-b" />
          <i className="star star-c" />
          <i className="star star-d" />
          <i className="star star-e" />
          <div className="moon-cue">
            <i className="cue-ball" />
          </div>
          <div className="rack-anchor">
            <div className="rack">
              <i className="rball rb-1" />
              <i className="rball rb-9" />
              <i className="rball rb-2" />
              <i className="rball rb-8" />
              <i className="rball rb-3" />
              <i className="rball rb-7" />
            </div>
          </div>
        </div>
        <span className="intro-kicker">中式八球 · 240HZ 物理</span>
        <h1 aria-label="瓜瓜台球">
          <span>瓜</span><span>瓜</span><span>台</span><span>球</span>
        </h1>
        <div className="skill-summary" aria-label="当前能力评估">
          <span>当前水平</span>
          <strong>{levelLabel(playerSkill.level)} · {Math.round(playerSkill.level)}</strong>
          <small>{confidenceText} · {Math.floor(playerSkill.totalPlayerShots)} 杆</small>
        </div>
        <div className="mode-grid">
          <section className="mode-choice practice">
            <span>陪练</span>
            <small>顾燃 · {levelLabel(practiceLevel)} {practiceLevel}</small>
            <button className="mode-start start-btn" onClick={() => onStart('practice')}>
              开始对局
            </button>
          </section>
          <section className="mode-choice challenge">
            <span>挑战</span>
            <small>顾燃 · {levelLabel(challengeLevel)} {challengeLevel}</small>
            <button className="mode-start" onClick={() => onStart('challenge')}>
              开始挑战
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
