import React from 'react';
import ReactDOM from 'react-dom/client';
import './core/i18n';
import App from './App';
import './styles/global.css';
import './styles/manual.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
