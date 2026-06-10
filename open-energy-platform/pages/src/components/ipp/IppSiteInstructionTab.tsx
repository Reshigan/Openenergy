import { useState } from 'react';
import { api } from '../../lib/api';

type SiStatus =
  | 'draft' | 'issued' | 'acknowledged' | 'in_execution' | 'completed'
  | 'ie_verified' | 'closed' | 'disputed' | 'dispute_resolved' | 'superseded' | 'voided';

type InstructionType =
  | 'safety_directive' | 'variation_instruction' | 'defect_rectification'
  | 'design_clarification' | 'testing_instruction' | 'administrative';

interface SI {
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

const INSTRUCTION_TYPE_LABELS: Record<InstructionType, string> = {
  safety_directive: 'Safety directive',
  variation_instruction: 'Variation',
  defect_rectification: 'Defect rectification',
  design_clarification: 'Design clarification',
  testing_instruction: 'Testing instruction',
  administrative: 'Administrative',
};

const INSTRUCTION_TYPE_COLORS: Record<InstructionType, string> = {
  safety_directive: '#dc2626',
  variation_instruction: '#2563eb',
  defect_rectification: '#d97706',
  design_clarification: '#7c3aed',
  testing_instruction: '#0891b2',
  administrative: '#6b7280',
};

const STATUS_COLORS: Record<SiStatus, string> = {
  draft: '#6b7280', issued: '#2563eb', acknowledged: '#0891b2',
  in_execution: '#d97706', completed: '#16a34a', ie_verified: '#059669',
  closed: '#374151', disputed: '#dc2626', dispute_resolved: '#7c3aed',
  superseded: '#9ca3af', voided: '#d1d5db',
};

const SLA_LABELS: Record<InstructionType, string> = {
  safety_directive: '4h', variation_instruction: '24h',
  defect_rectification: '48h', design_clarification: '48h',
  testing_instruction: '72h', administrative: '168h',
};

const TERMINAL = new Set(['closed', 'superseded', 'voided']);

function slaRemaining(row: SI): string {
  const d = new Date(row.sla_deadline);
  const h = Math.round((d.getTime() - Date.now()) / 3_600_000);
  if (row.is_sla_breached) return 'BREACHED';
  if (h <= 0) return 'OVERDUE';
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function slaColor(row: SI): string {
  if (row.is_sla_breached || TERMINAL.has(row.status)) return TERMINAL.has(row.status) ? '#9ca3af' : '#dc2626';
  const h = Math.round((new Date(row.sla_deadline).getTime() - Date.now()) / 3_600_000);
  if (h <= 0) return '#dc2626';
  if (h < 8) return '#ea580c';
  if (h < 24) return '#d97706';
  return '#16a34a';
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      background: `${color}18`, color, border: `1px solid ${color}40`,
      borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
      padding: '12px 16px', minWidth: 80, flex: '1 1 80px',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#f1f5f9' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const FILTER_BUTTONS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'safety_directive', label: 'Safety' },
  { key: 'disputed', label: 'Disputed' },
  { key: 'breached', label: 'SLA breached' },
  { key: 'variation_instruction', label: 'Variations' },
  { key: 'closed', label: 'Closed' },
  { key: 'reportable', label: 'Reportable' },
];

export function IppSiteInstructionTab() {
  const [items, setItems] = useState<SI[]>([]);
  const [kpi, setKpi] = useState({
    total: 0, open_count: 0, disputed_count: 0, safety_count: 0,
    variation_count: 0, late_count: 0, reportable_total: 0, closed_count: 0,
  });
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<SI | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: { items: SI[]; total: number; open_count: number; disputed_count: number; safety_count: number; variation_count: number; late_count: number; reportable_total: number; closed_count: number } }>('/ipp-site-instruction?period=ytd');
      const data = r.data?.data;
      setItems(data?.items ?? []);
      setKpi({
        total: data?.total ?? 0,
        open_count: data?.open_count ?? 0,
        disputed_count: data?.disputed_count ?? 0,
        safety_count: data?.safety_count ?? 0,
        variation_count: data?.variation_count ?? 0,
        late_count: data?.late_count ?? 0,
        reportable_total: data?.reportable_total ?? 0,
        closed_count: data?.closed_count ?? 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const [loaded, setLoaded] = useState(false);
  if (!loaded) { setLoaded(true); load(); }

  const filtered = items.filter(r => {
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

  async function doAction(id: string, action: string, extra: Record<string, unknown> = {}) {
    await api.put(`/ipp-site-instruction/${id}/action`, { action, ...extra });
    await load();
    setSelected(prev => prev?.id === id ? { ...prev, ...extra } : prev);
  }

  function actionButtons(row: SI) {
    const s = row.status;
    const btns: { label: string; action: string; extra?: Record<string, unknown>; danger?: boolean }[] = [];
    if (s === 'draft') {
      btns.push({ label: 'Issue', action: 'issue_instruction' });
      btns.push({ label: 'Void', action: 'void_instruction', danger: true });
    }
    if (s === 'issued') btns.push({ label: 'Acknowledge', action: 'acknowledge_receipt' });
    if (s === 'acknowledged' || s === 'dispute_resolved') btns.push({ label: 'Commence', action: 'commence_work' });
    if (s === 'in_execution') btns.push({ label: 'Complete', action: 'complete_work' });
    if (s === 'completed') btns.push({ label: 'IE Verify', action: 'ie_verify' });
    if (s === 'ie_verified') btns.push({ label: 'Close', action: 'close_instruction' });
    if (['issued', 'acknowledged', 'in_execution'].includes(s))
      btns.push({ label: 'Dispute', action: 'dispute_instruction', danger: true });
    if (s === 'disputed') btns.push({ label: 'Resolve dispute', action: 'resolve_dispute' });
    return btns;
  }

  return (
    <div style={{ padding: 24, color: '#f1f5f9', fontFamily: 'Inter, sans-serif' }}>
      {/* KPI bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard label="Total" value={kpi.total} />
        <KpiCard label="Open" value={kpi.open_count} color="#2563eb" />
        <KpiCard label="Safety" value={kpi.safety_count} color="#dc2626" />
        <KpiCard label="Disputed" value={kpi.disputed_count} color="#ea580c" />
        <KpiCard label="Variations" value={kpi.variation_count} color="#2563eb" />
        <KpiCard label="SLA breached" value={kpi.late_count} color="#dc2626" />
        <KpiCard label="Reportable" value={kpi.reportable_total} color="#7c3aed" />
        <KpiCard label="Closed" value={kpi.closed_count} color="#16a34a" />
      </div>

      {/* Filter + Create */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {FILTER_BUTTONS.map(b => (
          <button type="button" key={b.key} onClick={() => setFilter(b.key)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            background: filter === b.key ? '#2563eb' : '#1e293b',
            color: filter === b.key ? '#fff' : '#94a3b8',
            border: `1px solid ${filter === b.key ? '#2563eb' : '#334155'}`,
          }}>{b.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setShowCreate(true)} style={{
          padding: '6px 14px', borderRadius: 6, background: '#2563eb',
          color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}>+ New instruction</button>
        <button type="button" onClick={load} style={{
          padding: '6px 12px', borderRadius: 6, background: '#1e293b',
          color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer', fontSize: 12,
        }}>{loading ? '...' : '↻'}</button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155', color: '#64748b', textAlign: 'left' }}>
              <th style={{ padding: '6px 10px' }}>Ref / Date</th>
              <th style={{ padding: '6px 10px' }}>Project</th>
              <th style={{ padding: '6px 10px' }}>Type</th>
              <th style={{ padding: '6px 10px' }}>Description</th>
              <th style={{ padding: '6px 10px' }}>Status</th>
              <th style={{ padding: '6px 10px' }}>SLA</th>
              <th style={{ padding: '6px 10px' }}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#475569' }}>
                {loading ? 'Loading…' : 'No site instructions found'}
              </td></tr>
            )}
            {filtered.map(row => (
              <tr key={row.id}
                onClick={() => setSelected(row)}
                style={{
                  borderBottom: '1px solid #1e293b', cursor: 'pointer',
                  background: selected?.id === row.id ? 'oklch(0.93 0.012 55)' : 'transparent',
                }}
                onMouseEnter={e => { if (selected?.id !== row.id) (e.currentTarget as HTMLElement).style.background = '#1e293b'; }}
                onMouseLeave={e => { if (selected?.id !== row.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{row.si_ref || row.id.slice(0, 8)}</div>
                  <div style={{ color: '#64748b', fontSize: 11 }}>{row.issued_date}</div>
                </td>
                <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{row.project_name || row.project_id}</td>
                <td style={{ padding: '8px 10px' }}>
                  <Pill color={INSTRUCTION_TYPE_COLORS[row.instruction_type]}>
                    {INSTRUCTION_TYPE_LABELS[row.instruction_type]}
                  </Pill>
                </td>
                <td style={{ padding: '8px 10px', color: '#cbd5e1', maxWidth: 280 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.description}
                  </div>
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <Pill color={STATUS_COLORS[row.status]}>{row.status.replace(/_/g, ' ')}</Pill>
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ color: slaColor(row), fontWeight: 600 }}>
                    {TERMINAL.has(row.status) ? '—' : slaRemaining(row)}
                  </span>
                  <div style={{ fontSize: 10, color: '#475569' }}>({SLA_LABELS[row.instruction_type]})</div>
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {row.is_safety_directive === 1 && <Pill color="#dc2626">⚠ Safety</Pill>}
                    {row.is_contract_variation === 1 && <Pill color="#2563eb">Variation</Pill>}
                    {row.is_sla_breached === 1 && <Pill color="#dc2626">SLA</Pill>}
                    {row.is_reportable === 1 && <Pill color="#7c3aed">Reportable</Pill>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
          background: '#0f172a', borderLeft: '1px solid #334155',
          overflowY: 'auto', zIndex: 100, padding: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
                {selected.si_ref || selected.id.slice(0, 8)}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{selected.project_name}</div>
            </div>
            <button type="button" onClick={() => setSelected(null)} style={{
              background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 20,
            }}>×</button>
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            <Pill color={INSTRUCTION_TYPE_COLORS[selected.instruction_type]}>
              {INSTRUCTION_TYPE_LABELS[selected.instruction_type]}
            </Pill>
            <Pill color={STATUS_COLORS[selected.status]}>{selected.status.replace(/_/g, ' ')}</Pill>
            {selected.is_safety_directive === 1 && <Pill color="#dc2626">⚠ Safety directive</Pill>}
            {selected.is_contract_variation === 1 && <Pill color="#2563eb">Contract variation</Pill>}
            {selected.is_sla_breached === 1 && <Pill color="#dc2626">SLA breached</Pill>}
            {selected.is_reportable === 1 && <Pill color="#7c3aed">Reportable</Pill>}
            {selected.requires_ie_witness === 1 && <Pill color="#0891b2">IE witness</Pill>}
          </div>

          {/* Fields */}
          {[
            ['Issued date', selected.issued_date],
            ['SLA deadline', selected.sla_deadline?.slice(0, 16).replace('T', ' ')],
            ['IE signatory', selected.ie_signatory],
            ['Contractor signatory', selected.contractor_signatory],
            ['Work location', selected.work_location],
            ['Value', selected.value_zar != null ? `R ${Number(selected.value_zar).toLocaleString('en-ZA')}` : null],
            ['NCR ref', selected.ncr_ref],
            ['DFR ref', selected.dfr_ref],
            ['Diary ref', selected.diary_ref],
            ['Superseded by', selected.superseded_by],
            ['Regulator ref', selected.regulator_ref],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label as string} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12 }}>
              <span style={{ color: '#64748b', minWidth: 140 }}>{label}</span>
              <span style={{ color: '#e2e8f0' }}>{value}</span>
            </div>
          ))}

          {/* Description */}
          <div style={{ marginTop: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>DESCRIPTION</div>
            <div style={{
              background: '#1e293b', borderRadius: 6, padding: 12, fontSize: 12,
              color: '#cbd5e1', lineHeight: 1.6,
            }}>{selected.description}</div>
          </div>

          {selected.scope_narrative && (
            <div style={{ marginTop: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>SCOPE / NARRATIVE</div>
              <div style={{
                background: '#1e293b', borderRadius: 6, padding: 12, fontSize: 12,
                color: '#cbd5e1', lineHeight: 1.6,
              }}>{selected.scope_narrative}</div>
            </div>
          )}

          {/* Action buttons */}
          {!TERMINAL.has(selected.status) && (
            <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {actionButtons(selected).map(btn => (
                <button type="button" key={btn.action}
                  onClick={async () => {
                    let extra: Record<string, unknown> = {};
                    if (btn.action === 'dispute_instruction') {
                      const reason = window.prompt('Dispute reason:');
                      if (!reason) return;
                      extra = { notes: reason };
                    } else if (btn.action === 'grant_extension') {
                      const days = window.prompt('Extension days:');
                      if (!days) return;
                      extra = { extension_days: Number(days) };
                    }
                    await doAction(selected.id, btn.action, extra);
                  }}
                  style={{
                    padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: 'none',
                    background: btn.danger ? '#7f1d1d' : '#1d4ed8',
                    color: btn.danger ? '#fca5a5' : '#fff',
                  }}>{btn.label}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: '#000a', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#0f172a', border: '1px solid #334155', borderRadius: 12,
            padding: 28, width: 520, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: '#f1f5f9' }}>
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
              {[
                ['project_id', 'Project ID', 'text', true],
                ['project_name', 'Project name', 'text', false],
                ['si_ref', 'SI reference (e.g. SI-2026-001)', 'text', false],
                ['issued_date', 'Issued date', 'date', true],
                ['work_location', 'Work location', 'text', false],
                ['ie_signatory', 'IE / Principal Agent', 'text', false],
                ['contractor_signatory', 'Contractor signatory', 'text', false],
              ].map(([name, label, type, req]) => (
                <div key={name as string} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
                    {label as string}{req ? ' *' : ''}
                  </label>
                  <input name={name as string} type={type as string} required={!!req} style={{
                    width: '100%', background: '#1e293b', border: '1px solid #334155',
                    borderRadius: 6, padding: '7px 10px', color: '#f1f5f9', fontSize: 12,
                    boxSizing: 'border-box',
                  }} />
                </div>
              ))}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
                  Instruction type *
                </label>
                <select name="instruction_type" required style={{
                  width: '100%', background: '#1e293b', border: '1px solid #334155',
                  borderRadius: 6, padding: '7px 10px', color: '#f1f5f9', fontSize: 12,
                }}>
                  {Object.entries(INSTRUCTION_TYPE_LABELS).map(([k, v]) =>
                    <option key={k} value={k}>{v}</option>
                  )}
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
                  Description *
                </label>
                <textarea name="description" required rows={3} style={{
                  width: '100%', background: '#1e293b', border: '1px solid #334155',
                  borderRadius: 6, padding: '7px 10px', color: '#f1f5f9', fontSize: 12,
                  boxSizing: 'border-box', resize: 'vertical',
                }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
                  Scope / Narrative
                </label>
                <textarea name="scope_narrative" rows={2} style={{
                  width: '100%', background: '#1e293b', border: '1px solid #334155',
                  borderRadius: 6, padding: '7px 10px', color: '#f1f5f9', fontSize: 12,
                  boxSizing: 'border-box', resize: 'vertical',
                }} />
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#cbd5e1' }}>
                  <input type="checkbox" name="is_safety_directive" />
                  Safety directive (OHSA s.8)
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#cbd5e1' }}>
                  <input type="checkbox" name="is_contract_variation" />
                  Contract variation
                </label>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
                  Variation value (R)
                </label>
                <input name="value_zar" type="number" min="0" step="0.01" style={{
                  width: '100%', background: '#1e293b', border: '1px solid #334155',
                  borderRadius: 6, padding: '7px 10px', color: '#f1f5f9', fontSize: 12,
                  boxSizing: 'border-box',
                }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{
                  padding: '8px 16px', borderRadius: 6, background: '#1e293b',
                  color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer', fontSize: 12,
                }}>Cancel</button>
                <button type="submit" disabled={submitting} style={{
                  padding: '8px 16px', borderRadius: 6, background: '#2563eb',
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
