/*
[INPUT]: 依赖 onStart 回调
[OUTPUT]: 渲染开始界面（品牌标识 + 描述 + 开始按钮）
[POS]: HUD 组件层，只渲染纯展示性开始界面
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

interface IntroScreenProps {
  onStart: () => void;
}

export function IntroScreen({ onStart }: IntroScreenProps) {
  return (
    <div className="intro-backdrop">
      <div className="intro-card">
        <span className="intro-kicker">中式八球 · 物理模拟</span>
        <h1>净息</h1>
        <p>真实物理引擎驱动，每一杆都经过碰撞计算。</p>
        <button className="start-btn" onClick={onStart}>
          开始对局
        </button>
        <div className="intro-tags">
          <span>240Hz物理</span>
          <span>Three.js 真 3D</span>
          <span>双视角</span>
        </div>
      </div>
    </div>
  );
}