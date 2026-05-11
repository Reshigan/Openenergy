/* ════════════════════════════════════════════════════════════════════════
 * Service worker registration + install-prompt helpers
 *
 * - registerServiceWorker(): registers /sw.js on first navigation, reloads
 *   automatically when a new service worker has activated.
 * - useInstallPrompt(): React hook that exposes whether the browser has
 *   offered an install prompt and a function to fire it.
 * ═══════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from 'react';

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  // Defer registration until the page has loaded so it doesn't compete
  // with first-paint resources.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // When a new worker is waiting, ask the old one to step aside and
      // reload once the new one takes control — keeps everyone on the
      // latest build without manual refresh.
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            w.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch(() => { /* silent */ });

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

// PWA install-prompt state. The `beforeinstallprompt` event is captured at
// boot; consumer components call `prompt()` from a user-gesture handler.
interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BIPEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BIPEvent;
    window.dispatchEvent(new CustomEvent('oe-install-available'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('oe-installed'));
  });
}

export function useInstallPrompt() {
  const [available, setAvailable] = useState(Boolean(deferredPrompt));
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onAvail = () => setAvailable(true);
    const onInstalled = () => { setAvailable(false); setInstalled(true); };
    window.addEventListener('oe-install-available', onAvail);
    window.addEventListener('oe-installed', onInstalled);

    // If the app is launched from the home screen / installed PWA, the
    // display-mode is `standalone`. Reflect that in `installed`.
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
    }
    return () => {
      window.removeEventListener('oe-install-available', onAvail);
      window.removeEventListener('oe-installed', onInstalled);
    };
  }, []);

  const prompt = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setAvailable(false);
    return choice.outcome;
  }, []);

  return { available, installed, prompt };
}

/** True when the SPA is running inside the installed PWA / home-screen launcher. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari sets navigator.standalone; everyone else uses the media query.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(iosStandalone) || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}
