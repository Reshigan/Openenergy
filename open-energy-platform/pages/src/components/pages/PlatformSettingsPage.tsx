// ════════════════════════════════════════════════════════════════════════
// PlatformSettingsPage — /settings/platform
//
// One workbench surface for the cross-cutting platform features added
// in migration 059: API keys, saved filters, webhooks, digests, usage.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, Banknote, Bell, Copy, Key, ListChecks, Plug,
  Power, RefreshCw, Send, ShieldOff, Trash2, Webhook,
} from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';

type Tab = 'usage' | 'api-keys' | 'webhooks' | 'digests' | 'saved-filters';

export function PlatformSettingsPage() {
  const [tab, setTab] = useState<Tab>('usage');
  return (
    <StitchPage
      eyebrowIcon={Plug}
      eyebrowLabel="Platform"
      title="Settings"
      subtitle="API access, outbound webhooks, digests, saved filters and usage metering."
    >
      <div className="border-b border-[#dde4ec] flex flex-wrap gap-1">
        {([
          { k: 'usage',         label: 'Usage',          icon: <Activity size={13} /> },
          { k: 'api-keys',      label: 'API keys',       icon: <Key      size={13} /> },
          { k: 'webhooks',      label: 'Webhooks',       icon: <Webhook  size={13} /> },
          { k: 'digests',       label: 'Digests',        icon: <Send     size={13} /> },
          { k: 'saved-filters', label: 'Saved filters',  icon: <ListChecks size={13} /> },
        ] as Array<{ k: Tab; label: string; icon: React.ReactNode }>).map((t) => (
          <button type="button" key={t.k} onClick={() => setTab(t.k)}
            className={`h-10 px-4 text-[12px] font-semibold inline-flex items-center gap-1 border-b-2 transition-colors ${tab === t.k ? 'border-[#3b82c4] text-[#3b82c4]' : 'border-transparent text-[#6b7685] hover:text-[#0f1c2e]'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'usage'         && <UsageTab />}
      {tab === 'api-keys'      && <ApiKeysTab />}
      {tab === 'webhooks'      && <WebhooksTab />}
      {tab === 'digests'       && <DigestsTab />}
      {tab === 'saved-filters' && <SavedFiltersTab />}
    </StitchPage>
  );
}

// ─── Usage ───────────────────────────────────────────────────────────────
function UsageTab() {
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(30);
  useEffect(() => { void api.get(`/usage?days=${days}`).then((r) => setData(r.data?.data)).catch(() => setData(null)); }, [days]);
  if (!data) return <div className="widget-card widget-empty mt-3">Loading usage…</div>;
  const t = data.totals || {};
  const tiles = [
    { label: 'Worker requests',  value: t.worker_requests?.toLocaleString() || '0', tone: 'info' },
    { label: 'D1 reads (est)',   value: t.d1_reads_est?.toLocaleString()    || '0', tone: 'info' },
    { label: 'D1 writes (est)',  value: t.d1_writes_est?.toLocaleString()   || '0', tone: 'info' },
    { label: 'Webhook delivers', value: t.webhook_deliveries?.toLocaleString() || '0', tone: 'info' },
    { label: 'Digests sent',     value: t.digest_sends?.toLocaleString()    || '0', tone: 'info' },
    { label: 'Est. cost (USD)',  value: '$' + Number(t.est_cost_usd || 0).toFixed(2), tone: 'amber' },
  ];
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-[#6b7685]">Window:</span>
        {[7, 30, 90].map((n) => (
          <button type="button" key={n} onClick={() => setDays(n)}
            className={`h-7 px-2.5 rounded-full text-[11px] font-semibold border ${days === n ? 'bg-[#c2873a] text-white border-[#1a3a5c]' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>
            {n}d
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {tiles.map((tt) => (
          <div key={tt.label} className={`widget-tile ${tt.tone === 'amber' ? 'widget-tone-amber' : 'widget-tone-info'}`}>
            <div className="widget-kpi-label">{tt.label}</div>
            <div className="widget-kpi-value">{tt.value}</div>
          </div>
        ))}
      </div>
      <section className="widget-card">
        <header className="widget-card-header">
          <div className="widget-card-title">Daily series</div>
          <div className="widget-card-subtitle">Estimates from audit-event volume; Cloudflare Analytics provides the source-of-truth totals.</div>
        </header>
        <div className="p-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr><th className="text-left">Day</th><th className="text-right">Worker req</th><th className="text-right">D1 reads</th><th className="text-right">D1 writes</th><th className="text-right">Webhooks</th><th className="text-right">Digests</th><th className="text-right">Est. cost</th></tr></thead>
            <tbody>
              {(data.series || []).slice().reverse().map((r: any) => (
                <tr key={r.day}>
                  <td className="font-mono text-[11px]">{r.day}</td>
                  <td className="text-right font-mono">{(r.worker_requests || 0).toLocaleString()}</td>
                  <td className="text-right font-mono">{(r.d1_reads_est  || 0).toLocaleString()}</td>
                  <td className="text-right font-mono">{(r.d1_writes_est || 0).toLocaleString()}</td>
                  <td className="text-right font-mono">{r.webhook_deliveries || 0}</td>
                  <td className="text-right font-mono">{r.digest_sends || 0}</td>
                  <td className="text-right font-mono">${Number(r.est_cost_usd || 0).toFixed(3)}</td>
                </tr>
              ))}
              {!(data.series || []).length && <tr><td colSpan={7} className="text-[#6b7685] italic py-2">No usage rows yet — the daily rollup cron fills these at 00:05 SAST.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ─── API Keys ────────────────────────────────────────────────────────────
function ApiKeysTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [scopes, setScopes] = useState('');
  const load = () => api.get('/api-keys').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const create = async () => {
    if (!name.trim()) return;
    const r = await api.post('/api-keys', { name: name.trim(), scopes: scopes ? scopes.split(',').map((s) => s.trim()).filter(Boolean) : undefined });
    setNewKey(r.data?.data?.key || null);
    setName(''); setScopes('');
    void load();
  };
  const revoke = async (id: string) => {
    if (!confirm('Revoke this API key? Any clients using it will start receiving 401.')) return;
    await api.post(`/api-keys/${id}/revoke`, {});
    void load();
  };
  return (
    <div className="mt-3 space-y-3">
      {newKey && (
        <div className="widget-card p-4 widget-tone-good border border-[#1a8a5b]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[12px] font-bold widget-tone-good-text">API key created — copy it now</div>
              <div className="text-[11px] text-[#3d4756] mt-1">This is the only time the raw key will be shown. Store it in your secret manager before closing this banner.</div>
              <code className="block mt-2 font-mono text-[12px] bg-white border border-[#dde4ec] px-3 py-2 rounded">{newKey}</code>
            </div>
            <button type="button" onClick={() => { void navigator.clipboard.writeText(newKey); }} className="h-8 px-2.5 rounded bg-white border border-[#dde4ec] text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
              <Copy size={13} /> Copy
            </button>
            <button type="button" onClick={() => setNewKey(null)} className="h-8 px-2.5 rounded bg-[#c2873a] text-white text-[12px] font-semibold">Done</button>
          </div>
        </div>
      )}
      <section className="widget-card">
        <header className="widget-card-header">
          <div>
            <div className="widget-card-title">Create new API key</div>
            <div className="widget-card-subtitle">Use the <code>X-OE-API-Key</code> header on any endpoint that opts into apiKeyAuth.</div>
          </div>
        </header>
        <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          <input placeholder="Name (e.g. 'Asset-ops poller')" value={name} onChange={(e) => setName(e.target.value)}
                 className="h-9 px-3 rounded border border-[#dde4ec] text-[12px]" />
          <input placeholder="Scopes (comma-sep, optional)" value={scopes} onChange={(e) => setScopes(e.target.value)}
                 className="h-9 px-3 rounded border border-[#dde4ec] text-[12px] font-mono" />
          <button type="button" onClick={create} disabled={!name.trim()}
                  className="h-9 px-3 rounded bg-[#c2873a] text-white text-[12px] font-semibold disabled:opacity-50">
            Create key
          </button>
        </div>
      </section>
      <section className="widget-card">
        <header className="widget-card-header">
          <div className="widget-card-title">Active keys ({rows.filter((r) => !r.revoked).length})</div>
          <button type="button" onClick={load} className="text-[11px] inline-flex items-center gap-1 text-[#3b82c4]"><RefreshCw size={11} /> Refresh</button>
        </header>
        <div className="p-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr><th className="text-left">Name</th><th className="text-left">Preview</th><th className="text-left">Scopes</th><th className="text-left">Last used</th><th className="text-left">Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="font-mono text-[11px]">{r.key_preview}</td>
                  <td className="font-mono text-[10px]">{r.scopes || '—'}</td>
                  <td className="font-mono text-[11px]">{r.last_used_at ? new Date(r.last_used_at).toLocaleString() : 'never'}</td>
                  <td>
                    {r.revoked
                      ? <span className="px-1.5 py-0.5 rounded text-[10px] widget-tone-bad font-semibold">REVOKED</span>
                      : <span className="px-1.5 py-0.5 rounded text-[10px] widget-tone-good font-semibold">ACTIVE</span>}
                  </td>
                  <td className="text-right">
                    {!r.revoked && (
                      <button type="button" onClick={() => revoke(r.id)} className="text-[11px] text-[#c0392b] hover:underline">Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="text-[#6b7685] italic py-3">No keys yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ─── Webhooks ────────────────────────────────────────────────────────────
const WEBHOOK_EVENTS = [
  'om.fault_detected', 'om.fault_resolved', 'om.work_order_created',
  'om.work_order_completed', 'om.work_order_verified',
  'trade.fill', 'invoice.issued', 'invoice.confirmed',
  'covenant.breached', 'lender.dscr_warning',
];

function WebhooksTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const load = async () => {
    const r = await api.get('/webhooks/subscriptions');
    setRows(r.data?.data || []);
  };
  const loadDeliveries = async (subId: string) => {
    const r = await api.get(`/webhooks/deliveries?subscription_id=${subId}`);
    setDeliveries(r.data?.data || []);
  };
  useEffect(() => { void load(); }, []);
  const create = async () => {
    if (!url.trim() || events.length === 0) return;
    const r = await api.post('/webhooks/subscriptions', { target_url: url.trim(), events });
    setSecret(r.data?.data?.secret || null);
    setUrl(''); setEvents([]);
    void load();
  };
  return (
    <div className="mt-3 space-y-3">
      {secret && (
        <div className="widget-card p-4 widget-tone-good border border-[#1a8a5b]">
          <div className="text-[12px] font-bold widget-tone-good-text">Subscription created — copy the HMAC secret now</div>
          <div className="text-[11px] text-[#3d4756] mt-1">Verify <code>x-oe-signature: sha256=...</code> against this secret in your handler. Shown once.</div>
          <code className="block mt-2 font-mono text-[12px] bg-white border border-[#dde4ec] px-3 py-2 rounded">{secret}</code>
          <button type="button" onClick={() => setSecret(null)} className="mt-2 h-8 px-2.5 rounded bg-[#c2873a] text-white text-[12px] font-semibold">Got it</button>
        </div>
      )}
      <section className="widget-card">
        <header className="widget-card-header">
          <div className="widget-card-title">New webhook subscription</div>
        </header>
        <div className="p-3 space-y-2">
          <input placeholder="https://yourdomain.com/oe-webhook" value={url} onChange={(e) => setUrl(e.target.value)}
                 className="w-full h-9 px-3 rounded border border-[#dde4ec] text-[12px] font-mono" />
          <div className="flex flex-wrap gap-1">
            {WEBHOOK_EVENTS.map((ev) => (
              <button type="button" key={ev}
                onClick={() => setEvents((s) => s.includes(ev) ? s.filter((x) => x !== ev) : [...s, ev])}
                className={`h-6 px-2 rounded-full text-[10px] font-mono ${events.includes(ev) ? 'bg-[#c2873a] text-white' : 'bg-white border border-[#dde4ec] text-[#3d4756]'}`}>
                {ev}
              </button>
            ))}
          </div>
          <button type="button" onClick={create} disabled={!url || events.length === 0}
                  className="h-9 px-3 rounded bg-[#c2873a] text-white text-[12px] font-semibold disabled:opacity-50">
            Subscribe
          </button>
        </div>
      </section>
      <section className="widget-card">
        <header className="widget-card-header">
          <div className="widget-card-title">Active subscriptions ({rows.filter((r) => r.enabled).length})</div>
        </header>
        <div className="p-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr><th className="text-left">Target URL</th><th className="text-left">Events</th><th className="text-left">Last status</th><th className="text-left">Failures</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-[11px] truncate max-w-[300px]" title={r.target_url}>{r.target_url}</td>
                  <td className="text-[10px]">{(JSON.parse(r.events || '[]') as string[]).length} events</td>
                  <td className="font-mono text-[11px]">{r.last_status_code ? `HTTP ${r.last_status_code}` : '—'}</td>
                  <td className="text-right font-mono">{r.consecutive_failures || 0}</td>
                  <td className="text-right space-x-2">
                    <button type="button" onClick={async () => { await api.post(`/webhooks/subscriptions/${r.id}/test`, {}); void loadDeliveries(r.id); }} className="text-[11px] text-[#3b82c4]">Test</button>
                    <button type="button" onClick={() => loadDeliveries(r.id)} className="text-[11px] text-[#3d4756]">Deliveries</button>
                    {r.enabled === 1 && (
                      <button type="button" onClick={async () => { await api.post(`/webhooks/subscriptions/${r.id}/disable`, {}); void load(); }} className="text-[11px] text-[#c0392b]">Disable</button>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="text-[#6b7685] italic py-3">No subscriptions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {deliveries.length > 0 && (
        <section className="widget-card">
          <header className="widget-card-header">
            <div className="widget-card-title">Recent deliveries</div>
          </header>
          <ul className="divide-y divide-[#eef2f7]">
            {deliveries.map((d) => (
              <li key={d.id} className="px-3 py-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${d.status === 'delivered' ? 'widget-tone-good' : 'widget-tone-bad'}`}>{d.status}</span>
                  <span className="font-mono">{d.event}</span>
                  <span className="text-[#6b7685] ml-auto">{new Date(d.created_at).toLocaleString()}</span>
                  {d.status_code != null && <span className="font-mono">HTTP {d.status_code}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─── Digests ─────────────────────────────────────────────────────────────
function DigestsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'sms'>('email');
  const [destination, setDestination] = useState('');
  const [type, setType] = useState('morning_briefing');
  const [hour, setHour] = useState(7);
  const load = () => api.get('/digests/subscriptions').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const create = async () => {
    if (!destination.trim()) return;
    await api.post('/digests/subscriptions', {
      channel, destination: destination.trim(), digest_type: type, send_hour_sast: hour,
    });
    setDestination('');
    void load();
  };
  const disable = async (id: string) => { await api.post(`/digests/subscriptions/${id}/disable`, {}); void load(); };
  const sendNow = async (id: string) => { const r = await api.post(`/digests/subscriptions/${id}/send-now`, {}); alert(`Status: ${r.data?.data?.status || 'unknown'}`); void load(); };
  return (
    <div className="mt-3 space-y-3">
      <section className="widget-card">
        <header className="widget-card-header">
          <div className="widget-card-title">New digest subscription</div>
          <div className="widget-card-subtitle">Provider delivery requires EMAIL_API_KEY / TWILIO_AUTH env vars; before that, deliveries are logged as "would_send".</div>
        </header>
        <div className="p-3 grid grid-cols-2 md:grid-cols-5 gap-2">
          <select value={channel} onChange={(e) => setChannel(e.target.value as any)} className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]">
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
          </select>
          <input placeholder={channel === 'email' ? 'you@example.com' : '+27821234567'} value={destination} onChange={(e) => setDestination(e.target.value)}
                 className="h-9 px-3 rounded border border-[#dde4ec] text-[12px] font-mono col-span-2" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]">
            <option value="morning_briefing">Morning briefing</option>
            <option value="weekly_summary">Weekly summary</option>
            <option value="lender_monthly">Lender monthly</option>
            <option value="offtaker_weekly">Offtaker weekly</option>
          </select>
          <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))}
                 placeholder="Hour SAST" className="h-9 px-2 rounded border border-[#dde4ec] text-[12px] font-mono" />
        </div>
        <div className="px-3 pb-3"><button type="button" onClick={create} className="h-9 px-3 rounded bg-[#c2873a] text-white text-[12px] font-semibold">Subscribe</button></div>
      </section>
      <section className="widget-card">
        <header className="widget-card-header"><div className="widget-card-title">Subscriptions</div></header>
        <div className="p-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr><th className="text-left">Channel</th><th className="text-left">Destination</th><th className="text-left">Type</th><th className="text-left">Hour (SAST)</th><th className="text-left">Last sent</th><th className="text-left">Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="capitalize">{r.channel}</td>
                  <td className="font-mono text-[11px]">{r.destination}</td>
                  <td className="font-mono text-[11px]">{r.digest_type}</td>
                  <td className="font-mono">{String(r.send_hour_sast).padStart(2, '0')}:00</td>
                  <td className="font-mono text-[11px]">{r.last_sent_at ? new Date(r.last_sent_at).toLocaleString() : 'never'}</td>
                  <td>{r.enabled === 1
                    ? <span className="px-1.5 py-0.5 rounded text-[10px] widget-tone-good font-semibold">ACTIVE</span>
                    : <span className="px-1.5 py-0.5 rounded text-[10px] widget-tone-bad font-semibold">DISABLED</span>}</td>
                  <td className="text-right space-x-2">
                    <button type="button" onClick={() => sendNow(r.id)} className="text-[11px] text-[#3b82c4]">Send now</button>
                    {r.enabled === 1 && (
                      <button type="button" onClick={() => disable(r.id)} className="text-[11px] text-[#c0392b]">Disable</button>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="text-[#6b7685] italic py-3">No subscriptions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ─── Saved filters ───────────────────────────────────────────────────────
function SavedFiltersTab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api.get('/saved-filters').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const grouped = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of rows) {
      const arr = m.get(r.surface) || [];
      arr.push(r); m.set(r.surface, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  const del = async (id: string) => {
    if (!confirm('Delete this saved filter?')) return;
    await api.delete(`/saved-filters/${id}`).catch(() => null);
    void load();
  };
  return (
    <div className="mt-3 space-y-3">
      <section className="widget-card">
        <header className="widget-card-header">
          <div className="widget-card-title">Saved filters</div>
          <div className="widget-card-subtitle">Filters saved from list pages (Faults, Work orders, Invoices, ...). Default-marked filters auto-apply on visit.</div>
        </header>
        {grouped.length === 0 ? (
          <div className="widget-empty">No saved filters yet — apply filters on any list page and tap "Save view".</div>
        ) : grouped.map(([surface, list]) => (
          <div key={surface}>
            <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-[#6b7685] font-bold bg-[#f8fafc] border-t border-b border-[#eef2f7]">{surface}</div>
            <ul className="divide-y divide-[#eef2f7]">
              {list.map((r: any) => (
                <li key={r.id} className="px-3 py-2 flex items-center gap-2 text-[12px]">
                  <span className="font-semibold text-[#0f1c2e] flex-1">{r.name}</span>
                  {r.is_default === 1 && <span className="px-1.5 py-0.5 rounded text-[10px] widget-tone-info font-semibold">default</span>}
                  {r.shared === 1 && <span className="px-1.5 py-0.5 rounded text-[10px] widget-tone-good font-semibold">shared</span>}
                  <span className="font-mono text-[10px] text-[#6b7685]">used {r.use_count || 0}×</span>
                  <button type="button" onClick={() => del(r.id)} className="text-[11px] text-[#c0392b]">Delete</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

export default PlatformSettingsPage;
