// Wave 37 — Carbon Project Registration / PDD Validation chain.
//
// The FRONT END of the carbon credit lifecycle. A mitigation project moves from
// idea (PIN) → full Project Design Document (PDD) → independent validation by a
// VVB → public stakeholder consultation → host-country DNA authorization →
// registry registration → active crediting period, then hands off to W11 (MRV
// verification), W17 (retirement) and W4 (Article 6 ITMO).
//
//   pin_submitted → pdd_drafted → validation_underway → public_consultation →
//   dna_authorization → registration_requested → registered → crediting_active
//   (+ corrections_required = VVB CAR loop, rejected = terminal, withdrawn = terminal)
//
// Mounted on the Carbon workstation. INVERTED SLA matrix: the higher-integrity
// tier (afolu_redd) gets MORE diligence time in every state. rejected crosses to
// the regulator for ALL tiers; registered + SLA-breach cross for high-integrity
// tiers (afolu_redd + large_scale). Standards: Gold Standard + Verra VCS +
// Article 6.4 + SA DFFE DNA Letter of Approval.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
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
  | 'pin_submitted' | 'pdd_drafted' | 'validation_underway' | 'corrections_required'
  | 'public_consultation' | 'dna_authorization' | 'registration_requested'
  | 'registered' | 'crediting_active' | 'rejected' | 'withdrawn';

type Tier = 'afolu_redd' | 'large_scale' | 'small_scale';

interface RegRow {
  [key: string]: unknown;
  id: string;
  project_number: string;
  source_event: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  developer_party_id: string;
  developer_party_name: string;
  vvb_name: string | null;
  project_name: string;
  project_tier: Tier;
  standard: string | null;
  methodology: string | null;
  province: string | null;
  host_country: string;
  crediting_years: number | null;
  estimated_annual_tco2e: number | null;
  estimated_total_tco2e: number | null;
  registered_serial_block: string | null;
  pin_ref: string | null;
  pdd_ref: string | null;
  validation_ref: string | null;
  car_ref: string | null;
  consultation_ref: string | null;
  dna_authorization_ref: string | null;
  registration_ref: string | null;
  rejection_ref: string | null;
  validation_basis: string | null;
  corrections_basis: string | null;
  consultation_basis: string | null;
  dna_basis: string | null;
  registration_basis: string | null;
  rejection_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  pin_submitted_at: string;
  sla_deadline_at: string | null;
  car_round: number;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable?: boolean;
  enhanced_due_diligence?: boolean;
  breach_crosses_regulator?: boolean;
  sla_window_minutes?: number;
  created_by: string;
}

interface KpiSummary {
  total: number;
  open_count: number;
  registered_count: number;
  crediting_count: number;
  rejected_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  high_integrity_open: number;
  total_estimated_tco2e: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'pin_submitted',
  'pdd_drafted',
  'validation_underway',
  'public_consultation',
  'dna_authorization',
  'registration_requested',
  'registered',
  'crediting_active',
];

const BRANCH_STATES: readonly string[] = [
  'corrections_required',
  'rejected',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                 label: 'Active' },
  { key: 'all',                    label: 'All' },
  { key: 'reportable',             label: 'Reportable' },
  { key: 'afolu_redd',             label: 'AFOLU/REDD+' },
  { key: 'large_scale',            label: 'Large-scale' },
  { key: 'small_scale',            label: 'Small-scale' },
  { key: 'breached',               label: 'SLA breached' },
  { key: 'pin_submitted',          label: 'PIN' },
  { key: 'pdd_drafted',            label: 'PDD' },
  { key: 'validation_underway',    label: 'Validation' },
  { key: 'corrections_required',   label: 'CAR' },
  { key: 'public_consultation',    label: 'Consultation' },
  { key: 'dna_authorization',      label: 'DNA' },
  { key: 'registration_requested', label: 'Reg. req.' },
  { key: 'registered',             label: 'Registered' },
  { key: 'crediting_active',       label: 'Crediting' },
  { key: 'rejected',               label: 'Rejected' },
  { key: 'withdrawn',              label: 'Withdrawn' },
];

// ── action helpers ────────────────────────────────────────────────────────
const CORRECTABLE: ChainStatus[] = ['validation_underway'];
const REJECTABLE: ChainStatus[] = ['validation_underway', 'corrections_required', 'registration_requested'];
const WITHDRAWABLE: ChainStatus[] = [
  'pin_submitted', 'pdd_drafted', 'validation_underway', 'corrections_required',
  'public_consultation', 'dna_authorization', 'registration_requested',
];

const TIER_LABEL: Record<Tier, string> = {
  afolu_redd:  'AFOLU/REDD+',
  large_scale: 'Large-scale',
  small_scale: 'Small-scale',
};

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtTco2e(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}Mt`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}kt`;
  return `${n.toLocaleString('en-ZA')}t`;
}

