// Wave 28 — Grid Connection Agreement (UNGCA) chain — NERSA Grid Code C-1.
//
// 10-state lifecycle (+ 2 terminals) for the connection agreement every IPP
// must execute with Eskom Transmission / Distribution before COD. Mounted on
// both the IPP workstation (IPP team submits applications + accepts cost) and
// the Grid operator workstation (Grid Code C-1 reviewers issue studies / cost
// estimates / energise / reject).
//
//   • KPI strip: total / studies open / cost phase / agreement / construction
//     / transmission open / breached / cost accepted total / capacity in service
//   • Filter pills by tier + state + reportable
//   • ChainCard list with tier pill + MW + SLA countdown
//   • Drill-down: timeline + role-aware action button (11 transitions)

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
  | 'application_filed' | 'studies_required' | 'studies_executing'
  | 'cost_estimate_issued' | 'cost_accepted'
  | 'connection_agreement_drafted' | 'executed'
  | 'construction' | 'energised' | 'in_service'
  | 'rejected' | 'withdrawn';

type Tier = 'transmission' | 'distribution' | 'embedded';

interface GcaRow extends Record<string, unknown> {
  id: string;
  case_number: string;
  project_id: string;
  project_name: string;
  ipp_party: string;
  network_party: string;
  connection_tier: Tier;
  voltage_kv: number;
  poc_substation: string;
  capacity_mw: number;
  technology: string;
  gia_ref: string | null;
  cost_estimate_zar: number | null;
  cost_accepted_zar: number | null;
  ungca_ref: string | null;
  energisation_date_planned: string | null;
  energisation_date_actual: string | null;
  rod_reason: string | null;
  withdrawal_reason: string | null;
  regulator_authority: string | null;
  regulator_ref: string | null;
  chain_status: ChainStatus;
  application_filed_at: string;
  studies_required_at: string | null;
  studies_executing_at: string | null;
  cost_estimate_issued_at: string | null;
  cost_accepted_at: string | null;
  connection_agreement_drafted_at: string | null;
  executed_at: string | null;
  construction_at: string | null;
  energised_at: string | null;
  in_service_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  closure_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable?: boolean;
  breach_crosses_regulator?: boolean;
  created_by: string;
  created_at: string;
}

interface GcaEvent {
  id: string;
  gca_id: string;
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
  studies: number;
  cost_phase: number;
  agreement: number;
  construction_ph: number;
  transmission: number;
  breached: number;
  cost_total: number;
  mw_service: number;
}

const ALL_STATES = [
  'application_filed', 'studies_required', 'studies_executing',
  'cost_estimate_issued', 'cost_accepted', 'connection_agreement_drafted',
  'executed', 'construction', 'energised', 'in_service',
] as const;

const BRANCH_STATES = ['rejected', 'withdrawn'] as const;

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                       label: 'Active' },
  { key: 'all',                          label: 'All' },
  { key: 'reportable',                   label: 'Transmission (NERSA C-1)' },
  { key: 'transmission',                 label: 'Transmission' },
  { key: 'distribution',                 label: 'Distribution' },
  { key: 'embedded',                     label: 'Embedded' },
  { key: 'breached',                     label: 'SLA breached' },
  { key: 'application_filed',            label: 'Applied' },
  { key: 'studies_required',             label: 'Studies req' },
  { key: 'studies_executing',            label: 'Studies exec' },
  { key: 'cost_estimate_issued',         label: 'Cost issued' },
  { key: 'cost_accepted',                label: 'Cost accepted' },
  { key: 'connection_agreement_drafted', label: 'UNGCA drafted' },
  { key: 'executed',                     label: 'Executed' },
  { key: 'construction',                 label: 'Construction' },
  { key: 'energised',                    label: 'Energised' },
  { key: 'in_service',                   label: 'In service' },
  { key: 'rejected',                     label: 'Rejected' },
  { key: 'withdrawn',                    label: 'Withdrawn' },
];

const REJECTABLE: ChainStatus[] = [
  'application_filed', 'studies_required', 'studies_executing', 'cost_estimate_issued',
];

