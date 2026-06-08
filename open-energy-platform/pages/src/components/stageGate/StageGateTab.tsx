// Wave 131 - Project Stage Gates (DG0-DG4) governance chain.
//
// PHASE E WAVE 1 OF N - First IPP-PM profile-completeness wave.
//
// Mounted at:
//   /ipp-lifecycle/workstation?tab=stage-gates  (WRITE: ipp_developer/admin)
//   /lender-suite/workstation?tab=stage-gates   (READ: lender - DG2/DG3)
//   /regulator/workstation?tab=stage-gates      (READ: regulator - DG0/DG4)
//
// 12-state forward + 4 branch lifecycle:
//   gate_proposed -> evidence_compiled -> ie_reviewed -> lender_reviewed
//     -> board_briefing_circulated -> cab_held -> conditions_set
//     -> decision_recorded -> conditions_satisfied -> gate_passed
//     -> notified_downstream -> archived
//   + gate_deferred (SOFT) / gate_withdrawn / gate_rejected (HARD, W131 SIG)
//   + gate_conditional_pass (W131 SIGNATURE branch - loops back)
//
// INVERTED SLA: low_capex 7d -> equator_cat_a 90d.
// SIGNATURE: reject_gate crosses regulator EVERY tier.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type SgStatus =
  | 'gate_proposed' | 'evidence_compiled' | 'ie_reviewed' | 'lender_reviewed'
  | 'board_briefing_circulated' | 'cab_held' | 'conditions_set' | 'decision_recorded'
  | 'conditions_satisfied' | 'gate_passed' | 'notified_downstream' | 'archived'
  | 'gate_deferred' | 'gate_withdrawn' | 'gate_rejected' | 'gate_conditional_pass';

type SgTier = 'low_capex' | 'medium_capex' | 'high_capex' | 'mega_capex' | 'equator_cat_a';

interface SgRow {
  id: string;
  gate_index: number;
  project_id: string;
  title: string | null;
  capex_zar: number | null;
  equator_category: string | null;
  current_tier: SgTier;
  floor_equator_cat_a: number;
  floor_fid_committed: number;
  floor_nersa_notifiable: number;
  floor_debt_sized: number;
  floor_shareholder_consent_required: number;
  w19_procurement_ref: string | null;
  w20_cod_ref: string | null;
  w21_drawdown_ref: string | null;
  w113_evm_ref: string | null;
  w118_block_ref: string | null;
  decision: string | null;
  conditions_payload: string | null;
  ie_letter_attached_bool_live: number;
  cab_minutes_attached_bool_live: number;
  board_minutes_attached_bool_live: number;
  cost_confidence_aace_class_live: string | null;
  irr_post_tax_live: number | null;
  chain_status: SgStatus;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  sla_breached: number;
  is_reportable: number;
  regulator_ref: string | null;
  regulator_crossed_at: string | null;
  authority_required: string | null;
  urgency_band: string | null;
  // LIVE derived
  time_in_state_hours_live: number | null;
  sla_remaining_hours_live: number | null;
  conditions_aging_days_live: number | null;
  equator_category_live: string;
  gate_name: string;
  created_at: string;
  updated_at: string;
}

interface Dashboard {
  stage_gates: {
    active_gates_count: number;
    sla_breached_count: number;
    rejected_count: number;
    total_count: number;
  };
}

type FilterTier = 'all' | SgTier;
type FilterStatus = 'all' | 'active' | 'terminal' | 'breached' | 'reportable';
type FilterGate = 'all' | '0' | '1' | '2' | '3' | '4';

const TIER_LABEL: Record<SgTier, string> = {
  low_capex: 'Low (<R100M)',
  medium_capex: 'Medium (R100–500M)',
  high_capex: 'High (R500M–2bn)',
  mega_capex: 'Mega (>R2bn)',
  equator_cat_a: 'Equator Cat A',
};

