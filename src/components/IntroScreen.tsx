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
        <p>选择这一局你想要的对手关系。实力只在开局匹配，局内不会追着比分变化。</p>
        <div className="skill-summary" aria-label="当前能力评估">
          <span>当前水平</span>
          <strong>{levelLabel(playerSkill.level)} · {Math.round(playerSkill.level)}</strong>
          <small>{confidenceText} · {Math.floor(playerSkill.qualifiedShots)} 杆有效样本</small>
        </div>
        <div className="mode-grid">
          <button className="mode-choice practice" onClick={() => onStart('practice')}>
            <span>陪练</span>
            <strong>多打、多学、少挫败</strong>
            <small>顾燃 {levelLabel(practiceLevel)} · {practiceLevel}</small>
            <em>保留走位与击球复盘</em>
          </button>
          <button className="mode-choice challenge" onClick={() => onStart('challenge')}>
            <span>挑战</span>
            <strong>高一档，整局锁定</strong>
            <small>顾燃 {levelLabel(challengeLevel)} · {challengeLevel}</small>
            <em>赛中关闭规划提示</em>
          </button>
        </div>
        <div className="intro-tags">
          <span>240Hz物理</span>
          <span>动态评估</span>
          <span>局内公平锁定</span>
        </div>
      </div>
    </div>
  );
}