function getActions(row: RegRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward action
  if (s === 'pin_submitted') {
    actions.push({
      key: 'draft-pdd',
      label: 'Draft PDD (Developer)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'pdd_ref',                label: 'PDD reference (e.g. PDD-2026-0007)', type: 'text',   required: false, placeholder: row.pdd_ref ?? '' },
        { key: 'methodology',            label: 'Methodology (e.g. VM0007, ACM0002, GS TPDDTEC)',     type: 'text',   required: false, placeholder: row.methodology ?? '' },
        { key: 'crediting_years',        label: 'Crediting period (years)',             type: 'number', required: false, placeholder: row.crediting_years != null ? String(row.crediting_years) : '' },
        { key: 'estimated_annual_tco2e', label: 'Estimated annual tCO₂e',              type: 'number', required: false, placeholder: row.estimated_annual_tco2e != null ? String(row.estimated_annual_tco2e) : '' },
        { key: 'estimated_total_tco2e',  label: 'Estimated total tCO₂e (crediting period)', type: 'number', required: false, placeholder: row.estimated_total_tco2e != null ? String(row.estimated_total_tco2e) : '' },
      ],
    });
  }

  if (s === 'pdd_drafted') {
    actions.push({
      key: 'submit-validation',
      label: 'Submit to VVB (Developer)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'vvb_name',        label: 'VVB / DOE name (independent validator)',                               type: 'text',     required: false, placeholder: row.vvb_name ?? '' },
        { key: 'validation_basis', label: 'Validation basis (additionality + baseline + methodology applicability)', type: 'textarea', required: false, placeholder: row.validation_basis ?? '' },
        { key: 'validation_ref',  label: 'Validation reference (optional)',                                       type: 'text',     required: false, placeholder: row.validation_ref ?? '' },
      ],
    });
  }

  if (s === 'validation_underway') {
    actions.push({
      key: 'open-consultation',
      label: 'Open consultation (Developer)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'consultation_basis', label: 'Consultation basis (local stakeholder + GS safeguards)', type: 'textarea', required: false, placeholder: row.consultation_basis ?? '' },
        { key: 'consultation_ref',  label: 'Consultation reference (optional)',                       type: 'text',     required: false, placeholder: row.consultation_ref ?? '' },
      ],
    });
  }

  if (s === 'corrections_required') {
    actions.push({
      key: 'resubmit',
      label: 'Resubmit (Developer)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'validation_basis', label: 'Resubmission basis — how the CARs were addressed', type: 'textarea', required: false, placeholder: row.validation_basis ?? '' },
      ],
    });
  }

  if (s === 'public_consultation') {
    actions.push({
      key: 'authorize-dna',
      label: 'Authorize DNA (Authority)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'dna_basis',            label: 'DNA basis (DFFE Letter of Approval / host-country authorization)', type: 'textarea', required: false, placeholder: row.dna_basis ?? '' },
        { key: 'dna_authorization_ref', label: 'DNA authorization reference (e.g. DFFE-LOA-2026-0007)',          type: 'text',     required: false, placeholder: row.dna_authorization_ref ?? '' },
      ],
    });
  }

  if (s === 'dna_authorization') {
    actions.push({
      key: 'request-registration',
      label: 'Request registration (Developer)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'registration_basis', label: 'Registration request basis (registry submission package complete)', type: 'textarea', required: false, placeholder: row.registration_basis ?? '' },
        { key: 'registration_ref',   label: 'Registration reference (optional)',                                type: 'text',     required: false, placeholder: row.registration_ref ?? '' },
      ],
    });
  }

  if (s === 'registration_requested') {
    actions.push({
      key: 'register',
      label: 'Register (Registry)',
      tone: 'primary',
      // registered crosses to regulator for AFOLU + large-scale
      cascadeTo: (row.project_tier === 'afolu_redd' || row.project_tier === 'large_scale') ? ['regulator'] : [],
      fields: [
        { key: 'registered_serial_block', label: 'Registered serial block (registry serial range)', type: 'text',     required: false, placeholder: row.registered_serial_block ?? '' },
        { key: 'registration_basis',      label: 'Registration basis (registry approval — crosses to regulator for AFOLU + large-scale)', type: 'textarea', required: false, placeholder: row.registration_basis ?? '' },
      ],
    });
  }

  if (s === 'registered') {
    actions.push({
      key: 'activate-crediting',
      label: 'Activate crediting (Registry)',
      tone: 'primary',
      cascadeTo: [],
      fields: [
        { key: 'registered_serial_block', label: 'Confirm registered serial block',       type: 'text',   required: false, placeholder: row.registered_serial_block ?? '' },
        { key: 'estimated_total_tco2e',   label: 'Confirm total crediting-period tCO₂e', type: 'number', required: false, placeholder: row.estimated_total_tco2e != null ? String(row.estimated_total_tco2e) : '' },
      ],
    });
  }

  // Secondary: request-corrections (VVB CAR) — available in validation_underway
  if (CORRECTABLE.includes(s)) {
    actions.push({
      key: 'request-corrections',
      label: 'Raise CAR (VVB)',
      tone: 'warn',
      cascadeTo: [],
      fields: [
        { key: 'corrections_basis', label: 'Corrective Action Request (CAR) basis — what the VVB flagged', type: 'textarea', required: true,  placeholder: '' },
        { key: 'car_ref',           label: 'CAR reference (optional)',                                       type: 'text',     required: false, placeholder: row.car_ref ?? '' },
      ],
    });
  }

  // Secondary: reject (VVB) — crosses regulator ALL tiers
  if (REJECTABLE.includes(s)) {
    actions.push({
      key: 'reject',
      label: 'Reject (VVB)',
      tone: 'danger',
      cascadeTo: ['regulator'],
      fields: [
        { key: 'rejection_basis', label: 'Rejection basis — why the project failed (non-additionality, leakage, permanence). Crosses to regulator for ALL tiers', type: 'textarea', required: true,  placeholder: '' },
        { key: 'rejection_ref',  label: 'Rejection reference (optional)',                                                                                          type: 'text',     required: false, placeholder: '' },
        { key: 'rod_notes',      label: 'ROD notes (record of decision)',                                                                                          type: 'textarea', required: false, placeholder: '' },
      ],
    });
  }

  // Secondary: withdraw (Developer)
  if (WITHDRAWABLE.includes(s)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw (Developer)',
      tone: 'ghost',
      cascadeTo: [],
      fields: [
        { key: 'withdrawal_basis', label: 'Withdrawal basis (developer withdrew the project)', type: 'textarea', required: true, placeholder: '' },
      ],
    });
  }

  return actions;
}

