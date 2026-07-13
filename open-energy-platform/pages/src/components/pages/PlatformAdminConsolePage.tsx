// ════════════════════════════════════════════════════════════════════════
// PlatformAdminConsolePage — /admin/platform-console
//
// One operator console covering the cross-cutting platform machinery:
//   • Feature flags     — read + admin update with rollout % and overrides
//   • RUM dashboard     — last-7-day metric / page rollup from /api/polish/rum/summary
//   • Signatures        — search Ed25519 signatures by document_kind + document_ref
//   • AI sessions       — admin view of caller's recent AI sessions for triage
//
// Step-up gating is enforced server-side on the mutation endpoints.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Layers, ToggleLeft, Activity, FileSignature, Bot, Save, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';

type Flag = {
  key: string;
  description?: string;
  default_enabled: number;
  rollout_pct: number;
  role_overrides?: string;
  participant_allowlist?: string;
  participant_blocklist?: string;
  killed: number;
};

type RumRow = { metric: string; page_path: string; n: number; avg_v: number | null; min_v: number | null; max_v: number | null };

type Sig = {
  id: string; document_kind: string; document_ref: string; document_hash: string;
  signer_id: string; signer_role: string | null; signed_at: string; signing_method: string;
  signature_b64: string; public_key_b64: string;
};

type AiSession = { id: string; surface: string | null; started_at: string; pinned: number; closed_at: string | null };

type Tab = 'flags' | 'rum' | 'signatures' | 'ai';

