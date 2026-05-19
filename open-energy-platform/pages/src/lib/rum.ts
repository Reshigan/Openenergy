// ════════════════════════════════════════════════════════════════════════
// rum — fire-and-forget Real User Monitoring beacons.
//
// Reports Core Web Vitals (LCP / FID / CLS / INP / TTFB) plus route-
// change and unhandled-error events to /api/polish/rum. Beacons are
// batched and sent on `visibilitychange:hidden` or page unload to avoid
// fetch-during-teardown issues.
// ════════════════════════════════════════════════════════════════════════

type RumEvent = {
  page_path: string;
  metric: string;
  value?: number;
  network_type?: string;
  device_category?: string;
};

const buffer: RumEvent[] = [];
const sessionId = (() => {
  let s = sessionStorage.getItem('oe-rum-sid');
  if (!s) {
    s = Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem('oe-rum-sid', s);
  }
  return s;
})();

function deviceCategory(): string {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1280) return 'tablet';
  return 'desktop';
}
function networkType(): string | undefined {
  const c = (navigator as any).connection;
  return c?.effectiveType;
}

function flush() {
  if (!buffer.length || !localStorage.getItem('token')) return;
  const events = buffer.splice(0, buffer.length);
  const body = JSON.stringify({ events: events.map((e) => ({ ...e, session_id: sessionId })) });
  // Use sendBeacon for unload-time flushes; falls back to fetch keepalive.
  const url = '/api/polish/rum';
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      // sendBeacon doesn't allow auth header; fetch keepalive is the
      // fallback when we need Authorization
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    }
    fetch(url, {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      body,
    }).catch(() => null);
  } catch { /* swallow */ }
}

export function reportRum(metric: string, value?: number) {
  buffer.push({
    page_path: location.pathname,
    metric, value,
    network_type: networkType(),
    device_category: deviceCategory(),
  });
  if (buffer.length >= 10) flush();
}

export function installRum() {
  // Route changes
  let lastPath = location.pathname;
  const obs = new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      reportRum('route_change');
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  // Unhandled errors
  window.addEventListener('error', (e) => reportRum('error', undefined));
  window.addEventListener('unhandledrejection', () => reportRum('error'));
  // Web Vitals via PerformanceObserver
  try {
    const lcpObs = new PerformanceObserver((entries) => {
      const last = entries.getEntries().pop() as any;
      if (last) reportRum('LCP', last.renderTime || last.loadTime);
    });
    lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });

    let cls = 0;
    const clsObs = new PerformanceObserver((entries) => {
      for (const e of entries.getEntries() as any[]) {
        if (!e.hadRecentInput) cls += e.value;
      }
      reportRum('CLS', cls);
    });
    clsObs.observe({ type: 'layout-shift', buffered: true });

    const inpObs = new PerformanceObserver((entries) => {
      for (const e of entries.getEntries() as any[]) {
        reportRum('INP', e.duration);
      }
    });
    inpObs.observe({ type: 'event', buffered: true, durationThreshold: 40 } as any);
  } catch { /* PerformanceObserver not supported */ }

  // TTFB from Navigation Timing
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav) reportRum('TTFB', nav.responseStart - nav.requestStart);
  } catch { /* ignore */ }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  setInterval(flush, 30_000);
}
