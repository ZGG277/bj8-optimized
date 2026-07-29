/*
[INPUT]: ThemeSwitcher 导出的主题配置、解析与轮换纯函数
[OUTPUT]: 三主题白名单、默认回退、URL 优先级和首尾循环回归
[POS]: 主题选择状态机的无 DOM 单元测试
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  isThemeId,
  nextThemeId,
  resolveThemeId,
  THEME_OPTIONS,
} from './ThemeSwitcher';

describe('three-theme switcher', () => {
  it('只暴露三套经过验收的视觉主题', () => {
    expect(THEME_OPTIONS.map(theme => theme.id)).toEqual(['celadon', 'noir', 'neon']);
  });

  it('无有效选择时回退到青瓷', () => {
    expect(DEFAULT_THEME).toBe('celadon');
    expect(resolveThemeId('', null)).toBe('celadon');
    expect(resolveThemeId('?theme=frost', 'heritage')).toBe('celadon');
  });

  it('有效 URL 参数优先于本地选择', () => {
    expect(resolveThemeId('?theme=noir', 'neon')).toBe('noir');
  });

  it('无有效 URL 参数时恢复本地选择', () => {
    expect(resolveThemeId('?mode=practice', 'neon')).toBe('neon');
  });

  it('拒绝已淘汰或未知主题', () => {
    expect(isThemeId('frost')).toBe(false);
    expect(isThemeId('heritage')).toBe(false);
    expect(isThemeId('celadon')).toBe(true);
  });

  it('快捷键轮换在首尾之间循环', () => {
    expect(nextThemeId('celadon', -1)).toBe('neon');
    expect(nextThemeId('neon', 1)).toBe('celadon');
  });
});
