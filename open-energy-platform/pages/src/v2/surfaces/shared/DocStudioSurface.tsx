// pages/src/meridian/surfaces/shared/DocStudioSurface.tsx
//
// Meridian surface — "Document Studio" (carbon_fund + lender roles). The paid
// doc-generation subscription (migration 515): enable the subscription, then
// 1-click generate standard submission documents (PDD / MRV / validation /
// REC issuance / term sheet / info memo) from existing project data and walk
// each through review → submit → accept/reject.
//
// Registered as `carbon_fund:doc_studio` and `lender:doc_studio`. Backend:
// /api/doc-gen/* (entitlement, enable, generate, jobs, transition).
import React, { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { OEIcon } from '../../../components/OEIcon';

type DocType = 'pdd' | 'mrv' | 'validation_report' | 'rec_issuance_request' | 'term_sheet' | 'info_memo';

const DOC_TYPES: { value: DocType; label: string; subject: string }[] = [
  { value: 'pdd', label: 'Project Design Document (PDD)', subject: 'project ID' },
  { value: 'mrv', label: 'Monitoring & Verification (MRV)', subject: 'MRV submission ID' },
  { value: 'validation_report', label: 'Validation Report', subject: 'carbon project ID' },
  { value: 'rec_issuance_request', label: 'REC / GO Issuance Request', subject: 'project ID' },
  { value: 'term_sheet', label: 'Funding Term Sheet', subject: 'project ID' },
  { value: 'info_memo', label: 'Information Memorandum', subject: 'project ID' },
];

const STANDARDS = [
  { value: '', label: 'Auto / not applicable' },
  { value: 'gold_standard', label: 'Gold Standard' },
  { value: 'verra_vcs', label: 'Verra VCS' },
  { value: 'pure_earth', label: 'Pure Earth' },
  { value: 'i_rec', label: 'I-REC' },
  { value: 'article_6_4', label: 'Article 6.4 (UNFCCC)' },
  { value: 'cdm', label: 'CDM' },
];

interface Job {
  id: string; doc_type: string; registry_standard: string | null;
  subject_label: string; status: string; title: string;
  created_at: string; content_md?: string;
}

const NEXT: Record<string, string[]> = {
  generated: ['in_review'], in_review: ['submitted'],
  submitted: ['accepted', 'rejected'], accepted: [], rejected: ['in_review'],
};

// Attention order: rejected (rework) → generated (needs review) → in_review → submitted (external) → accepted.
const ORDER: Record<string, number> = { rejected: 0, generated: 1, in_review: 2, submitted: 3, accepted: 4 };

const STATUS_TONE: Record<string, { c: string; b: string }> = {
  generated: { c: '#475569', b: '#f1f5f9' },
  in_review: { c: '#b45309', b: '#fef3c7' },
  submitted: { c: '#1d4ed8', b: '#dbeafe' },
  accepted: { c: '#15803d', b: '#dcfce7' },
  rejected: { c: '#b91c1c', b: '#fee2e2' },
};

function StatusPill({ s }: { s: string }) {
  const t = STATUS_TONE[s] ?? STATUS_TONE.generated;
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: t.c, background: t.b }}>{s.replace(/_/g, ' ')}</span>;
}

