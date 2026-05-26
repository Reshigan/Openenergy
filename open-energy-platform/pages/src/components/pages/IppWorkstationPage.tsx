import React, { useEffect, useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { api } from '../../lib/api';

export function IppWorkstationPage() {
  const kpis = useWorkstationKpis('ipp_developer');
  const projectsPanel = useWorkstationPanel('Active projects', '/projects', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#dbecfb] text-[#1a3a5c]">{r.project_type || r.energy_type || '—'}</span>,
    text: <span>{r.project_name || r.name} · {r.capacity_mw != null ? `${Number(r.capacity_mw).toFixed(1)} MW` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{(r.lifecycle_stage || r.status || '').replace(/_/g, ' ')}</span>,
  }), 'No active projects.');
  const panels = [projectsPanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="ipp_developer"
      eyebrow="IPP developer · Workstation"
      title="IPP workstation"
      subtitle="Projects · Milestones · Insurance · Community. The site-to-COD pipeline a developer runs every day."
      backHref="/ipp-lifecycle"
      backLabel="IPP lifecycle"
      kpis={kpis}
      panels={panels}
      tabs={[
        { key: 'projects', label: 'My projects', body: () => <ProjectsTab /> },
        { key: 'milestones', label: 'Milestones', body: ({ onRefresh }) => <MilestonesTab onRefresh={onRefresh} /> },
        { key: 'insurance', label: 'Insurance', body: ({ onRefresh }) => <InsuranceTab onRefresh={onRefresh} /> },
        { key: 'community', label: 'Community', body: ({ onRefresh }) => <CommunityTab onRefresh={onRefresh} /> },
        { key: 'audit', label: 'Audit & compliance',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/ipp"
              reconHint="project_id,milestone_name,satisfied_at,evidence_ref"
              reconSourceOptions={['lender_ie', 'nersa', 'dmre']}
              onChange={onRefresh}
            />
          ),
        },
      ]}
    />
  );
}

