/*
[INPUT]: 依赖 React/ReactDOM、Game、统一字体加载、主题首帧初始化与分层样式
[OUTPUT]: 先准备存档和霞鹜文楷，再挂载Game与一次性Canvas文字；不改变教学/球局
[POS]: React 应用入口，只做挂载与样式加载顺序（base → layout → controls → themes → princess），不含业务逻辑
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import './minitool/runtime-compat';
import { prepareGameStorage } from './minitool/persistent-storage';
import { ensureUiFont } from './typography';
import React from 'react';
import ReactDOM from 'react-dom/client';
import Game from './Game';
import { applyInitialTheme } from './components/ThemeSwitcher';
import './styles/base.css';
import './styles/layout.css';
import './styles/controls.css';
import './styles/themes/index.css';
import './styles/princess.css';

async function boot() {
  try {
    await prepareGameStorage();
    // Canvas textures are drawn once: activate the bundled font before mounting.
    await ensureUiFont().catch(() => {});
    applyInitialTheme();
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode><Game /></React.StrictMode>,
    );
  } catch (error) {
    const root = document.getElementById('root')!;
    const card = document.createElement('div'); card.className = 'boot-card'; card.setAttribute('role', 'alert');
    const title = document.createElement('h1'); title.textContent = '存档暂时无法读取';
    const detail = document.createElement('p');
    detail.textContent = '为保护进度，本次未开始游戏。' + (error instanceof Error ? error.message : '请稍后重试。');
    const retry = document.createElement('button'); retry.textContent = '重新读取';
    retry.addEventListener('click', () => { retry.disabled = true; retry.textContent = '正在读取…'; void boot(); });
    card.appendChild(title); card.appendChild(detail); card.appendChild(retry);
    root.textContent = ''; root.appendChild(card);
  }
}
void boot();
