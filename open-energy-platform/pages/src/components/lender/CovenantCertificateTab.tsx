// Wave 38 — Lender Covenant Compliance Certificate chain — LMA + Equator Principles + SARB.
//
// The ONGOING monitoring backbone of project finance. After financial close,
// the borrower delivers a periodic signed Compliance Certificate evidencing the
// financial covenants (DSCR, LLCR, gearing) for the test period. The facility
// agent reviews and either confirms compliance or declares a breach; a breach
// routes through the waiver / cure / acceleration branches.
//
//   certificate_due → certificate_submitted → under_review → ratios_verified
//     → compliant
//   breach: breach_identified → waiver_requested → waiver_granted
//                             → cure_period → cured
//                             → accelerated (event of default)
//
// URGENT tier SLA — senior secured tightest (closest monitoring). accelerate
// crosses regulator for ALL tiers; breach declarations + SLA breaches for
// senior_secured + mezzanine only (SARB large-exposure).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { prompt } from '../PromptDialog';

type ChainStatus =
  | 'certificate_due' | 'certificate_submitted' | 'under_review' | 'ratios_verified'
  | 'compliant' | 'breach_identified' | 'waiver_requested' | 'waiver_granted'
  | 'cure_period' | 'cured' | 'accelerated';

type Tier = 'senior_secured' | 'mezzanine' | 'subordinated';

interface CovCertRow {
  id: string;
  certificate_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  borrower_party_id: string;
  borrower_party_name: string;
  facility_agent_name: string | null;
  lender_name: string | null;
  facility_name: string;
  facility_tier: Tier;
  facility_limit: number | null;
  outstanding_principal: number | null;
  test_period: string | null;
  test_period_end: string | null;
  dscr_actual: number | null;
  dscr_threshold: number | null;
  llcr_actual: number | null;
  llcr_threshold: number | null;
  gearing_actual: number | null;
  gearing_threshold: number | null;
  breached_covenants: string | null;
  certificate_ref: string | null;
  review_ref: string | null;
  breach_ref: string | null;
  waiver_ref: string | null;
  cure_ref: string | null;
  acceleration_ref: string | null;
  submission_basis: string | null;
  review_basis: string | null;
  breach_basis: string | null;
  waiver_basis: string | null;
  cure_basis: string | null;
  acceleration_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  certificate_due_at: string;
  certificate_submitted_at: string | null;
  under_review_at: string | null;
  ratios_verified_at: string | null;
  compliant_at: string | null;
  breach_identified_at: string | null;
  waiver_requested_at: string | null;
  waiver_granted_at: string | null;
  cure_period_at: string | null;
  cured_at: string | null;
  accelerated_at: string | null;
  waiver_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable?: boolean;
  has_breached?: boolean;
  breach_crosses_regulator?: boolean;
  sla_window_minutes?: number;
  created_by: string;
  created_at: string;
}

