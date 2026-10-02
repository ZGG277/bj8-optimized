import { describe, expect, it } from 'vitest';
import { createPlayerSkillProfile, loadPlayerSkillProfile, PLAYER_SKILL_STORAGE_KEY,
  PREVIOUS_PLAYER_SKILL_STORAGE_KEY, LEGACY_PLAYER_SKILL_STORAGE_KEY } from '../opponent/model';
import { CONTROL_LAYOUT_STORAGE_KEY, createDefaultControlLayouts, loadControlLayouts } from '../layout/control-layout';
import { CONTROL_LEARNING_STORAGE_KEY } from '../control-onboarding';
import { FIRST_MATCH_GUIDE_STORAGE_KEY } from '../first-match-guide';
import { AIM_ASSIST_STORAGE_KEY, loadAimAssistPreference } from '../hooks/useAimAssist';
import { THEME_STORAGE_KEY, resolveThemeId } from '../components/ThemeSwitcher';

describe('原小工具存档兼容合同', () => {
  it('延续已发布包使用的存储键，不另开空档', () => {
    expect([PLAYER_SKILL_STORAGE_KEY, CONTROL_LAYOUT_STORAGE_KEY, CONTROL_LEARNING_STORAGE_KEY,
      FIRST_MATCH_GUIDE_STORAGE_KEY, AIM_ASSIST_STORAGE_KEY, THEME_STORAGE_KEY]).toEqual([
      'guagua-billiards:player-skill:v3', 'guagua-billiards:control-layout:v3',
      'guagua-billiards:learned-controls:v1', 'guagua-billiards:first-match-guide:v1',
      'guagua-billiards:aim-assist:v1', 'bj8-ui-theme',
    ]);
  });
  it('读取旧档保留等级、统计、布局、偏好和未知记录，不写入或删除', () => {
    const profile = { ...createPlayerSkillProfile(), level: 61, matchesEvaluated: 42, totalPlayerShots: 321 };
    const layouts = createDefaultControlLayouts(); layouts.layouts.portrait.aimDial = { mode: 'free', x: .35, y: .91 };
    const values = new Map([[PLAYER_SKILL_STORAGE_KEY, JSON.stringify(profile)],
      [CONTROL_LAYOUT_STORAGE_KEY, JSON.stringify(layouts)], [THEME_STORAGE_KEY, 'noir'],
      [AIM_ASSIST_STORAGE_KEY, 'false'], ['future-extension', 'keep-me']]);
    const before = [...values];
    const storage = { getItem: (key: string) => values.get(key) ?? null };
    expect(loadPlayerSkillProfile(storage)).toMatchObject({ level: 61, matchesEvaluated: 42, totalPlayerShots: 321 });
    expect(loadControlLayouts(storage)).toEqual(layouts);
    expect(loadAimAssistPreference(storage)).toBe(false);
    expect(resolveThemeId('', storage.getItem(THEME_STORAGE_KEY))).toBe('noir');
    expect([...values]).toEqual(before);
  });
  it.each([[1, LEGACY_PLAYER_SKILL_STORAGE_KEY], [2, PREVIOUS_PLAYER_SKILL_STORAGE_KEY]] as const)(
    '兼容更早 v%s 画像且保留原始值', (version, key) => {
      const raw = JSON.stringify({ ...createPlayerSkillProfile(), version, level: 57, totalPlayerShots: 180 });
      const values = new Map<string, string>([[key, raw]]);
      expect(loadPlayerSkillProfile({ getItem: name => values.get(name) ?? null })).toMatchObject({ level: 57, totalPlayerShots: 180 });
      expect(values.get(key)).toBe(raw);
    });
});