const TIER_COLOR: Record<SgTier, string> = {
  low_capex: '#6b7280',
  medium_capex: '#2563eb',
  high_capex: '#d97706',
  mega_capex: '#dc2626',
  equator_cat_a: '#7c3aed',
};

const STATUS_COLOR: Record<string, string> = {
  gate_proposed: '#6b7280',
  evidence_compiled: '#2563eb',
  ie_reviewed: '#0891b2',
  lender_reviewed: '#0891b2',
  board_briefing_circulated: '#7c3aed',
  cab_held: '#7c3aed',
  conditions_set: '#d97706',
  decision_recorded: '#d97706',
  conditions_satisfied: '#059669',
  gate_passed: '#059669',
  notified_downstream: '#16a34a',
  archived: '#4b5563',
  gate_deferred: '#f59e0b',
  gate_withdrawn: '#6b7280',
  gate_rejected: '#dc2626',
  gate_conditional_pass: '#f59e0b',
};

const GATE_NAMES: Record<number, string> = {
  0: 'DG0 Concept',
  1: 'DG1 Feasibility',
  2: 'DG2 FEED/FID-prep',
  3: 'DG3 Sanction (FID)',
  4: 'DG4 COD/Operations',
};

const FORWARD_ACTIONS: Partial<Record<SgStatus, { action: string; label: string }>> = {
  gate_proposed:               { action: 'compile_evidence',          label: 'Compile Evidence' },
  evidence_compiled:           { action: 'ie_review',                 label: 'IE Review' },
  ie_reviewed:                 { action: 'lender_review',             label: 'Lender Review' },
  lender_reviewed:             { action: 'circulate_board_briefing',  label: 'Circulate Briefing' },
  board_briefing_circulated:   { action: 'hold_cab',                  label: 'Hold CAB' },
  cab_held:                    { action: 'set_conditions',            label: 'Set Conditions' },
  conditions_set:              { action: 'record_decision',           label: 'Record Decision' },
  decision_recorded:           { action: 'satisfy_conditions',        label: 'Satisfy Conditions' },
  conditions_satisfied:        { action: 'pass_gate',                 label: 'Pass Gate' },
  gate_passed:                 { action: 'notify_downstream',         label: 'Notify Downstream' },
  notified_downstream:         { action: 'archive',                   label: 'Archive' },
  gate_deferred:               { action: 'compile_evidence',          label: 'Resume (Evidence)' },
  gate_conditional_pass:       { action: 'satisfy_conditions',        label: 'Satisfy Conditions' },
};

function isTerminal(s: SgStatus): boolean {
  return s === 'archived' || s === 'gate_rejected' || s === 'gate_withdrawn';
}

function fmtCapex(zar: number | null): string {
  if (!zar) return '—';
  if (zar >= 1_000_000_000) return `R${(zar / 1_000_000_000).toFixed(1)}bn`;
  if (zar >= 1_000_000) return `R${(zar / 1_000_000).toFixed(0)}M`;
  return `R${zar.toLocaleString()}`;
}

function fmtHours(h: number | null): string {
  if (h === null) return '—';
  if (h >= 24) return `${Math.round(h / 24)}d`;
  return `${Math.round(h)}h`;
}

interface StageGateTabProps {
  readOnly?: boolean;
}

