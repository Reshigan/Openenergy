// ════════════════════════════════════════════════════════════════════════
// IppSiteInstructionTab — Site Instruction chain
//
// State machine: draft → issued → acknowledged → in_execution →
//   completed → ie_verified → closed
// Branch: disputed → dispute_resolved (re-enters acknowledged path)
//         voided, superseded (terminals)
//
// Instruction types: safety_directive (4h SLA), variation_instruction (24h),
//   defect_rectification (48h), design_clarification (48h),
//   testing_instruction (72h), administrative (168h)
//
// Safety directives (OHSA s.8) + reportable SIs cross to regulator.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'var(--s0, oklch(0.96 0.003 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG2    = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX2    = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';
const BAD    = 'var(--bad, oklch(0.48 0.20 20))';
const WARN   = 'var(--accent, oklch(0.50 0.18 55))';
const GOOD   = 'var(--good, oklch(0.40 0.16 155))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

// ── types ─────────────────────────────────────────────────────────────────
type SiStatus =
  | 'draft' | 'issued' | 'acknowledged' | 'in_execution' | 'completed'
  | 'ie_verified' | 'closed' | 'disputed' | 'dispute_resolved' | 'superseded' | 'voided';

type InstructionType =
  | 'safety_directive' | 'variation_instruction' | 'defect_rectification'
  | 'design_clarification' | 'testing_instruction' | 'administrative';

interface SI {
  [key: string]: unknown;
  id: string;
  project_id: string;
  project_name?: string;
  si_ref?: string;
  instruction_type: InstructionType;
  status: SiStatus;
  issued_date: string;
  description: string;
  scope_narrative?: string;
  work_location?: string;
  ie_signatory?: string;
  contractor_signatory?: string;
  is_safety_directive: number;
  is_contract_variation: number;
  value_zar?: number | null;
  requires_ie_witness: number;
  ncr_ref?: string;
  dfr_ref?: string;
  diary_ref?: string;
  superseded_by?: string;
  sla_hours: number;
  sla_deadline: string;
  is_sla_breached: number;
  is_reportable: number;
  regulator_ref?: string;
  disputed_at?: string;
  closed_at?: string;
  updated_at: string;
}

interface KPI {
  total: number;
  open_count: number;
  disputed_count: number;
  safety_count: number;
  variation_count: number;
  late_count: number;
  reportable_total: number;
  closed_count: number;
}

// ── lookup tables ─────────────────────────────────────────────────────────
const INSTRUCTION_TYPE_LABELS: Record<InstructionType, string> = {
  safety_directive: 'Safety directive',
  variation_instruction: 'Variation',
  defect_rectification: 'Defect rectification',
  design_clarification: 'Design clarification',
  testing_instruction: 'Testing instruction',
  administrative: 'Administrative',
};

const SLA_LABELS: Record<InstructionType, string> = {
  safety_directive: '4h',
  variation_instruction: '24h',
  defect_rectification: '48h',
  design_clarification: '48h',
  testing_instruction: '72h',
  administrative: '168h',
};

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'draft',
  'issued',
  'acknowledged',
  'in_execution',
  'completed',
  'ie_verified',
  'closed',
];

const BRANCH_STATES: readonly string[] = [
  'disputed',
  'dispute_resolved',
  'superseded',
  'voided',
];

const TERMINAL = new Set(['closed', 'superseded', 'voided']);

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'safety_directive', label: 'Safety' },
  { key: 'disputed', label: 'Disputed' },
  { key: 'breached', label: 'SLA breached' },
  { key: 'variation_instruction', label: 'Variations' },
  { key: 'closed', label: 'Closed' },
  { key: 'reportable', label: 'Reportable' },
];

// ── helpers ───────────────────────────────────────────────────────────────
function fmtDate(s?: string | null): string {
  if (!s) return '—';
  return s.slice(0, 16).replace('T', ' ');
}

