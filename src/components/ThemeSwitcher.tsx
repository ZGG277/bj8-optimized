/*
[INPUT]: 三套作用域主题 CSS、URL theme 参数、localStorage 与键盘输入
[OUTPUT]: 对外提供首帧主题初始化、纯主题解析函数与常驻三按钮切换器
[POS]: HUD 工具组件；与 Game 并列挂载，只改 html[data-theme]，不接触游戏状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useEffect, useState } from 'react';

export const THEME_OPTIONS = [
  { id: 'celadon', label: '青瓷', hint: '宋代天青玉质' },
  { id: 'noir', label: '决赛之夜', hint: '黑金转播质感' },
  { id: 'neon', label: '霓虹球房', hint: '深夜电光辉光' },
] as const;

export type ThemeId = (typeof THEME_OPTIONS)[number]['id'];

export const DEFAULT_THEME: ThemeId = 'celadon';
export const THEME_STORAGE_KEY = 'bj8-ui-theme';

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEME_OPTIONS.some(theme => theme.id === value);
}

export function resolveThemeId(search: string, stored: string | null): ThemeId {
  const fromUrl = new URLSearchParams(search).get('theme');
  if (isThemeId(fromUrl)) return fromUrl;
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

export function nextThemeId(current: ThemeId, direction: 1 | -1): ThemeId {
  const index = THEME_OPTIONS.findIndex(theme => theme.id === current);
  const nextIndex = (index + direction + THEME_OPTIONS.length) % THEME_OPTIONS.length;
  return THEME_OPTIONS[nextIndex].id;
}

function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistTheme(theme: ThemeId): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 存储不可用时仍允许当前页面切换主题。
  }
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
}

export function applyInitialTheme(): ThemeId {
  const theme = resolveThemeId(window.location.search, readStoredTheme());
  applyTheme(theme);
  return theme;
}

function updateThemeUrl(theme: ThemeId): void {
  const url = new URL(window.location.href);
  url.searchParams.set('theme', theme);
  window.history.replaceState(window.history.state, '', url);
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

export default function ThemeSwitcher() {
  const [current, setCurrent] = useState<ThemeId>(() => {
    const applied = document.documentElement.dataset.theme;
    return isThemeId(applied) ? applied : applyInitialTheme();
  });

  const select = (theme: ThemeId) => {
    setCurrent(theme);
    applyTheme(theme);
    persistTheme(theme);
    updateThemeUrl(theme);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key !== '[' && event.key !== ']')
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || isTextEntryTarget(event.target)
      ) return;
      const direction = event.key === ']' ? 1 : -1;
      select(nextThemeId(current, direction));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current]);

  return (
    <div className="theme-switcher" role="group" aria-label="视觉主题">
      {THEME_OPTIONS.map(theme => (
        <button
          key={theme.id}
          type="button"
          data-theme-option={theme.id}
          aria-pressed={current === theme.id}
          className={current === theme.id ? 'active' : ''}
          title={`${theme.hint}（快捷键 [ / ]）`}
          onClick={() => select(theme.id)}
        >
          {theme.label}
        </button>
      ))}
    </div>
  );
}
