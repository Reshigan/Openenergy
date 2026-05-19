// ════════════════════════════════════════════════════════════════════════
// ComplianceAdminPage — /settings/compliance-admin
//
// Operator-side compliance dashboard. Distinct from ComplianceSettingsPage
// (the user-facing self-service surface). Tabs:
//   • Info Officer  — POPIA dashboard: SAR pipeline, retention policies
//   • SARs          — Subject Access Request queue with 30-day SLA
//   • KYC review    — Pending KYC + screening review + tier upgrades
//   • Devices       — Trusted device & WebAuthn key inventory
//   • Lockouts      — Active MFA lockouts + manual clear
//   • Submissions   — NERSA/SARS regulator submission tracking
//   • Incidents     — Status page incident management
//   • Maintenance   — Status page scheduled maintenance
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Calendar, FileCheck, FileText, Lock, ShieldAlert,
  ShieldCheck, Smartphone, Unlock, Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';

type Tab = 'info-officer' | 'sar' | 'kyc-review' | 'devices' | 'lockouts' | 'submissions' | 'incidents' | 'maintenance';

export function ComplianceAdminPage() {
  const [tab, setTab] = useState<Tab>('info-officer');
  return (
    <StitchPage
      eyebrowIcon={ShieldCheck}
      eyebrowLabel="Compliance · Admin"
      title="Compliance operations"
      subtitle="POPIA Info Officer dashboard, KYC review queue, MFA lockouts, regulator submission tracking, status incident management."
    >
      <div className="border-b border-[#dde4ec] flex flex-wrap gap-1">
        {([
          { k: 'info-officer', label: 'Info Officer',  icon: <ShieldCheck size={13} /> },
          { k: 'sar',          label: 'SARs',          icon: <FileText    size={13} /> },
          { k: 'kyc-review',   label: 'KYC review',    icon: <Users       size={13} /> },
          { k: 'devices',      label: 'Devices',       icon: <Smartphone  size={13} /> },
          { k: 'lockouts',     label: 'Lockouts',      icon: <Lock        size={13} /> },
          { k: 'submissions',  label: 'Submissions',   icon: <FileCheck   size={13} /> },
          { k: 'incidents',    label: 'Incidents',     icon: <ShieldAlert size={13} /> },
          { k: 'maintenance',  label: 'Maintenance',   icon: <Calendar    size={13} /> },
        ] as Array<{ k: Tab; label: string; icon: React.ReactNode }>).map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`h-10 px-3 text-[12px] font-semibold inline-flex items-center gap-1 border-b-2 transition-colors ${tab === t.k ? 'border-[#3b82c4] text-[#3b82c4]' : 'border-transparent text-[#6b7685] hover:text-[#0f1c2e]'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'info-officer' && <InfoOfficerTab />}
      {tab === 'sar'          && <SarTab />}
      {tab === 'kyc-review'   && <KycReviewTab />}
      {tab === 'devices'      && <DevicesTab />}
      {tab === 'lockouts'     && <LockoutsTab />}
      {tab === 'submissions'  && <SubmissionsTab />}
      {tab === 'incidents'    && <IncidentsTab />}
      {tab === 'maintenance'  && <MaintenanceTab />}
    </StitchPage>
  );
}

// ─── Info Officer ────────────────────────────────────────────────────────
function InfoOfficerTab() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { void api.get('/popia-deep/dashboard').then((r) => setData(r.data?.data)).catch(() => setData(null)); }, []);
  if (!data) return <div className="widget-card widget-empty mt-3">Loading dashboard…</div>;
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile label="PII access (30d)"    value={data.pii_access_30d.toLocaleString()} tone="info" />
        <Tile label="Consent withdrawals" value={data.consent_withdrawals_30d.toLocaleString()} tone="amber" />
        <Tile label="Open SARs"           value={String((data.sar_pipeline.find((s: any) => s.status === 'open')?.c) || 0)} tone="info" />
        <Tile label="Overdue SARs"        value={String((data.sar_pipeline.reduce((acc: number, s: any) => acc + (s.overdue || 0), 0)))} tone="bad" />
      </div>
      <Section title="SAR pipeline">
        <Table headers={['Status', 'Count', 'Overdue']}>
          {data.sar_pipeline.map((s: any) => (
            <tr key={s.status}><td>{s.status}</td><td className="text-right font-mono">{s.c}</td><td className={`text-right font-mono ${s.overdue > 0 ? 'widget-tone-bad-text' : ''}`}>{s.overdue || 0}</td></tr>
          ))}
        </Table>
      </Section>
      <Section title="Retention policies">
        <Table headers={['Data type', 'Retention', 'Lawful basis', 'Reference']}>
          {data.retention_policies.map((p: any) => (
            <tr key={p.data_type}>
              <td>{p.data_type}</td>
              <td className="font-mono">{p.retention_days}d</td>
              <td className="capitalize">{p.lawful_basis.replace(/_/g, ' ')}</td>
              <td className="font-mono text-[10px]">{p.legal_reference || '—'}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}

// ─── SARs ───────────────────────────────────────────────────────────────
function SarTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const load = () => api.get(`/popia-deep/sar${filter === 'all' ? '' : `?status=${filter}`}`).then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, [filter]);
  const respond = async (id: string, outcome: 'fulfilled' | 'rejected') => {
    const summary = prompt(outcome === 'rejected' ? 'Rejection reason:' : 'Response summary:') || '';
    if (!summary) return;
    await api.post(`/popia-deep/sar/${id}/respond`, { outcome, response_summary: outcome === 'fulfilled' ? summary : null, rejection_reason: outcome === 'rejected' ? summary : null });
    void load();
  };
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-1 text-[11px]">
        {['all', 'open', 'in_progress', 'fulfilled', 'rejected', 'escalated'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
                  className={`h-7 px-2.5 rounded-full font-semibold border ${filter === s ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]' : 'bg-white border-[#dde4ec]'}`}>
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <Section title={`SAR queue (${rows.length})`}>
        <Table headers={['Received', 'Type', 'Subject', 'Status', 'Due', '']}>
          {rows.map((s) => {
            const overdue = new Date(s.due_at).getTime() < Date.now() && !['fulfilled', 'rejected'].includes(s.status);
            return (
              <tr key={s.id}>
                <td className="font-mono text-[10px]">{new Date(s.received_at).toLocaleDateString()}</td>
                <td className="capitalize">{s.request_type}</td>
                <td className="font-mono text-[11px]">{s.subject_email}</td>
                <td><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                  s.status === 'fulfilled' ? 'widget-tone-good' : s.status === 'rejected' ? 'widget-tone-bad' :
                  s.status === 'escalated' ? 'widget-tone-bad' : 'widget-tone-amber'
                }`}>{s.status.replace(/_/g, ' ')}</span></td>
                <td className={`font-mono text-[10px] ${overdue ? 'widget-tone-bad-text' : ''}`}>{new Date(s.due_at).toLocaleDateString()}{overdue ? ' ⚠' : ''}</td>
                <td className="text-right space-x-2">
                  {!['fulfilled', 'rejected'].includes(s.status) && (
                    <>
                      <button onClick={() => respond(s.id, 'fulfilled')} className="text-[11px] text-[#1a8a5b] font-semibold">Fulfil</button>
                      <button onClick={() => respond(s.id, 'rejected')}  className="text-[11px] text-[#c0392b] font-semibold">Reject</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={6} className="text-[#6b7685] italic py-3">No SARs in this state.</td></tr>}
        </Table>
      </Section>
    </div>
  );
}

// ─── KYC review (tier upgrades + screening) ─────────────────────────────
function KycReviewTab() {
  const [pending, setPending] = useState<any[]>([]);
  const [screenName, setScreenName] = useState('');
  const [screenResult, setScreenResult] = useState<any>(null);
  useEffect(() => {
    void api.get('/kyc/submissions?status=pending').then((r) => setPending(r.data?.data || []));
  }, []);
  const screen = async () => {
    if (!screenName.trim()) return;
    const r = await api.post('/kyc-deep/screening', { full_name: screenName.trim() });
    setScreenResult(r.data?.data);
  };
  return (
    <div className="mt-3 space-y-3">
      <Section title="PEP / sanctions screen">
        <div className="p-3 flex gap-2 items-center">
          <input value={screenName} onChange={(e) => setScreenName(e.target.value)} placeholder="Full legal name"
                 className="h-9 flex-1 px-3 rounded border border-[#dde4ec] text-[12px]" />
          <button onClick={screen} className="h-9 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold">Screen</button>
        </div>
        {screenResult && (
          <div className="p-3 border-t border-[#eef2f7] text-[12px]">
            {screenResult.cleared ? (
              <div className="widget-tone-good-text font-semibold">✓ No matches against UN / OFAC / EU / UK / SA-PEP lists</div>
            ) : (
              <>
                <div className="widget-tone-bad-text font-semibold">⚠ {screenResult.matches.length} potential match{screenResult.matches.length === 1 ? '' : 'es'}</div>
                <ul className="mt-1 text-[11px] space-y-1">
                  {screenResult.matches.map((m: any, i: number) => (
                    <li key={i} className="font-mono">
                      {m.list} · {m.name} ({(m.score * 100).toFixed(0)}% match){m.country ? ` · ${m.country}` : ''}{m.designation ? ` · ${m.designation}` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Section>
      <Section title={`Pending KYC documents (${pending.length})`}>
        <Table headers={['Participant', 'Type', 'Submitted', 'Status']}>
          {pending.map((p) => (
            <tr key={p.id}>
              <td>{p.participant_name || p.participant_id}</td>
              <td className="font-mono text-[11px]">{p.document_type}</td>
              <td className="font-mono text-[11px]">{new Date(p.submitted_at).toLocaleDateString()}</td>
              <td>
                <span className="px-1.5 py-0.5 rounded text-[10px] widget-tone-amber font-bold uppercase">{p.status}</span>
              </td>
            </tr>
          ))}
          {!pending.length && <tr><td colSpan={4} className="text-[#6b7685] italic py-3">Nothing pending.</td></tr>}
        </Table>
      </Section>
    </div>
  );
}

// ─── Devices ────────────────────────────────────────────────────────────
function DevicesTab() {
  const [keys, setKeys] = useState<any[]>([]);
  const [devs, setDevs] = useState<any[]>([]);
  const load = async () => {
    const [k, d] = await Promise.all([api.get('/auth-deep/webauthn/credentials'), api.get('/auth-deep/devices')]);
    setKeys(k.data?.data || []);
    setDevs(d.data?.data || []);
  };
  useEffect(() => { void load(); }, []);
  return (
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
      <Section title={`WebAuthn keys (${keys.filter((k) => !k.revoked_at).length})`}>
        <Table headers={['Device', 'Last used', 'Created', '']}>
          {keys.map((k) => (
            <tr key={k.id}>
              <td>{k.device_name}{k.revoked_at && <span className="ml-1 text-[10px] widget-tone-bad font-semibold rounded px-1">REVOKED</span>}</td>
              <td className="font-mono text-[10px]">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'never'}</td>
              <td className="font-mono text-[10px]">{new Date(k.created_at).toLocaleDateString()}</td>
              <td className="text-right">
                {!k.revoked_at && (
                  <button onClick={async () => { await api.post(`/auth-deep/webauthn/credentials/${k.id}/revoke`, {}); void load(); }}
                          className="text-[11px] text-[#c0392b]">Revoke</button>
                )}
              </td>
            </tr>
          ))}
          {!keys.length && <tr><td colSpan={4} className="text-[#6b7685] italic py-3">No keys enrolled.</td></tr>}
        </Table>
      </Section>
      <Section title={`Trusted devices (${devs.filter((d) => !d.revoked).length})`}>
        <Table headers={['Label', 'IP', 'Expires', '']}>
          {devs.map((d) => (
            <tr key={d.id}>
              <td>{d.device_label}{d.revoked === 1 && <span className="ml-1 text-[10px] widget-tone-bad font-semibold rounded px-1">REVOKED</span>}</td>
              <td className="font-mono text-[10px]">{d.ip || '—'}</td>
              <td className="font-mono text-[10px]">{new Date(d.expires_at).toLocaleDateString()}</td>
              <td className="text-right">
                {d.revoked !== 1 && (
                  <button onClick={async () => { await api.post(`/auth-deep/devices/${d.id}/revoke`, {}); void load(); }}
                          className="text-[11px] text-[#c0392b]">Revoke</button>
                )}
              </td>
            </tr>
          ))}
          {!devs.length && <tr><td colSpan={4} className="text-[#6b7685] italic py-3">No trusted devices.</td></tr>}
        </Table>
      </Section>
    </div>
  );
}

// ─── Lockouts (admin) ───────────────────────────────────────────────────
function LockoutsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api.get('/auth-deep/lockouts').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const clear = async (pid: string) => {
    if (!confirm(`Clear all MFA lockouts for ${pid}?`)) return;
    await api.post(`/auth-deep/lockouts/${pid}/clear`, {});
    void load();
  };
  return (
    <div className="mt-3">
      <Section title={`Active lockouts (${rows.length})`}>
        <Table headers={['Participant', 'IP', 'Attempts', 'Locked until', '']}>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="font-mono text-[11px]">{r.participant_id}</td>
              <td className="font-mono text-[11px]">{r.ip}</td>
              <td className="text-right font-mono">{r.attempts}</td>
              <td className="font-mono text-[10px]">{r.locked_until ? new Date(r.locked_until).toLocaleString() : '—'}</td>
              <td className="text-right"><button onClick={() => clear(r.participant_id)} className="text-[11px] text-[#1a8a5b] inline-flex items-center gap-1"><Unlock size={11} /> Clear</button></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="text-[#6b7685] italic py-3">No active lockouts — good.</td></tr>}
        </Table>
      </Section>
    </div>
  );
}

// ─── Submissions ────────────────────────────────────────────────────────
function SubmissionsTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api.get('/reports-deep/submissions').then((r) => setRows(r.data?.data || [])); }, []);
  return (
    <div className="mt-3">
      <Section title="Regulator submissions">
        <div className="p-2 text-[11px] text-[#6b7685]">
          Submissions go via the Regulator Packs tab on /settings/compliance. This view tracks ack receipts + resubmission chains.
        </div>
        <Table headers={['Kind', 'Submitted to', 'Submitted at', 'Status', 'Ack ID']}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-mono text-[11px]">{r.report_kind}</td>
              <td>{r.submitted_to}</td>
              <td className="font-mono text-[10px]">{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'}</td>
              <td><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                r.status === 'accepted'   ? 'widget-tone-good' :
                r.status === 'rejected'   ? 'widget-tone-bad'  :
                r.status === 'acknowledged' ? 'widget-tone-info' : 'widget-tone-amber'
              }`}>{r.status}</span></td>
              <td className="font-mono text-[10px]">{r.acknowledgment_id || '—'}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="text-[#6b7685] italic py-3">No submissions yet.</td></tr>}
        </Table>
      </Section>
    </div>
  );
}

// ─── Incidents (status admin) ───────────────────────────────────────────
function IncidentsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState({ title: '', body: '', severity: 'minor' as 'info' | 'minor' | 'major' | 'critical', components: '' });
  const load = () => api.get('/status-admin/incidents').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const create = async () => {
    if (!draft.title || !draft.components) return;
    await api.post('/status-admin/incidents', {
      title: draft.title, body: draft.body, severity: draft.severity,
      affected_components: draft.components.split(',').map((s) => s.trim()).filter(Boolean),
    });
    setDraft({ title: '', body: '', severity: 'minor', components: '' });
    void load();
  };
  const update = async (id: string, status: string) => {
    const message = prompt('Update message:') || '';
    if (!message) return;
    await api.post(`/status-admin/incidents/${id}/update`, { status, message });
    void load();
  };
  return (
    <div className="mt-3 space-y-3">
      <Section title="Open an incident">
        <div className="p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
          <input placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                 className="h-9 px-2 rounded border border-[#dde4ec] text-[12px] md:col-span-2" />
          <select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value as any })}
                  className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]">
            <option value="info">info</option><option value="minor">minor</option><option value="major">major</option><option value="critical">critical</option>
          </select>
          <input placeholder="Components (comma-sep)" value={draft.components} onChange={(e) => setDraft({ ...draft, components: e.target.value })}
                 className="h-9 px-2 rounded border border-[#dde4ec] text-[12px] font-mono" />
          <input placeholder="Body (optional)" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                 className="h-9 px-2 rounded border border-[#dde4ec] text-[12px] md:col-span-3" />
          <button onClick={create} className="h-9 px-3 rounded bg-[#c0392b] text-white text-[12px] font-semibold">Open incident</button>
        </div>
      </Section>
      <Section title={`Incidents (last 30 days)`}>
        <Table headers={['Started', 'Title', 'Severity', 'Status', '']}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-mono text-[10px]">{new Date(r.started_at).toLocaleString()}</td>
              <td>{r.title}</td>
              <td><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                r.severity === 'critical' ? 'widget-tone-bad' :
                r.severity === 'major' ? 'widget-tone-amber' : 'widget-tone-info'
              }`}>{r.severity}</span></td>
              <td><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                r.status === 'resolved' || r.status === 'postmortem_published' ? 'widget-tone-good' : 'widget-tone-amber'
              }`}>{r.status.replace(/_/g, ' ')}</span></td>
              <td className="text-right space-x-2">
                {!['resolved', 'postmortem_published'].includes(r.status) && (
                  <>
                    <button onClick={() => update(r.id, 'identified')} className="text-[11px]">→ Identified</button>
                    <button onClick={() => update(r.id, 'monitoring')} className="text-[11px]">→ Monitoring</button>
                    <button onClick={() => update(r.id, 'resolved')}   className="text-[11px] widget-tone-good-text font-semibold">Resolve</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="text-[#6b7685] italic py-3">No incidents.</td></tr>}
        </Table>
      </Section>
    </div>
  );
}

