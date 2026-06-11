// Wave 27 — REIPPPP Economic Development commitment monitoring chain.
//
// 9-state lifecycle for the 7 contractual ED commitments every REIPPPP-awarded
// project carries to IPPO/DMRE/DTI. Surfaced as a P6 audit chain on the IPP
// workstation (the IPP team owns cure-plan submission) and Regulator inbox.
//
//   • KPI strip: total / variance open / cure required / cure executing /
//     penalty open / escalated / breached / penalty total ZAR
//   • Filter pills by commitment type + chain state + reportable
//   • Listing with tier pill + variance % + SLA countdown
//   • Drill-down: timeline + per-state action button (13 transitions)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainCardProps, type ChainEvent } from '../ChainCard';

const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'baseline_locked' | 'monitoring' | 'variance_flagged'
  | 'cure_plan_required' | 'cure_plan_submitted' | 'cure_executing'
  | 'verified_compliant' | 'closed'
  | 'penalty_issued' | 'escalated' | 'false_alarm';

type Tier =
  | 'ownership' | 'local_content'
  | 'jobs' | 'skills'
  | 'enterprise_dev' | 'socio_economic' | 'community_trust';

interface EdRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  project_id: string;
  project_name: string;
  bid_window: string;
  commitment_type: Tier;
  commitment_label: string;
  baseline_value: number;
  baseline_unit: string;
  reporting_period: string;
  current_value: number | null;
  variance_pct: number | null;
  variance_threshold_pct: number;
  cure_plan_summary: string | null;
  cure_plan_filed_at: string | null;
  cure_plan_approved_at: string | null;
  remediation_summary: string | null;
  linked_wo_id: string | null;
  penalty_amount_zar: number | null;
  penalty_ref: string | null;
  regulator_authority: string | null;
  regulator_ref: string | null;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  closure_notes: string | null;
  baseline_locked_at: string;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_high_scoring?: boolean;
  is_reportable?: boolean;
  created_by: string;
  created_at: string;
}

