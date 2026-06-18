// pages/src/meridian/surfaces/ipp/CommunitySurface.tsx — IPP "Community" surface.
// Bucket B: extracted verbatim from the retired IppWorkstationPage `community` tab body
// (per-project ED/SED summary + register-stakeholder / log-engagement ActionModals).
// Self-contained `{ role }` body; husk `onRefresh` re-fetch replaced by a local refreshKey.
// Carries its own copy of the small Card helper (the husk shared one Card across tabs).
import { useEffect, useState } from 'react';
import { ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

type Project = { id: string; project_name?: string; name?: string };

function Card({ label, value }: { label: string; value: number | null | undefined }) {
  const formatted = value != null ? Number(value).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—';
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink3)]">{label}</div>
      <div className="text-[20px] font-semibold text-[var(--ink)] mt-1">{formatted}</div>
    </div>
  );
}

export default function CommunitySurface(_props: { role: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<string>('');
  const [logging, setLogging] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [summary, setSummary] = useState<any | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/projects');
        const rows = (r.data?.data || []) as Project[];
        setProjects(rows);
        if (rows.length > 0) setPid(rows[0].id);
      } catch { /* ignore */ }
    })();
  }, []);
  useEffect(() => {
    if (!pid) return;
    api.get(`/ipp/community/ed-sed/${pid}/summary`)
      .then((r) => setSummary(r.data?.data || null))
      .catch(() => setSummary(null));
  }, [pid, refreshKey]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <label className="block text-[13px]">
          <span className="text-[var(--ink3)]">Project</span>
          <select value={pid} onChange={(e) => setPid(e.target.value)} className="mt-1 h-9 px-3 border border-[var(--line)] rounded-md text-[13px]">
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_name || p.name || p.id}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setRegistering(true)} className="h-9 px-3 rounded-md bg-white border border-[var(--line)] text-[12px] font-semibold">+ Register stakeholder</button>
          <button type="button" onClick={() => setLogging(true)} className="h-9 px-3 rounded-md bg-[var(--petrol)] text-white text-[12px] font-semibold">+ Log engagement</button>
        </div>
      </div>
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card label="ED commitments (ZAR)" value={summary.ed_committed_zar} />
          <Card label="SED commitments (ZAR)" value={summary.sed_committed_zar} />
          <Card label="Cumulative paid (ZAR)" value={summary.paid_to_date_zar} />
        </div>
      )}
      {registering && (
        <ActionModal
          title="Register stakeholder"
          submitLabel="Register"
          fields={[
            { key: 'stakeholder_name', label: 'Stakeholder name', required: true },
            { key: 'stakeholder_type', label: 'Type', type: 'select', options: [
              { value: 'community_leader', label: 'Community leader' },
              { value: 'municipality', label: 'Municipality' },
              { value: 'ngo', label: 'NGO' },
              { value: 'traditional_authority', label: 'Traditional authority' },
              { value: 'other', label: 'Other' },
            ] },
            { key: 'contact_person', label: 'Contact person' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setRegistering(false)}
          onSubmit={async (v) => {
            await api.post('/ipp/community/stakeholders', { project_id: pid, ...v });
            setRegistering(false); setRefreshKey((k) => k + 1);
          }}
        />
      )}
      {logging && (
        <ActionModal
          title="Log community engagement"
          submitLabel="Log"
          fields={[
            { key: 'stakeholder_id', label: 'Stakeholder', type: 'lookup', required: true, lookupEndpoint: '/api/lookup/participants', lookupAutoFill: { stakeholder_name: 'name' } },
            { key: 'engagement_date', label: 'Date', type: 'date', required: true },
            { key: 'engagement_type', label: 'Type', type: 'select', required: true, options: [
              { value: 'meeting', label: 'Meeting' },
              { value: 'consultation', label: 'Consultation' },
              { value: 'commitment', label: 'Commitment' },
              { value: 'complaint', label: 'Complaint' },
            ] },
            { key: 'notes', label: 'Notes / outcome', type: 'textarea', required: true },
          ] as FieldSpec[]}
          onClose={() => setLogging(false)}
          onSubmit={async (v) => {
            await api.post('/ipp/community/engagements', { project_id: pid, ...v });
            setLogging(false); setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
