/*
[INPUT]: 依赖 useAimInteraction 导出的拨轮默认值与有效落位完成判定
[OUTPUT]: 默认精瞄及 aim/ghost 抬指触发、line/取消副指针隔离的纯语义回归
[POS]: 瞄准交互协调层的轻量契约测试，不挂载 React、DOM 或 Three.js
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AIM_DIAL_PRECISION_ACTIVE,
  shouldNotifyAimEstablished,
} from './useAimInteraction';

describe('瞄准交互默认值与完成事实', () => {
  it('拨轮首次出现与状态迁移后的产品默认值都是精瞄', () => {
    expect(DEFAULT_AIM_DIAL_PRECISION_ACTIVE).toBe(true);
  });

  it.each(['aim', 'ghost'] as const)(
    'active pointer 完成有效 %s 落位时通知相机编排',
    (mode) => {
      expect(shouldNotifyAimEstablished({
        ownsActivePointer: true,
        mode,
        aimEstablished: true,
      })).toBe(true);
    },
  );

  it('纯 line 拖动不触发自动进入第一人称', () => {
    expect(shouldNotifyAimEstablished({
      ownsActivePointer: true,
      mode: 'line',
      aimEstablished: true,
    })).toBe(false);
  });

  it('无有效落点或副指针抬起不触发完成事实', () => {
    expect(shouldNotifyAimEstablished({
      ownsActivePointer: true,
      mode: 'ghost',
      aimEstablished: false,
    })).toBe(false);
    expect(shouldNotifyAimEstablished({
      ownsActivePointer: false,
      mode: 'aim',
      aimEstablished: true,
    })).toBe(false);
  });
});