interface EdEvent {
  id: string;
  commitment_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiData {
  total: number;
  variance_open: number;
  cure_required: number;
  cure_executing: number;
  penalty_open: number;
  escalated: number;
  breached: number;
  penalty_total_zar: number;
}

const ALL_STATES = [
  'baseline_locked',
  'monitoring',
  'variance_flagged',
  'cure_plan_required',
  'cure_plan_submitted',
  'cure_executing',
  'verified_compliant',
  'closed',
] as const;

const BRANCH_STATES = [
  'penalty_issued',
  'escalated',
  'false_alarm',
] as const;

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active' },
  { key: 'all',                 label: 'All' },
  { key: 'reportable',          label: 'High-scoring' },
  { key: 'ownership',           label: 'Ownership' },
  { key: 'local_content',       label: 'Local content' },
  { key: 'jobs',                label: 'Jobs' },
  { key: 'skills',              label: 'Skills' },
  { key: 'enterprise_dev',      label: 'Enterprise dev' },
  { key: 'socio_economic',      label: 'Socio-econ' },
  { key: 'community_trust',     label: 'Community trust' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'escalated',           label: 'Escalated' },
  { key: 'baseline_locked',     label: 'Baseline locked' },
  { key: 'monitoring',          label: 'Monitoring' },
  { key: 'variance_flagged',    label: 'Variance flagged' },
  { key: 'cure_plan_required',  label: 'Cure required' },
  { key: 'cure_plan_submitted', label: 'Cure submitted' },
  { key: 'cure_executing',      label: 'Cure executing' },
  { key: 'verified_compliant',  label: 'Verified' },
  { key: 'penalty_issued',      label: 'Penalty issued' },
  { key: 'closed',              label: 'Closed' },
];

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtVariance(v: number | null): string {
  if (v === null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function fmtBaseline(value: number, unit: string): string {
  if (unit === 'percent') return `${value.toFixed(1)}%`;
  if (unit === 'fte')     return `${Math.round(value)} FTE`;
  if (unit === 'zar')     return `R${value.toLocaleString('en-ZA')}`;
  return `${value.toLocaleString('en-ZA')} ${unit}`;
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1_000)     return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function getActions(row: EdRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'baseline_locked') {
    actions.push({ key: 'activate-monitoring', label: 'Activate monitoring', tone: 'primary' });
  }
  if (s === 'monitoring') {
    actions.push({
      key: 'detect-variance',
      label: 'Flag variance',
      tone: 'primary',
      fields: [
        { key: 'current_value', label: `Current ${row.commitment_label} value (baseline ${fmtBaseline(row.baseline_value, row.baseline_unit)})`, type: 'text', required: true },
        { key: 'variance_pct',  label: 'Variance % vs baseline (negative = under)', type: 'text', required: false },
      ],
    });
  }
  if (s === 'variance_flagged') {
    const defaultAuth = row.commitment_type === 'ownership' || row.commitment_type === 'local_content'
      ? 'IPPO;DMRE' : 'IPPO';
    actions.push({
      key: 'require-cure-plan',
      label: 'Require cure plan (IPPO)',
      tone: 'primary',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'regulator_authority', label: `Regulator authority (IPPO / IPPO;DMRE / IPPO;DTI) — default: ${defaultAuth}`, type: 'text', required: false },
        { key: 'regulator_ref',       label: 'IPPO cure-plan notice reference (e.g. IPPO-ED-2026-0142)', type: 'text', required: false },
      ],
    });
    actions.push({
      key: 'mark-false-alarm',
      label: 'Mark false alarm',
      tone: 'ghost',
      fields: [
        { key: 'closure_notes', label: 'False-alarm reason (e.g. stale-data reconciliation)', type: 'textarea', required: true },
      ],
    });
  }
  if (s === 'cure_plan_required') {
    actions.push({
      key: 'submit-cure-plan',
      label: 'Submit cure plan',
      tone: 'primary',
      fields: [
        { key: 'cure_plan_summary', label: 'Cure plan summary (key actions, milestones, ZAR commitment)', type: 'textarea', required: true },
      ],
    });
  }
  if (s === 'cure_plan_submitted') {
    actions.push({
      key: 'approve-cure-plan',
      label: 'Approve + begin cure',
      tone: 'primary',
      fields: [
        { key: 'linked_wo_id', label: 'Linked work order ID (optional)', type: 'text', required: false },
      ],
    });
  }
  if (s === 'cure_executing') {
    actions.push({
      key: 'verify-compliance',
      label: 'Verify compliance',
      tone: 'primary',
      fields: [
        { key: 'remediation_summary', label: 'Remediation summary (what was achieved)', type: 'textarea', required: false },
        { key: 'current_value',       label: 'Verified current value', type: 'text', required: false },
        { key: 'variance_pct',        label: 'Verified variance %', type: 'text', required: false },
      ],
    });
    actions.push({
      key: 'issue-penalty',
      label: 'Issue DMRE penalty',
      tone: 'danger',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'penalty_amount_zar',  label: 'Penalty amount (ZAR)', type: 'text', required: true },
        { key: 'penalty_ref',         label: 'DMRE penalty reference (e.g. DMRE-PEN-2026-0014)', type: 'text', required: false },
        { key: 'regulator_authority', label: 'Regulator authority (DMRE / IPPO;DMRE) — default: DMRE', type: 'text', required: false },
      ],
    });
    actions.push({
      key: 'escalate',
      label: 'Escalate to DTI',
      tone: 'warn',
      cascadeTo: ['regulator'],
    });
  }
  if (s === 'penalty_issued') {
    actions.push({
      key: 'close-with-penalty',
      label: 'Close with penalty',
      tone: 'primary',
      fields: [
        { key: 'closure_notes', label: 'Closure notes', type: 'textarea', required: false },
      ],
    });
    actions.push({
      key: 'escalate',
      label: 'Escalate to DTI',
      tone: 'warn',
      cascadeTo: ['regulator'],
    });
  }
  if (s === 'verified_compliant') {
    actions.push({
      key: 'close-compliant',
      label: 'Close compliant',
      tone: 'primary',
      fields: [
        { key: 'closure_notes', label: 'Closure notes', type: 'textarea', required: false },
      ],
    });
  }
  if (s === 'escalated') {
    actions.push({
      key: 'close-escalated',
      label: 'Close escalated',
      tone: 'primary',
      fields: [
        { key: 'closure_notes', label: 'Closure notes', type: 'textarea', required: false },
      ],
    });
  }
  if (s === 'false_alarm') {
    actions.push({
      key: 'close-false-alarm',
      label: 'Close false alarm',
      tone: 'ghost',
      fields: [
        { key: 'closure_notes', label: 'Closure notes', type: 'textarea', required: false },
      ],
    });
  }

  return actions;
}

