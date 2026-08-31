/*
[INPUT]: 依赖玩家能力画像与 onStart(mode) 回调
[OUTPUT]: 渲染开始界面、当前水平/置信度与陪练/挑战双模式入口
[POS]: HUD 组件层，只展示模式差异并提交选择，不持有对局状态
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
        <span className="intro-kicker">中式八球 · 物理模拟</span>
        <h1>瓜瓜台球</h1>
        <p>选择这一局你想要的对手关系。双方水平局内锁定，每局结束后统一更新。</p>
        <div className="skill-summary" aria-label="当前能力评估">
          <span>当前水平</span>
          <strong>{levelLabel(playerSkill.level)} · {Math.round(playerSkill.level)}</strong>
          <small>{confidenceText} · {Math.floor(playerSkill.totalPlayerShots)} 杆已记录</small>
        </div>
        <div className="mode-grid">
          <section className="mode-choice practice">
            <span>陪练</span>
            <strong>多打、多学、少挫败</strong>
            <small>顾燃 {levelLabel(practiceLevel)} · {practiceLevel}</small>
            <em>保留走位与击球复盘</em>
            <button className="mode-start start-btn" onClick={() => onStart('practice')}>
              开始对局
            </button>
          </section>
          <section className="mode-choice challenge">
            <span>挑战</span>
            <strong>高一档，持续挑战</strong>
            <small>顾燃 {levelLabel(challengeLevel)} · {challengeLevel}</small>
            <em>更强对手，辅助仍由你决定</em>
            <button className="mode-start" onClick={() => onStart('challenge')}>
              开始挑战
            </button>
          </section>
        </div>
        <div className="intro-tags">
          <span>240Hz物理</span>
          <span>动态评估</span>
          <span>渐进匹配</span>
        </div>
      </div>
    </div>
  );
}
