// Wave 26 — Cybersecurity incident chain (POPIA Section 22 + Cybercrimes Act Section 54).
//
// 12-state digital incident lifecycle surfaced as a P6 audit chain on
// Admin + Regulator + IPP workstations. Sister to W25 HSE chain.
//
//   • KPI strip: total / reportable open / notify-regulator pending / escalated / breached / records affected
//   • Filter pills by tier + chain state
//   • Listing with tier pill + records affected + SLA countdown
//   • Drill-down: timeline + per-state action button (13 transitions)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ─── Design tokens ────────────────────────────────────────────────────
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

// ─── Types ────────────────────────────────────────────────────────────
type ChainStatus =
  | 'detected' | 'triaged' | 'contained'
  | 'notified_regulator' | 'notified_subjects'
  | 'investigating'
  | 'remediation_planned' | 'remediation_executing'
  | 'verified' | 'closed'
  | 'escalated' | 'false_alarm';

type Tier = 'catastrophic' | 'major' | 'personal_data' | 'operational' | 'low';

interface CyberRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  asset_scope: string;
  asset_description: string | null;
  project_id: string | null;
  detected_at: string;
  reported_at: string;
  reported_by: string;
  incident_type: string;
  incident_tier: Tier;
  threat_vector: string | null;
  data_categories: string | null;
  records_affected: number;
  subjects_notified_count: number;
  containment_actions_taken: string | null;
  rca_summary: string | null;
  remediation_plan: string | null;
  linked_wo_id: string | null;
  regulator_notified: number;
  regulator_authority: string | null;
  regulator_ref: string | null;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  closure_notes: string | null;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable?: boolean;
  created_by: string;
  created_at: string;
}

interface KPI {
  total: number;
  reportable_open: number;
  notify_pending: number;
  escalated: number;
  breached: number;
  records_affected: number;
}

// ─── State path constants ─────────────────────────────────────────────
const ALL_STATES = [
  'detected', 'triaged', 'contained',
  'notified_regulator', 'notified_subjects',
  'investigating',
  'remediation_planned', 'remediation_executing',
  'verified', 'closed',
] as const;

const BRANCH_STATES = ['escalated', 'false_alarm'] as const;

const FILTERS = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'catastrophic',          label: 'Catastrophic' },
  { key: 'major',                 label: 'Major' },
  { key: 'personal_data',         label: 'Personal data' },
  { key: 'operational',           label: 'Operational' },
  { key: 'low',                   label: 'Low' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'escalated',             label: 'Escalated' },
  { key: 'detected',              label: 'Detected' },
  { key: 'triaged',               label: 'Triaged' },
  { key: 'contained',             label: 'Contained' },
  { key: 'notified_regulator',    label: 'IR notified' },
  { key: 'notified_subjects',     label: 'Subjects notified' },
  { key: 'investigating',         label: 'Investigating' },
  { key: 'remediation_planned',   label: 'Remediation planned' },
  { key: 'remediation_executing', label: 'Remediation executing' },
  { key: 'verified',              label: 'Verified' },
  { key: 'closed',                label: 'Closed' },
];