function renderDetail(row: EdRow): React.ReactNode {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
      <DetailPair label="Project"          value={row.project_id} />
      <DetailPair label="Bid window"       value={row.bid_window} />
      <DetailPair label="Reporting period" value={row.reporting_period} />
      <DetailPair label="Baseline"         value={fmtBaseline(row.baseline_value, row.baseline_unit)} />
      <DetailPair label="Current"          value={row.current_value !== null ? fmtBaseline(row.current_value, row.baseline_unit) : '—'} />
      <DetailPair label="Variance"         value={fmtVariance(row.variance_pct)} />
      <DetailPair label="Threshold"        value={`${row.variance_threshold_pct.toFixed(1)}%`} />
      <DetailPair label="State"            value={row.chain_status.replace(/_/g, ' ')} />
      <DetailPair label="Regulator"        value={row.regulator_authority ?? '—'} />
      <DetailPair label="Regulator ref"    value={row.regulator_ref ?? '—'} />
      <DetailPair label="Penalty"          value={fmtZar(row.penalty_amount_zar)} />
      <DetailPair label="Penalty ref"      value={row.penalty_ref ?? '—'} />
      <DetailPair label="Linked WO"        value={row.linked_wo_id ?? '—'} />
      <DetailPair label="Cure filed"       value={fmtDate(row.cure_plan_filed_at)} />
      <DetailPair label="Cure approved"    value={fmtDate(row.cure_plan_approved_at)} />
      <DetailPair label="Escalation"       value={String(row.escalation_level)} />
      <DetailPair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="Created"          value={fmtDate(row.created_at)} />
      {row.cure_plan_summary && (
        <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: '8px 10px', borderRadius: 4, border: `1px solid ${BORDER}`, background: BG2 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 2 }}>Cure plan</div>
          <div style={{ fontSize: 12, color: TX1 }}>{row.cure_plan_summary}</div>
        </div>
      )}
      {row.remediation_summary && (
        <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: '8px 10px', borderRadius: 4, border: `1px solid ${BORDER}`, background: BG2 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 2 }}>Remediation summary</div>
          <div style={{ fontSize: 12, color: TX1 }}>{row.remediation_summary}</div>
        </div>
      )}
      {row.closure_notes && (
        <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: '8px 10px', borderRadius: 4, border: `1px solid ${BORDER}`, background: BG2 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 2 }}>Closure notes</div>
          <div style={{ fontSize: 12, color: TX1 }}>{row.closure_notes}</div>
        </div>
      )}
    </div>
  );
}

