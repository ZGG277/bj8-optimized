/*
[INPUT]: ControlDeck 长按/内容手势意图纯判定函数
[OUTPUT]: 回归瞄准/蓄力位移优先于布局长按，真正静止才进入拖位
[POS]: 五控件 Pointer 意图互斥回归，不依赖 DOM
[PROTOCOL]: 长按时限或意图阈值变化时同步更新 ControlDeck.tsx 与 components/CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  CONTENT_GESTURE_LAYOUT_CANCEL_PX,
  controlActivationIntent,
} from './ControlDeck';

describe('controlActivationIntent', () => {
  it('瞄准已位移时，即使同时跨过长按时限也只能继续瞄准', () => {
    expect(controlActivationIntent(
      'aimDial',
      CONTENT_GESTURE_LAYOUT_CANCEL_PX + 0.1,
      true,
      14,
    )).toBe('quick-gesture');
  });

  it('蓄力缓慢移动也会锁定为内容手势，不升级为控件拖位', () => {
    expect(controlActivationIntent('power', 4, false, 14)).toBe('quick-gesture');
  });

  it('容错范围内保持静止，到期后才进入布局拖位', () => {
    expect(controlActivationIntent('aimDial', 2, false, 14)).toBe('pending');
    expect(controlActivationIntent('aimDial', 2, true, 14)).toBe('layout');
  });
});