interface CovCertEvent {
  id: string;
  certificate_id: string;
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
  certificate_due:       { bg: '#fff4d6', fg: '#a06200', label: 'Certificate due' },
  certificate_submitted: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Submitted' },
  under_review:          { bg: '#fbe7d0', fg: '#7a4500', label: 'Under review' },
  ratios_verified:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Ratios verified' },
  compliant:             { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Compliant' },
  breach_identified:     { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Breach identified' },
  waiver_requested:      { bg: '#fbe7d0', fg: '#7a4500', label: 'Waiver requested' },
  waiver_granted:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'Waiver granted' },
  cure_period:           { bg: '#fff4d6', fg: '#a06200', label: 'Cure period' },
  cured:                 { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Cured' },
  accelerated:           { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Accelerated (EoD)' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  senior_secured: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Senior secured' },
  mezzanine:      { bg: '#fff4d6', fg: '#a06200', label: 'Mezzanine' },
  subordinated:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Subordinated' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'reportable',            label: 'SARB reportable' },
  { key: 'senior_secured',        label: 'Senior' },
  { key: 'mezzanine',             label: 'Mezzanine' },
  { key: 'subordinated',          label: 'Subordinated' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'certificate_due',       label: 'Due' },
  { key: 'certificate_submitted', label: 'Submitted' },
  { key: 'under_review',          label: 'Review' },
  { key: 'ratios_verified',       label: 'Verified' },
  { key: 'compliant',             label: 'Compliant' },
  { key: 'breach_identified',     label: 'Breach' },
  { key: 'waiver_requested',      label: 'Waiver req' },
  { key: 'waiver_granted',        label: 'Waived' },
  { key: 'cure_period',           label: 'Cure' },
  { key: 'cured',                 label: 'Cured' },
  { key: 'accelerated',           label: 'Accelerated' },
];

type ActionKind =
  | 'submit-certificate' | 'begin-review' | 'verify-ratios' | 'confirm-compliant'
  | 'flag-breach' | 'flag-non-submission' | 'request-waiver' | 'grant-waiver'
  | 'require-cure' | 'confirm-cured' | 'accelerate';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  certificate_due:       'submit-certificate',
  certificate_submitted: 'begin-review',
  under_review:          'verify-ratios',
  ratios_verified:       'confirm-compliant',
  compliant:             null,
  breach_identified:     'request-waiver',
  waiver_requested:      'grant-waiver',
  waiver_granted:        null,
  cure_period:           'confirm-cured',
  cured:                 null,
  accelerated:           null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'submit-certificate':  'Submit certificate (Borrower)',
  'begin-review':        'Begin review (Agent)',
  'verify-ratios':       'Verify ratios (Agent)',
  'confirm-compliant':   'Confirm compliant (Agent)',
  'flag-breach':         'Flag breach (Agent)',
  'flag-non-submission': 'Flag non-submission (Agent)',
  'request-waiver':      'Request waiver (Borrower)',
  'grant-waiver':        'Grant waiver (Lender)',
  'require-cure':        'Require cure (Agent)',
  'confirm-cured':       'Confirm cured (Agent)',
  'accelerate':          'Accelerate — declare EoD (Lender)',
};

// States that can branch to a breach declaration.
const CAN_FLAG_BREACH: ChainStatus[] = ['under_review', 'ratios_verified'];
const CAN_FLAG_NON_SUBMISSION: ChainStatus[] = ['certificate_due'];
// States offering require-cure (breach handling).
const CAN_REQUIRE_CURE: ChainStatus[] = ['breach_identified', 'waiver_requested'];
// States offering acceleration (event of default).
const CAN_ACCELERATE: ChainStatus[] = ['breach_identified', 'waiver_requested', 'cure_period'];

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

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(0)}m`;
  if (Math.abs(n) >= 1_000)     return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtRatio(actual: number | null, threshold: number | null): string {
  if (actual === null || actual === undefined) return '—';
  const a = actual.toFixed(2);
  if (threshold === null || threshold === undefined) return a;
  return `${a} / ${threshold.toFixed(2)}`;
}

interface KpiSummary {
  total: number;
  open_count: number;
  compliant_count: number;
  active_breach_count: number;
  waiver_granted_count: number;
  cured_count: number;
  accelerated_count: number;
  breached: number;
  reportable_total: number;
  senior_open: number;
  total_outstanding: number;
}

export function CovenantCertificateTab() {
  const [rows, setRows] = useState<CovCertRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<CovCertRow | null>(null);
  const [events, setEvents] = useState<CovCertEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CovCertRow[] } & KpiSummary }>('/covenant-certificate/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          compliant_count: data.compliant_count || 0,
          active_breach_count: data.active_breach_count || 0,
          waiver_granted_count: data.waiver_granted_count || 0,
          cured_count: data.cured_count || 0,
          accelerated_count: data.accelerated_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          senior_open: data.senior_open || 0,
          total_outstanding: data.total_outstanding || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load covenant certificate chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: CovCertRow; events: CovCertEvent[] } }>(`/covenant-certificate/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load certificate history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'senior_secured' || filter === 'mezzanine' || filter === 'subordinated') {
        return r.facility_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, compliant_count: 0, active_breach_count: 0,
    waiver_granted_count: 0, cured_count: 0, accelerated_count: 0, breached: 0,
    reportable_total: 0, senior_open: 0, total_outstanding: 0,
  };

  const act = useCallback(async (action: ActionKind, row: CovCertRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'submit-certificate') {
        const ref = await prompt('Certificate reference (eg "CC-2026-Q1-0042"):');
        if (ref) body.certificate_ref = ref;
        const dscr = await prompt('DSCR actual (eg 1.35):');
        if (dscr) body.dscr_actual = Number(dscr);
        const llcr = await prompt('LLCR actual (eg 1.42):', '');
        if (llcr) body.llcr_actual = Number(llcr);
        const gearing = await prompt('Gearing actual ratio (eg 0.72):', '');
        if (gearing) body.gearing_actual = Number(gearing);
        const basis = await prompt('Submission basis (narrative):', '');
        if (basis) body.submission_basis = basis;
      } else if (action === 'begin-review') {
        const ref = await prompt('Review reference (optional):', '');
        if (ref) body.review_ref = ref;
      } else if (action === 'verify-ratios') {
        const dscr = await prompt('DSCR verified (leave blank to keep):', String(row.dscr_actual ?? ''));
        if (dscr) body.dscr_actual = Number(dscr);
        const llcr = await prompt('LLCR verified (leave blank to keep):', String(row.llcr_actual ?? ''));
        if (llcr) body.llcr_actual = Number(llcr);
        const gearing = await prompt('Gearing verified (leave blank to keep):', String(row.gearing_actual ?? ''));
        if (gearing) body.gearing_actual = Number(gearing);
        const basis = await prompt('Review basis (narrative):', '');
        if (basis) body.review_basis = basis;
      } else if (action === 'confirm-compliant') {
        const rod = await prompt('Confirmation notes (optional):', '');
        if (rod) body.rod_notes = rod;
      } else if (action === 'flag-breach') {
        const which = await prompt('Breached covenants (comma list, eg "DSCR,GEARING"):');
        if (!which) return;
        body.breached_covenants = which;
        const ref = await prompt('Breach reference (eg "BREACH-2026-0007"):', '');
        if (ref) body.breach_ref = ref;
        const basis = await prompt('Breach basis (narrative — required):');
        if (!basis) return;
        body.breach_basis = basis;
        const reason = await prompt('Reason code (eg "DSCR_SHORTFALL", "GEARING_EXCEEDED"):', '');
        if (reason) body.reason_code = reason;
      } else if (action === 'flag-non-submission') {
        const ref = await prompt('Breach reference (eg "INFO-BREACH-2026-0003"):', '');
        if (ref) body.breach_ref = ref;
        const basis = await prompt('Non-submission basis (required — information covenant breach):');
        if (!basis) return;
        body.breach_basis = basis;
        const reason = await prompt('Reason code (eg "CERT_NOT_DELIVERED"):', '');
        if (reason) body.reason_code = reason;
      } else if (action === 'request-waiver') {
        const ref = await prompt('Waiver reference (eg "WAIVER-REQ-2026-0005"):', '');
        if (ref) body.waiver_ref = ref;
        const basis = await prompt('Waiver request basis (narrative — required):');
        if (!basis) return;
        body.waiver_basis = basis;
      } else if (action === 'grant-waiver') {
        const ref = await prompt('Waiver reference / majority-lender resolution ref:', row.waiver_ref ?? '');
        if (ref) body.waiver_ref = ref;
        const basis = await prompt('Waiver grant basis (lender decision rationale — required):');
        if (!basis) return;
        body.waiver_basis = basis;
        const rod = await prompt('ROD notes (conditions attached, optional):', '');
        if (rod) body.rod_notes = rod;
      } else if (action === 'require-cure') {
        const ref = await prompt('Cure reference (eg "CURE-2026-0009"):', '');
        if (ref) body.cure_ref = ref;
        const basis = await prompt('Cure basis (remediation plan — required):');
        if (!basis) return;
        body.cure_basis = basis;
      } else if (action === 'confirm-cured') {
        const basis = await prompt('Cure confirmation basis (evidence remediated — required):');
        if (!basis) return;
        body.cure_basis = basis;
        const rod = await prompt('ROD notes (optional):', '');
        if (rod) body.rod_notes = rod;
      } else if (action === 'accelerate') {
        const ref = await prompt('Acceleration reference (eg "ACCEL-EOD-2026-0002"):');
        if (!ref) return;
        body.acceleration_ref = ref;
        const basis = await prompt('Acceleration basis (event of default rationale — required):');
        if (!basis) return;
        body.acceleration_basis = basis;
        const reason = await prompt('Reason code (eg "EVENT_OF_DEFAULT", "UOP_DIVERSION"):', '');
        if (reason) body.reason_code = reason;
        const rod = await prompt('ROD notes (board / majority-lender resolution — required):');
        if (!rod) return;
        body.rod_notes = rod;
      }
      await api.post(`/covenant-certificate/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Covenant Compliance Certificate — LMA + Equator Principles + SARB</h2>
          <p className="text-xs text-[#4a5568]">
            The ongoing monitoring backbone. The borrower delivers a periodic
            signed Compliance Certificate (DSCR / LLCR / gearing) for the test
            period; the agent reviews and confirms compliance or declares a
            breach → waiver / cure / acceleration. URGENT tier SLA — senior
            secured tightest (closest monitoring). Acceleration (event of
            default) crosses the regulator for ALL tiers; breach declarations +
            SLA breaches for senior + mezzanine only (SARB large-exposure).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"          value={kpis.total} />
        <Kpi label="Open"           value={kpis.open_count}          tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Compliant"      value={kpis.compliant_count} />
        <Kpi label="Active breach"  value={kpis.active_breach_count} tone={kpis.active_breach_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cured"          value={kpis.cured_count} />
        <Kpi label="Accelerated"    value={kpis.accelerated_count}   tone={kpis.accelerated_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"   value={kpis.breached}            tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Outstanding"    value={fmtZar(kpis.total_outstanding)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Waiver granted: <span className="font-semibold text-[#1f6b3a]">{kpis.waiver_granted_count}</span></span>
        <span>SARB reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Senior open: <span className="font-semibold text-[#1a3a5c]">{kpis.senior_open}</span></span>
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Certificate #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Borrower / facility</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Period</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">DSCR</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Outstanding</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Breached</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.facility_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.certificate_number}
                      {r.is_reportable && <span className="ml-1 rounded bg-[#fde0e0] px-1 text-[9px] font-semibold text-[#9b1f1f]">SARB</span>}
                    </td>
                    <td className="px-3 py-2 text-[#1a3a5c]">
                      <div className="font-medium">{r.borrower_party_name}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.facility_name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.test_period ?? '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.dscr_threshold != null && r.dscr_actual != null && r.dscr_actual < r.dscr_threshold ? 'text-red-700 font-semibold' : 'text-[#1a3a5c]'}`}>
                      {fmtRatio(r.dscr_actual, r.dscr_threshold)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZar(r.outstanding_principal)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#9b1f1f]">{r.breached_covenants ?? '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No certificates match.</td></tr>
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
  row: CovCertRow;
  events: CovCertEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: CovCertRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canFlagBreach = CAN_FLAG_BREACH.includes(row.chain_status);
  const canFlagNonSubmission = CAN_FLAG_NON_SUBMISSION.includes(row.chain_status);
  const canRequireCure = CAN_REQUIRE_CURE.includes(row.chain_status);
  const canAccelerate = CAN_ACCELERATE.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.certificate_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.borrower_party_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.facility_tier].label} · {row.facility_name} · {row.test_period ?? '—'}
              </div>
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Borrower"             value={row.borrower_party_name} />
            <Pair label="Facility agent"       value={row.facility_agent_name ?? '—'} />
            <Pair label="Lender of record"     value={row.lender_name ?? '—'} />
            <Pair label="Tier"                  value={TIER_TONE[row.facility_tier].label} />
            <Pair label="Facility"              value={row.facility_name} />
            <Pair label="Facility limit"        value={fmtZar(row.facility_limit)} />
            <Pair label="Outstanding"           value={fmtZar(row.outstanding_principal)} />
            <Pair label="Test period"           value={row.test_period ?? '—'} />
            <Pair label="Period end"            value={row.test_period_end ?? '—'} />
            <Pair label="DSCR (actual/thr)"     value={fmtRatio(row.dscr_actual, row.dscr_threshold)} />
            <Pair label="LLCR (actual/thr)"     value={fmtRatio(row.llcr_actual, row.llcr_threshold)} />
            <Pair label="Gearing (actual/thr)"  value={fmtRatio(row.gearing_actual, row.gearing_threshold)} />
            <Pair label="Breached covenants"    value={row.breached_covenants ?? '—'} />
            <Pair label="Waiver round"          value={String(row.waiver_round)} />
            <Pair label="Certificate ref"       value={row.certificate_ref ?? '—'} />
            <Pair label="Waiver ref"            value={row.waiver_ref ?? '—'} />
            <Pair label="Cure ref"              value={row.cure_ref ?? '—'} />
            <Pair label="Acceleration ref"      value={row.acceleration_ref ?? '—'} />
            <Pair label="State"                  value={STATE_TONE[row.chain_status].label} />
            <Pair label="Reportable"            value={row.is_reportable ? 'Yes — SARB' : 'No'} />
            <Pair label="Escalation level"      value={String(row.escalation_level)} />
            <Pair label="SLA deadline"          value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"            value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Reason code"           value={row.reason_code ?? '—'} />
            {row.source_wave && <Pair label="Source" value={`${row.source_wave} · ${row.source_entity_id ?? ''}`} />}
          </div>
          {row.rod_notes && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">ROD notes</div>
              {row.rod_notes}
            </div>
          )}
        </section>

        {(nextAction || canFlagBreach || canFlagNonSubmission || canRequireCure || canAccelerate) && (
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
              {canFlagNonSubmission && (
                <button
                  onClick={() => onAct('flag-non-submission', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['flag-non-submission']}
                </button>
              )}
              {canFlagBreach && (
                <button
                  onClick={() => onAct('flag-breach', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['flag-breach']}
                </button>
              )}
              {canRequireCure && (
                <button
                  onClick={() => onAct('require-cure', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#a06200] hover:bg-[#fff8e8]"
                >
                  {ACTION_LABEL['require-cure']}
                </button>
              )}
              {canAccelerate && (
                <button
                  onClick={() => onAct('accelerate', row)}
                  className="rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 hover:bg-red-50"
                >
                  {ACTION_LABEL['accelerate']}
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
                  {(e.from_status || e.to_status) && (
                    <div className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</div>
                  )}
                  {e.actor_party && <div className="text-[10px] text-[#6b7685]">party: {e.actor_party}</div>}
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

export default CovenantCertificateTab;
