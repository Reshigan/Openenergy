// pages/src/meridian/surfaces/admin/CronSurface.tsx
//
// Meridian surface — "Scheduled jobs" (admin role). There is no list endpoint for cron
// (the seven schedules are static in wrangler.toml::[triggers] and dispatched by scheduled()
// in src/index.ts), so this surface renders that static schedule catalogue and exposes a
// per-row "Run once" button → POST /api/admin/cron/run-once?pattern=<cron> (gated on admin).
// Each run reports {success, ran} inline. Bucket B operational surface. Registered as
// `admin:cron` in surfaces.tsx, reached from Atlas (⌘K) via the roleData feature key `cron`.
import React, { useState } from 'react';
import { Pill } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

// Mirror of wrangler.toml::[triggers] — what scheduled() in src/index.ts dispatches.
const SCHEDULES: { cron: string; label: string; detail: string }[] = [
  { cron: '*/15 * * * *', label: 'Surveillance & depth snapshots', detail: 'Market-abuse surveillance scan + OrderBook DO depth snapshots' },
  { cron: '0 * * * *', label: 'VWAP mark prices', detail: 'Hourly volume-weighted average mark-price recompute' },
  { cron: '5 0 * * *', label: 'Metering & ONA rollups', detail: 'Daily metering + ONA rollups, audit archive prep' },
  { cron: '10 0 * * *', label: 'PPA settlement run', detail: 'Previous-day PPA settlement run' },
  { cron: '30 0 * * *', label: 'Usage & margin-call cycle', detail: 'Usage snapshot + margin-call cycle' },
  { cron: '45 0 * * *', label: 'Watershed & maturity', detail: 'Watershed anomaly scan + maturity refresh' },
  { cron: '0 2 1 * *', label: 'Monthly platform invoice', detail: 'Monthly platform invoice run (1st of month, 02:00)' },
];

export default function CronSurface(_props: { role: string }) {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const runNow = async (cron: string) => {
    setRunning(cron);
    try {
      const res = await api.post(`/admin/cron/run-once?pattern=${encodeURIComponent(cron)}`);
      const ran = res.data?.ran ?? res.data?.success;
      setResults((r) => ({ ...r, [cron]: { ok: true, msg: ran ? 'Dispatched' : 'No-op' } }));
    } catch (e: any) {
      setResults((r) => ({ ...r, [cron]: { ok: false, msg: e?.response?.data?.error || e?.message || 'Failed' } }));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-white">
      <table className="w-full text-[12px]">
        <thead className="bg-[var(--raised)] text-[var(--ink3)] uppercase text-[10px] tracking-wide">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Schedule</th>
            <th className="text-left px-3 py-2 font-semibold">Cron</th>
            <th className="text-left px-3 py-2 font-semibold">Job</th>
            <th className="text-right px-3 py-2 font-semibold">Run</th>
          </tr>
        </thead>
        <tbody>
          {SCHEDULES.map((s) => {
            const r = results[s.cron];
            return (
              <tr key={s.cron} className="border-t border-[var(--line)]">
                <td className="px-3 py-2 font-medium">{s.label}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-[var(--ink2)]">{s.cron}</td>
                <td className="px-3 py-2 text-[var(--ink2)]">
                  {s.detail}
                  {r && <span className="ml-2"><Pill tone={r.ok ? 'good' : 'bad'}>{r.msg}</Pill></span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    disabled={running === s.cron}
                    onClick={() => runNow(s.cron)}
                    className="btn pri"
                  >
                    {running === s.cron ? 'Running…' : 'Run once'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