const WITHDRAWABLE: ChainStatus[] = [
  'application_filed', 'studies_required', 'studies_executing',
  'cost_estimate_issued', 'cost_accepted', 'connection_agreement_drafted',
];

const TIER_LABEL: Record<Tier, string> = {
  transmission: 'Transmission',
  distribution: 'Distribution',
  embedded:     'Embedded SSEG',
};

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(0)}m`;
  if (Math.abs(n) >= 1_000)     return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtMW(n: number): string {
  if (n < 1) return `${(n * 1000).toFixed(0)}kW`;
  return `${n}MW`;
}

function getActions(row: GcaRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'application_filed') {
    actions.push({ key: 'request-studies', label: 'Request studies (Grid)', tone: 'primary', cascadeTo: ['ipp_developer'] });
  }
  if (s === 'studies_required') {
    actions.push({
      key: 'begin-studies', label: 'Begin GIA studies (Grid)', tone: 'primary',
      cascadeTo: ['ipp_developer'],
      fields: [{ key: 'gia_ref', label: 'GIA / load-flow study reference (e.g. GIA-ESK-2026-0142)', type: 'text', required: false }],
    });
  }
  if (s === 'studies_executing') {
    actions.push({
      key: 'issue-cost-estimate', label: 'Issue cost estimate (Grid)', tone: 'primary',
      cascadeTo: ['ipp_developer'],
      fields: [
        { key: 'cost_estimate_zar', label: 'Cost estimate (ZAR)', type: 'text', required: true },
        { key: 'gia_ref', label: 'GIA reference (optional)', type: 'text', required: false },
      ],
    });
  }
  if (s === 'cost_estimate_issued') {
    actions.push({
      key: 'accept-cost', label: 'Accept cost (IPP)', tone: 'primary',
      cascadeTo: ['grid_operator'],
      fields: [{ key: 'cost_accepted_zar', label: 'Accepted cost (ZAR — typically matches estimate)', type: 'text', required: true }],
    });
  }
  if (s === 'cost_accepted') {
    actions.push({ key: 'draft-agreement', label: 'Draft UNGCA (Grid)', tone: 'primary', cascadeTo: ['ipp_developer'] });
  }
  if (s === 'connection_agreement_drafted') {
    const fields: ChainAction['fields'] = [
      { key: 'ungca_ref', label: 'UNGCA reference (e.g. UNGCA-ESK-2026-0017)', type: 'text', required: true },
    ];
    if (row.connection_tier === 'transmission') {
      fields.push(
        { key: 'regulator_authority', label: 'Regulator (NERSA for transmission)', type: 'text', required: false },
        { key: 'regulator_ref', label: 'NERSA C-1 acknowledgement reference (e.g. NERSA-C1-2026-0142)', type: 'text', required: false },
      );
    }
    actions.push({
      key: 'execute-agreement', label: 'Sign UNGCA (IPP)', tone: 'primary',
      cascadeTo: row.connection_tier === 'transmission' ? ['grid_operator', 'regulator'] : ['grid_operator'],
      fields,
    });
  }
  if (s === 'executed') {
    actions.push({ key: 'begin-construction', label: 'Mobilise construction (IPP)', tone: 'primary', cascadeTo: ['grid_operator'] });
  }
  if (s === 'construction') {
    actions.push({
      key: 'energise', label: 'Energise connection (Grid)', tone: 'primary',
      cascadeTo: ['ipp_developer'],
      fields: [{ key: 'energisation_date_actual', label: 'Actual energisation date (ISO, optional — defaults to now)', type: 'text', required: false }],
    });
  }
  if (s === 'energised') {
    actions.push({ key: 'commission', label: 'Commission to service (Grid)', tone: 'primary', cascadeTo: ['ipp_developer'] });
  }

  if (REJECTABLE.includes(s)) {
    actions.push({
      key: 'reject', label: 'Reject application (Grid)', tone: 'danger',
      cascadeTo: ['ipp_developer', 'regulator'],
      fields: [{ key: 'rod_reason', label: 'Reason for rejection (grid stability / load / phasing)', type: 'textarea', required: true }],
    });
  }
  if (WITHDRAWABLE.includes(s)) {
    actions.push({
      key: 'withdraw', label: 'Withdraw application (IPP)', tone: 'ghost',
      fields: [{ key: 'withdrawal_reason', label: 'Reason for withdrawal', type: 'textarea', required: true }],
    });
  }

  return actions;
}

function renderDetail(row: GcaRow): React.ReactNode {
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '12px 16px',
        }}
      >
        <DetailPair label="Project ID"           value={row.project_id} />
        <DetailPair label="IPP party"            value={row.ipp_party} />
        <DetailPair label="Network party"        value={row.network_party} />
        <DetailPair label="Connection tier"      value={TIER_LABEL[row.connection_tier]} />
        <DetailPair label="Voltage"              value={`${row.voltage_kv} kV`} />
        <DetailPair label="Substation"           value={row.poc_substation} />
        <DetailPair label="Capacity"             value={fmtMW(row.capacity_mw)} />
        <DetailPair label="Technology"           value={row.technology} />
        <DetailPair label="GIA ref"              value={row.gia_ref ?? '—'} />
        <DetailPair label="Cost estimate"        value={fmtZar(row.cost_estimate_zar)} />
        <DetailPair label="Cost accepted"        value={fmtZar(row.cost_accepted_zar)} />
        <DetailPair label="UNGCA ref"            value={row.ungca_ref ?? '—'} />
        <DetailPair label="Energisation planned" value={fmtDate(row.energisation_date_planned)} />
        <DetailPair label="Energisation actual"  value={fmtDate(row.energisation_date_actual)} />
        <DetailPair label="Regulator"            value={row.regulator_authority ?? '—'} />
        <DetailPair label="Regulator ref"        value={row.regulator_ref ?? '—'} />
        <DetailPair label="Escalation level"     value={String(row.escalation_level)} />
        <DetailPair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="Filed at"             value={fmtDate(row.application_filed_at)} />
      </div>
      {row.rod_reason && (
        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, border: `1px solid ${BAD}40`, background: 'oklch(0.97 0.04 20)', fontSize: 12, color: BAD }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, color: BAD }}>Rejection reason</div>
          {row.rod_reason}
        </div>
      )}
      {row.withdrawal_reason && (
        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG2, fontSize: 12, color: TX2 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, color: TX3 }}>Withdrawal reason</div>
          {row.withdrawal_reason}
        </div>
      )}
      {row.closure_notes && (
        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG2, fontSize: 12, color: TX2 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, color: TX3 }}>Closure notes</div>
          {row.closure_notes}
        </div>
      )}
    </div>
  );
}

export function GcaChainTab() {
  const [rows, setRows] = useState<GcaRow[]>([]);
  const [summary, setSummary] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: GcaRow[] } }>('/gca/connection-chain');
      const items = res.data?.data?.items || [];
      setRows(items);

      // Compute KPIs client-side
      let studies = 0, cost_phase = 0, agreement = 0, construction_ph = 0;
      let transmission = 0, breached = 0, cost_total = 0, mw_service = 0;
      for (const r of items) {
        if (r.chain_status === 'studies_required' || r.chain_status === 'studies_executing') studies++;
        if (r.chain_status === 'cost_estimate_issued' || r.chain_status === 'cost_accepted') cost_phase++;
        if (r.chain_status === 'connection_agreement_drafted') agreement++;
        if (r.chain_status === 'construction' || r.chain_status === 'energised') construction_ph++;
        if (r.connection_tier === 'transmission' && !r.is_terminal) transmission++;
        if (r.sla_breached && !r.is_terminal) breached++;
        cost_total += r.cost_accepted_zar || 0;
        if (r.chain_status === 'in_service') mw_service += r.capacity_mw || 0;
      }
      setSummary({ total: items.length, studies, cost_phase, agreement, construction_ph, transmission, breached, cost_total, mw_service });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load GCA chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      const body: Record<string, unknown> = { ...values };
      // Coerce numeric fields
      if (values.cost_estimate_zar) body.cost_estimate_zar = Number(values.cost_estimate_zar);
      if (values.cost_accepted_zar) body.cost_accepted_zar = Number(values.cost_accepted_zar);
      await api.post(`/gca/connection-chain/${rowId}/${key}`, body);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: GcaRow; events: GcaEvent[] } }>(`/gca/connection-chain/${id}`);
      const evts = (res.data?.data?.events || []).map((e) => ({
        id: e.id,
        event_type: e.event_type,
        from_status: e.from_status,
        to_status: e.to_status,
        actor_id: e.actor_id,
        notes: e.notes,
        payload: e.payload,
        created_at: e.created_at,
      })) satisfies ChainEvent[];
      setExpandedEvents((prev) => ({ ...prev, [id]: evts }));
    } catch {
      // non-fatal — events just won't show
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return !!r.is_reportable;
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'transmission' || filter === 'distribution' || filter === 'embedded') {
        return r.connection_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ padding: '20px', background: BG, minHeight: '100%' }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: TX1, margin: 0 }}>
          Grid Connection Agreement (UNGCA) chain — NERSA Grid Code C-1
        </h2>
        <p style={{ fontSize: 11, color: TX3, margin: '4px 0 0' }}>
          10-state lifecycle every IPP executes with Eskom Transmission/Distribution before COD: application →
          studies → cost estimate → cost accepted → UNGCA drafted → executed → construction → energised → in service.
          Inverted SLA tiers (transmission gets 730d construction window vs 90d embedded); transmission +
          distribution rejections + SLA breaches cross to NERSA inbox.
        </p>
      </header>

      {summary && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
              gap: 10,
              marginBottom: 8,
            }}
          >
            <KpiTile label="Total"            value={summary.total} />
            <KpiTile label="Studies open"     value={summary.studies} />
            <KpiTile label="Cost phase"       value={summary.cost_phase} />
            <KpiTile label="UNGCA drafted"    value={summary.agreement} />
            <KpiTile label="Construction"     value={summary.construction_ph}  tone={summary.construction_ph > 0 ? 'warn' : 'ok'} />
            <KpiTile label="Transmission act" value={summary.transmission}      tone={summary.transmission > 0 ? 'warn' : 'ok'} />
            <KpiTile label="SLA breached"     value={summary.breached}          tone={summary.breached > 0 ? 'bad' : 'ok'} />
            <KpiTile label="Cost accepted"    value={fmtZar(summary.cost_total)} />
          </div>
          <div style={{ fontSize: 11, color: TX3, marginBottom: 12 }}>
            Capacity in service:{' '}
            <span style={{ fontWeight: 700, color: GOOD }}>
              {summary.mw_service.toLocaleString('en-ZA')} MW
            </span>
          </div>
        </>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
              transition: 'background 120ms, color 120ms',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, border: `1px solid ${BAD}50`, background: 'oklch(0.97 0.04 20)', fontSize: 12, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 8, border: `1px solid ${BORDER}` }}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: TX3, background: BG1, borderRadius: 8, border: `1px solid ${BORDER}` }}>
          No GCA cases match.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((row) => (
            <ChainCard
              key={row.id}
              item={row}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.project_name}
              meta={
                <span>
                  <span style={{ fontFamily: MONO, fontSize: 10 }}>{row.case_number}</span>
                  {' · '}
                  {TIER_LABEL[row.connection_tier]}
                  {' · '}
                  {fmtMW(row.capacity_mw)}
                  {' '}
                  {row.technology}
                  {' · '}
                  {row.voltage_kv}kV @ {row.poc_substation}
                  {row.cost_accepted_zar != null && ` · Cost: ${fmtZar(row.cost_accepted_zar)}`}
                  {row.regulator_ref && ` · NERSA: ${row.regulator_ref}`}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              onExpand={handleExpand}
              events={expandedEvents[row.id]}
              cascadeTo={row.connection_tier === 'transmission' ? ['regulator', 'ipp_developer', 'grid_operator'] : ['ipp_developer', 'grid_operator']}
              detail={renderDetail(row)}
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
    <div style={{ borderRadius: 7, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px' }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1, fontFamily: value.startsWith('R') || value.match(/^\d/) ? MONO : undefined }}>{value}</div>
    </div>
  );
}

export default GcaChainTab;