// ─── Actions ──────────────────────────────────────────────────────────
function getActions(row: CyberRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'detected') {
    actions.push({ key: 'triage', label: 'Triage', tone: 'primary' });
  }
  if (s === 'triaged') {
    actions.push({
      key: 'contain', label: 'Contain', tone: 'primary',
      fields: [{ key: 'containment_actions_taken', label: 'Containment actions taken', type: 'textarea', required: false }],
    });
  }
  if (s === 'contained') {
    actions.push({
      key: 'notify-regulator', label: 'Notify IR / SAPS', tone: 'primary',
      cascadeTo: ['regulator'],
      fields: [
        {
          key: 'regulator_authority',
          label: 'Regulator authority (IR / SAPS_CYBERCRIME / IR;SAPS_CYBERCRIME)',
          type: 'text',
          required: false,
        },
        { key: 'regulator_ref', label: 'Regulator reference (e.g. IR-POPIA22-2026-0067)', type: 'text', required: false },
      ],
    });
    if (!row.is_reportable) {
      actions.push({ key: 'skip-notify', label: 'Skip notify (internal)', tone: 'ghost' });
    }
  }
  if (s === 'notified_regulator') {
    actions.push({
      key: 'notify-subjects', label: 'Notify data subjects', tone: 'primary',
      fields: [{ key: 'subjects_notified_count', label: 'Number of data subjects notified', type: 'text', required: false }],
    });
  }
  if (s === 'notified_subjects') {
    actions.push({ key: 'begin-investigation', label: 'Begin investigation', tone: 'primary' });
  }
  if (s === 'investigating') {
    actions.push({
      key: 'complete-rca', label: 'Complete RCA', tone: 'primary',
      fields: [
        { key: 'rca_summary', label: 'RCA summary', type: 'textarea', required: true },
        { key: 'remediation_plan', label: 'Remediation plan', type: 'textarea', required: false },
      ],
    });
    actions.push({ key: 'escalate', label: 'Escalate', tone: 'danger', cascadeTo: ['regulator', 'admin'] });
  }
  if (s === 'remediation_planned') {
    actions.push({
      key: 'dispatch-remediation', label: 'Dispatch remediation', tone: 'primary',
      fields: [{ key: 'linked_wo_id', label: 'Linked work order ID (optional)', type: 'text', required: false }],
    });
    actions.push({ key: 'escalate', label: 'Escalate', tone: 'danger', cascadeTo: ['regulator', 'admin'] });
  }
  if (s === 'remediation_executing') {
    actions.push({ key: 'verify-remediation', label: 'Verify remediation', tone: 'primary' });
    actions.push({ key: 'escalate', label: 'Escalate', tone: 'danger', cascadeTo: ['regulator', 'admin'] });
  }
  if (s === 'verified') {
    actions.push({
      key: 'close', label: 'Close + archive', tone: 'primary',
      fields: [{ key: 'closure_notes', label: 'Closure notes', type: 'textarea', required: false }],
    });
  }
  if (s === 'escalated') {
    actions.push({
      key: 'close-escalated', label: 'Close escalated', tone: 'primary',
      fields: [{ key: 'closure_notes', label: 'Closure notes', type: 'textarea', required: false }],
    });
  }
  if (s === 'false_alarm') {
    actions.push({
      key: 'close-false-alarm', label: 'Close false alarm', tone: 'ghost',
      fields: [{ key: 'closure_notes', label: 'Closure notes', type: 'textarea', required: false }],
    });
  }
  if (s === 'detected' || s === 'triaged') {
    actions.push({
      key: 'mark-false-alarm', label: 'Mark false alarm', tone: 'ghost',
      fields: [{ key: 'closure_notes', label: 'False-alarm reason', type: 'textarea', required: true }],
    });
  }

  return actions;
}

// ─── Detail pane ──────────────────────────────────────────────────────
function renderDetail(row: CyberRow): React.ReactNode {
  return (
    <div style={{ fontSize: 12, color: TX1 }}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <DetailPair label="Detected"          value={fmtDate(row.detected_at)} />
        <DetailPair label="Reported"          value={fmtDate(row.reported_at)} />
        <DetailPair label="Reported by"       value={row.reported_by} />
        <DetailPair label="Asset"             value={row.asset_description ?? '—'} />
        <DetailPair label="Threat vector"     value={row.threat_vector ?? '—'} />
        <DetailPair label="Data categories"   value={row.data_categories ?? '—'} />
        <DetailPair label="Project"           value={row.project_id ?? '—'} />
        <DetailPair label="Regulator"         value={row.regulator_authority ?? '—'} />
        <DetailPair label="Regulator ref"     value={row.regulator_ref ?? '—'} />
        <DetailPair label="Subjects notified" value={fmtNumber(row.subjects_notified_count)} />
        <DetailPair label="Linked WO"         value={row.linked_wo_id ?? '—'} />
        <DetailPair label="Escalation"        value={String(row.escalation_level)} />
        <DetailPair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status"        value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      </div>
      {row.containment_actions_taken && (
        <div className="rounded border px-3 py-2 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 4 }}>Containment actions</div>
          {row.containment_actions_taken}
        </div>
      )}
      {row.rca_summary && (
        <div className="rounded border px-3 py-2 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 4 }}>RCA summary</div>
          {row.rca_summary}
        </div>
      )}
      {row.remediation_plan && (
        <div className="rounded border px-3 py-2 mb-2" style={{ background: BG1, borderColor: BORDER }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 4 }}>Remediation plan</div>
          {row.remediation_plan}
        </div>
      )}
      {row.closure_notes && (
        <div className="rounded border px-3 py-2" style={{ background: BG1, borderColor: BORDER }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3, marginBottom: 4 }}>Closure notes</div>
          {row.closure_notes}
        </div>
      )}
    </div>
  );
}