export function EdCommitmentChainTab() {
  const [rows, setRows] = useState<EdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: EdRow[] } }>('/ed/commitment-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load ED commitments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ed/commitment-chain/${rowId}/${key}`, values);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: EdRow; events: EdEvent[] } }>(`/ed/commitment-chain/${id}`);
      const evts = res.data?.data?.events || [];
      setExpandedEvents(prev => ({ ...prev, [id]: evts.map(e => ({
        id: e.id,
        event_type: e.event_type,
        from_status: e.from_status,
        to_status: e.to_status,
        actor_id: e.actor_id,
        notes: e.notes,
        payload: e.payload,
        created_at: e.created_at,
      })) }));
    } catch {
      // silently fail event load
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return !!r.is_high_scoring;
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'escalated')  return r.chain_status === 'escalated' || r.escalation_level > 0;
      if (['ownership','local_content','jobs','skills','enterprise_dev','socio_economic','community_trust'].includes(filter)) {
        return r.commitment_type === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const summary = useMemo((): KpiData => {
    let variance_open = 0, cure_required = 0, cure_executing = 0;
    let penalty_open = 0, escalated = 0, breached = 0;
    let penalty_total_zar = 0;
    for (const r of rows) {
      if (r.chain_status === 'variance_flagged') variance_open++;
      if (r.chain_status === 'cure_plan_required' || r.chain_status === 'cure_plan_submitted') cure_required++;
      if (r.chain_status === 'cure_executing') cure_executing++;
      if (r.chain_status === 'penalty_issued') penalty_open++;
      if (r.chain_status === 'escalated' || r.escalation_level > 0) escalated++;
      if (r.sla_breached) breached++;
      penalty_total_zar += r.penalty_amount_zar || 0;
    }
    return { total: rows.length, variance_open, cure_required, cure_executing, penalty_open, escalated, breached, penalty_total_zar };
  }, [rows]);

  return (
    <div style={{ padding: '20px', background: BG, minHeight: '100%' }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: TX1, margin: 0 }}>
          REIPPPP Economic Development commitment chain
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 4, lineHeight: 1.5 }}>
          7 contractual ED commitments (ownership · local content · jobs · skills · enterprise dev · SED · community trust)
          tracked baseline → quarterly monitoring → variance → IPPO cure plan → cure execution → verification → close.
          Ownership/local-content 14d variance window, IPPO 30d cure plan, DMRE penalty + DTI Codes Council escalation
          on persistent under-performance. High-scoring + jobs/skills breaches cross to regulator inbox.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 16 }}>
        <KpiTile label="Total"          value={summary.total} />
        <KpiTile label="Variance open"  value={summary.variance_open}   tone={summary.variance_open > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Cure required"  value={summary.cure_required}   tone={summary.cure_required > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Cure executing" value={summary.cure_executing}  tone={summary.cure_executing > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Penalty open"   value={summary.penalty_open}    tone={summary.penalty_open > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Escalated"      value={summary.escalated}       tone={summary.escalated > 0 ? 'bad' : 'ok'} />
        <KpiTile label="SLA breached"   value={summary.breached}        tone={summary.breached > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Penalty total"  value={fmtZar(summary.penalty_total_zar)} tone={summary.penalty_total_zar > 0 ? 'bad' : 'ok'} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
              transition: 'all 120ms',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 4, border: `1px solid ${BAD}40`, background: `${BAD}10`, fontSize: 12, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 6, border: `1px solid ${BORDER}` }}>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 6, border: `1px solid ${BORDER}` }}>
          No ED commitments match.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((row) => (
            <ChainCard
              key={row.id}
              item={row as unknown as ChainCardProps['item']}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.project_name} — ${row.commitment_label}`}
              meta={`${row.bid_window} · ${row.commitment_type.replace(/_/g, ' ')} · Period: ${row.reporting_period}`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              onExpand={handleExpand}
              events={expandedEvents[row.id]}
              detail={renderDetail(row)}
              cascadeTo={row.is_high_scoring ? ['regulator'] : []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1, marginTop: 1 }}>{value}</div>
    </div>
  );
}

export default EdCommitmentChainTab;
