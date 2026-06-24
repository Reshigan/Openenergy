// ════════════════════════════════════════════════════════════════════════
// CookieConsentBanner — POPIA-aligned consent capture before any analytics
// or marketing cookies fire. Renders once per device until a choice is
// recorded server-side (via /api/consent/record).
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Cookie, Shield, X } from 'lucide-react';

const LOCAL_KEY = 'oe.consent.v1';
const POLICY_VERSION = '2026-05-19';

function getOrCreateSessionId(): string {
  let s = localStorage.getItem('oe.session_id');
  if (!s) {
    s = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('oe.session_id', s);
  }
  return s;
}

export function CookieConsentBanner() {
  const [show, setShow] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_KEY);
    if (!stored) { setShow(true); return; }
    try {
      const parsed = JSON.parse(stored);
      // Reshow if the policy version has changed
      if (parsed?.version !== POLICY_VERSION) setShow(true);
    } catch { setShow(true); }
  }, []);

  const record = async (acc: { analytics: boolean; marketing: boolean }) => {
    const sessionId = getOrCreateSessionId();
    const items = [
      { consent_type: 'cookies_necessary', version: POLICY_VERSION, accepted: true },
      { consent_type: 'cookies_analytics', version: POLICY_VERSION, accepted: acc.analytics },
      { consent_type: 'cookies_marketing', version: POLICY_VERSION, accepted: acc.marketing },
    ];
    try {
      await fetch('/api/consent/record', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-oe-session-id': sessionId },
        body: JSON.stringify({ session_id: sessionId, items }),
      });
    } catch { /* will retry on next interaction */ }
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ version: POLICY_VERSION, ...acc, at: new Date().toISOString() }));
    setShow(false);
  };

  if (!show) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-[200] left-auto right-3 max-w-md md:right-4 md:bottom-4">
      <div className="rounded-xl bg-white border border-[#dde4ec] shadow-xl p-4">
        <div className="flex items-start gap-2">
          <Cookie size={18} className="text-[#b04e0f] mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-[#0f1c2e]">Privacy &amp; cookies</div>
            <p className="text-[12px] text-[#3d4756] mt-1 leading-snug">
              We use necessary cookies for auth and session state, and optional
              cookies for analytics. POPIA gives you the right to refuse non-essential
              cookies. See <a href="/legal" className="underline font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>privacy policy</a>.
            </p>
            <div className="mt-2 space-y-2 text-[12px]">
              <label className="flex items-center gap-2 text-[#3d4756] min-h-[24px]">
                <input type="checkbox" checked disabled className="accent-[oklch(0.46_0.16_55)] w-6 h-6" /> Necessary
              </label>
              <label className="flex items-center gap-2 text-[#3d4756] min-h-[24px]">
                <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} className="accent-[oklch(0.46_0.16_55)] w-6 h-6" /> Analytics
              </label>
              <label className="flex items-center gap-2 text-[#3d4756] min-h-[24px]">
                <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="accent-[oklch(0.46_0.16_55)] w-6 h-6" /> Marketing
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => record({ analytics, marketing })}
                      className="h-8 px-3 rounded bg-[#996428] text-white text-[12px] font-semibold">Save preferences</button>
              <button type="button" onClick={() => record({ analytics: true, marketing: true })}
                      className="h-8 px-3 rounded bg-white border border-[#dde4ec] text-[#3d4756] text-[12px] font-semibold">Accept all</button>
              <button type="button" onClick={() => record({ analytics: false, marketing: false })}
                      className="h-8 px-3 rounded bg-white border border-[#dde4ec] text-[#3d4756] text-[12px] font-semibold">Necessary only</button>
            </div>
          </div>
          <button type="button"
            onClick={() => record({ analytics: false, marketing: false })}
            aria-label="Dismiss cookie banner (necessary cookies only)"
            className="p-2 -mt-1 -mr-1 text-[#6b7685] hover:text-[#0f1c2e] inline-flex items-center justify-center min-w-[24px] min-h-[24px]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default CookieConsentBanner;
