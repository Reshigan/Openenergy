import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToasterProvider } from './components/signature';
import { registerServiceWorker } from './lib/pwa';
import { installSastClock } from './lib/sast';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import './components/signature/signature.css';

// Force every timestamp render across the SPA to South African Standard
// Time (UTC+2). NERSA / SARS / PAIA filings all operate in SAST; a regulator
// viewing an audit-chain export from London should still see SAST.
installSastClock();

registerServiceWorker();

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

// A stale tab whose hashed chunk no longer exists after a deploy throws on
// dynamic import (Vite fires `vite:preloadError`, or the browser throws the
// "'text/html' is not a valid JavaScript MIME type" TypeError). One reload
// pulls the fresh index.html + new hashes. sessionStorage-guarded so a
// genuinely broken build can't loop.
function recoverFromStaleChunk(): boolean {
  if (sessionStorage.getItem('oe-chunk-reload')) return false;
  sessionStorage.setItem('oe-chunk-reload', '1');
  window.location.reload();
  return true;
}
window.addEventListener('vite:preloadError', (ev) => {
  ev.preventDefault();
  recoverFromStaleChunk();
});

window.addEventListener('error', (ev) => {
  const msg = ev.message || '';
  if (msg.includes('is not a valid JavaScript MIME type') || msg.includes('Failed to fetch dynamically imported module')) {
    if (recoverFromStaleChunk()) return;
  }
  reportGlobal(ev.error ?? ev.message, 'onerror');
});
window.addEventListener('unhandledrejection', (ev) => {
  reportGlobal(ev.reason, 'unhandledrejection');
});

// App mounted OK — clear the one-shot guard so a future stale-chunk error in
// this session can reload once more.
window.addEventListener('load', () => { sessionStorage.removeItem('oe-chunk-reload'); });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToasterProvider>
        <App />
      </ToasterProvider>
    </ErrorBoundary>
  </React.StrictMode>
);