function fmtZar(v?: number | null): string {
  if (v == null) return '—';
  return `R ${Number(v).toLocaleString('en-ZA')}`;
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: SI): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.status;
  // Safety directives and reportable SIs cross to regulator
  const regulatorCascade = (row.is_safety_directive === 1 || row.is_reportable === 1)
    ? ['regulator']
    : [];

  if (s === 'draft') {
    actions.push({
      key: 'issue_instruction',
      label: 'Issue',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'void_instruction',
      label: 'Void',
      tone: 'danger',
      fields: [],
      cascadeTo: [],
    });
  }

  if (s === 'issued') {
    actions.push({
      key: 'acknowledge_receipt',
      label: 'Acknowledge',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'dispute_instruction',
      label: 'Dispute',
      tone: 'danger',
      fields: [
        {
          key: 'notes',
          label: 'Dispute reason',
          type: 'textarea',
          required: true,
          placeholder: 'Describe the dispute...',
        },
      ],
      cascadeTo: regulatorCascade,
    });
  }

  if (s === 'acknowledged') {
    actions.push({
      key: 'commence_work',
      label: 'Commence',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'dispute_instruction',
      label: 'Dispute',
      tone: 'danger',
      fields: [
        {
          key: 'notes',
          label: 'Dispute reason',
          type: 'textarea',
          required: true,
          placeholder: 'Describe the dispute...',
        },
      ],
      cascadeTo: regulatorCascade,
    });
  }

  if (s === 'in_execution') {
    actions.push({
      key: 'complete_work',
      label: 'Complete',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'dispute_instruction',
      label: 'Dispute',
      tone: 'danger',
      fields: [
        {
          key: 'notes',
          label: 'Dispute reason',
          type: 'textarea',
          required: true,
          placeholder: 'Describe the dispute...',
        },
      ],
      cascadeTo: regulatorCascade,
    });
  }

  if (s === 'completed') {
    actions.push({
      key: 'ie_verify',
      label: 'IE Verify',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (s === 'ie_verified') {
    actions.push({
      key: 'close_instruction',
      label: 'Close',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (s === 'disputed') {
    actions.push({
      key: 'resolve_dispute',
      label: 'Resolve dispute',
      tone: 'primary',
      fields: [],
      cascadeTo: regulatorCascade,
    });
  }

  if (s === 'dispute_resolved') {
    actions.push({
      key: 'commence_work',
      label: 'Commence',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: SI): React.ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <DetailPair label="Issued date" value={row.issued_date ?? '—'} />
        <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline)} />
        <DetailPair label="SLA window" value={SLA_LABELS[row.instruction_type]} />
        <DetailPair label="IE signatory" value={row.ie_signatory ?? '—'} />
        <DetailPair label="Contractor signatory" value={row.contractor_signatory ?? '—'} />
        <DetailPair label="Work location" value={row.work_location ?? '—'} />
        <DetailPair label="Variation value" value={fmtZar(row.value_zar)} />
        <DetailPair label="NCR ref" value={row.ncr_ref ?? '—'} />
        <DetailPair label="DFR ref" value={row.dfr_ref ?? '—'} />
        <DetailPair label="Diary ref" value={row.diary_ref ?? '—'} />
        {row.superseded_by && (
          <DetailPair label="Superseded by" value={row.superseded_by} />
        )}
        {row.regulator_ref && (
          <DetailPair label="Regulator ref" value={row.regulator_ref} />
        )}
        <DetailPair label="IE witness required" value={row.requires_ie_witness === 1 ? 'Yes' : 'No'} />
        <DetailPair label="Safety directive" value={row.is_safety_directive === 1 ? 'Yes (OHSA s.8)' : 'No'} />
        <DetailPair label="Contract variation" value={row.is_contract_variation === 1 ? 'Yes' : 'No'} />
        <DetailPair label="Reportable" value={row.is_reportable === 1 ? 'Yes' : 'No'} />
      </div>

      {row.description && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Description</div>
          <div style={{ color: TX2, fontSize: 11, lineHeight: 1.6 }}>{row.description}</div>
        </div>
      )}

      {row.scope_narrative && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Scope / Narrative</div>
          <div style={{ color: TX2, fontSize: 11, lineHeight: 1.6 }}>{row.scope_narrative}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function IppSiteInstructionTab() {
  const [rows, setRows] = useState<SI[]>([]);
  const [summary, setSummary] = useState<KPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get<{
        data: {
          items: SI[];
          total: number;
          open_count: number;
          disputed_count: number;
          safety_count: number;
          variation_count: number;
          late_count: number;
          reportable_total: number;
          closed_count: number;
        };
      }>('/ipp-site-instruction?period=ytd');
      const d = res.data?.data;
      setRows(d?.items ?? []);
      setSummary({
        total: d?.total ?? 0,
        open_count: d?.open_count ?? 0,
        disputed_count: d?.disputed_count ?? 0,
        safety_count: d?.safety_count ?? 0,
        variation_count: d?.variation_count ?? 0,
        late_count: d?.late_count ?? 0,
        reportable_total: d?.reportable_total ?? 0,
        closed_count: d?.closed_count ?? 0,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.put(`/ipp-site-instruction/${rowId}/action`, { action: key, ...values });
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp-site-instruction/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp-site-instruction/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all') return true;
      if (filter === 'open') return !TERMINAL.has(r.status);
      if (filter === 'safety_directive') return r.instruction_type === 'safety_directive';
      if (filter === 'variation_instruction') return r.instruction_type === 'variation_instruction';
      if (filter === 'disputed') return r.status === 'disputed';
      if (filter === 'breached') return r.is_sla_breached === 1;
      if (filter === 'reportable') return r.is_reportable === 1;
      if (filter === 'closed') return r.status === 'closed';
      return true;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: 0, open_count: 0, disputed_count: 0, safety_count: 0,
    variation_count: 0, late_count: 0, reportable_total: 0, closed_count: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Site Instructions</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          OHSA s.8 safety directives, variation instructions, defect rectifications and design clarifications issued on active projects.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total" value={kpis.total} />
        <KpiTile label="Open" value={kpis.open_count} tone="ok" />
        <KpiTile label="Safety" value={kpis.safety_count} tone="bad" />
        <KpiTile label="Disputed" value={kpis.disputed_count} tone="warn" />
        <KpiTile label="Variations" value={kpis.variation_count} />
        <KpiTile label="SLA breached" value={kpis.late_count} tone="bad" />
        <KpiTile label="Reportable" value={kpis.reportable_total} tone="warn" />
        <KpiTile label="Closed" value={kpis.closed_count} tone="ok" />
      </div>

      {/* Filter pills + create */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setShowCreate(true)}
          className="h-6 px-3 rounded-full text-[11px] font-semibold"
          style={{ background: ACC, color: '#fff', border: `1px solid ${ACC}` }}>
          + New instruction
        </button>
        <button type="button" onClick={() => void load()}
          className="h-6 px-2.5 rounded-full text-[11px]"
          style={{ background: BG2, color: TX2, border: `1px solid ${BORDER}` }}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]"
          style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const typeLabel = INSTRUCTION_TYPE_LABELS[row.instruction_type];
            const flags: string[] = [];
            if (row.is_safety_directive === 1) flags.push('⚠ Safety');
            if (row.is_contract_variation === 1) flags.push('Variation');
            if (row.is_sla_breached === 1) flags.push('SLA breached');
            if (row.is_reportable === 1) flags.push('Reportable');
            if (row.requires_ie_witness === 1) flags.push('IE witness');

            const metaText = [
              typeLabel,
              row.project_name || row.project_id,
              SLA_LABELS[row.instruction_type] + ' SLA',
              ...flags,
            ].filter(Boolean).join(' · ');

            return (
              <ChainCard
                key={row.id}
                item={{
                  ...row,
                  chain_status: row.status,
                  sla_deadline_at: row.sla_deadline ?? null,
                  sla_breached: row.is_sla_breached === 1,
                  is_terminal: TERMINAL.has(row.status),
                }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.si_ref || row.id.slice(0, 8)}
                meta={<span style={{ color: TX3, fontSize: 11 }}>{metaText}</span>}
                actions={getActions(row)}
                onAction={(key, values) => handleAction(row.id, key, values)}
                cascadeTo={[]}
                detail={renderDetail(row)}
                events={expandedEvents[row.id]}
                onExpand={handleExpand}
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]"
              style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No site instructions match.
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'oklch(0.1 0.01 250 / 0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: BG1, border: `1px solid ${BORDER}`, borderRadius: 12,
            padding: 28, width: 520, maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 8px 32px oklch(0.1 0.01 250 / 0.18)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: TX1 }}>
              New site instruction
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (submitting) return;
              setSubmitting(true);
              try {
                const fd = new FormData(e.currentTarget);
                await api.post('/ipp-site-instruction', {
                  project_id: fd.get('project_id'),
                  project_name: fd.get('project_name'),
                  instruction_type: fd.get('instruction_type'),
                  si_ref: fd.get('si_ref'),
                  issued_date: fd.get('issued_date'),
                  description: fd.get('description'),
                  scope_narrative: fd.get('scope_narrative'),
                  work_location: fd.get('work_location'),
                  ie_signatory: fd.get('ie_signatory'),
                  contractor_signatory: fd.get('contractor_signatory'),
                  is_safety_directive: fd.get('is_safety_directive') === 'on',
                  is_contract_variation: fd.get('is_contract_variation') === 'on',
                  value_zar: fd.get('value_zar') ? Number(fd.get('value_zar')) : null,
                });
                setShowCreate(false);
                await load();
              } finally { setSubmitting(false); }
            }}>
              {([
                ['project_id', 'Project ID', 'text', true],
                ['project_name', 'Project name', 'text', false],
                ['si_ref', 'SI reference (e.g. SI-2026-001)', 'text', false],
                ['issued_date', 'Issued date', 'date', true],
                ['work_location', 'Work location', 'text', false],
                ['ie_signatory', 'IE / Principal Agent', 'text', false],
                ['contractor_signatory', 'Contractor signatory', 'text', false],
              ] as [string, string, string, boolean][]).map(([name, label, type, req]) => (
                <div key={name} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: TX3, display: 'block', marginBottom: 4 }}>
                    {label}{req ? ' *' : ''}
                  </label>
                  <input name={name} type={type} required={req} style={{
                    width: '100%', background: BG2, border: `1px solid ${BORDER}`,
                    borderRadius: 6, padding: '7px 10px', color: TX1, fontSize: 12,
                    boxSizing: 'border-box',
                  }} />
                </div>
              ))}

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: TX3, display: 'block', marginBottom: 4 }}>
                  Instruction type *
                </label>
                <select name="instruction_type" required style={{
                  width: '100%', background: BG2, border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: '7px 10px', color: TX1, fontSize: 12,
                }}>
                  {Object.entries(INSTRUCTION_TYPE_LABELS).map(([k, v]) =>
                    <option key={k} value={k}>{v}</option>
                  )}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: TX3, display: 'block', marginBottom: 4 }}>
                  Description *
                </label>
                <textarea name="description" required rows={3} style={{
                  width: '100%', background: BG2, border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: '7px 10px', color: TX1, fontSize: 12,
                  boxSizing: 'border-box', resize: 'vertical',
                }} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: TX3, display: 'block', marginBottom: 4 }}>
                  Scope / Narrative
                </label>
                <textarea name="scope_narrative" rows={2} style={{
                  width: '100%', background: BG2, border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: '7px 10px', color: TX1, fontSize: 12,
                  boxSizing: 'border-box', resize: 'vertical',
                }} />
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: TX2 }}>
                  <input type="checkbox" name="is_safety_directive" />
                  Safety directive (OHSA s.8)
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: TX2 }}>
                  <input type="checkbox" name="is_contract_variation" />
                  Contract variation
                </label>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, color: TX3, display: 'block', marginBottom: 4 }}>
                  Variation value (R)
                </label>
                <input name="value_zar" type="number" min="0" step="0.01" style={{
                  width: '100%', background: BG2, border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: '7px 10px', color: TX1, fontSize: 12,
                  boxSizing: 'border-box',
                }} />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{
                  padding: '8px 16px', borderRadius: 6, background: BG2,
                  color: TX2, border: `1px solid ${BORDER}`, cursor: 'pointer', fontSize: 12,
                }}>Cancel</button>
                <button type="submit" disabled={submitting} style={{
                  padding: '8px 16px', borderRadius: 6, background: ACC,
                  color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  opacity: submitting ? 0.5 : 1,
                }}>{submitting ? 'Creating…' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── shared tiles ──────────────────────────────────────────────────────────
function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[80px]" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default IppSiteInstructionTab;
