/*
[INPUT]: 依赖 React/ReactDOM、Game、主题首帧初始化、逐控件新手提示与分层样式
[OUTPUT]: 对外提供应用挂载（无导出），首帧应用已选主题并挂载 Game 与 ControlOnboarding
[POS]: React 应用入口，只做挂载与样式加载顺序（base → layout → controls → themes → onboarding），不含业务逻辑
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import './minitool/runtime-compat';
import { prepareGameStorage } from './minitool/persistent-storage';
import React from 'react';
import ReactDOM from 'react-dom/client';
import Game from './Game';
import { applyInitialTheme } from './components/ThemeSwitcher';
import { ControlOnboarding } from './components/ControlOnboarding';
import './styles/base.css';
import './styles/layout.css';
import './styles/controls.css';
import './styles/themes/index.css';
import './styles/onboarding.css';

async function boot() {
  try {
    await prepareGameStorage();
    applyInitialTheme();
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode><Game /><ControlOnboarding /></React.StrictMode>,
    );
  } catch (error) {
    const root = document.getElementById('root')!;
    root.textContent = '已有存档暂时无法读取，为保护进度，本次未开始游戏。';
    const detail = document.createElement('p');
    detail.textContent = error instanceof Error ? error.message : '请稍后重试。';
    const retry = document.createElement('button'); retry.textContent = '重新读取';
    retry.addEventListener('click', () => { root.textContent = ''; void boot(); });
    root.appendChild(detail); root.appendChild(retry);
  }
}
void boot();
