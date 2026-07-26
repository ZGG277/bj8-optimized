/*
[INPUT]: 依赖 React/ReactDOM、Game 对局编排器与 styles 三层样式
[OUTPUT]: 对外提供应用挂载（无导出），将 Game 以 StrictMode 渲染到 #root
[POS]: React 应用入口，只做挂载与样式加载顺序（base → layout → controls），不含业务逻辑
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React from 'react';
import ReactDOM from 'react-dom/client';
import Game from './Game';
import './styles/base.css';
import './styles/layout.css';
import './styles/controls.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Game />
  </React.StrictMode>
);