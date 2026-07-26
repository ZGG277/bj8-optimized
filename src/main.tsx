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