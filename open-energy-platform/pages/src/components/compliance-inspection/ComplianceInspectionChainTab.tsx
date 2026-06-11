// Wave 40 — Regulator Compliance Inspection & Enforcement lifecycle tab.
//
// NERSA's PROACTIVE, own-initiative enforcement arm (ERA 2006 §10 monitoring +
// §34/§35 enforcement). The regulator schedules a compliance inspection of a
// licensee, conducts it, drafts + issues findings, may issue a compliance
// directive, verifies remediation, and closes the matter — or escalates to a
// financial penalty with a statutory appeal route to the NERSA Tribunal.
//
// This is the ACTIVE ENFORCEMENT complement to the reactive W31 disposition
// (intake/triage) and periodic W33 licence-renewal (lifecycle). Disposition
// routes what comes IN; this chain is what the regulator initiates OUT.
//
// URGENT SLA — the more severe the contravention, the TIGHTER every window.
// Reportability: lodge_appeal crosses for EVERY tier (Tribunal docket);
// impose_penalty + SLA breaches cross for critical + serious.
//
// Two-party split write: the regulator officer drives the inspection +
// enforcement machinery; the respondent licensee begins remediation and lodges
// any appeal. actor_party (officer / respondent) is derived from the action.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

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
  | 'inspection_scheduled' | 'inspection_in_progress' | 'findings_drafted'
  | 'findings_issued' | 'directive_issued' | 'remediation_underway'
  | 'remediation_verified' | 'penalty_imposed' | 'appealed'
  | 'compliant_closed' | 'enforcement_closed' | 'withdrawn';

type Tier = 'critical' | 'serious' | 'minor';

interface InspectionRow {
  [key: string]: unknown;
  id: string;
  inspection_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  officer_party_id: string;
  officer_party_name: string;
  respondent_party_id: string;
  respondent_party_name: string;
  licence_ref: string | null;
  facility_name: string;
  inspection_trigger: string | null;
  contravention_tier: Tier;
  licence_condition_ref: string | null;
  penalty_amount_zar: number | null;
  daily_penalty_zar: number | null;
  remediation_cost_zar: number | null;
  findings_ref: string | null;
  directive_ref: string | null;
  penalty_ref: string | null;
  appeal_ref: string | null;
  tribunal_ref: string | null;
  inspection_basis: string | null;
  findings_basis: string | null;
  directive_basis: string | null;
  remediation_basis: string | null;
  penalty_basis: string | null;
  appeal_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  inspection_scheduled_at: string;
  inspection_in_progress_at: string | null;
  findings_drafted_at: string | null;
  findings_issued_at: string | null;
  directive_issued_at: string | null;
  remediation_underway_at: string | null;
  remediation_verified_at: string | null;
  penalty_imposed_at: string | null;
  appealed_at: string | null;
  compliant_closed_at: string | null;
  enforcement_closed_at: string | null;
  withdrawn_at: string | null;
  is_reportable: boolean;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  in_enforcement?: boolean;
  breach_crosses_regulator?: boolean;
}

interface KpiSummary {
  total: number;
  open_count: number;
  compliant_closed_count: number;
  enforcement_closed_count: number;
  withdrawn_count: number;
  in_enforcement_count: number;
  appealed_count: number;
  breached: number;
  reportable_total: number;
  critical_open: number;
  total_penalty: number;
  total_remediation: number;
}

const ALL_STATES = [
  'inspection_scheduled',
  'inspection_in_progress',
  'findings_drafted',
  'findings_issued',
  'directive_issued',
  'remediation_underway',
  'remediation_verified',
  'compliant_closed',
] as const;

const BRANCH_STATES = [
  'penalty_imposed',
  'appealed',
  'enforcement_closed',
  'withdrawn',
] as const;