function ProjectsTab() {
  return (
    <ListingTable
      endpoint="/projects"
      rowKey={(r) => r.id}
      rowHref={(r) => `/projects/${r.id}`}
      empty={{ title: 'No projects', description: 'Register your first project from the IPP lifecycle page.' }}
      columns={[
        { key: 'project_name', label: 'Project', render: (r) => r.project_name || r.name },
        { key: 'project_type', label: 'Type', render: (r) => <Pill tone="info">{r.project_type || r.energy_type || '—'}</Pill> },
        { key: 'capacity_mw', label: 'Capacity', align: 'right', render: (r) => r.capacity_mw != null ? `${Number(r.capacity_mw).toFixed(1)} MW` : '—' },
        { key: 'lifecycle_stage', label: 'Stage', render: (r) => <Pill tone={r.lifecycle_stage === 'operational' ? 'good' : 'neutral'}>{(r.lifecycle_stage || r.status || 'unknown').replace(/_/g, ' ')}</Pill> },
        { key: 'cod_target', label: 'COD target', render: (r) => r.cod_target || r.target_cod_date || '—' },
        { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—' },
      ]}
    />
  );
}

type Project = { id: string; project_name?: string; name?: string };
type Milestone = { id: string; name: string; due_date: string | null; status: string };

function MilestonesTab({ onRefresh }: { onRefresh: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<string>('');
  const [items, setItems] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [satisfying, setSatisfying] = useState<Milestone | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/projects');
        const rows = (r.data?.data || []) as Project[];
        setProjects(rows);
        if (rows.length > 0) setPid(rows[0].id);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'failed to load projects');
      }
    })();
  }, []);

  useEffect(() => {
    if (!pid) return;
    setLoading(true); setErr(null);
    api.get(`/projects/${pid}/milestones`)
      .then((r) => setItems((r.data?.data || []) as Milestone[]))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false));
  }, [pid, onRefresh]);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <label className="block text-[13px]">
          <span className="text-[#6b7685]">Project</span>
          <select value={pid} onChange={(e) => setPid(e.target.value)} className="mt-1 h-9 px-3 border border-[#dde4ec] rounded-md text-[13px]">
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_name || p.name || p.id}</option>)}
          </select>
        </label>
      </div>
      {err && <div className="text-[12px] text-red-700">{err}</div>}
      {loading ? (
        <div className="text-[13px] text-[#6b7685]">Loading milestones…</div>
      ) : items.length === 0 ? (
        <div className="text-[13px] text-[#6b7685]">No milestones for this project.</div>
      ) : (
        <div className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
              <tr><th className="px-4 py-2">Milestone</th><th className="px-4 py-2">Due</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody>
              {items.map(m => (
                <tr key={m.id} className="border-t border-[#e5ebf2]">
                  <td className="px-4 py-2">{m.name}</td>
                  <td className="px-4 py-2">{m.due_date || '—'}</td>
                  <td className="px-4 py-2"><Pill tone={m.status === 'satisfied' ? 'good' : m.status === 'overdue' ? 'bad' : 'warn'}>{m.status}</Pill></td>
                  <td className="px-4 py-2">
                    {m.status !== 'satisfied' && (
                      <button onClick={() => setSatisfying(m)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Satisfy</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {satisfying && (
        <ActionModal
          title={`Satisfy milestone · ${satisfying.name}`}
          submitLabel="Mark satisfied"
          fields={[
            { key: 'evidence_url', label: 'Evidence URL or R2 key' },
            { key: 'notes', label: 'Notes', type: 'textarea', required: true },
          ] as FieldSpec[]}
          onClose={() => setSatisfying(null)}
          onSubmit={async (v) => {
            await api.post(`/projects/${pid}/milestones/${satisfying.id}/satisfy`, v);
            setSatisfying(null);
            // refetch
            const r = await api.get(`/projects/${pid}/milestones`);
            setItems((r.data?.data || []) as Milestone[]);
          }}
        />
      )}
    </div>
  );
}

function InsuranceTab({ onRefresh }: { onRefresh: () => void }) {
  const [withinDays, setWithinDays] = useState('90');
  const [claiming, setClaiming] = useState<any | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <label className="block text-[13px]">
          <span className="text-[#6b7685]">Expiring within (days)</span>
          <select value={withinDays} onChange={(e) => setWithinDays(e.target.value)} className="mt-1 h-9 px-3 border border-[#dde4ec] rounded-md text-[13px]">
            <option value="30">30</option><option value="60">60</option>
            <option value="90">90</option><option value="180">180</option>
          </select>
        </label>
      </div>
      <ListingTable
        endpoint={`/ipp/insurance/expiring?within_days=${withinDays}`}
        rowKey={(r) => r.id}
        empty={{ title: 'No policies expiring', description: 'No active policies expire within the selected window.' }}
        columns={[
          { key: 'policy_number', label: 'Policy', render: (r) => <span className="font-mono text-[11px]">{r.policy_number}</span> },
          { key: 'policy_type', label: 'Type', render: (r) => <Pill tone="info">{(r.policy_type || '').replace(/_/g, ' ')}</Pill> },
          { key: 'insurer', label: 'Insurer' },
          { key: 'sum_insured_zar', label: 'Sum insured', align: 'right', render: (r) => r.sum_insured_zar != null ? Number(r.sum_insured_zar).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—' },
          { key: 'period_end', label: 'Expires', render: (r) => r.period_end },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'active' ? 'good' : 'bad'}>{r.status}</Pill> },
          { key: '_actions', label: '', render: (r) => (
            <button onClick={() => setClaiming(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">File claim</button>
          ) },
        ]}
      />
      {claiming && (
        <ActionModal
          title={`File claim against ${claiming.policy_number}`}
          submitLabel="File claim"
          fields={[
            { key: 'claim_number', label: 'Claim number', required: true },
            { key: 'loss_event_date', label: 'Loss event date', type: 'date' },
            { key: 'quantum_zar', label: 'Quantum (ZAR)', type: 'number' },
            { key: 'description', label: 'Description', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setClaiming(null)}
          onSubmit={async (v) => {
            const body: any = { claim_number: v.claim_number };
            if (v.loss_event_date) body.loss_event_date = v.loss_event_date;
            if (v.quantum_zar) body.quantum_zar = Number(v.quantum_zar);
            if (v.description) body.description = v.description;
            await api.post(`/ipp/insurance/policies/${claiming.id}/claim`, body);
            setClaiming(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function CommunityTab({ onRefresh }: { onRefresh: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<string>('');
  const [logging, setLogging] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [summary, setSummary] = useState<any | null>(null);
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
  }, [pid, onRefresh]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <label className="block text-[13px]">
          <span className="text-[#6b7685]">Project</span>
          <select value={pid} onChange={(e) => setPid(e.target.value)} className="mt-1 h-9 px-3 border border-[#dde4ec] rounded-md text-[13px]">
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_name || p.name || p.id}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button onClick={() => setRegistering(true)} className="h-9 px-3 rounded-md bg-white border border-[#dde4ec] text-[12px] font-semibold">+ Register stakeholder</button>
          <button onClick={() => setLogging(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">+ Log engagement</button>
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
            setRegistering(false); onRefresh();
          }}
        />
      )}
      {logging && (
        <ActionModal
          title="Log community engagement"
          submitLabel="Log"
          fields={[
            { key: 'stakeholder_id', label: 'Stakeholder ID', required: true, placeholder: 'cs_…' },
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
            setLogging(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: number | null | undefined }) {
  const formatted = value != null ? Number(value).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—';
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
      <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className="text-[20px] font-semibold text-[#0f1c2e] mt-1">{formatted}</div>
    </div>
  );
}
