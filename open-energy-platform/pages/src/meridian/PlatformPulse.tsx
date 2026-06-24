// pages/src/meridian/PlatformPulse.tsx — live generation heartbeat strip.
// Sits atop Horizon so the board visibly MOVES: real metered generation over the
// trailing 24h, refreshed every 20s. Data from GET /api/pulse (telemetry-fed, so
// it has real numbers on the live cec system, not just the demo). Pure enhancement:
// any fetch failure renders nothing, so Horizon never depends on it.
import React from 'react';
import { api } from '../lib/api';

interface Pulse {
  mwh_7d: number; co2_avoided_t: number; sites_reporting: number;
  latest_ts: string | null; latest_kwh: number;
  top_site: string | null; top_site_mwh: number;
}

function ago(ts: string | null): string {
  if (!ts) return '—';
  const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export function PlatformPulse(): React.ReactElement | null {
  const [p, setP] = React.useState<Pulse | null>(null);
  React.useEffect(() => {
    let live = true;
    const load = () => api.get('/pulse')
      .then((r) => { if (live && r.data?.success) setP(r.data.data as Pulse); })
      .catch(() => { /* silent — strip is non-critical */ });
    load();
    const t = setInterval(load, 20000); // ponytail: 20s poll; SSE if viewer count ever justifies
    return () => { live = false; clearInterval(t); };
  }, []);

  if (!p || p.sites_reporting === 0) return null;

  const items: Array<[string, string]> = [
    ['Generation 7d', `${p.mwh_7d.toLocaleString()} MWh`],
    ['Sites reporting', String(p.sites_reporting)],
    ['CO₂ avoided 7d', `${p.co2_avoided_t.toLocaleString()} t`],
    ['Latest reading', ago(p.latest_ts)],
  ];
  if (p.top_site) items.push(['Top producer', `${p.top_site} · ${p.top_site_mwh} MWh`]);

  return (
    <div className="mer-pulse" role="status" aria-label="Live platform generation pulse">
      <span className="mer-pulse-dot" aria-hidden="true" />
      {items.map(([k, v]) => (
        <span className="mer-pulse-item" key={k}><i>{k}</i><b>{v}</b></span>
      ))}
    </div>
  );
}