const FILTERS = [
  { key: 'active',                 label: 'Active' },
  { key: 'all',                    label: 'All' },
  { key: 'critical',               label: 'Critical' },
  { key: 'serious',                label: 'Serious' },
  { key: 'minor',                  label: 'Minor' },
  { key: 'enforcement',            label: 'In enforcement' },
  { key: 'breached',               label: 'SLA breached' },
  { key: 'reportable',             label: 'Reportable' },
  { key: 'inspection_scheduled',   label: 'Scheduled' },
  { key: 'inspection_in_progress', label: 'In progress' },
  { key: 'findings_drafted',       label: 'Findings drafted' },
  { key: 'findings_issued',        label: 'Findings issued' },
  { key: 'directive_issued',       label: 'Directive issued' },
  { key: 'remediation_underway',   label: 'Remediation' },
  { key: 'remediation_verified',   label: 'Verified' },
  { key: 'penalty_imposed',        label: 'Penalty' },
  { key: 'appealed',               label: 'Appealed' },
  { key: 'compliant_closed',       label: 'Compliant closed' },
  { key: 'enforcement_closed',     label: 'Enforcement closed' },
  { key: 'withdrawn',              label: 'Withdrawn' },
];

const TERMINAL_STATES: ChainStatus[] = ['compliant_closed', 'enforcement_closed', 'withdrawn'];

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(1)}k`;
  return `R${n.toFixed(0)}`;
}

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function getActions(row: InspectionRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  const canCloseNoFindings = ['inspection_in_progress', 'findings_drafted'].includes(s);
  const canPenalty = ['findings_issued', 'directive_issued', 'remediation_underway'].includes(s);
  const canAppeal = ['penalty_imposed', 'directive_issued'].includes(s);
  const canWithdraw = ['inspection_scheduled', 'inspection_in_progress', 'findings_drafted'].includes(s);

  if (s === 'inspection_scheduled') {
    actions.push({
      key: 'begin-inspection',
      label: 'Begin inspection (officer)',
      tone: 'primary',
      fields: [
        { key: 'inspection_basis', label: 'Inspection scope / basis (what is being examined)', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'inspection_in_progress') {
    actions.push({
      key: 'draft-findings',
      label: 'Draft findings (officer)',
      tone: 'primary',
      fields: [
        { key: 'findings_ref', label: 'Findings reference (e.g. NERSA-FIND-2026-0042)', type: 'text', required: true },
        { key: 'findings_basis', label: 'Findings basis — contraventions identified', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'findings_drafted') {
    actions.push({
      key: 'issue-findings',
      label: 'Issue findings (officer)',
      tone: 'primary',
      fields: [
        { key: 'findings_ref', label: 'Issued findings reference (served on respondent)', type: 'text', required: true },
        { key: 'findings_basis', label: 'Findings basis / cover note', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'findings_issued') {
    actions.push({
      key: 'issue-directive',
      label: 'Issue directive (officer)',
      tone: 'primary',
      fields: [
        { key: 'directive_ref', label: 'Compliance directive reference (e.g. NERSA-DIR-2026-0017)', type: 'text', required: true },
        { key: 'directive_basis', label: 'Directive basis — required remediation + deadline', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'directive_issued') {
    actions.push({
      key: 'begin-remediation',
      label: 'Begin remediation (respondent)',
      tone: 'primary',
      fields: [
        { key: 'remediation_basis', label: 'Remediation plan basis — what the respondent will do', type: 'textarea', required: false },
        { key: 'remediation_cost_zar', label: 'Estimated remediation cost (ZAR), if known', type: 'text', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'remediation_underway') {
    actions.push({
      key: 'verify-remediation',
      label: 'Verify remediation (officer)',
      tone: 'primary',
      fields: [
        { key: 'remediation_basis', label: 'Verification basis — evidence the directive was satisfied', type: 'textarea', required: false },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'remediation_verified') {
    actions.push({
      key: 'close-compliant',
      label: 'Close — compliant (officer)',
      tone: 'primary',
      fields: [
        { key: 'rod_notes', label: 'Record-of-decision — remediation accepted, matter closed', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'penalty_imposed') {
    actions.push({
      key: 'close-enforcement',
      label: 'Close enforcement (officer)',
      tone: 'primary',
      fields: [
        { key: 'rod_notes', label: 'Record-of-decision — enforcement concluded', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'appealed') {
    actions.push({
      key: 'resolve-appeal',
      label: 'Resolve appeal (officer)',
      tone: 'primary',
      fields: [
        { key: 'tribunal_ref', label: 'Tribunal reference / outcome ref', type: 'text', required: false },
        { key: 'rod_notes', label: 'Tribunal decision — outcome + any varied penalty', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (canCloseNoFindings) {
    actions.push({
      key: 'close-no-findings',
      label: 'Close — no findings (officer)',
      tone: 'ghost',
      fields: [
        { key: 'rod_notes', label: 'Record-of-decision — why the inspection closes clean', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  if (canPenalty) {
    actions.push({
      key: 'impose-penalty',
      label: 'Impose penalty (officer)',
      tone: 'danger',
      fields: [
        { key: 'penalty_ref', label: 'Penalty reference (e.g. NERSA-PEN-2026-0009)', type: 'text', required: true },
        { key: 'penalty_amount_zar', label: 'Penalty amount (ZAR)', type: 'text', required: true },
        { key: 'daily_penalty_zar', label: 'Daily penalty for continued non-compliance (ZAR), if any', type: 'text', required: false },
        { key: 'penalty_basis', label: 'Penalty basis — statutory provision + reasoning', type: 'textarea', required: false },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (canAppeal) {
    actions.push({
      key: 'lodge-appeal',
      label: 'Lodge appeal (respondent)',
      tone: 'warn',
      fields: [
        { key: 'appeal_ref', label: 'Appeal reference (e.g. NERSA-TRIBUNAL-2026-0011)', type: 'text', required: true },
        { key: 'appeal_basis', label: 'Grounds of appeal', type: 'textarea', required: true },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (canWithdraw) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (officer)',
      tone: 'ghost',
      fields: [
        { key: 'rod_notes', label: 'Withdrawal reason (e.g. duplicate, superseded, no jurisdiction)', type: 'textarea', required: true },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

function renderDetail(row: InspectionRow): React.ReactNode {
  return (
    <div style={{ fontSize: 12 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '8px 16px',
        }}
      >
        <DetailPair label="Tier"                value={row.contravention_tier} />
        <DetailPair label="Trigger"             value={row.inspection_trigger ?? '—'} />
        <DetailPair label="Licence ref"         value={row.licence_ref ?? '—'} />
        <DetailPair label="Licence condition"   value={row.licence_condition_ref ?? '—'} />
        <DetailPair label="Officer"             value={row.officer_party_name} />
        <DetailPair label="Respondent"          value={row.respondent_party_name} />
        <DetailPair label="Penalty"             value={fmtZar(row.penalty_amount_zar)} />
        <DetailPair label="Daily penalty"       value={fmtZar(row.daily_penalty_zar)} />
        <DetailPair label="Remediation cost"    value={fmtZar(row.remediation_cost_zar)} />
        <DetailPair label="Findings ref"        value={row.findings_ref ?? '—'} />
        <DetailPair label="Directive ref"       value={row.directive_ref ?? '—'} />
        <DetailPair label="Penalty ref"         value={row.penalty_ref ?? '—'} />
        <DetailPair label="Appeal ref"          value={row.appeal_ref ?? '—'} />
        <DetailPair label="Tribunal ref"        value={row.tribunal_ref ?? '—'} />
        <DetailPair label="Reason code"         value={row.reason_code ?? '—'} />
        <DetailPair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
        <DetailPair label="Escalation level"    value={String(row.escalation_level)} />
        <DetailPair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Scheduled"           value={fmtDate(row.inspection_scheduled_at)} />
        <DetailPair label="In progress"         value={fmtDate(row.inspection_in_progress_at)} />
        <DetailPair label="Findings drafted"    value={fmtDate(row.findings_drafted_at)} />
        <DetailPair label="Findings issued"     value={fmtDate(row.findings_issued_at)} />
        <DetailPair label="Directive issued"    value={fmtDate(row.directive_issued_at)} />
        <DetailPair label="Remediation underway" value={fmtDate(row.remediation_underway_at)} />
        <DetailPair label="Remediation verified" value={fmtDate(row.remediation_verified_at)} />
        <DetailPair label="Penalty imposed"     value={fmtDate(row.penalty_imposed_at)} />
        <DetailPair label="Appealed"            value={fmtDate(row.appealed_at)} />
        <DetailPair label="Compliant closed"    value={fmtDate(row.compliant_closed_at)} />
        <DetailPair label="Enforcement closed"  value={fmtDate(row.enforcement_closed_at)} />
        <DetailPair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
      </div>
      {row.source_wave && (
        <div style={{ marginTop: 8, fontSize: 11, color: TX2 }}>
          Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
        </div>
      )}
      {row.inspection_basis && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>Inspection basis</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.inspection_basis}</div>
        </div>
      )}
      {row.findings_basis && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: WARN }}>Findings basis</div>
          <div style={{ color: TX1, whiteSpace: 'pre-wrap' }}>{row.findings_basis}</div>
        </div>
      )}
      {row.directive_basis && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: WARN }}>Directive basis</div>
          <div style={{ color: TX1, whiteSpace: 'pre-wrap' }}>{row.directive_basis}</div>
        </div>
      )}
      {row.remediation_basis && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: GOOD }}>Remediation basis</div>
          <div style={{ color: TX1, whiteSpace: 'pre-wrap' }}>{row.remediation_basis}</div>
        </div>
      )}
      {row.penalty_basis && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: BAD }}>Penalty basis</div>
          <div style={{ color: TX1, whiteSpace: 'pre-wrap' }}>{row.penalty_basis}</div>
        </div>
      )}
      {row.appeal_basis && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: BAD }}>Appeal basis</div>
          <div style={{ color: TX1, whiteSpace: 'pre-wrap' }}>{row.appeal_basis}</div>
        </div>
      )}
      {row.rod_notes && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: GOOD }}>Record of decision</div>
          <div style={{ color: TX1, whiteSpace: 'pre-wrap' }}>{row.rod_notes}</div>
        </div>
      )}
    </div>
  );
}

export function ComplianceInspectionChainTab() {
  const [rows, setRows] = useState<InspectionRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: InspectionRow[] } & KpiSummary }>('/compliance-inspection/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setSummary({
          total: d.total, open_count: d.open_count,
          compliant_closed_count: d.compliant_closed_count,
          enforcement_closed_count: d.enforcement_closed_count,
          withdrawn_count: d.withdrawn_count, in_enforcement_count: d.in_enforcement_count,
          appealed_count: d.appealed_count, breached: d.breached,
          reportable_total: d.reportable_total, critical_open: d.critical_open,
          total_penalty: d.total_penalty, total_remediation: d.total_remediation,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load compliance inspection chains');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      const body: Record<string, string | number> = { ...values };
      // Coerce numeric fields
      if (values.penalty_amount_zar) body.penalty_amount_zar = Number(values.penalty_amount_zar);
      if (values.daily_penalty_zar)  body.daily_penalty_zar  = Number(values.daily_penalty_zar);
      if (values.remediation_cost_zar) body.remediation_cost_zar = Number(values.remediation_cost_zar);
      // Inject fixed reason codes per action
      if (key === 'close-no-findings')  body.reason_code = 'no_contravention_found';
      if (key === 'close-compliant')    body.reason_code = 'remediation_verified';
      if (key === 'impose-penalty')     body.reason_code = 'penalty_imposed';
      if (key === 'resolve-appeal')     body.reason_code = 'appeal_resolved';
      if (key === 'close-enforcement')  body.reason_code = 'enforcement_concluded';
      if (key === 'withdraw')           body.reason_code = 'withdrawn';
      await api.post(`/compliance-inspection/chain/${rowId}/${key}`, body);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: InspectionRow; events: ChainEvent[] } }>(
        `/compliance-inspection/chain/${id}`
      );
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch {
      // non-fatal
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')         return true;
      if (filter === 'active')      return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'critical')    return r.contravention_tier === 'critical';
      if (filter === 'serious')     return r.contravention_tier === 'serious';
      if (filter === 'minor')       return r.contravention_tier === 'minor';
      if (filter === 'enforcement') return !!r.in_enforcement && !r.is_terminal;
      if (filter === 'breached')    return !!r.sla_breached;
      if (filter === 'reportable')  return r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ padding: '20px', background: BG, minHeight: '100%' }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: TX1, margin: 0 }}>
          Compliance inspection &amp; enforcement
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 4, lineHeight: 1.5 }}>
          12-stage P6 chain · scheduled → in progress → findings drafted → findings issued → directive issued →
          remediation underway → remediation verified → compliant closed. The enforcement branch escalates to a
          penalty (with a NERSA Tribunal appeal route); early inspections can close clean or withdraw. The regulator
          officer drives the machinery; the respondent licensee begins remediation and lodges any appeal. URGENT SLA:
          the more severe the contravention, the tighter every window. Appeals cross to the regulator inbox for every
          tier; penalties + SLA breaches cross for critical + serious (NERSA ERA §10 + §34/§35).
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
        <KpiTile label="Total"              value={summary?.total ?? rows.length} />
        <KpiTile label="Open"               value={summary?.open_count ?? 0} />
        <KpiTile label="Critical open"      value={summary?.critical_open ?? 0}        tone={(summary?.critical_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="In enforcement"     value={summary?.in_enforcement_count ?? 0} tone={(summary?.in_enforcement_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Appealed"           value={summary?.appealed_count ?? 0}       tone={(summary?.appealed_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="SLA breached"       value={summary?.breached ?? 0}             tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Compliant closed"   value={summary?.compliant_closed_count ?? 0}   tone="ok" />
        <KpiTile label="Enforcement closed" value={summary?.enforcement_closed_count ?? 0} />
        <KpiTile label="Withdrawn"          value={summary?.withdrawn_count ?? 0} />
        <KpiTile label="Reportable"         value={summary?.reportable_total ?? 0}    tone={(summary?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Penalties"          value={fmtZar(summary?.total_penalty)}    tone={(summary?.total_penalty ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Remediation"        value={fmtZar(summary?.total_remediation)} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 4,
              cursor: 'pointer',
              border: filter === f.key ? 'none' : `1px solid ${BORDER}`,
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
              transition: 'background 120ms',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 4, background: 'oklch(0.97 0.04 20)', border: `1px solid ${BAD}`, color: BAD, fontSize: 12 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 6, border: `1px solid ${BORDER}` }}>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 6, border: `1px solid ${BORDER}` }}>
          No inspections match.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((row) => (
            <ChainCard
              key={row.id}
              item={{
                ...row,
                case_number: row.inspection_number,
              }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.facility_name}
              meta={
                <span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: TX3 }}>{row.inspection_number}</span>
                  {' · '}
                  <span style={{ textTransform: 'capitalize' }}>{row.contravention_tier}</span>
                  {' · '}
                  {row.respondent_party_name}
                  {row.is_reportable && (
                    <span style={{ marginLeft: 4, color: BAD, fontWeight: 700 }} title="Reportable to regulator">●</span>
                  )}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              onExpand={handleExpand}
              events={expandedEvents[row.id]}
              detail={renderDetail(row)}
              cascadeTo={[]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1 }}>{value}</div>
    </div>
  );
}

export default ComplianceInspectionChainTab;
