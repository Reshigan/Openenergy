// MRV verification chain — Wave 11 P6-grade tab for the Carbon workstation.
//
// Surfaces the UNFCCC / Article 6 verification workflow:
//   • KPI strip: draft / DOE review / CRA review / approved / escalated
//   • Filter pills by chain state
//   • Submission table with SLA countdown
//   • Drill-down with full audit-chain event timeline + action buttons
//
// Roles: admin/support/carbon/regulator/ipp can read; action buttons are
// gated server-side and surface 403 as toast.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'draft' | 'submitted' | 'doe_assigned' | 'doe_review'
  | 'doe_opinion_positive' | 'doe_opinion_qualified'
  | 'doe_opinion_adverse'  | 'doe_opinion_disclaimer'
  | 'cra_review' | 'cra_approved' | 'cra_rejected'
  | 'issuance_authorized' | 'issued' | 'withdrawn';

interface SubRow {
  id: string;
  project_id: string;
  reporting_period_start: string;
  reporting_period_end: string;
  claimed_reductions_tco2e: number;
  monitoring_methodology: string | null;
  status: string;
  chain_status: ChainStatus;
  chain_status_label?: string;
  is_terminal?: boolean;
  sla_deadline_at?: string | null;
  days_until_sla?: number | null;
  sla_breached?: boolean;
  doe_assignee_id: string | null;
  doe_due_at: string | null;
  doe_opinion: string | null;
  cra_due_at: string | null;
  cra_rejection_reason: string | null;
  last_sla_breach_at: string | null;
  created_at: string;
}

interface ChainEvent {
  id: string;
  submission_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string;
  actor_id: string;
  notes: string | null;
  body_json: string | null;
  created_at: string;
}

const TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  draft:                  { bg: '#f0f3f7', fg: '#445566', label: 'Draft' },
  submitted:              { bg: '#dbecfb', fg: '#1a3a5c', label: 'Submitted' },
  doe_assigned:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'DOE assigned' },
  doe_review:             { bg: '#fff4d6', fg: '#a06200', label: 'DOE reviewing' },
  doe_opinion_positive:   { bg: '#daf5e2', fg: '#1f6b3a', label: 'DOE positive' },
  doe_opinion_qualified:  { bg: '#fff4d6', fg: '#a06200', label: 'DOE qualified' },
  doe_opinion_adverse:    { bg: '#3a0f0f', fg: '#ffd6d6', label: 'DOE adverse' },
  doe_opinion_disclaimer: { bg: '#fde0e0', fg: '#9b1f1f', label: 'DOE disclaimer' },
  cra_review:             { bg: '#fff4d6', fg: '#a06200', label: 'CRA reviewing' },
  cra_approved:           { bg: '#daf5e2', fg: '#1f6b3a', label: 'CRA approved' },
  cra_rejected:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'CRA rejected' },
  issuance_authorized:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Issuance authorized' },
  issued:                 { bg: '#daf5e2', fg: '#1f6b3a', label: 'Issued' },
  withdrawn:              { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                   label: 'In flight' },
  { key: 'all',                    label: 'All' },
  { key: 'draft',                  label: 'Draft' },
  { key: 'submitted',              label: 'Submitted' },
  { key: 'doe_review',             label: 'DOE review' },
  { key: 'cra_review',             label: 'CRA review' },
  { key: 'cra_approved',           label: 'CRA approved' },
  { key: 'doe_opinion_adverse',    label: 'Adverse' },
  { key: 'cra_rejected',           label: 'Rejected' },
  { key: 'issued',                 label: 'Issued' },
];

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, padding: '12px 16px', minWidth: 140 }}>
      <div style={{ fontSize: 11, color: '#557', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1c2733', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#7a8a9a', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function fmtSla(d: number | null | undefined, breached: boolean | undefined): string {
  if (d == null) return '—';
  if (breached) return `${-d}d overdue`;
  if (d === 0) return 'due today';
  if (d < 0) return `${-d}d overdue`;
  return `${d}d remaining`;
}

const IN_FLIGHT = new Set<ChainStatus>([
  'draft', 'submitted', 'doe_assigned', 'doe_review',
  'doe_opinion_positive', 'doe_opinion_qualified',
  'cra_review', 'cra_approved', 'issuance_authorized',
]);

export function MrvChainTab() {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const [drill, setDrill] = useState<SubRow | null>(null);
  const [drillEvents, setDrillEvents] = useState<ChainEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<{ data: { items: SubRow[] } }>('/carbon/mrv-chain');
      setRows(r.data?.data?.items || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load chain.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'open') return rows.filter((r) => IN_FLIGHT.has(r.chain_status));
    return rows.filter((r) => r.chain_status === filter);
  }, [rows, filter]);

  const kpis = useMemo(() => ({
    total:      rows.length,
    draft:      rows.filter((r) => r.chain_status === 'draft').length,
    doe:        rows.filter((r) => r.chain_status === 'doe_assigned' || r.chain_status === 'doe_review').length,
    cra:        rows.filter((r) => r.chain_status === 'cra_review').length,
    approved:   rows.filter((r) => r.chain_status === 'cra_approved' || r.chain_status === 'issuance_authorized').length,
    issued:     rows.filter((r) => r.chain_status === 'issued').length,
    escalated:  rows.filter((r) => r.chain_status === 'doe_opinion_adverse' || r.chain_status === 'cra_rejected' || r.sla_breached).length,
  }), [rows]);

  const openDrill = useCallback(async (row: SubRow) => {
    setDrill(row); setDrillEvents([]);
    try {
      const r = await api.get<{ data: { submission: SubRow; events: ChainEvent[] } }>(`/carbon/mrv-chain/${row.id}`);
      setDrill(r.data?.data?.submission || row);
      setDrillEvents(r.data?.data?.events || []);
    } catch {/* leave empty */}
  }, []);

  const act = useCallback(async (kind: string, payload: any, targetId: string) => {
    setError(null);
    try {
      await api.post(`/carbon/mrv-chain/${targetId}/${kind}`, payload);
      await load();
      if (drill) await openDrill(drill);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    }
  }, [load, openDrill, drill]);

  return (
    <div data-testid="carbon-mrv-chain-tab" style={{ padding: '16px 20px', minHeight: 600 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1c2733', marginTop: 0 }}>MRV verification chain</h2>
      <p style={{ fontSize: 13, color: '#557', marginTop: 4 }}>
        UNFCCC Article 6 verification workflow — draft → DOE assigned → DOE review →
        DOE opinion → CRA review → CRA approve / reject → issuance authorized → issued.
        DOE SLA 90 days (CDM rules); CRA SLA 30 days (Article 6.4 supervisory body).
      </p>

      <div data-testid="carbon-mrv-chain-kpis" style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <Kpi label="Total" value={kpis.total} />
        <Kpi label="In DOE" value={kpis.doe} sub="90-day SLA" />
        <Kpi label="In CRA" value={kpis.cra} sub="30-day SLA" />
        <Kpi label="Approved" value={kpis.approved} sub="ready for issuance" />
        <Kpi label="Issued" value={kpis.issued} />
        <Kpi label="Escalated" value={kpis.escalated} sub="regulator inbox" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            data-testid={`carbon-mrv-chain-filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 12px', borderRadius: 999, border: '1px solid #e3e7ec',
              background: filter === f.key ? '#1c2733' : '#fff',
              color: filter === f.key ? '#fff' : '#1c2733', fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >{f.label}</button>
        ))}
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#fde0e0', color: '#9b1f1f', borderRadius: 6, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div data-testid="carbon-mrv-chain-table" style={{ marginTop: 14, background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f8fb', textAlign: 'left', color: '#557' }}>
              <th style={{ padding: '8px 12px' }}>Submission</th>
              <th style={{ padding: '8px 12px' }}>Project</th>
              <th style={{ padding: '8px 12px' }}>Period</th>
              <th style={{ padding: '8px 12px', textAlign: 'right' }}>tCO₂e</th>
              <th style={{ padding: '8px 12px' }}>State</th>
              <th style={{ padding: '8px 12px' }}>SLA</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#7a8a9a' }}>
                {loading ? 'Loading…' : 'No submissions in this view.'}
              </td></tr>
            )}
            {filtered.map((r) => {
              const tone = TONE[r.chain_status];
              return (
                <tr
                  key={r.id}
                  data-testid={`carbon-mrv-chain-row-${r.id}`}
                  onClick={() => openDrill(r)}
                  style={{ borderTop: '1px solid #eef1f5', cursor: 'pointer' }}
                >
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{r.id}</td>
                  <td style={{ padding: '8px 12px' }}>{r.project_id}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {r.reporting_period_start.slice(0, 10)} → {r.reporting_period_end.slice(0, 10)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                    {Number(r.claimed_reductions_tco2e).toLocaleString()}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: tone.bg, color: tone.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {tone.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: r.sla_breached ? '#9b1f1f' : '#557' }}>
                    {fmtSla(r.days_until_sla, r.sla_breached)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {drill && (
        <div
          data-testid="carbon-mrv-chain-drill"
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 560, background: '#fff',
            borderLeft: '1px solid #e3e7ec', boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
            zIndex: 50, padding: 20, overflowY: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setDrill(null)}
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
          >×</button>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>{drill.id}</h3>
          <div style={{ fontSize: 12, color: '#557' }}>
            {drill.project_id} · {drill.reporting_period_start.slice(0, 10)} → {drill.reporting_period_end.slice(0, 10)}
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
            <div><span style={{ color: '#557' }}>State:</span> <strong>{TONE[drill.chain_status].label}</strong></div>
            <div><span style={{ color: '#557' }}>Claimed:</span> <strong>{Number(drill.claimed_reductions_tco2e).toLocaleString()} tCO₂e</strong></div>
            {drill.doe_due_at && (
              <div><span style={{ color: '#557' }}>DOE due:</span> <strong>{drill.doe_due_at.slice(0, 10)}</strong></div>
            )}
            {drill.cra_due_at && (
              <div><span style={{ color: '#557' }}>CRA due:</span> <strong>{drill.cra_due_at.slice(0, 10)}</strong></div>
            )}
            {drill.doe_opinion && (
              <div><span style={{ color: '#557' }}>DOE opinion:</span> <strong>{drill.doe_opinion}</strong></div>
            )}
          </div>

          {drill.cra_rejection_reason && (
            <div style={{ marginTop: 10, padding: 10, background: '#fde0e0', color: '#9b1f1f', borderRadius: 6, fontSize: 12 }}>
              <strong>CRA rejection:</strong> {drill.cra_rejection_reason}
            </div>
          )}

          <h4 style={{ marginTop: 18, fontSize: 13, color: '#557' }}>Chain timeline</h4>
          <div data-testid="carbon-mrv-chain-events" style={{ marginTop: 6, maxHeight: 320, overflowY: 'auto' }}>
            {drillEvents.length === 0 && (
              <div style={{ fontSize: 12, color: '#7a8a9a' }}>No events recorded.</div>
            )}
            {drillEvents.map((ev) => (
              <div
                key={ev.id}
                data-testid={`carbon-mrv-chain-event-${ev.id}`}
                style={{ padding: '8px 10px', borderBottom: '1px solid #eef1f5' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{ev.event_type}</div>
                  <span style={{ fontSize: 10, color: '#7a8a9a' }}>{ev.created_at.slice(0, 16).replace('T', ' ')}</span>
                </div>
                <div style={{ marginTop: 2, fontSize: 12 }}>{ev.notes ?? ''}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: '#557', fontFamily: 'monospace' }}>
                  {ev.from_status ?? '∅'} → {ev.to_status}
                </div>
              </div>
            ))}
          </div>

          <div data-testid="carbon-mrv-chain-actions" style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {drill.chain_status === 'draft' && (
              <button type="button" data-testid="carbon-mrv-chain-submit"
                onClick={() => void act('submit', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#1c2733', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Submit</button>
            )}
            {drill.chain_status === 'submitted' && (
              <button type="button" data-testid="carbon-mrv-chain-assign-doe"
                onClick={() => void act('assign-doe', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Assign DOE</button>
            )}
            {drill.chain_status === 'doe_assigned' && (
              <button type="button" data-testid="carbon-mrv-chain-start-review"
                onClick={() => void act('start-review', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Start review</button>
            )}
            {drill.chain_status === 'doe_review' && (
              <>
                <button type="button" data-testid="carbon-mrv-chain-opinion-positive"
                  onClick={() => void act('record-opinion', { doe_opinion: 'positive' }, drill.id)}
                  style={{ padding: '6px 12px', background: '#1f6b3a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Positive</button>
                <button type="button" data-testid="carbon-mrv-chain-opinion-qualified"
                  onClick={() => void act('record-opinion', { doe_opinion: 'qualified' }, drill.id)}
                  style={{ padding: '6px 12px', background: '#a06200', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Qualified</button>
                <button type="button" data-testid="carbon-mrv-chain-opinion-adverse"
                  onClick={() => {
                    const notes = prompt('Adverse finding — provide reason:');
                    if (notes) void act('record-opinion', { doe_opinion: 'adverse', notes }, drill.id);
                  }}
                  style={{ padding: '6px 12px', background: '#9b1f1f', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Adverse</button>
              </>
            )}
            {(drill.chain_status === 'doe_opinion_positive' || drill.chain_status === 'doe_opinion_qualified') && (
              <button type="button" data-testid="carbon-mrv-chain-submit-cra"
                onClick={() => void act('submit-cra', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Submit to CRA</button>
            )}
            {drill.chain_status === 'cra_review' && (
              <>
                <button type="button" data-testid="carbon-mrv-chain-approve-cra"
                  onClick={() => void act('approve-cra', {}, drill.id)}
                  style={{ padding: '6px 12px', background: '#1f6b3a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >CRA approve</button>
                <button type="button" data-testid="carbon-mrv-chain-reject-cra"
                  onClick={() => {
                    const reason = prompt('CRA rejection reason?');
                    if (reason) void act('reject-cra', { rejection_reason: reason }, drill.id);
                  }}
                  style={{ padding: '6px 12px', background: '#9b1f1f', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >CRA reject</button>
              </>
            )}
            {drill.chain_status === 'cra_approved' && (
              <button type="button" data-testid="carbon-mrv-chain-authorize-issuance"
                onClick={() => void act('authorize-issuance', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#1c2733', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Authorize issuance</button>
            )}
            {drill.chain_status === 'issuance_authorized' && (
              <button type="button" data-testid="carbon-mrv-chain-issue"
                onClick={() => void act('issue', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#1f6b3a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Issue credits</button>
            )}
            {!drill.is_terminal && (
              <button type="button" data-testid="carbon-mrv-chain-withdraw"
                onClick={() => {
                  if (confirm('Withdraw this submission? This is terminal.')) {
                    void act('withdraw', {}, drill.id);
                  }
                }}
                style={{ padding: '6px 12px', background: '#557', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Withdraw</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
