// Wave 57 — Embedded-Generation Registration & Schedule 2 Exemption tab.
//
// NERSA registration of small-scale / embedded generation under the Electricity
// Regulation Act 4 of 2006 Schedule 2 (as amended 2021/2023). Schedule 2 lists
// generation activities EXEMPT from holding a licence; the 2023 amendment removed
// the own-use capacity cap. Exempt facilities above the de-minimis threshold must
// still REGISTER. A registration committee determines whether a facility qualifies
// for the exemption, then registers it, refuses it, or REFERS it UP to the W49
// full-licensing pipeline (generation for sale / trading / export, or a
// configuration outside Schedule 2). The light-touch front-end sibling of W49 —
// no public-participation step is the W57 distinction.
//
//   registration_received → eligibility_screening → technical_verification
//     → exemption_determination → registration_approved → registered.
//   Info-gap loop:  eligibility_screening → information_requested → (submit) → eligibility_screening.
//   Conditional:    exemption_determination → conditions_pending → registration_approved.
//   Referral (signature): exemption_determination → referred_to_licensing (hands off to W49).
//   refused from exemption_determination; withdrawn from any pre-decision state;
//   lapsed from information_requested (non-responsive).
//
// INVERTED SLA — the bigger the embedded generator, the longer every window
// (shorter overall than W49 licensing). Two-party write: the applicant files /
// supplies info / satisfies conditions / withdraws; the regulator drives
// everything else. Reportability: a referral crosses for EVERY tier (the W57
// signature — kicking a facility into full licensing); large + utility refusals
// and SLA breaches also cross (Electricity Regulation Act 4 of 2006 Schedule 2 +
// NERSA SSEG registration framework).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'registration_received' | 'eligibility_screening' | 'information_requested'
  | 'technical_verification' | 'exemption_determination' | 'conditions_pending'
  | 'registration_approved' | 'registered' | 'referred_to_licensing'
  | 'refused' | 'withdrawn' | 'lapsed';

type Tier = 'micro' | 'small' | 'medium' | 'large' | 'utility';

interface RegistrationRow {
  [key: string]: unknown;
  id: string;
  registration_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  regulator_party_id: string;
  regulator_party_name: string;
  capacity_tier: Tier;
  generation_purpose: string;
  technology: string | null;
  customer_category: string | null;
  facility_name: string;
  facility_location: string | null;
  capacity_kw: number;
  point_of_connection: string | null;
  distributor: string | null;
  estimated_capex_zar_m: number | null;
  grid_connection_ref: string | null;
  application_ref: string | null;
  screening_ref: string | null;
  info_request_ref: string | null;
  verification_ref: string | null;
  determination_ref: string | null;
  conditions_ref: string | null;
  certificate_ref: string | null;
  licensing_referral_ref: string | null;
  regulator_ref: string | null;
  application_basis: string | null;
  screening_basis: string | null;
  info_request_basis: string | null;
  verification_basis: string | null;
  determination_basis: string | null;
  conditions_basis: string | null;
  approval_basis: string | null;
  referral_basis: string | null;
  refusal_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  info_request_round: number;
  chain_status: ChainStatus;
  registration_received_at: string;
  eligibility_screening_at: string | null;
  information_requested_at: string | null;
  technical_verification_at: string | null;
  exemption_determination_at: string | null;
  conditions_pending_at: string | null;
  registration_approved_at: string | null;
  registered_at: string | null;
  referred_to_licensing_at: string | null;
  refused_at: string | null;
  withdrawn_at: string | null;
  lapsed_at: string | null;
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
  breach_crosses_regulator?: boolean;
}

