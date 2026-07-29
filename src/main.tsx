/*
[INPUT]: 依赖 React/ReactDOM、Game 对局编排器、三主题切换器与 styles 四层样式
[OUTPUT]: 对外提供应用挂载（无导出），在首帧前应用主题并渲染 Game 与 ThemeSwitcher
[POS]: React 应用入口，只做挂载与样式加载顺序（base → layout → controls → themes），不含业务逻辑
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React from 'react';
import ReactDOM from 'react-dom/client';
import Game from './Game';
import ThemeSwitcher, { applyInitialTheme } from './components/ThemeSwitcher';
import './styles/base.css';
import './styles/layout.css';
import './styles/controls.css';
import './styles/themes/index.css';

applyInitialTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Game />
    <ThemeSwitcher />
  </React.StrictMode>
);