function renderDetail(row: RegRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Developer"        value={row.developer_party_name} />
      <DetailPair label="VVB / DOE"        value={row.vvb_name ?? '—'} />
      <DetailPair label="Tier"             value={TIER_LABEL[row.project_tier]} />
      <DetailPair label="Standard"         value={row.standard ?? '—'} />
      <DetailPair label="Methodology"      value={row.methodology ?? '—'} />
      <DetailPair label="Host country"     value={row.host_country} />
      <DetailPair label="Province"         value={row.province ?? '—'} />
      <DetailPair label="Crediting years"  value={row.crediting_years != null ? String(row.crediting_years) : '—'} />
      <DetailPair label="Annual tCO₂e"     value={fmtTco2e(row.estimated_annual_tco2e)} />
      <DetailPair label="Total tCO₂e"      value={fmtTco2e(row.estimated_total_tco2e)} />
      <DetailPair label="Serial block"     value={row.registered_serial_block ?? '—'} />
      <DetailPair label="PDD ref"          value={row.pdd_ref ?? '—'} />
      <DetailPair label="Validation ref"   value={row.validation_ref ?? '—'} />
      <DetailPair label="CAR ref"          value={row.car_ref ?? '—'} />
      <DetailPair label="Consultation ref" value={row.consultation_ref ?? '—'} />
      <DetailPair label="DNA ref"          value={row.dna_authorization_ref ?? '—'} />
      <DetailPair label="Registration ref" value={row.registration_ref ?? '—'} />
      <DetailPair label="Rejection ref"    value={row.rejection_ref ?? '—'} />
      <DetailPair label="CAR round"        value={String(row.car_round)} />
      <DetailPair label="Escalation"       value={String(row.escalation_level)} />
      <DetailPair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status"       value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="PIN submitted"    value={fmtDate(row.pin_submitted_at)} />
      <DetailPair label="Reason code"      value={row.reason_code ?? '—'} />
      {row.source_wave && (
        <DetailPair label="Provenance" value={`${row.source_wave} · ${row.source_entity_id ?? ''}`} />
      )}
      {row.validation_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Validation basis</div>
          <div style={{ color: TX2 }}>{row.validation_basis}</div>
        </div>
      )}
      {row.corrections_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: 'oklch(0.98 0.04 55)', borderColor: 'oklch(0.82 0.12 55)' }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>CAR basis</div>
          <div style={{ color: TX2 }}>{row.corrections_basis}</div>
        </div>
      )}
      {row.consultation_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Consultation basis</div>
          <div style={{ color: TX2 }}>{row.consultation_basis}</div>
        </div>
      )}
      {row.dna_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>DNA basis</div>
          <div style={{ color: TX2 }}>{row.dna_basis}</div>
        </div>
      )}
      {row.registration_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: 'oklch(0.97 0.03 155)', borderColor: 'oklch(0.82 0.10 155)' }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: GOOD }}>Registration basis</div>
          <div style={{ color: TX2 }}>{row.registration_basis}</div>
        </div>
      )}
      {row.rejection_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: 'oklch(0.97 0.04 20)', borderColor: 'oklch(0.82 0.14 20)' }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Rejection basis</div>
          <div style={{ color: TX2 }}>{row.rejection_basis}</div>
        </div>
      )}
      {row.withdrawal_basis && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Withdrawal basis</div>
          <div style={{ color: TX2 }}>{row.withdrawal_basis}</div>
        </div>
      )}
      {row.rod_notes && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>ROD notes</div>
          <div style={{ color: TX2 }}>{row.rod_notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function RegistrationChainTab() {
  const [rows, setRows] = useState<RegRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RegRow[] } & KpiSummary }>('/carbon-registration/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total:                data.total ?? (data.items?.length || 0),
          open_count:           data.open_count || 0,
          registered_count:     data.registered_count || 0,
          crediting_count:      data.crediting_count || 0,
          rejected_count:       data.rejected_count || 0,
          withdrawn_count:      data.withdrawn_count || 0,
          breached:             data.breached || 0,
          reportable_total:     data.reportable_total || 0,
          high_integrity_open:  data.high_integrity_open || 0,
          total_estimated_tco2e: data.total_estimated_tco2e || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load registration chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      // Coerce numeric fields that come through as strings
      const body: Record<string, unknown> = { ...values };
      for (const numKey of ['crediting_years', 'estimated_annual_tco2e', 'estimated_total_tco2e']) {
        if (body[numKey] !== undefined && body[numKey] !== '') {
          body[numKey] = Number(body[numKey]);
        }
      }
      // Inject static reason_code fields that were hardcoded in old act()
      if (key === 'reject') body.reason_code = 'validation_failed';
      if (key === 'withdraw') body.reason_code = 'developer_withdrawal';

      await api.post(`/carbon-registration/chain/${rowId}/${key}`, body);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/carbon-registration/chain/${rowId}`);
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
      const res = await api.get<{ data: { case: RegRow; events: ChainEvent[] } }>(`/carbon-registration/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'afolu_redd' || filter === 'large_scale' || filter === 'small_scale') {
        return r.project_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, registered_count: 0, crediting_count: 0,
    rejected_count: 0, withdrawn_count: 0, breached: 0, reportable_total: 0,
    high_integrity_open: 0, total_estimated_tco2e: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          Carbon Project Registration / PDD Validation — Gold Standard + Verra VCS + Article 6.4
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          11-state front end of the carbon credit lifecycle: PIN submitted → PDD drafted → validation
          (VVB) → public consultation → DNA authorization → registration requested → registered →
          crediting active (+ VVB CAR loop, rejection, withdrawal). Hands off to MRV verification (W11),
          retirement (W17) and Article 6 ITMO (W4). INVERTED SLA: higher-integrity tier (AFOLU/REDD+)
          gets more diligence time. Rejection crosses to the regulator for ALL tiers; registration +
          SLA breaches cross for high-integrity tiers (AFOLU/REDD+ + large-scale).
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-3 flex flex-wrap gap-2">
        <KpiTile label="Total"        value={kpis.total} />
        <KpiTile label="Open"         value={kpis.open_count}      tone={kpis.open_count > 0 ? 'warn' : undefined} />
        <KpiTile label="Registered"   value={kpis.registered_count} />
        <KpiTile label="Crediting"    value={kpis.crediting_count}  tone={kpis.crediting_count > 0 ? 'ok' : undefined} />
        <KpiTile label="Rejected"     value={kpis.rejected_count}   tone={kpis.rejected_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached" value={kpis.breached}         tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Reportable"   value={kpis.reportable_total} />
        <KpiTile label="Est. tCO₂e"   value={fmtTco2e(kpis.total_estimated_tco2e)} />
      </div>

      {/* Secondary KPI row */}
      <div className="mb-3 flex flex-wrap gap-4" style={{ fontSize: 11, color: TX2 }}>
        <span>High-integrity open: <span style={{ fontWeight: 600, color: BAD }}>{kpis.high_integrity_open}</span></span>
        <span>Withdrawn: <span style={{ fontWeight: 600, color: TX2 }}>{kpis.withdrawn_count}</span></span>
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
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
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]"
          style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.project_number} — ${row.project_name}`}
              meta={
                <span style={{ color: TX3, fontSize: 11 }}>
                  {TIER_LABEL[row.project_tier]}
                  {' · '}
                  {row.developer_party_name}
                  {row.standard ? ` · ${row.standard}` : ''}
                  {row.car_round > 0 ? ` · CAR×${row.car_round}` : ''}
                  {row.source_wave ? ` · ${row.source_wave}` : ''}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]"
              style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No projects match.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

export default RegistrationChainTab;
