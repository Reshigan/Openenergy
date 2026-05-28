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

type ChainStatus =
  | 'pin_submitted' | 'pdd_drafted' | 'validation_underway' | 'corrections_required'
  | 'public_consultation' | 'dna_authorization' | 'registration_requested'
  | 'registered' | 'crediting_active' | 'rejected' | 'withdrawn';

type Tier = 'afolu_redd' | 'large_scale' | 'small_scale';

interface RegRow {
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

interface RegEvent {
  id: string;
  project_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  pin_submitted:          { bg: '#e3e7ec', fg: '#445',    label: 'PIN submitted' },
  pdd_drafted:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'PDD drafted' },
  validation_underway:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Validation' },
  corrections_required:   { bg: '#fff4d6', fg: '#a06200', label: 'CAR — corrections' },
  public_consultation:    { bg: '#e6e0fb', fg: '#4a2f8a', label: 'Consultation' },
  dna_authorization:      { bg: '#fbe7d0', fg: '#7a4500', label: 'DNA authorization' },
  registration_requested: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Registration req.' },
  registered:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Registered' },
  crediting_active:       { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Crediting active' },
  rejected:               { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Rejected' },
  withdrawn:              { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  afolu_redd:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'AFOLU/REDD+' },
  large_scale: { bg: '#fff4d6', fg: '#a06200', label: 'Large-scale' },
  small_scale: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Small-scale' },
};

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

type ActionKind =
  | 'draft-pdd' | 'submit-validation' | 'request-corrections' | 'resubmit'
  | 'open-consultation' | 'authorize-dna' | 'request-registration' | 'register'
  | 'activate-crediting' | 'reject' | 'withdraw';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  pin_submitted:          'draft-pdd',
  pdd_drafted:            'submit-validation',
  validation_underway:    'open-consultation',
  corrections_required:   'resubmit',
  public_consultation:    'authorize-dna',
  dna_authorization:      'request-registration',
  registration_requested: 'register',
  registered:             'activate-crediting',
  crediting_active:       null,
  rejected:               null,
  withdrawn:              null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'draft-pdd':            'Draft PDD (Developer)',
  'submit-validation':    'Submit to VVB (Developer)',
  'request-corrections':  'Raise CAR (VVB)',
  'resubmit':             'Resubmit (Developer)',
  'open-consultation':    'Open consultation (Developer)',
  'authorize-dna':        'Authorize DNA (Authority)',
  'request-registration': 'Request registration (Developer)',
  'register':             'Register (Registry)',
  'activate-crediting':   'Activate crediting (Registry)',
  'reject':               'Reject (VVB)',
  'withdraw':             'Withdraw (Developer)',
};

const CORRECTABLE: ChainStatus[] = ['validation_underway'];
const REJECTABLE: ChainStatus[] = ['validation_underway', 'corrections_required', 'registration_requested'];
const WITHDRAWABLE: ChainStatus[] = [
  'pin_submitted', 'pdd_drafted', 'validation_underway', 'corrections_required',
  'public_consultation', 'dna_authorization', 'registration_requested',
];

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

export function RegistrationChainTab() {
  const [rows, setRows] = useState<RegRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<RegRow | null>(null);
  const [events, setEvents] = useState<RegEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RegRow[] } & KpiSummary }>('/carbon-registration/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          registered_count: data.registered_count || 0,
          crediting_count: data.crediting_count || 0,
          rejected_count: data.rejected_count || 0,
          withdrawn_count: data.withdrawn_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          high_integrity_open: data.high_integrity_open || 0,
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

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: RegRow; events: RegEvent[] } }>(`/carbon-registration/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load project history');
    }
  }, []);

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

  const act = useCallback(async (action: ActionKind, row: RegRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'draft-pdd') {
        const ref = window.prompt('PDD reference (e.g. PDD-2026-0007):', row.pdd_ref ?? '');
        if (ref) body.pdd_ref = ref;
        const meth = window.prompt('Methodology (e.g. VM0007, ACM0002, GS TPDDTEC):', row.methodology ?? '');
        if (meth) body.methodology = meth;
        const yrs = window.prompt('Crediting period (years):', row.crediting_years != null ? String(row.crediting_years) : '');
        if (yrs) body.crediting_years = Number(yrs);
        const ann = window.prompt('Estimated annual tCO₂e:', row.estimated_annual_tco2e != null ? String(row.estimated_annual_tco2e) : '');
        if (ann) body.estimated_annual_tco2e = Number(ann);
        const tot = window.prompt('Estimated total tCO₂e (crediting period):', row.estimated_total_tco2e != null ? String(row.estimated_total_tco2e) : '');
        if (tot) body.estimated_total_tco2e = Number(tot);
      } else if (action === 'submit-validation') {
        const vvb = window.prompt('VVB / DOE name (independent validator):', row.vvb_name ?? '');
        if (vvb) body.vvb_name = vvb;
        const basis = window.prompt('Validation basis (additionality + baseline + methodology applicability):', row.validation_basis ?? '');
        if (basis) body.validation_basis = basis;
        const ref = window.prompt('Validation reference (optional):', row.validation_ref ?? '');
        if (ref) body.validation_ref = ref;
      } else if (action === 'request-corrections') {
        const basis = window.prompt('Corrective Action Request (CAR) basis — what the VVB flagged. Required:');
        if (!basis) return;
        body.corrections_basis = basis;
        const ref = window.prompt('CAR reference (optional):', row.car_ref ?? '');
        if (ref) body.car_ref = ref;
      } else if (action === 'resubmit') {
        const basis = window.prompt('Resubmission basis — how the CARs were addressed:', row.validation_basis ?? '');
        if (basis) body.validation_basis = basis;
      } else if (action === 'open-consultation') {
        const basis = window.prompt('Consultation basis (local stakeholder + GS safeguards):', row.consultation_basis ?? '');
        if (basis) body.consultation_basis = basis;
        const ref = window.prompt('Consultation reference (optional):', row.consultation_ref ?? '');
        if (ref) body.consultation_ref = ref;
      } else if (action === 'authorize-dna') {
        const basis = window.prompt('DNA basis (DFFE Letter of Approval / host-country authorization):', row.dna_basis ?? '');
        if (basis) body.dna_basis = basis;
        const ref = window.prompt('DNA authorization reference (e.g. DFFE-LOA-2026-0007):', row.dna_authorization_ref ?? '');
        if (ref) body.dna_authorization_ref = ref;
      } else if (action === 'request-registration') {
        const basis = window.prompt('Registration request basis (registry submission package complete):', row.registration_basis ?? '');
        if (basis) body.registration_basis = basis;
        const ref = window.prompt('Registration reference (optional):', row.registration_ref ?? '');
        if (ref) body.registration_ref = ref;
      } else if (action === 'register') {
        const serial = window.prompt('Registered serial block (registry serial range):', row.registered_serial_block ?? '');
        if (serial) body.registered_serial_block = serial;
        const basis = window.prompt('Registration basis (registry approval — crosses to regulator for AFOLU + large-scale):', row.registration_basis ?? '');
        if (basis) body.registration_basis = basis;
      } else if (action === 'activate-crediting') {
        const serial = window.prompt('Confirm registered serial block:', row.registered_serial_block ?? '');
        if (serial) body.registered_serial_block = serial;
        const tot = window.prompt('Confirm total crediting-period tCO₂e:', row.estimated_total_tco2e != null ? String(row.estimated_total_tco2e) : '');
        if (tot) body.estimated_total_tco2e = Number(tot);
      } else if (action === 'reject') {
        const basis = window.prompt('Rejection basis — why the project failed (non-additionality, leakage, permanence). Required, crosses to regulator for ALL tiers:');
        if (!basis) return;
        body.rejection_basis = basis;
        const ref = window.prompt('Rejection reference (optional):');
        if (ref) body.rejection_ref = ref;
        const rod = window.prompt('ROD notes (record of decision):');
        if (rod) body.rod_notes = rod;
        body.reason_code = 'validation_failed';
      } else if (action === 'withdraw') {
        const basis = window.prompt('Withdrawal basis (developer withdrew the project):');
        if (!basis) return;
        body.withdrawal_basis = basis;
        body.reason_code = 'developer_withdrawal';
      }
      await api.post(`/carbon-registration/chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Carbon Project Registration / PDD Validation — Gold Standard + Verra VCS + Article 6.4</h2>
          <p className="text-xs text-[#4a5568]">
            11-state front end of the carbon credit lifecycle: PIN submitted → PDD drafted → validation
            (VVB) → public consultation → DNA authorization → registration requested → registered →
            crediting active (+ VVB CAR loop, rejection, withdrawal). Hands off to MRV verification (W11),
            retirement (W17) and Article 6 ITMO (W4). INVERTED SLA: higher-integrity tier (AFOLU/REDD+)
            gets more diligence time. Rejection crosses to the regulator for ALL tiers; registration +
            SLA breaches cross for high-integrity tiers (AFOLU/REDD+ + large-scale).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"            value={kpis.total} />
        <Kpi label="Open"             value={kpis.open_count}          tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Registered"       value={kpis.registered_count} />
        <Kpi label="Crediting"        value={kpis.crediting_count}     tone="ok" />
        <Kpi label="Rejected"         value={kpis.rejected_count}      tone={kpis.rejected_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"     value={kpis.breached}            tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable"       value={kpis.reportable_total} />
        <Kpi label="Est. tCO₂e"       value={fmtTco2e(kpis.total_estimated_tco2e)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>High-integrity open: <span className="font-semibold text-[#9b1f1f]">{kpis.high_integrity_open}</span></span>
        <span>Withdrawn: <span className="font-semibold text-[#557]">{kpis.withdrawn_count}</span></span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Developer</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / standard</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Est. tCO₂e</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.project_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.project_number}
                      {r.source_wave && <span className="ml-1 text-[9px] text-[#8a93a0]">{r.source_wave}</span>}
                    </td>
                    <td className="px-3 py-2 text-[#1a3a5c]">{r.developer_party_name}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <div className="text-[11px]">{r.project_name}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.standard ?? '—'} · {r.methodology ?? '—'} · {r.province ?? r.host_country}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtTco2e(r.estimated_total_tco2e)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                      {r.car_round > 0 && <span className="ml-1 text-[9px] text-[#a06200]">CAR×{r.car_round}</span>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No projects match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: RegRow;
  events: RegEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: RegRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canCorrect = CORRECTABLE.includes(row.chain_status);
  const canReject = REJECTABLE.includes(row.chain_status);
  const canWithdraw = WITHDRAWABLE.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.project_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.project_tier].label} · {row.standard ?? '—'} · {row.methodology ?? '—'} · {row.province ?? row.host_country}
              </div>
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Developer"          value={row.developer_party_name} />
            <Pair label="VVB / DOE"          value={row.vvb_name ?? '—'} />
            <Pair label="Tier"               value={TIER_TONE[row.project_tier].label} />
            <Pair label="Standard"           value={row.standard ?? '—'} />
            <Pair label="Methodology"        value={row.methodology ?? '—'} />
            <Pair label="Host country"       value={row.host_country} />
            <Pair label="Province"           value={row.province ?? '—'} />
            <Pair label="Crediting years"    value={row.crediting_years != null ? String(row.crediting_years) : '—'} />
            <Pair label="Annual tCO₂e"       value={fmtTco2e(row.estimated_annual_tco2e)} />
            <Pair label="Total tCO₂e"        value={fmtTco2e(row.estimated_total_tco2e)} />
            <Pair label="Serial block"       value={row.registered_serial_block ?? '—'} />
            <Pair label="PDD ref"            value={row.pdd_ref ?? '—'} />
            <Pair label="Validation ref"     value={row.validation_ref ?? '—'} />
            <Pair label="CAR ref"            value={row.car_ref ?? '—'} />
            <Pair label="Consultation ref"   value={row.consultation_ref ?? '—'} />
            <Pair label="DNA ref"            value={row.dna_authorization_ref ?? '—'} />
            <Pair label="Registration ref"   value={row.registration_ref ?? '—'} />
            <Pair label="Rejection ref"      value={row.rejection_ref ?? '—'} />
            <Pair label="State"              value={STATE_TONE[row.chain_status].label} />
            <Pair label="CAR round"          value={String(row.car_round)} />
            <Pair label="Escalation"         value={String(row.escalation_level)} />
            <Pair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"         value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="PIN submitted"      value={fmtDate(row.pin_submitted_at)} />
            <Pair label="Reason code"        value={row.reason_code ?? '—'} />
            {row.source_wave && <Pair label="Provenance" value={`${row.source_wave} · ${row.source_entity_id ?? ''}`} />}
          </div>
          {row.validation_basis && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Validation basis</div>
              {row.validation_basis}
            </div>
          )}
          {row.corrections_basis && (
            <div className="mt-2 rounded border border-[#ffe4b5] bg-[#fffaf0] px-3 py-2 text-[12px] text-[#8a4a00]">
              <div className="text-[10px] uppercase tracking-wider text-[#a06200] mb-1">CAR basis</div>
              {row.corrections_basis}
            </div>
          )}
          {row.consultation_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Consultation basis</div>
              {row.consultation_basis}
            </div>
          )}
          {row.dna_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">DNA basis</div>
              {row.dna_basis}
            </div>
          )}
          {row.registration_basis && (
            <div className="mt-2 rounded border border-[#cfe6d3] bg-[#f3fbf5] px-3 py-2 text-[12px] text-[#1f5b3a]">
              <div className="text-[10px] uppercase tracking-wider text-[#1f6b3a] mb-1">Registration basis</div>
              {row.registration_basis}
            </div>
          )}
          {row.rejection_basis && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1">Rejection basis</div>
              {row.rejection_basis}
            </div>
          )}
          {row.withdrawal_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#557]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Withdrawal basis</div>
              {row.withdrawal_basis}
            </div>
          )}
          {row.rod_notes && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">ROD notes</div>
              {row.rod_notes}
            </div>
          )}
        </section>

        {(nextAction || canCorrect || canReject || canWithdraw) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canCorrect && (
                <button
                  onClick={() => onAct('request-corrections', row)}
                  className="rounded border border-[#e0b070] bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4a00] hover:bg-[#fffaf0]"
                >
                  {ACTION_LABEL['request-corrections']}
                </button>
              )}
              {canReject && (
                <button
                  onClick={() => onAct('reject', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject']}
                </button>
              )}
              {canWithdraw && (
                <button
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['withdraw']}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="inline-block rounded bg-[#eef1f5] px-1.5 py-0.5 text-[10px] font-medium text-[#445]">{e.actor_party}</span>
                    )}
                  </div>
                  {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}

export default RegistrationChainTab;
