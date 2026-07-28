/*
[INPUT]: 禁用/蓄力态、预览力度、开球标记与 begin/update/release/cancel/tap 回调
[OUTPUT]: 对外提供力度与出杆合一的长行程控件(role=button 内含 role=meter,可 Tab 聚焦,Enter 轻杆)
[POS]: 控制组件层,只负责手势出口与语义;力度事实由 input 层计算,物理击球由 Game 提交
[PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
*/

type Props = {
  disabled: boolean;
  charging: boolean;
  power: number;
  breaking: boolean;
  onBegin: (clientY: number, availableTravel: number) => void;
  onUpdate: (clientY: number) => void;
  onRelease: () => void;
  onCancel: () => void;
  /** 键盘轻杆:Enter 直接以保底力度出杆;空格按住蓄力由全局键盘通道处理 */
  onTap: () => void;
};

export function ShootControl({ disabled, charging, power, breaking, onBegin, onUpdate, onRelease, onCancel, onTap }: Props) {
  const rounded = Math.round(power);
  return (
    <div className="shoot-zone" onPointerDown={(e) => e.stopPropagation()}>
      <div
        className={`shoot-pad ${charging ? 'charging' : ''} ${disabled ? 'disabled' : ''}`}
        role="button"
        aria-label={breaking ? '开球:下拉蓄力松开出杆,回车轻杆' : '出杆:下拉蓄力松开出杆,回车轻杆'}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const rect = e.currentTarget.getBoundingClientRect();
          // 合一控件本身就是下拉轨道：从按下点到控件底边均为有效行程。
          onBegin(e.clientY, Math.min(220, Math.max(72, rect.bottom - e.clientY)));
        }}
        onPointerMove={(e) => {
          e.preventDefault();
          if (!disabled) onUpdate(e.clientY);
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          if (!disabled) onRelease();
        }}
        onPointerCancel={() => onCancel()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            onTap();
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span
          className={`shoot-power-fill ${power > 85 ? 'hot' : ''}`}
          style={{ height: `${power}%` }}
          role="meter"
          aria-label="出杆力度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={rounded}
        />
        <span className="shoot-pull-mark" aria-hidden="true">↓</span>
        <strong>{breaking ? '开球' : '出杆'}</strong>
        <span className="power-num">{rounded}</span>
        <small>下拉 · 松开</small>
      </div>
    </div>
  );
}