export default function DocStudioSurface(_: { role: string }) {
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [docType, setDocType] = useState<DocType>('pdd');
  const [standard, setStandard] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Job | null>(null);

  const loadJobs = () => api.get('/doc-gen/jobs').then((r) => setJobs(r.data?.jobs ?? [])).catch(() => {});

  useEffect(() => {
    api.get('/doc-gen/entitlement')
      .then((r) => { setEntitled(!!r.data?.active); if (r.data?.active) loadJobs(); })
      .catch(() => setEntitled(false));
  }, []);

  const enable = async () => {
    setBusy(true); setError(null);
    try { await api.post('/doc-gen/enable', { tier: 'professional' }); setEntitled(true); loadJobs(); }
    catch (e: any) { setError(e?.response?.data?.error || 'Could not enable subscription'); }
    finally { setBusy(false); }
  };

  const generate = async () => {
    if (!subjectId.trim()) { setError('Enter a subject ID'); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.post('/doc-gen/generate', {
        doc_type: docType, subject_id: subjectId.trim(), registry_standard: standard || undefined,
      });
      setSubjectId('');
      await loadJobs();
      const j = r.data?.job;
      if (j) setPreview({ ...j, subject_label: j.title } as Job);
    } catch (e: any) {
      const code = e?.response?.status;
      setError(code === 404 ? 'No record found for that subject ID' : (e?.response?.data?.error || 'Generation failed'));
    } finally { setBusy(false); }
  };

  const transition = async (id: string, to: string) => {
    setError(null);
    try { await api.post(`/doc-gen/jobs/${id}/transition`, { to }); await loadJobs(); }
    catch (e: any) { setError(e?.response?.data?.error || 'Transition failed'); }
  };

  const openPreview = async (id: string) => {
    try { const r = await api.get(`/doc-gen/jobs/${id}`); setPreview(r.data?.job ?? null); }
    catch { /* ignore */ }
  };

  if (entitled === null) return <div className="p-6 text-[13px] text-[var(--ink3)]">Loading…</div>;

  if (!entitled) {
    return (
      <div className="max-w-xl mx-auto p-8">
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-2 mb-2">
            <OEIcon name="doc-stack" size={22} tone="teal" />
            <h2 className="text-[18px] font-bold text-[var(--ink)]">Document Studio</h2>
          </div>
          <p className="text-[13px] text-[var(--ink2)] mb-1">
            Generate standard submission documents — PDDs, MRV reports, validation summaries,
            REC issuance requests, term sheets and information memoranda — automatically from your
            existing project data, in submission-ready format. The Studio manages the full lifecycle:
            draft → review → submit → accept.
          </p>
          <p className="text-[12px] text-[var(--ink3)] mb-4">Professional subscription. No per-document charge.</p>
          {error && <div className="text-[12px] text-[var(--oxide-deep)] mb-2">{error}</div>}
          <button type="button" onClick={enable} disabled={busy} className="btn pri">
            {busy ? 'Enabling…' : 'Enable Document Studio'}
          </button>
        </div>
      </div>
    );
  }

  const subjectHint = DOC_TYPES.find((d) => d.value === docType)?.subject ?? 'subject ID';

  const byStatus = (s: string) => jobs.filter((j) => j.status === s).length;
  const awaiting = byStatus('generated') + byStatus('in_review') + byStatus('rejected');
  const submitted = byStatus('submitted');
  const accepted = byStatus('accepted');
  const sortedJobs = [...jobs].sort(
    (a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || (b.created_at || '').localeCompare(a.created_at || ''),
  );
  const kpi = (label: string, value: number, urgent = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink3)' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color: urgent && value > 0 ? 'var(--amber-deep)' : 'var(--ink)' }}>{value}</span>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Summary — document pipeline at a glance */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px',
        background: 'linear-gradient(135deg, color-mix(in oklab, var(--petrol) 14%, transparent), transparent)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[13px] font-bold text-[var(--ink)]">Document Studio</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: 'var(--ink2)', background: 'var(--paper)' }}>
            {jobs.length} {jobs.length === 1 ? 'document' : 'documents'}
          </span>
          {awaiting > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: 'var(--amber-deep)', background: 'var(--amber-tint)' }}>
              {awaiting} need attention
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16 }}>
          {kpi('Documents', jobs.length)}
          {kpi('Awaiting action', awaiting, true)}
          {kpi('Submitted', submitted)}
          {kpi('Accepted', accepted)}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      {/* Generator */}
      <div className="space-y-3">
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--line)' }}>
          <h3 className="text-[14px] font-bold text-[var(--ink)]">Generate a document</h3>
          <label className="block">
            <span className="text-[12px] font-medium text-[var(--ink2)]">Document type</span>
            <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)}
              className="mt-1 w-full h-9 rounded-md border border-[var(--line)] text-[13px] px-2">
              {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-[var(--ink2)]">Registry standard</span>
            <select value={standard} onChange={(e) => setStandard(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-[var(--line)] text-[13px] px-2">
              {STANDARDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-[var(--ink2)]">Subject ({subjectHint})</span>
            <input value={subjectId} onChange={(e) => setSubjectId(e.target.value)}
              placeholder={`Paste the ${subjectHint}`}
              className="mt-1 w-full h-9 rounded-md border border-[var(--line)] text-[13px] px-2" />
          </label>
          {error && <div className="text-[12px] text-[var(--oxide-deep)]">{error}</div>}
          <button type="button" onClick={generate} disabled={busy}
            className="btn pri inline-flex items-center gap-1.5">
            <OEIcon name="spark" size={14} /> {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Jobs + preview */}
      <div className="space-y-3">
        {preview && (
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[13px] font-bold text-[var(--ink)]">{preview.title}</h4>
              <button type="button" onClick={() => setPreview(null)} className="text-[var(--ink3)] hover:text-[var(--ink2)]">
                <OEIcon name="close" size={16} />
              </button>
            </div>
            <pre className="text-[12px] text-[var(--ink2)] whitespace-pre-wrap max-h-[420px] overflow-auto font-mono leading-relaxed">
              {preview.content_md || '(no content)'}
            </pre>
          </div>
        )}

        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--line)' }}>
          <div className="px-4 py-2.5 border-b bg-[var(--paper)] text-[12px] font-semibold text-[var(--ink2)]">
            Documents ({jobs.length})
          </div>
          {jobs.length === 0 ? (
            <div className="p-6 text-[13px] text-[var(--ink3)]">No documents yet. Generate your first one.</div>
          ) : (
            <ul className="divide-y">
              {sortedJobs.map((j) => (
                <li key={j.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button type="button" onClick={() => openPreview(j.id)}
                      className="text-[13px] font-semibold text-[var(--ink)] hover:underline text-left">
                      {j.title}
                    </button>
                    <div className="mt-0.5 text-[11px] text-[var(--ink3)]">
                      {j.doc_type.replace(/_/g, ' ')}
                      {j.registry_standard && ` · ${j.registry_standard.replace(/_/g, ' ')}`}
                      {` · ${j.subject_label}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusPill s={j.status} />
                    {(NEXT[j.status] ?? []).map((to) => (
                      <button key={to} type="button" onClick={() => transition(j.id, to)}
                        className="btn ghost">
                        {to === 'rejected' ? 'Reject' : to === 'accepted' ? 'Accept' : to.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
