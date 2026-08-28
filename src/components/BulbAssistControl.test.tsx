/*
[INPUT]: BulbAssistControl 的纯持久化/定位函数与服务端静态结构
[OUTPUT]: 覆盖真新用户门禁、老用户免打扰、关闭持久化、拖放锚点版本、视口避让及 aria/触控文案
[POS]: 灯泡辅助入口回归门禁，不依赖真实 WebGL 或对局
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FIRST_MATCH_GUIDE_STORAGE_KEY } from '../first-match-guide';
import { PLAYER_SKILL_STORAGE_KEY } from '../opponent/model';
import {
  BULB_COACHMARK_STORAGE_KEY,
  BulbCoachmark,
  bulbCoachmarkAnchorVersion,
  bulbCoachmarkSideFor,
  positionBulbCoachmark,
  saveBulbCoachmarkDismissed,
  shouldShowBulbCoachmark,
} from './BulbAssistControl';

function memoryStorage(initial?: Record<string, string>): Storage {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('灯泡提示新用户门禁', () => {
  it('只对无完成标记且无击球证据的新用户展示', () => {
    expect(shouldShowBulbCoachmark(memoryStorage())).toBe(true);
    expect(shouldShowBulbCoachmark(memoryStorage({
      [FIRST_MATCH_GUIDE_STORAGE_KEY]: 'done',
    }))).toBe(false);
    expect(shouldShowBulbCoachmark(memoryStorage({
      [PLAYER_SKILL_STORAGE_KEY]: JSON.stringify({ totalPlayerShots: 1 }),
    }))).toBe(false);
  });

  it('点关闭后持久收起，后续不再展示', () => {
    const storage = memoryStorage();
    saveBulbCoachmarkDismissed(storage);
    expect(storage.getItem(BULB_COACHMARK_STORAGE_KEY)).toBe('done');
    expect(shouldShowBulbCoachmark(storage)).toBe(false);
  });

  it('存储不可读或历史画像损坏时宁可不打扰', () => {
    expect(shouldShowBulbCoachmark(null)).toBe(false);
    expect(shouldShowBulbCoachmark({
      getItem: () => { throw new Error('blocked'); },
    })).toBe(false);
    expect(shouldShowBulbCoachmark(memoryStorage({
      [PLAYER_SKILL_STORAGE_KEY]: '{broken',
    }))).toBe(false);
  });
});

describe('灯泡提示锚定', () => {
  it('随右侧/底部/自由布局选择不遮挡灯泡的方向', () => {
    expect(bulbCoachmarkSideFor({
      mode: 'docked', edge: 'right', order: 1, position: 0.32,
    })).toBe('left');
    expect(bulbCoachmarkSideFor({
      mode: 'docked', edge: 'bottom', order: 1, position: 0.32,
    })).toBe('above');
    expect(bulbCoachmarkSideFor({ mode: 'free', x: 0.2, y: 0.5 })).toBe('right');
    expect(bulbCoachmarkSideFor({ mode: 'free', x: 0.8, y: 0.5 })).toBe('left');
  });

  it('自由灯泡靠近视口边界时翻转方向并保持 8px 安全边界', () => {
    const position = positionBulbCoachmark(
      { left: 6, right: 60, top: 400, bottom: 450, width: 54, height: 50 },
      { width: 220, height: 58 },
      'left',
      390,
      844,
    );
    expect(position.side).toBe('right');
    expect(position.left).toBe(68);
    expect(position.top).toBeGreaterThanOrEqual(8);
    expect(position.top + 58).toBeLessThanOrEqual(844 - 8);
  });

  it('同一侧内拖动也生成新锚点版本，落位后强制重测位置', () => {
    expect(bulbCoachmarkAnchorVersion({ mode: 'free', x: 0.68, y: 0.2 }))
      .not.toBe(bulbCoachmarkAnchorVersion({ mode: 'free', x: 0.68, y: 0.8 }));
  });
});

describe('灯泡提示语义', () => {
  it('清楚说明两类功能，关闭入口具名且保留 44px 样式热区', () => {
    const markup = renderToStaticMarkup(
      <BulbCoachmark
        preferredSide="left"
        visible
        onDismiss={() => {}}
      />,
    );
    expect(markup).toContain('小灯泡里有');
    expect(markup).toContain('瞄准辅助线 · 走位/击球复盘');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="关闭小灯泡功能提示"');
    expect(markup).toContain('bulb-coachmark-dismiss');
  });
});