export default function StageGateTab({ readOnly = false }: StageGateTabProps) {
  const [rows, setRows] = useState<SgRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<FilterTier>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterGate, setFilterGate] = useState<FilterGate>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api('/api/stage-gate');
      setRows(res.data?.data ?? []);
      setDashboard(res.data?.dashboard ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load stage gates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterTier !== 'all' && r.current_tier !== filterTier) return false;
      if (filterGate !== 'all' && String(r.gate_index) !== filterGate) return false;
      if (filterStatus === 'active' && isTerminal(r.chain_status)) return false;
      if (filterStatus === 'terminal' && !isTerminal(r.chain_status)) return false;
      if (filterStatus === 'breached' && !r.sla_breached) return false;
      if (filterStatus === 'reportable' && !r.is_reportable) return false;
      return true;
    });
  }, [rows, filterTier, filterStatus, filterGate]);

  // Group by gate index for DG-row layout
  const byGate = useMemo(() => {
    const groups: Record<number, SgRow[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    for (const r of filtered) {
      if (groups[r.gate_index] !== undefined) groups[r.gate_index].push(r);
    }
    return groups;
  }, [filtered]);

  async function runAction(id: string, action: string) {
    if (readOnly) return;
    try {
      setActionLoading(`${id}:${action}`);
      await api(`/api/stage-gate/${id}/${action}`, { method: 'POST', data: {} });
      await load();
    } catch (e: any) {
      alert(`Action failed: ${e?.message ?? 'Unknown error'}`);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, color: '#6b7280', fontFamily: 'monospace' }}>
        Loading stage gates…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, color: '#dc2626', fontFamily: 'monospace' }}>
        {error}
      </div>
    );
  }

  const db = dashboard?.stage_gates;

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: 24 }}>
      {/* KPI header */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Active gates', value: db?.active_gates_count ?? 0, tone: 'neutral' },
          { label: 'SLA breached', value: db?.sla_breached_count ?? 0, tone: db?.sla_breached_count ? 'warn' : 'good' },
          { label: 'Rejected', value: db?.rejected_count ?? 0, tone: db?.rejected_count ? 'bad' : 'good' },
          { label: 'Total', value: db?.total_count ?? rows.length, tone: 'neutral' },
        ].map(k => (
          <div key={k.label} style={{
            background: k.tone === 'bad' ? '#fef2f2' : k.tone === 'warn' ? '#fffbeb' : '#f0fdf4',
            border: `1px solid ${k.tone === 'bad' ? '#fecaca' : k.tone === 'warn' ? '#fde68a' : '#bbf7d0'}`,
            borderRadius: 8, padding: '12px 20px', minWidth: 120,
          }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.tone === 'bad' ? '#dc2626' : k.tone === 'warn' ? '#d97706' : '#059669' }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {/* Gate filter */}
        {(['all', '0', '1', '2', '3', '4'] as FilterGate[]).map(g => (
          <button type="button" key={g}
            onClick={() => setFilterGate(g)}
            style={{
              padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
              background: filterGate === g ? '#1e40af' : '#e5e7eb',
              color: filterGate === g ? '#fff' : '#374151',
            }}>
            {g === 'all' ? 'All DG' : GATE_NAMES[Number(g)]}
          </button>
        ))}
        <span style={{ color: '#d1d5db', margin: '0 4px' }}>|</span>
        {(['all', 'active', 'terminal', 'breached', 'reportable'] as FilterStatus[]).map(s => (
          <button type="button" key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
              background: filterStatus === s ? '#1e40af' : '#e5e7eb',
              color: filterStatus === s ? '#fff' : '#374151',
            }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <span style={{ color: '#d1d5db', margin: '0 4px' }}>|</span>
        {(['all', 'low_capex', 'medium_capex', 'high_capex', 'mega_capex', 'equator_cat_a'] as FilterTier[]).map(t => (
          <button type="button" key={t}
            onClick={() => setFilterTier(t)}
            style={{
              padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
              background: filterTier === t ? (t === 'all' ? '#1e40af' : TIER_COLOR[t as SgTier]) : '#e5e7eb',
              color: filterTier === t ? '#fff' : '#374151',
            }}>
            {t === 'all' ? 'All tiers' : TIER_LABEL[t as SgTier]}
          </button>
        ))}
      </div>

      {/* DG-row layout: one section per gate index */}
      {([0,1,2,3,4] as const).map(gateIndex => {
        const gateRows = byGate[gateIndex];
        if (gateRows.length === 0 && filterGate !== 'all' && filterGate !== String(gateIndex)) return null;
        return (
          <div key={gateIndex} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: gateIndex === 3 ? '#dc2626' : gateIndex === 4 ? '#059669' : '#1e40af',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
              }}>
                {gateIndex}
              </div>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{GATE_NAMES[gateIndex]}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>({gateRows.length} gate{gateRows.length !== 1 ? 's' : ''})</span>
              {(gateIndex === 0 || gateIndex === 4) && (
                <span style={{ fontSize: 11, background: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: 10 }}>
                  NERSA notifiable
                </span>
              )}
              {gateIndex === 3 && (
                <span style={{ fontSize: 11, background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: 10 }}>
                  FID / REIPPPP sanction
                </span>
              )}
            </div>

            {gateRows.length === 0 ? (
              <div style={{ color: '#9ca3af', fontSize: 13, paddingLeft: 36 }}>No gates at this stage</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 36 }}>
                {gateRows.map(row => {
                  const isExpanded = expandedId === row.id;
                  const fwd = FORWARD_ACTIONS[row.chain_status];
                  const terminal = isTerminal(row.chain_status);
                  const statusColor = STATUS_COLOR[row.chain_status] ?? '#6b7280';

                  return (
                    <div key={row.id} style={{
                      border: `1px solid ${row.sla_breached ? '#fecaca' : row.is_reportable ? '#fde68a' : '#e5e7eb'}`,
                      borderRadius: 8,
                      background: row.chain_status === 'gate_rejected' ? '#fef2f2'
                        : row.chain_status === 'archived' ? '#f9fafb'
                        : '#fff',
                    }}>
                      {/* Row header */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      >
                        {/* Status dot */}
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />

                        {/* Title + project */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.title ?? `${GATE_NAMES[row.gate_index]} — ${row.project_id}`}
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            {row.project_id} · {fmtCapex(row.capex_zar)}
                          </div>
                        </div>

                        {/* Status badge */}
                        <div style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                          background: statusColor + '22', color: statusColor,
                        }}>
                          {row.chain_status.replace(/_/g, ' ')}
                        </div>

                        {/* Tier badge */}
                        <div style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                          background: TIER_COLOR[row.current_tier] + '22',
                          color: TIER_COLOR[row.current_tier],
                        }}>
                          {TIER_LABEL[row.current_tier]}
                        </div>

                        {/* SLA badge */}
                        {!terminal && row.sla_remaining_hours_live !== null && (
                          <div style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                            background: row.sla_breached ? '#fef2f2' : row.sla_remaining_hours_live < 48 ? '#fffbeb' : '#f0fdf4',
                            color: row.sla_breached ? '#dc2626' : row.sla_remaining_hours_live < 48 ? '#d97706' : '#059669',
                          }}>
                            {row.sla_breached ? '⚠ SLA breached' : `SLA ${fmtHours(row.sla_remaining_hours_live)} left`}
                          </div>
                        )}

                        {/* Regulator flag */}
                        {row.is_reportable ? (
                          <div style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#fef3c7', color: '#b45309' }}>
                            NERSA/DMRE
                          </div>
                        ) : null}

                        {/* Chevron */}
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>{isExpanded ? '▲' : '▼'}</div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div style={{ padding: '12px 14px', borderTop: '1px solid #e5e7eb', background: '#fafafa' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
                            {[
                              ['Capex', fmtCapex(row.capex_zar)],
                              ['Equator', row.equator_category_live ?? '—'],
                              ['Cost confidence', row.cost_confidence_aace_class_live ?? '—'],
                              ['IRR post-tax', row.irr_post_tax_live != null ? `${row.irr_post_tax_live.toFixed(1)}%` : '—'],
                              ['SLA target', fmtHours(row.sla_target_hours)],
                              ['Time in state', fmtHours(row.time_in_state_hours_live)],
                              ['Conditions aging', row.conditions_aging_days_live != null ? `${row.conditions_aging_days_live}d` : '—'],
                              ['Authority', row.authority_required ?? '—'],
                              ['Decision', row.decision ?? '—'],
                              ['Regulator ref', row.regulator_ref ?? '—'],
                            ].map(([k, v]) => (
                              <div key={k}>
                                <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>{k}</div>
                                <div style={{ fontSize: 12, fontWeight: 500 }}>{v}</div>
                              </div>
                            ))}
                          </div>

                          {/* Bridges */}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                            {[
                              ['W19 Procurement', row.w19_procurement_ref],
                              ['W20 COD', row.w20_cod_ref],
                              ['W21 Drawdown', row.w21_drawdown_ref],
                              ['W113 EVM', row.w113_evm_ref],
                              ['W118 Audit', row.w118_block_ref],
                            ].map(([label, ref]) => (
                              <div key={label} style={{
                                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                background: ref ? '#dcfce7' : '#f3f4f6',
                                color: ref ? '#16a34a' : '#9ca3af',
                              }}>
                                {ref ? `✓ ${label}` : `○ ${label}`}
                              </div>
                            ))}
                          </div>

                          {/* Floor flags */}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                            {[
                              ['Equator Cat A', row.floor_equator_cat_a],
                              ['FID committed', row.floor_fid_committed],
                              ['NERSA notifiable', row.floor_nersa_notifiable],
                              ['Debt sized', row.floor_debt_sized],
                              ['Shareholder consent', row.floor_shareholder_consent_required],
                            ].map(([label, flag]) => flag ? (
                              <div key={label as string} style={{
                                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                background: '#ede9fe', color: '#7c3aed',
                              }}>
                                {label as string}
                              </div>
                            ) : null)}
                          </div>

                          {/* Action buttons */}
                          {!readOnly && !terminal && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {fwd && (
                                <button type="button"
                                  onClick={() => runAction(row.id, fwd.action)}
                                  disabled={!!actionLoading}
                                  style={{
                                    padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                    background: '#1e40af', color: '#fff', fontSize: 12, fontWeight: 500,
                                    opacity: actionLoading ? 0.7 : 1,
                                  }}>
                                  {actionLoading === `${row.id}:${fwd.action}` ? '…' : fwd.label}
                                </button>
                              )}
                              {/* Conditional pass (for conditions_satisfied / gate_passed) */}
                              {(row.chain_status === 'conditions_satisfied' || row.chain_status === 'gate_passed') && (
                                <button type="button"
                                  onClick={() => runAction(row.id, 'conditional_pass')}
                                  disabled={!!actionLoading}
                                  style={{
                                    padding: '6px 16px', borderRadius: 6, border: '1px solid #f59e0b',
                                    cursor: 'pointer', background: '#fffbeb', color: '#92400e', fontSize: 12,
                                    opacity: actionLoading ? 0.7 : 1,
                                  }}>
                                  Conditional Pass
                                </button>
                              )}
                              {/* Defer */}
                              {!['gate_deferred','gate_conditional_pass'].includes(row.chain_status) && (
                                <button type="button"
                                  onClick={() => runAction(row.id, 'defer_gate')}
                                  disabled={!!actionLoading}
                                  style={{
                                    padding: '6px 16px', borderRadius: 6, border: '1px solid #d97706',
                                    cursor: 'pointer', background: '#fffbeb', color: '#92400e', fontSize: 12,
                                    opacity: actionLoading ? 0.7 : 1,
                                  }}>
                                  Defer
                                </button>
                              )}
                              {/* Reject */}
                              <button type="button"
                                onClick={() => {
                                  if (confirm(`REJECT gate for ${row.title ?? row.project_id}? This terminates the project at this gate. NERSA/DMRE will be notified (W131 SIGNATURE). Continue?`)) {
                                    runAction(row.id, 'reject_gate');
                                  }
                                }}
                                disabled={!!actionLoading}
                                style={{
                                  padding: '6px 16px', borderRadius: 6, border: '1px solid #dc2626',
                                  cursor: 'pointer', background: '#fef2f2', color: '#dc2626', fontSize: 12,
                                  opacity: actionLoading ? 0.7 : 1,
                                }}>
                                Reject (W131 SIG)
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: 40 }}>
          No stage gates match the selected filters.
        </div>
      )}
    </div>
  );
}