// ─── Utility formatters ───────────────────────────────────────────────
function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60)   return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-ZA');
}

// ─── Component ────────────────────────────────────────────────────────
export function CyberIncidentChainTab() {
  const [rows, setRows] = useState<CyberRow[]>([]);
  const [summary, setSummary] = useState<KPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CyberRow[] } }>('/cyber/incident-chain');
      const items = res.data?.data?.items || [];
      setRows(items);

      // compute KPIs from items
      let reportable_open = 0, notify_pending = 0, escalated = 0, breached = 0, records_affected = 0;
      for (const r of items) {
        if (r.is_reportable && !r.is_terminal) reportable_open++;
        if (r.is_reportable && r.chain_status === 'contained') notify_pending++;
        if (r.chain_status === 'escalated' || r.escalation_level > 0) escalated++;
        if (r.sla_breached) breached++;
        records_affected += r.records_affected || 0;
      }
      setSummary({ total: items.length, reportable_open, notify_pending, escalated, breached, records_affected });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load cyber incidents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/cyber/incident-chain/${rowId}/${key}`, values);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: CyberRow; events: ChainEvent[] } }>(`/cyber/incident-chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
      // refresh the row with latest data
      if (res.data?.data?.case) {
        setRows(prev => prev.map(r => r.id === id ? (res.data.data.case as CyberRow) : r));
      }
    } catch {
      // non-fatal — events just won't show
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return !!r.is_reportable;
      if (['catastrophic', 'major', 'personal_data', 'operational', 'low'].includes(filter)) {
        return r.incident_tier === filter;
      }
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'escalated')  return r.chain_status === 'escalated' || r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ padding: '20px', background: BG, minHeight: '100%' }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: TX1, margin: 0 }}>Cybersecurity incident chain</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 4, lineHeight: 1.5 }}>
          POPIA Section 22 (Information Regulator) + Cybercrimes Act Section 54 (SAPS Cybercrime) lifecycle ·
          detected → triaged → contained → IR notified → subjects notified → investigating → remediation → verified → closed.
          Catastrophic 30m triage; major/personal-data 72h IR notification. Reportable-tier escalations and breaches cross into the regulator inbox.
        </p>
      </header>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3" style={{ marginBottom: 16 }}>
          <KpiTile label="Total incidents"   value={summary.total} />
          <KpiTile label="Reportable open"   value={summary.reportable_open}  tone={summary.reportable_open > 0 ? 'warn' : 'ok'} />
          <KpiTile label="IR notify pending" value={summary.notify_pending}   tone={summary.notify_pending > 0 ? 'warn' : 'ok'} />
          <KpiTile label="Escalated"         value={summary.escalated}        tone={summary.escalated > 0 ? 'warn' : 'ok'} />
          <KpiTile label="SLA breached"      value={summary.breached}         tone={summary.breached > 0 ? 'bad' : 'ok'} />
          <KpiTile label="Records affected"  value={fmtNumber(summary.records_affected)} tone={summary.records_affected > 0 ? 'warn' : 'ok'} />
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 4,
              cursor: 'pointer',
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
              border: filter === f.key ? 'none' : `1px solid ${BORDER}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', border: `1px solid ${BAD}30`, color: BAD, fontSize: 12 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 8, border: `1px solid ${BORDER}` }}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 8, border: `1px solid ${BORDER}` }}>
          No cyber incidents match.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((row) => (
            <ChainCard
              key={row.id}
              item={row}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.asset_scope}
              meta={
                <span>
                  {row.incident_type}
                  {' · '}
                  <span style={{ textTransform: 'capitalize' }}>{row.incident_tier.replace(/_/g, ' ')}</span>
                  {' · '}
                  {fmtNumber(row.records_affected)} record{row.records_affected === 1 ? '' : 's'}
                  {row.regulator_ref ? ` · ${row.regulator_ref}` : ''}
                  {' · '}detected {fmtDate(row.detected_at)}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={['regulator', 'admin']}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────
function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1, fontFamily: value.match(/^\d/) ? MONO : undefined }}>{value}</div>
    </div>
  );
}

export default CyberIncidentChainTab;
