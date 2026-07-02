import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Dark mode: user preference, remembered.
const stored = localStorage.getItem('safespend-theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (stored === 'dark' || (stored === null && prefersDark)) {
  document.documentElement.classList.add('dark');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
