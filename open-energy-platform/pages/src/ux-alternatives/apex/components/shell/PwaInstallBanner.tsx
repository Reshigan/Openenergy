import React, { useEffect, useState } from 'react';
import { OeIcon } from '../icons/Icons';

/**
 * Shows an install-to-homescreen banner on mobile browsers that support
 * the beforeinstallprompt event, or on iOS where we detect standalone mode
 * is not already active.
 */
export function PwaInstallBanner() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) return undefined;

    const dismissed = sessionStorage.getItem('oe-pwa-dismissed');
    if (dismissed) return undefined;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    if (ios) {
      setShow(true);
      return undefined;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    sessionStorage.setItem('oe-pwa-dismissed', '1');
    setShow(false);
  };

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setShow(false);
    }
    dismiss();
  };

  if (!show) return null;

  return (
    <div
      role="banner"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(360px, calc(100vw - 32px))',
        background: 'var(--oe-canvas)',
        borderRadius: 'var(--oe-r-card)',
        boxShadow: 'var(--oe-shadow-palette)',
        border: '1px solid var(--oe-border)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        zIndex: 'calc(var(--oe-z-toast) + 1)' as any,
        animation: 'oe-slideUp 200ms var(--oe-ease)',
      }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {/* App icon */}
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: 'var(--oe-grad-active)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <OeLogo size={28} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--oe-text-1)' }}>
            Consolidated Energy Cockpit
          </div>
          <div style={{ fontSize: '12px', color: 'var(--oe-text-2)', marginTop: '2px', lineHeight: '1.4' }}>
            {isIOS
              ? 'Add to your Home Screen for the full experience — tap the Share icon then "Add to Home Screen"'
              : 'Install for instant access, offline support, and native mobile experience'}
          </div>
        </div>
        <button
          onClick={dismiss}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--oe-text-3)', padding: '2px', flexShrink: 0 }}
          aria-label="Dismiss install banner"
        >
          <OeIcon name="close" size={14} />
        </button>
      </div>

      {!isIOS && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={dismiss}
            style={{
              flex: 1,
              border: '1px solid var(--oe-border)',
              background: 'var(--oe-surf)',
              borderRadius: 'var(--oe-r-btn)',
              padding: '8px 12px',
              fontSize: '13px',
              color: 'var(--oe-text-2)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 80ms',
            }}
          >
            Not now
          </button>
          <button
            onClick={install}
            style={{
              flex: 2,
              border: 'none',
              background: 'var(--oe-grad-button)',
              borderRadius: 'var(--oe-r-btn)',
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#ffffff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: 'var(--oe-shadow-btn)',
              transition: 'transform 100ms var(--oe-ease), box-shadow 100ms',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
          >
            <OeIcon name="download" size={14} color="#fff" />
            Install app
          </button>
        </div>
      )}

      <style>{`
        @keyframes oe-slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

function OeLogo({ size = 28 }: { size?: number }) {
  const s = size;
  const r = s * 0.29;
  const sw = s * 0.07;
  const cx = s / 2;
  const cy = s / 2;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <circle cx={cx - s * 0.09} cy={cy - s * 0.04} r={r}
        stroke="#3b82c4" strokeWidth={sw} strokeDasharray={`${r * 2.7} ${r * 1.3}`} strokeDashoffset={`${-r * 0.32}`} />
      <circle cx={cx + s * 0.09} cy={cy - s * 0.04} r={r}
        stroke="#1f9b95" strokeWidth={sw} strokeDasharray={`${r * 2.7} ${r * 1.3}`} strokeDashoffset={`${-r * 0.32}`} />
      <circle cx={cx} cy={cy + s * 0.18} r={r}
        stroke="#fff" strokeWidth={sw} strokeDasharray={`${r * 2.7} ${r * 1.3}`} strokeDashoffset={`${-r * 0.32}`} />
      <circle cx={cx} cy={cy - s * 0.05} r={s * 0.07} fill="#fff" />
      <circle cx={cx} cy={cy - s * 0.05} r={s * 0.035} fill="#5fa8e8" />
    </svg>
  );
}

export default PwaInstallBanner;
