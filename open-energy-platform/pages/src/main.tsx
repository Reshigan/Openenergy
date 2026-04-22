import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Global handlers for errors that bypass React's render tree
// (async callbacks, setTimeout, unhandled promise rejections). They log
// to the same /api/telemetry/error endpoint ErrorBoundary uses.
function reportGlobal(error: unknown, source: 'onerror' | 'unhandledrejection'): void {
  const e = error instanceof Error ? error : new Error(String(error));
  fetch('/api/telemetry/error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      route: window.location.pathname,
      url: window.location.href,
      error_name: `${source}:${e.name}`,
      error_message: e.message,
      error_stack: e.stack || null,
      user_agent: navigator.userAgent,
      severity: source === 'unhandledrejection' ? 'warn' : 'error',
    }),
  }).catch(() => { /* swallow */ });
}

window.addEventListener('error', (ev) => {
  reportGlobal(ev.error ?? ev.message, 'onerror');
});
window.addEventListener('unhandledrejection', (ev) => {
  reportGlobal(ev.reason, 'unhandledrejection');
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);