export function PlatformAdminConsolePage() {
  const [tab, setTab] = useState<Tab>('flags');
  return (
    <StitchPage
      eyebrowIcon={Layers}
      eyebrowLabel="Platform · admin console"
      title="Platform admin console"
      subtitle="Feature flags, RUM telemetry, document signatures and AI assistant sessions in one place."
    >
      <div className="flex flex-wrap gap-1 mb-3" style={{ borderBottom: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
        {([
          ['flags', 'Feature flags', ToggleLeft],
          ['rum', 'RUM dashboard', Activity],
          ['signatures', 'Signatures', FileSignature],
          ['ai', 'AI sessions', Bot],
        ] as const).map(([k, label, Icon]) => (
          <button type="button"
            key={k}
            onClick={() => setTab(k)}
            className="h-9 px-3 text-[12px] font-semibold inline-flex items-center gap-1.5 border-b-2 -mb-px"
            style={tab === k
              ? { borderColor: 'var(--accent, oklch(0.46 0.16 55))', color: 'var(--accent, oklch(0.46 0.16 55))' }
              : { borderColor: 'transparent', color: 'var(--ink-2, oklch(0.40 0.009 250))' }
            }
          >
            <Icon size={13}/> {label}
          </button>
        ))}
      </div>
      {tab === 'flags' && <FlagsTab/>}
      {tab === 'rum' && <RumTab/>}
      {tab === 'signatures' && <SignaturesTab/>}
      {tab === 'ai' && <AiSessionsTab/>}
    </StitchPage>
  );
}

function FlagsTab() {
  const [raw, setRaw] = useState<Flag[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, Partial<Flag>>>({});

  const load = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.get('/polish/feature-flags');
      const j = r.data;
      if (!j.success) throw new Error(j.error || 'load failed');
      setRaw(j.data.raw || []);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'load failed'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);

  const save = async (key: string) => {
    const cur = raw.find((f) => f.key === key);
    if (!cur) return;
    const merged: any = { ...cur, ...edit[key] };
    setBusy(true); setErr(null); setAck(null);
    try {
      const r = await api.put(`/polish/feature-flags/${encodeURIComponent(key)}`, {
        description: merged.description,
        default_enabled: Number(merged.default_enabled) ? true : false,
        rollout_pct: Number(merged.rollout_pct || 0),
        killed: Number(merged.killed) ? true : false,
      });
      const j = r.data;
      if (!j.success) {
        if (j.step_up_required) throw new Error('Step-up auth required — sign out + back in or complete a fresh MFA challenge.');
        throw new Error(j.error || 'save failed');
      }
      setAck(`Saved ${key}`);
      setEdit((e) => { const n = { ...e }; delete n[key]; return n; });
      await load();
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.step_up_required) setErr('Step-up auth required for this change.');
      else setErr(data?.error || e?.message || 'save failed');
    }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-[13px] font-semibold" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>Feature flags</div>
        <span className="text-[11px]" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>— {raw.length} configured</span>
        <button type="button" onClick={load} className="ml-auto h-8 px-2 rounded text-[11px] inline-flex items-center gap-1"
                style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
          <RefreshCw size={11}/> Refresh
        </button>
      </div>
      {err && <div className="text-[12px] inline-flex items-center gap-1" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}><AlertCircle size={13}/> {err}</div>}
      {ack && <div className="text-[12px] inline-flex items-center gap-1" style={{ color: 'var(--good, oklch(0.45 0.15 150))' }}><CheckCircle2 size={13}/> {ack}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))', borderBottom: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
              <th className="py-1.5">Key</th>
              <th className="py-1.5">Description</th>
              <th className="py-1.5 text-center">Default</th>
              <th className="py-1.5 text-right">Rollout %</th>
              <th className="py-1.5 text-center">Killed</th>
              <th className="py-1.5 text-right">Save</th>
            </tr>
          </thead>
          <tbody>
            {raw.map((f) => {
              const e: any = edit[f.key] || {};
              const merged = { ...f, ...e };
              const dirty = Object.keys(e).length > 0;
              return (
                <tr key={f.key} style={{ borderBottom: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
                  <td className="py-2 font-mono">{f.key}</td>
                  <td className="py-2 max-w-md">
                    <input className="w-full h-7 px-1 rounded text-[11px]"
                           style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}
                           value={merged.description || ''}
                           onChange={(ev) => setEdit({ ...edit, [f.key]: { ...e, description: ev.target.value } })}/>
                  </td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={Number(merged.default_enabled) === 1}
                           onChange={(ev) => setEdit({ ...edit, [f.key]: { ...e, default_enabled: ev.target.checked ? 1 : 0 } })}/>
                  </td>
                  <td className="py-2 text-right">
                    <input type="number" min={0} max={100}
                           className="w-16 h-7 px-1 rounded text-[11px] text-right font-mono"
                           style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}
                           value={Number(merged.rollout_pct || 0)}
                           onChange={(ev) => setEdit({ ...edit, [f.key]: { ...e, rollout_pct: Number(ev.target.value) } })}/>
                  </td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={Number(merged.killed) === 1}
                           onChange={(ev) => setEdit({ ...edit, [f.key]: { ...e, killed: ev.target.checked ? 1 : 0 } })}/>
                  </td>
                  <td className="py-2 text-right">
                    <button type="button" disabled={!dirty || busy} onClick={() => save(f.key)}
                            className="h-7 px-2 rounded text-white text-[11px] font-semibold disabled:opacity-40 inline-flex items-center gap-1"
                            style={{ background: 'var(--accent, oklch(0.46 0.16 55))' }}>
                      <Save size={11}/> Save
                    </button>
                  </td>
                </tr>
              );
            })}
            {raw.length === 0 && <tr><td colSpan={6} className="py-2 italic" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>No feature flags configured.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RumTab() {
  const [rows, setRows] = useState<RumRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const load = async () => {
    setErr(null);
    try {
      const r = await api.get('/polish/rum/summary');
      const j = r.data;
      if (!j.success) throw new Error(j.error || 'load failed');
      setRows(j.data || []);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'load failed'); }
  };
  useEffect(() => { void load(); }, []);
  const filtered = filter ? rows.filter((r) => r.metric.includes(filter) || r.page_path.includes(filter)) : rows;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-[13px] font-semibold" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>RUM — last 7 days</div>
        <input placeholder="filter by metric or path" className="ml-auto h-8 px-2 rounded text-[11px] w-64"
               style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}
               value={filter} onChange={(e) => setFilter(e.target.value)}/>
        <button type="button" onClick={load} className="h-8 px-2 rounded text-[11px] inline-flex items-center gap-1"
                style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
          <RefreshCw size={11}/> Refresh
        </button>
      </div>
      {err && <div className="text-[12px]" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}>{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))', borderBottom: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
              <th className="py-1.5">Metric</th>
              <th className="py-1.5">Page</th>
              <th className="py-1.5 text-right">n</th>
              <th className="py-1.5 text-right">avg</th>
              <th className="py-1.5 text-right">min</th>
              <th className="py-1.5 text-right">max</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
                <td className="py-1.5 font-mono">{r.metric}</td>
                <td className="py-1.5 font-mono">{r.page_path}</td>
                <td className="py-1.5 text-right font-mono">{r.n}</td>
                <td className="py-1.5 text-right font-mono">{r.avg_v != null ? Number(r.avg_v).toFixed(1) : '—'}</td>
                <td className="py-1.5 text-right font-mono">{r.min_v != null ? Number(r.min_v).toFixed(1) : '—'}</td>
                <td className="py-1.5 text-right font-mono">{r.max_v != null ? Number(r.max_v).toFixed(1) : '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="py-2 italic" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>No RUM data yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SignaturesTab() {
  const [docKind, setDocKind] = useState('');
  const [docRef, setDocRef] = useState('');
  const [rows, setRows] = useState<Sig[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    if (!docKind || !docRef) { setErr('document_kind + document_ref required'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.get('/polish/signatures', { params: { document_kind: docKind, document_ref: docRef } });
      const j = r.data;
      if (!j.success) throw new Error(j.error || 'lookup failed');
      setRows(j.data || []);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'lookup failed'); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-3">
      <div className="text-[13px] font-semibold" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>Document signatures</div>
      <p className="text-[12px]" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>
        Look up Ed25519 signatures attached to any signed document.
      </p>
      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-[11px] font-semibold" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>
          Document kind
          <input className="block mt-1 h-8 px-2 rounded text-[11px] w-48 font-mono"
                 style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}
                 placeholder="e.g. ppa, decision, invoice"
                 value={docKind} onChange={(e) => setDocKind(e.target.value)}/>
        </label>
        <label className="text-[11px] font-semibold" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>
          Document ref
          <input className="block mt-1 h-8 px-2 rounded text-[11px] w-64 font-mono"
                 style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}
                 value={docRef} onChange={(e) => setDocRef(e.target.value)}/>
        </label>
        <button type="button" disabled={busy} onClick={load}
                className="h-8 px-3 rounded text-white text-[11px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--accent, oklch(0.46 0.16 55))' }}>
          {busy ? 'Loading…' : 'Look up'}
        </button>
      </div>
      {err && <div className="text-[12px]" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}>{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))', borderBottom: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
              <th className="py-1.5">Signed</th>
              <th className="py-1.5">Signer</th>
              <th className="py-1.5">Role</th>
              <th className="py-1.5">Method</th>
              <th className="py-1.5">Hash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
                <td className="py-1.5 font-mono">{new Date(s.signed_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</td>
                <td className="py-1.5 font-mono">{s.signer_id}</td>
                <td className="py-1.5">{s.signer_role || '—'}</td>
                <td className="py-1.5">{s.signing_method}</td>
                <td className="py-1.5 font-mono text-[10px] break-all max-w-md">{s.document_hash}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="py-2 italic" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>No signatures shown — query above to load.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AiSessionsTab() {
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    setErr(null);
    try {
      const r = await api.get('/ai-assistant/sessions');
      const j = r.data;
      if (!j.success) throw new Error(j.error || 'load failed');
      setSessions(j.data || []);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'load failed'); }
  };
  useEffect(() => { void load(); }, []);
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-[13px] font-semibold" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>Recent AI sessions</div>
        <button type="button" onClick={load} className="ml-auto h-8 px-2 rounded text-[11px] inline-flex items-center gap-1"
                style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
          <RefreshCw size={11}/> Refresh
        </button>
      </div>
      {err && <div className="text-[12px]" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}>{err}</div>}
      <ul className="text-[12px]" style={{ borderTop: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
        {sessions.map((s) => (
          <li key={s.id} className="py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
            <div className="font-mono text-[11px]">{s.id}</div>
            <div style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>surface={s.surface || '—'}</div>
            <div style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>started {new Date(s.started_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>
            {s.pinned ? <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--s1, oklch(0.96 0.003 250))', color: 'var(--accent, oklch(0.46 0.16 55))' }}>pinned</span> : null}
            {s.closed_at ? <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: 'var(--s1, oklch(0.96 0.003 250))', color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>closed</span> : null}
          </li>
        ))}
        {sessions.length === 0 && <li className="py-2 italic" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>No sessions yet.</li>}
      </ul>
    </section>
  );
}