// ─── Maintenance windows ───────────────────────────────────────────────
function MaintenanceTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState({ title: '', components: '', starts_at: '', ends_at: '' });
  const load = () => api.get('/status-admin/maintenance').then((r) => setRows(r.data?.data || []));
  useEffect(() => { void load(); }, []);
  const create = async () => {
    if (!draft.title || !draft.starts_at || !draft.ends_at) return;
    await api.post('/status-admin/maintenance', {
      title: draft.title,
      starts_at: new Date(draft.starts_at).toISOString(),
      ends_at: new Date(draft.ends_at).toISOString(),
      affected_components: draft.components.split(',').map((s) => s.trim()).filter(Boolean),
    });
    setDraft({ title: '', components: '', starts_at: '', ends_at: '' });
    void load();
  };
  return (
    <div className="mt-3 space-y-3">
      <Section title="Schedule maintenance window">
        <div className="p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
          <input placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                 className="h-9 px-2 rounded border border-[#dde4ec] text-[12px] md:col-span-2" />
          <input placeholder="Components (comma-sep)" value={draft.components} onChange={(e) => setDraft({ ...draft, components: e.target.value })}
                 className="h-9 px-2 rounded border border-[#dde4ec] text-[12px] font-mono md:col-span-2" />
          <input type="datetime-local" value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]" />
          <input type="datetime-local" value={draft.ends_at}   onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}   className="h-9 px-2 rounded border border-[#dde4ec] text-[12px]" />
          <button onClick={create} className="h-9 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold md:col-span-2">Schedule</button>
        </div>
      </Section>
      <Section title="Upcoming + recent maintenance">
        <Table headers={['Starts', 'Ends', 'Title', 'Components', 'Status']}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-mono text-[10px]">{new Date(r.starts_at).toLocaleString()}</td>
              <td className="font-mono text-[10px]">{new Date(r.ends_at).toLocaleString()}</td>
              <td>{r.title}</td>
              <td className="font-mono text-[10px]">{(JSON.parse(r.affected_components || '[]') as string[]).join(', ')}</td>
              <td><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                r.status === 'completed' ? 'widget-tone-good' :
                r.status === 'in_progress' ? 'widget-tone-amber' :
                r.status === 'cancelled' ? 'widget-tone-bad' : 'widget-tone-info'
              }`}>{r.status.replace(/_/g, ' ')}</span></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="text-[#6b7685] italic py-3">No windows scheduled.</td></tr>}
        </Table>
      </Section>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────
function Tile({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' | 'amber' | 'info' }) {
  const map: Record<string, string> = { good: 'widget-tone-good', warn: 'widget-tone-amber', amber: 'widget-tone-amber', bad: 'widget-tone-bad', info: 'widget-tone-info' };
  return (
    <div className={`widget-tile ${map[tone]}`}>
      <div className="widget-kpi-label">{label}</div>
      <div className="widget-kpi-value">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="widget-card">
      <header className="widget-card-header"><div className="widget-card-title">{title}</div></header>
      {children}
    </section>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="p-3 overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead><tr>{headers.map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default ComplianceAdminPage;