interface RegistrationEvent {
  id: string;
  registration_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiSummary {
  total: number;
  open_count: number;
  registered_count: number;
  referred_count: number;
  refused_count: number;
  withdrawn_count: number;
  lapsed_count: number;
  in_determination: number;
  breached: number;
  reportable_total: number;
  large_open: number;
  total_capacity_kw: number;
  registered_capacity_kw: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  registration_received:   { bg: '#e3e7ec', fg: '#557',    label: 'Received' },
  eligibility_screening:   { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Eligibility screening' },
  information_requested:   { bg: '#ffe9d6', fg: '#8a4a00', label: 'Info requested' },
  technical_verification:  { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Technical verification' },
  exemption_determination: { bg: '#fff4d6', fg: '#a06200', label: 'Exemption determination' },
  conditions_pending:      { bg: '#ffe9d6', fg: '#8a4a00', label: 'Conditions pending' },
  registration_approved:   { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  registered:              { bg: '#d4edda', fg: '#155724', label: 'Registered' },
  referred_to_licensing:   { bg: '#e7dbf7', fg: '#5a2a8a', label: 'Referred to licensing' },
  refused:                 { bg: '#fde0e0', fg: '#9b1f1f', label: 'Refused' },
  withdrawn:               { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
  lapsed:                  { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Lapsed' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  micro:   { bg: '#e3e7ec', fg: '#557',    label: 'Micro' },
  small:   { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Small' },
  medium:  { bg: '#fff4d6', fg: '#a06200', label: 'Medium' },
  large:   { bg: '#ffe4b5', fg: '#8a4a00', label: 'Large' },
  utility: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Utility' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                  label: 'Active' },
  { key: 'all',                     label: 'All' },
  { key: 'micro',                   label: 'Micro' },
  { key: 'small',                   label: 'Small' },
  { key: 'medium',                  label: 'Medium' },
  { key: 'large',                   label: 'Large' },
  { key: 'utility',                 label: 'Utility' },
  { key: 'in_determination',        label: 'In determination' },
  { key: 'registered',              label: 'Registered' },
  { key: 'referred',                label: 'Referred' },
  { key: 'breached',                label: 'SLA breached' },
  { key: 'reportable',              label: 'Reportable' },
  { key: 'registration_received',   label: 'Received' },
  { key: 'eligibility_screening',   label: 'Screening' },
  { key: 'information_requested',   label: 'Info requested' },
  { key: 'technical_verification',  label: 'Verification' },
  { key: 'exemption_determination', label: 'Determination' },
  { key: 'conditions_pending',      label: 'Conditions' },
  { key: 'registration_approved',   label: 'Approved' },
  { key: 'refused',                 label: 'Refused' },
  { key: 'withdrawn',               label: 'Withdrawn' },
  { key: 'lapsed',                  label: 'Lapsed' },
];

type ActionKind =
  | 'begin-screening' | 'request-info' | 'submit-info' | 'begin-verification'
  | 'determine-exemption' | 'approve-registration' | 'approve-with-conditions'
  | 'satisfy-conditions' | 'issue-certificate' | 'refer-to-licensing'
  | 'refuse-registration' | 'withdraw' | 'lapse';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  registration_received:   'begin-screening',
  eligibility_screening:   'begin-verification',
  information_requested:   'submit-info',
  technical_verification:  'determine-exemption',
  exemption_determination: 'approve-registration',
  conditions_pending:      'satisfy-conditions',
  registration_approved:   'issue-certificate',
  registered:              null,
  referred_to_licensing:   null,
  refused:                 null,
  withdrawn:               null,
  lapsed:                  null,
};

// Functional party per action. The registry (NERSA intake) handles screening
// logistics, info requests, certificate issuance and lapse; verifiers run the
// technical verification + exemption determination; the registration committee
// approves / refuses / refers (administratively, not the full Council); the
// applicant supplies information, satisfies conditions and withdraws.
const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-screening':         'Begin eligibility screening (registry)',
  'request-info':            'Request additional info (registry)',
  'submit-info':             'Submit additional info (applicant)',
  'begin-verification':      'Begin technical verification (verifier)',
  'determine-exemption':     'Make exemption determination (verifier)',
  'approve-registration':    'Approve registration (committee)',
  'approve-with-conditions': 'Approve with conditions (committee)',
  'satisfy-conditions':      'Satisfy conditions (applicant)',
  'issue-certificate':       'Issue registration certificate (registry)',
  'refer-to-licensing':      'Refer to full licensing (committee)',
  'refuse-registration':     'Refuse registration (committee)',
  'withdraw':                'Withdraw registration (applicant)',
  'lapse':                   'Lapse registration (registry)',
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

function fmtKw(n: number | null | undefined): string {
  if (!n) return '—';
  if (n >= 1000) return `${(n / 1000).toLocaleString('en-ZA', { maximumFractionDigits: 1 })} MW`;
  return `${n.toLocaleString('en-ZA')} kW`;
}

function fmtZarM(n: number | null | undefined): string {
  if (!n) return '—';
  return `R${n.toLocaleString('en-ZA')}m`;
}

const TERMINAL_STATES: ChainStatus[] = ['registered', 'referred_to_licensing', 'refused', 'withdrawn', 'lapsed'];
const DETERMINATION_STATES: ChainStatus[] = ['exemption_determination', 'conditions_pending'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['registration_received', 'eligibility_screening', 'information_requested', 'technical_verification', 'exemption_determination', 'conditions_pending'];

export function SsegRegistrationChainTab() {
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<RegistrationRow | null>(null);
  const [events, setEvents] = useState<RegistrationEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RegistrationRow[] } & KpiSummary }>('/sseg-registration/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, registered_count: d.registered_count,
          referred_count: d.referred_count, refused_count: d.refused_count,
          withdrawn_count: d.withdrawn_count, lapsed_count: d.lapsed_count,
          in_determination: d.in_determination, breached: d.breached,
          reportable_total: d.reportable_total, large_open: d.large_open,
          total_capacity_kw: d.total_capacity_kw, registered_capacity_kw: d.registered_capacity_kw,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load SSEG registrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: RegistrationRow; events: RegistrationEvent[] } }>(
        `/sseg-registration/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load registration history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'in_determination') return DETERMINATION_STATES.includes(r.chain_status);
      if (filter === 'referred')         return r.chain_status === 'referred_to_licensing';
      if (filter === 'breached')         return r.sla_breached;
      if (filter === 'reportable')       return r.is_reportable;
      if (filter === 'micro' || filter === 'small' || filter === 'medium' || filter === 'large' || filter === 'utility') {
        return r.capacity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: RegistrationRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'begin-screening') {
        const basis = window.prompt('Screening basis — scope of the eligibility screening (Schedule 2 category, de-minimis threshold, own-use vs export, distributor connection approval):') || '';
        const ref = window.prompt('Screening reference (e.g. NERSA-SSEG-SCR-2026-0007):') || '';
        body = {};
        if (basis) body.screening_basis = basis;
        if (ref) body.screening_ref = ref;
      } else if (action === 'request-info') {
        const basis = window.prompt('Info-request basis — the missing items the applicant must furnish (single-line diagram, metering certificate, distributor connection approval):');
        if (!basis) return;
        const ref = window.prompt('Info-request reference (e.g. NERSA-SSEG-RFI-2026-0007):') || '';
        body = { info_request_basis: basis };
        if (ref) body.info_request_ref = ref;
      } else if (action === 'submit-info') {
        const notes = window.prompt('Submission notes — the additional information the applicant has now furnished:');
        if (!notes) return;
        body = { notes };
      } else if (action === 'begin-verification') {
        const basis = window.prompt('Verification basis — scope of the technical verification (installed capacity, point-of-connection, own-use-vs-wheeling, grid-impact study for large/utility):');
        if (!basis) return;
        const ref = window.prompt('Verification reference (e.g. NERSA-SSEG-VER-2026-0007):') || '';
        body = { verification_basis: basis };
        if (ref) body.verification_ref = ref;
      } else if (action === 'determine-exemption') {
        const basis = window.prompt('Determination basis — committee finding on whether the facility qualifies for the Schedule 2 exemption:');
        if (!basis) return;
        const ref = window.prompt('Determination reference (e.g. NERSA-SSEG-DET-2026-0007):') || '';
        body = { determination_basis: basis };
        if (ref) body.determination_ref = ref;
      } else if (action === 'approve-registration') {
        const basis = window.prompt('Approval basis — committee resolution confirming the facility qualifies for Schedule 2 exemption and may be registered:');
        if (!basis) return;
        body = { approval_basis: basis };
      } else if (action === 'approve-with-conditions') {
        const basis = window.prompt('Conditions basis — the registration conditions the applicant must satisfy first (e.g. fit a bidirectional meter, restrict export to own-use):');
        if (!basis) return;
        const ref = window.prompt('Conditions reference (e.g. NERSA-SSEG-CND-2026-0007):') || '';
        body = { conditions_basis: basis };
        if (ref) body.conditions_ref = ref;
      } else if (action === 'satisfy-conditions') {
        const notes = window.prompt('Satisfaction notes — confirm the applicant has satisfied the registration conditions:');
        if (!notes) return;
        body = { notes };
      } else if (action === 'issue-certificate') {
        const cert = window.prompt('Registration certificate number (e.g. NERSA-SSEG-CERT-2026-0142):') || '';
        const reg = window.prompt('NERSA registration reference (optional):') || '';
        const rod = window.prompt('Record-of-decision notes (optional):') || '';
        body = {};
        if (cert) body.certificate_ref = cert;
        if (reg) body.regulator_ref = reg;
        if (rod) body.rod_notes = rod;
      } else if (action === 'refer-to-licensing') {
        const basis = window.prompt('Referral basis — why the facility falls outside Schedule 2 and must be referred to full licensing (generation for sale / trading / export, or a configuration outside the exemption):');
        if (!basis) return;
        const ref = window.prompt('Licensing referral reference (e.g. NERSA-LIC-2026-0188):') || '';
        const rod = window.prompt('Record-of-decision notes (optional):') || '';
        body = { referral_basis: basis, reason_code: 'outside_schedule_2' };
        if (ref) body.licensing_referral_ref = ref;
        if (rod) body.rod_notes = rod;
      } else if (action === 'refuse-registration') {
        const basis = window.prompt('Refusal basis — why the committee refuses the registration (ineligible configuration, false declaration, safety non-compliance):');
        if (!basis) return;
        body = { refusal_basis: basis, reason_code: 'registration_refused' };
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason — why the applicant is withdrawing before a determination:');
        if (!reason) return;
        body = { reason_code: reason };
      } else if (action === 'lapse') {
        const reason = window.prompt('Lapse reason — the applicant was non-responsive to the information request within the statutory window:') || 'non_responsive';
        body = { reason_code: reason };
      }
      await api.post(`/sseg-registration/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Embedded-generation registration &amp; Schedule 2 exemption</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage ERA 2006 Schedule 2 registration chain · received → eligibility screening → technical verification →
            exemption determination → approved → registered. NERSA may request additional information mid-screening (submit
            to return to screening); the committee may approve with conditions (applicant satisfies, then registered); a
            facility that does not qualify is REFERRED to full licensing (the W57 signature — handing off to the §§8–11
            pipeline); refused at the committee; withdrawn by the applicant before a determination; or lapsed when an
            information request goes unanswered. The LIGHT-TOUCH front-end sibling of licensing — no public-participation
            step. INVERTED SLA: the bigger the embedded generator, the longer every window. A referral crosses to the
            regulator inbox for EVERY tier; large + utility refusals and SLA breaches also cross (Electricity Regulation Act
            4 of 2006 Schedule 2 + NERSA SSEG registration framework).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Large / utility open" value={kpis?.large_open ?? 0} tone={(kpis?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In determination" value={kpis?.in_determination ?? 0} tone={(kpis?.in_determination ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Registered" value={kpis?.registered_count ?? 0} tone="ok" />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Referred to licensing" value={kpis?.referred_count ?? 0} tone={(kpis?.referred_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Refused" value={kpis?.refused_count ?? 0} tone={(kpis?.refused_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Withdrawn" value={kpis?.withdrawn_count ?? 0} />
        <Kpi label="Lapsed" value={kpis?.lapsed_count ?? 0} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Capacity in pipeline" value={fmtKw(kpis?.total_capacity_kw ?? 0)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Registration #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Applicant / facility</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Purpose / tech</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Capacity</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const ct = TIER_TONE[r.capacity_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.registration_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[240px]">
                      <div className="truncate" title={r.applicant_party_name}>{r.applicant_party_name}</div>
                      <div className="truncate text-[10px] text-[#4a5568]" title={r.facility_name}>{r.facility_name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ct.bg, color: ct.fg }}>
                        {ct.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568] capitalize">
                      {r.generation_purpose.replace(/_/g, ' ')}
                      {r.technology && r.technology !== 'na' && <span className="text-[10px] text-[#4a5568]"> · {r.technology.replace(/_/g, ' ')}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'oklch(0.46 0.16 55)' }}>{fmtKw(r.capacity_kw)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No SSEG registrations match.</td></tr>
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
  row: RegistrationRow;
  events: RegistrationEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: RegistrationRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRequestInfo = row.chain_status === 'eligibility_screening';
  const canApproveWithConditions = row.chain_status === 'exemption_determination';
  const canRefer = row.chain_status === 'exemption_determination';
  const canRefuse = row.chain_status === 'exemption_determination';
  const canApproveDirect = row.chain_status === 'conditions_pending';
  const canLapse = row.chain_status === 'information_requested';
  const canWithdraw = WITHDRAWABLE_STATES.includes(row.chain_status);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="oe-overlay-in fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="oe-drawer-in absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.registration_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.applicant_party_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.capacity_tier].label} · {row.generation_purpose.replace(/_/g, ' ')}
                {row.facility_name ? ` · ${row.facility_name}` : ''}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"                value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"                 value={TIER_TONE[row.capacity_tier].label} />
            <Pair label="Generation purpose"   value={row.generation_purpose.replace(/_/g, ' ')} />
            <Pair label="Technology"           value={row.technology ? row.technology.replace(/_/g, ' ') : '—'} />
            <Pair label="Customer category"    value={row.customer_category ? row.customer_category.replace(/_/g, ' ') : '—'} />
            <Pair label="Facility"             value={row.facility_name} />
            <Pair label="Location"             value={row.facility_location ?? '—'} />
            <Pair label="Capacity"             value={fmtKw(row.capacity_kw)} />
            <Pair label="Point of connection"  value={row.point_of_connection ?? '—'} />
            <Pair label="Distributor"          value={row.distributor ?? '—'} />
            <Pair label="Estimated capex"      value={fmtZarM(row.estimated_capex_zar_m)} />
            <Pair label="Regulator"            value={row.regulator_party_name} />
            <Pair label="Grid connection ref"  value={row.grid_connection_ref ?? '—'} />
            <Pair label="Info-request round"   value={String(row.info_request_round)} />
            <Pair label="Screening ref"        value={row.screening_ref ?? '—'} />
            <Pair label="Info-request ref"     value={row.info_request_ref ?? '—'} />
            <Pair label="Verification ref"     value={row.verification_ref ?? '—'} />
            <Pair label="Determination ref"    value={row.determination_ref ?? '—'} />
            <Pair label="Conditions ref"       value={row.conditions_ref ?? '—'} />
            <Pair label="Certificate ref"      value={row.certificate_ref ?? '—'} />
            <Pair label="Licensing referral"   value={row.licensing_referral_ref ?? '—'} />
            <Pair label="Regulator ref"        value={row.regulator_ref ?? '—'} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Received"             value={fmtDate(row.registration_received_at)} />
            <Pair label="Screening"            value={fmtDate(row.eligibility_screening_at)} />
            <Pair label="Info requested"       value={fmtDate(row.information_requested_at)} />
            <Pair label="Verification"         value={fmtDate(row.technical_verification_at)} />
            <Pair label="Determination"        value={fmtDate(row.exemption_determination_at)} />
            <Pair label="Conditions pending"   value={fmtDate(row.conditions_pending_at)} />
            <Pair label="Approved"             value={fmtDate(row.registration_approved_at)} />
            <Pair label="Registered"           value={fmtDate(row.registered_at)} />
            <Pair label="Referred"             value={fmtDate(row.referred_to_licensing_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.application_basis && (
            <BasisBlock label="Application basis" tone="oklch(0.46 0.16 55)" text={row.application_basis} />
          )}
          {row.screening_basis && (
            <BasisBlock label="Screening basis" tone="oklch(0.46 0.16 55)" text={row.screening_basis} />
          )}
          {row.info_request_basis && (
            <BasisBlock label="Info-request basis" tone="#8a4a00" text={row.info_request_basis} />
          )}
          {row.verification_basis && (
            <BasisBlock label="Verification basis" tone="oklch(0.46 0.16 55)" text={row.verification_basis} />
          )}
          {row.determination_basis && (
            <BasisBlock label="Determination basis" tone="#a06200" text={row.determination_basis} />
          )}
          {row.conditions_basis && (
            <BasisBlock label="Conditions basis" tone="#8a4a00" text={row.conditions_basis} />
          )}
          {row.approval_basis && (
            <BasisBlock label="Approval basis" tone="#1f6b3a" text={row.approval_basis} />
          )}
          {row.referral_basis && (
            <BasisBlock label="Licensing-referral basis" tone="#5a2a8a" text={row.referral_basis} />
          )}
          {row.refusal_basis && (
            <BasisBlock label="Refusal basis" tone="#9b1f1f" text={row.refusal_basis} />
          )}
          {row.rod_notes && (
            <BasisBlock label="Record of decision" tone="#155724" text={row.rod_notes} />
          )}
        </section>

        {(nextAction || canRequestInfo || canApproveWithConditions || canRefer || canRefuse || canApproveDirect || canLapse || canWithdraw) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canRequestInfo && (
                <button type="button"
                  onClick={() => onAct('request-info', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['request-info']}
                </button>
              )}
              {canApproveWithConditions && (
                <button type="button"
                  onClick={() => onAct('approve-with-conditions', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4a00] hover:bg-[#fff4d6]"
                >
                  {ACTION_LABEL['approve-with-conditions']}
                </button>
              )}
              {canApproveDirect && (
                <button type="button"
                  onClick={() => onAct('approve-registration', row)}
                  className="rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-[#1f6b3a] hover:bg-green-50"
                >
                  {ACTION_LABEL['approve-registration']}
                </button>
              )}
              {canRefer && (
                <button type="button"
                  onClick={() => onAct('refer-to-licensing', row)}
                  className="rounded border border-purple-300 bg-white px-3 py-1.5 text-[12px] font-medium text-[#5a2a8a] hover:bg-purple-50"
                >
                  {ACTION_LABEL['refer-to-licensing']}
                </button>
              )}
              {canRefuse && (
                <button type="button"
                  onClick={() => onAct('refuse-registration', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['refuse-registration']}
                </button>
              )}
              {canLapse && (
                <button type="button"
                  onClick={() => onAct('lapse', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL.lapse}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL.withdraw}
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
                  <div className="flex items-center justify-between">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[10px] font-medium text-[#4a5568]">{e.actor_party}</span>
                    )}
                  </div>
                  {e.notes && <div className="mt-1" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function BasisBlock({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="mt-3 text-[12px]">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: tone }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: tone }}>{text}</div>
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
