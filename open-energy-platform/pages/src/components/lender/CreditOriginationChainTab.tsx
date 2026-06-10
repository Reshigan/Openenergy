// Wave 53 — Lender Credit Facility Origination & Credit Approval chain —
// National Credit Act 34/2005 + Banks Act 94/1990 + Basel III + SARB
// large-exposure + LMA facility agreement.
//
// The FRONT-END of the project-finance lifecycle: the credit-approval gate a
// borrower passes BEFORE any money is committed. A prospective borrower applies;
// the lender screens (eligibility / KYC / NCA affordability), runs a full credit
// assessment, refers it to the credit committee, which approves /
// approves-with-conditions / refers-back / declines; once approved the lender
// issues the facility agreement, the borrower satisfies the conditions precedent,
// and the lender activates the facility — at which point it becomes available to
// draw. Sits UPSTREAM of every other Lender chain (W21 drawdown, W30 disbursement,
// W38 covenant cert, W6 dunning, W45 default).
//
//   application_received → screening → credit_assessment → committee_review
//     → approved → agreement_issued → cp_satisfied → facility_available
//   conditional-approval loop: committee_review → conditions_pending → approved
//   referral loop:             committee_review → referred_back → credit_assessment
//
// INVERTED tier SLA — bigger facility = MORE time. activate crosses the SARB
// large-exposure inbox for major + systemic (the W53 signature); decline crosses
// for systemic only; SLA breaches cross for major + systemic.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'application_received' | 'screening' | 'credit_assessment' | 'committee_review'
  | 'referred_back' | 'conditions_pending' | 'approved' | 'agreement_issued'
  | 'cp_satisfied' | 'facility_available' | 'declined' | 'withdrawn';

type Tier = 'small' | 'medium' | 'large' | 'major' | 'systemic';

interface CreditFacilityRow {
  id: string;
  application_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  lender_name: string | null;
  sponsor_name: string | null;
  facility_tier: Tier;
  facility_name: string;
  facility_type: string | null;
  facility_purpose: string | null;
  facility_limit_zar_m: number | null;
  tenor_months: number | null;
  margin_bps: number | null;
  pricing_basis: string | null;
  project_id: string | null;
  project_name: string | null;
  sector: string | null;
  credit_rating: string | null;
  ltv_pct: number | null;
  dscr_base: number | null;
  gearing_pct: number | null;
  pd_pct: number | null;
  lgd_pct: number | null;
  ead_zar_m: number | null;
  approved_amount_zar_m: number | null;
  conditions_count: number | null;
  cp_count: number | null;
  screening_ref: string | null;
  assessment_ref: string | null;
  committee_ref: string | null;
  approval_ref: string | null;
  agreement_ref: string | null;
  cp_ref: string | null;
  activation_ref: string | null;
  decline_ref: string | null;
  regulator_ref: string | null;
  screening_basis: string | null;
  assessment_basis: string | null;
  committee_basis: string | null;
  approval_basis: string | null;
  conditions_basis: string | null;
  cp_basis: string | null;
  activation_basis: string | null;
  decline_basis: string | null;
  reason_code: string | null;
  decision_notes: string | null;
  notes: string | null;
  referral_round: number;
  chain_status: ChainStatus;
  application_received_at: string;
  screening_at: string | null;
  credit_assessment_at: string | null;
  committee_review_at: string | null;
  referred_back_at: string | null;
  conditions_pending_at: string | null;
  approved_at: string | null;
  agreement_issued_at: string | null;
  cp_satisfied_at: string | null;
  facility_available_at: string | null;
  declined_at: string | null;
  withdrawn_at: string | null;
  is_reportable?: boolean;
  is_large_exposure?: boolean;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  breach_crosses_regulator?: boolean;
  sla_window_minutes?: number;
  created_by: string;
  created_at: string;
}

interface CreditFacilityEvent {
  id: string;
  application_id: string;
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
  application_received: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Application received' },
  screening:            { bg: '#e0eefb', fg: '#1a4a7a', label: 'Screening' },
  credit_assessment:    { bg: '#fff4d6', fg: '#a06200', label: 'Credit assessment' },
  committee_review:     { bg: '#fbe7d0', fg: '#7a4500', label: 'Committee review' },
  referred_back:        { bg: '#fde9c8', fg: '#8a4b00', label: 'Referred back' },
  conditions_pending:   { bg: '#e6dcf5', fg: '#4a2a7a', label: 'Conditions pending' },
  approved:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  agreement_issued:     { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Agreement issued' },
  cp_satisfied:         { bg: '#cfeede', fg: '#0e6b4a', label: 'CPs satisfied' },
  facility_available:   { bg: '#1f6b3a', fg: '#ffffff', label: 'Facility available' },
  declined:             { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Declined' },
  withdrawn:            { bg: '#cdd7e2', fg: '#33475e', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  small:    { bg: '#eef2f7', fg: '#33475e', label: 'Small (<R50m)' },
  medium:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Medium (<R250m)' },
  large:    { bg: '#fff4d6', fg: '#a06200', label: 'Large (<R1bn)' },
  major:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Major (<R5bn)' },
  systemic: { bg: '#fbb', fg: '#7a0e0e', label: 'Systemic (R5bn+)' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'In pipeline' },
  { key: 'all',                 label: 'All' },
  { key: 'reportable',          label: 'SARB reportable' },
  { key: 'large_exposure',      label: 'Large exposure' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'screening',           label: 'Screening' },
  { key: 'credit_assessment',   label: 'Assessment' },
  { key: 'committee_review',    label: 'Committee' },
  { key: 'referred_back',       label: 'Referred back' },
  { key: 'conditions_pending',  label: 'Conditions' },
  { key: 'approved',            label: 'Approved' },
  { key: 'agreement_issued',    label: 'Agreement' },
  { key: 'cp_satisfied',        label: 'CPs satisfied' },
  { key: 'facility_available',  label: 'Available' },
  { key: 'declined',            label: 'Declined' },
  { key: 'withdrawn',           label: 'Withdrawn' },
];

type ActionKind =
  | 'screen' | 'assess' | 'refer-committee' | 'refer-back' | 'approve'
  | 'approve-with-conditions' | 'satisfy-conditions' | 'issue-agreement'
  | 'satisfy-cp' | 'activate' | 'decline' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  application_received: 'screen',
  screening:            'assess',
  credit_assessment:    'refer-committee',
  committee_review:     'approve',
  referred_back:        'assess',
  conditions_pending:   'satisfy-conditions',
  approved:             'issue-agreement',
  agreement_issued:     'satisfy-cp',
  cp_satisfied:         'activate',
  facility_available:   null,
  declined:             null,
  withdrawn:            null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'screen':                  'Screen — eligibility / KYC / NCA (Lender)',
  'assess':                  'Run credit assessment (Lender)',
  'refer-committee':         'Refer to credit committee (Lender)',
  'refer-back':              'Refer back for re-analysis (Committee)',
  'approve':                 'Approve (Committee)',
  'approve-with-conditions': 'Approve with conditions (Committee)',
  'satisfy-conditions':      'Satisfy conditions (Applicant)',
  'issue-agreement':         'Issue facility agreement (Lender)',
  'satisfy-cp':              'Satisfy conditions precedent (Applicant)',
  'activate':                'Activate — make facility available (Lender)',
  'decline':                 'Decline (Lender)',
  'withdraw':                'Withdraw application (Applicant)',
};

// Branch availability per state (in addition to the primary forward action).
const CAN_APPROVE_WITH_CONDITIONS: ChainStatus[] = ['committee_review'];
const CAN_REFER_BACK: ChainStatus[]              = ['committee_review'];
const CAN_DECLINE: ChainStatus[]                 = ['screening', 'credit_assessment', 'committee_review', 'referred_back', 'conditions_pending'];
const CAN_WITHDRAW: ChainStatus[]                = ['application_received', 'screening', 'credit_assessment', 'committee_review', 'referred_back', 'conditions_pending', 'approved', 'agreement_issued', 'cp_satisfied'];

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

// Facility limit is stored in millions of ZAR.
function fmtZarM(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1000) return `R${(m / 1000).toFixed(2)}bn`;
  return `R${m.toLocaleString('en-ZA')}m`;
}

interface KpiSummary {
  total: number;
  open_count: number;
  available_count: number;
  declined_count: number;
  withdrawn_count: number;
  in_committee_count: number;
  conditions_pending_count: number;
  breached: number;
  reportable_total: number;
  large_exposure_open: number;
  total_limit_zar_m: number;
  total_approved_zar_m: number;
  available_limit_zar_m: number;
}

export function CreditOriginationChainTab() {
  const [rows, setRows] = useState<CreditFacilityRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<CreditFacilityRow | null>(null);
  const [events, setEvents] = useState<CreditFacilityEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CreditFacilityRow[] } & KpiSummary }>('/credit-origination/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          available_count: data.available_count || 0,
          declined_count: data.declined_count || 0,
          withdrawn_count: data.withdrawn_count || 0,
          in_committee_count: data.in_committee_count || 0,
          conditions_pending_count: data.conditions_pending_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          large_exposure_open: data.large_exposure_open || 0,
          total_limit_zar_m: data.total_limit_zar_m || 0,
          total_approved_zar_m: data.total_approved_zar_m || 0,
          available_limit_zar_m: data.available_limit_zar_m || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load credit origination chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: CreditFacilityRow; events: CreditFacilityEvent[] } }>(`/credit-origination/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load application history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')            return true;
      if (filter === 'active')         return !r.is_terminal;
      if (filter === 'reportable')     return r.is_reportable;
      if (filter === 'large_exposure') return r.is_large_exposure;
      if (filter === 'breached')       return r.sla_breached;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, available_count: 0, declined_count: 0,
    withdrawn_count: 0, in_committee_count: 0, conditions_pending_count: 0,
    breached: 0, reportable_total: 0, large_exposure_open: 0,
    total_limit_zar_m: 0, total_approved_zar_m: 0, available_limit_zar_m: 0,
  };

  const act = useCallback(async (action: ActionKind, row: CreditFacilityRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'screen') {
        const ref = window.prompt('Screening reference (eg "SCR-2026-0007"):', '');
        if (ref) body.screening_ref = ref;
        const basis = window.prompt('Screening basis (eligibility / KYC / NCA affordability — required):');
        if (!basis) return;
        body.screening_basis = basis;
        const rating = window.prompt('Indicative internal credit grade (eg "BB+"):', row.credit_rating ?? '');
        if (rating) body.credit_rating = rating;
      } else if (action === 'assess') {
        const ref = window.prompt('Assessment reference (eg "ASMT-2026-0007"):', '');
        if (ref) body.assessment_ref = ref;
        const basis = window.prompt('Assessment basis (financial model / DD / security — required):');
        if (!basis) return;
        body.assessment_basis = basis;
        const dscr = window.prompt('Base-case DSCR (eg 1.35):', row.dscr_base != null ? String(row.dscr_base) : '');
        if (dscr) body.dscr_base = Number(dscr);
        const ltv = window.prompt('LTV % (eg 70):', row.ltv_pct != null ? String(row.ltv_pct) : '');
        if (ltv) body.ltv_pct = Number(ltv);
        const gearing = window.prompt('Gearing % (eg 75):', row.gearing_pct != null ? String(row.gearing_pct) : '');
        if (gearing) body.gearing_pct = Number(gearing);
        const rating = window.prompt('Internal credit grade (eg "BBB-"):', row.credit_rating ?? '');
        if (rating) body.credit_rating = rating;
      } else if (action === 'refer-committee') {
        const ref = window.prompt('Committee paper reference (eg "CC-2026-0007"):', '');
        if (ref) body.committee_ref = ref;
        const basis = window.prompt('Committee submission basis (credit recommendation — required):');
        if (!basis) return;
        body.committee_basis = basis;
      } else if (action === 'refer-back') {
        const basis = window.prompt('Referral basis (what further analysis the committee requires — required):');
        if (!basis) return;
        body.committee_basis = basis;
        const reason = window.prompt('Reason code (eg "MODEL_REVISION", "SECURITY_GAP"):', '');
        if (reason) body.reason_code = reason;
        const notes = window.prompt('Decision notes (optional):', '');
        if (notes) body.decision_notes = notes;
      } else if (action === 'approve') {
        const ref = window.prompt('Approval reference (eg "APPROVAL-2026-0007"):');
        if (!ref) return;
        body.approval_ref = ref;
        const basis = window.prompt('Approval basis (committee resolution rationale — required):');
        if (!basis) return;
        body.approval_basis = basis;
        const amt = window.prompt('Approved amount (ZAR millions, eg 450):', row.facility_limit_zar_m != null ? String(row.facility_limit_zar_m) : '');
        if (amt) body.approved_amount_zar_m = Number(amt);
        const reason = window.prompt('Reason code (eg "WITHIN_APPETITE"):', '');
        if (reason) body.reason_code = reason;
      } else if (action === 'approve-with-conditions') {
        const ref = window.prompt('Approval reference (eg "APPROVAL-2026-0008"):');
        if (!ref) return;
        body.approval_ref = ref;
        const basis = window.prompt('Approval basis (committee resolution rationale — required):');
        if (!basis) return;
        body.approval_basis = basis;
        const cond = window.prompt('Conditions of approval (narrative — required):');
        if (!cond) return;
        body.conditions_basis = cond;
        const count = window.prompt('Number of conditions (eg 4):', '');
        if (count) body.conditions_count = Number(count);
        const amt = window.prompt('Approved amount (ZAR millions, eg 180):', row.facility_limit_zar_m != null ? String(row.facility_limit_zar_m) : '');
        if (amt) body.approved_amount_zar_m = Number(amt);
      } else if (action === 'satisfy-conditions') {
        const basis = window.prompt('Evidence the conditions of approval are met (required):');
        if (!basis) return;
        body.conditions_basis = basis;
      } else if (action === 'issue-agreement') {
        const ref = window.prompt('Facility agreement reference (eg "FA-2026-0007"):');
        if (!ref) return;
        body.agreement_ref = ref;
        const count = window.prompt('Number of conditions precedent (eg 8):', row.cp_count != null ? String(row.cp_count) : '');
        if (count) body.cp_count = Number(count);
      } else if (action === 'satisfy-cp') {
        const ref = window.prompt('CP satisfaction reference (eg "CP-SAT-2026-0007"):', '');
        if (ref) body.cp_ref = ref;
        const basis = window.prompt('CP satisfaction basis (CP checklist / legal opinion — required):');
        if (!basis) return;
        body.cp_basis = basis;
      } else if (action === 'activate') {
        const ref = window.prompt('Activation reference (eg "ACTIVATE-2026-0007"):');
        if (!ref) return;
        body.activation_ref = ref;
        const basis = window.prompt('Activation basis (facility made available to draw — required):');
        if (!basis) return;
        body.activation_basis = basis;
        if (row.facility_tier === 'major' || row.facility_tier === 'systemic') {
          const reg = window.prompt('SARB large-exposure reference (large-exposure tier — required):');
          if (!reg) return;
          body.regulator_ref = reg;
        }
      } else if (action === 'decline') {
        const ref = window.prompt('Decline reference (eg "DECLINE-2026-0009"):', '');
        if (ref) body.decline_ref = ref;
        const basis = window.prompt('Decline basis (credit rationale — required):');
        if (!basis) return;
        body.decline_basis = basis;
        const reason = window.prompt('Reason code (eg "DSCR_BELOW_FLOOR", "OUTSIDE_APPETITE"):', '');
        if (reason) body.reason_code = reason;
        if (row.facility_tier === 'systemic') {
          const reg = window.prompt('SARB reference (systemic decline is reportable — required):');
          if (!reg) return;
          body.regulator_ref = reg;
        }
      } else if (action === 'withdraw') {
        const reason = window.prompt('Reason code (eg "APPLICANT_WITHDREW", "ALT_FUNDING"):', '');
        if (reason) body.reason_code = reason;
        const notes = window.prompt('Withdrawal notes (optional):', '');
        if (notes) body.decision_notes = notes;
      }
      await api.post(`/credit-origination/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Credit Facility Origination & Credit Approval — NCA + Banks Act + Basel III + SARB</h2>
          <p className="text-xs text-[#4a5568]">
            The front-end of project finance — the credit-approval gate a borrower
            passes before any money is committed. Application → screening
            (eligibility / KYC / NCA affordability) → credit assessment (financial
            model / DD / security) → credit committee (approve / approve with
            conditions / refer back / decline) → agreement issued → conditions
            precedent satisfied → facility available to draw. Sits upstream of every
            other lender chain. INVERTED tier SLA — the bigger the facility, the more
            time every window allows. Activating a large-exposure facility (major +
            systemic) crosses the SARB large-exposure inbox; declining a systemic
            facility crosses too.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"           value={kpis.total} />
        <Kpi label="In pipeline"     value={kpis.open_count}            tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="At committee"    value={kpis.in_committee_count} />
        <Kpi label="Conditions"      value={kpis.conditions_pending_count} />
        <Kpi label="Available"       value={kpis.available_count}       tone="ok" />
        <Kpi label="Declined"        value={kpis.declined_count}        tone={kpis.declined_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"    value={kpis.breached}              tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Available limit" value={fmtZarM(kpis.available_limit_zar_m)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Withdrawn: <span className="font-semibold text-[#33475e]">{kpis.withdrawn_count}</span></span>
        <span>SARB reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Large exposure open: <span className="font-semibold text-[#9b1f1f]">{kpis.large_exposure_open}</span></span>
        <span>Pipeline limit: <span className="font-semibold text-[#1a3a5c]">{fmtZarM(kpis.total_limit_zar_m)}</span></span>
        <span>Approved: <span className="font-semibold text-[#1f6b3a]">{fmtZarM(kpis.total_approved_zar_m)}</span></span>
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Application #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Applicant / facility</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Sector</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Facility limit</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
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
                      {r.application_number}
                      {r.is_reportable && <span className="ml-1 rounded bg-[#fde0e0] px-1 text-[9px] font-semibold text-[#9b1f1f]">SARB</span>}
                    </td>
                    <td className="px-3 py-2 text-[#1a3a5c]">
                      <div className="font-medium">{r.applicant_party_name}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.facility_name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#4a5568]">{r.sector ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZarM(r.facility_limit_zar_m)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No applications match.</td></tr>
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
  row: CreditFacilityRow;
  events: CreditFacilityEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: CreditFacilityRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canApproveCond = CAN_APPROVE_WITH_CONDITIONS.includes(row.chain_status);
  const canReferBack = CAN_REFER_BACK.includes(row.chain_status);
  const canDecline = CAN_DECLINE.includes(row.chain_status);
  const canWithdraw = CAN_WITHDRAW.includes(row.chain_status);
  const anyAction = nextAction || canApproveCond || canReferBack || canDecline || canWithdraw;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.application_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.applicant_party_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.facility_tier].label} · {row.facility_name} · {row.facility_type ?? '—'}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Applicant"            value={row.applicant_party_name} />
            <Pair label="Lender of record"     value={row.lender_name ?? '—'} />
            <Pair label="Sponsor"              value={row.sponsor_name ?? '—'} />
            <Pair label="Tier"                 value={TIER_TONE[row.facility_tier].label} />
            <Pair label="Facility"             value={row.facility_name} />
            <Pair label="Facility type"        value={row.facility_type ?? '—'} />
            <Pair label="Facility limit"       value={fmtZarM(row.facility_limit_zar_m)} />
            <Pair label="Approved amount"      value={fmtZarM(row.approved_amount_zar_m)} />
            <Pair label="Tenor (months)"       value={row.tenor_months != null ? String(row.tenor_months) : '—'} />
            <Pair label="Margin (bps)"         value={row.margin_bps != null ? String(row.margin_bps) : '—'} />
            <Pair label="Pricing basis"        value={row.pricing_basis ?? '—'} />
            <Pair label="Sector"               value={row.sector ?? '—'} />
            <Pair label="Project"              value={row.project_name ?? '—'} />
            <Pair label="Credit grade"         value={row.credit_rating ?? '—'} />
            <Pair label="Base-case DSCR"       value={row.dscr_base != null ? row.dscr_base.toFixed(2) : '—'} />
            <Pair label="LTV %"                value={row.ltv_pct != null ? `${row.ltv_pct}%` : '—'} />
            <Pair label="Gearing %"            value={row.gearing_pct != null ? `${row.gearing_pct}%` : '—'} />
            <Pair label="PD %"                 value={row.pd_pct != null ? `${row.pd_pct}%` : '—'} />
            <Pair label="LGD %"                value={row.lgd_pct != null ? `${row.lgd_pct}%` : '—'} />
            <Pair label="EAD"                  value={fmtZarM(row.ead_zar_m)} />
            <Pair label="Conditions"           value={row.conditions_count != null ? String(row.conditions_count) : '—'} />
            <Pair label="CPs"                  value={row.cp_count != null ? String(row.cp_count) : '—'} />
            <Pair label="Referral round"       value={String(row.referral_round)} />
            <Pair label="Approval ref"         value={row.approval_ref ?? '—'} />
            <Pair label="Agreement ref"        value={row.agreement_ref ?? '—'} />
            <Pair label="Activation ref"       value={row.activation_ref ?? '—'} />
            <Pair label="State"                value={STATE_TONE[row.chain_status].label} />
            <Pair label="Reportable"           value={row.is_reportable ? 'Yes — SARB' : 'No'} />
            <Pair label="Escalation level"     value={String(row.escalation_level)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Regulator ref"        value={row.regulator_ref ?? '—'} />
            {row.source_wave && <Pair label="Source" value={`${row.source_wave} · ${row.source_entity_id ?? ''}`} />}
          </div>
          {row.decision_notes && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Decision notes</div>
              {row.decision_notes}
            </div>
          )}
        </section>

        {anyAction && (
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
              {canApproveCond && (
                <button type="button"
                  onClick={() => onAct('approve-with-conditions', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a2a7a] hover:bg-[#f4f0fb]"
                >
                  {ACTION_LABEL['approve-with-conditions']}
                </button>
              )}
              {canReferBack && (
                <button type="button"
                  onClick={() => onAct('refer-back', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4b00] hover:bg-[#fff8e8]"
                >
                  {ACTION_LABEL['refer-back']}
                </button>
              )}
              {canDecline && (
                <button type="button"
                  onClick={() => onAct('decline', row)}
                  className="rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 hover:bg-red-50"
                >
                  {ACTION_LABEL['decline']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#33475e] hover:bg-[#f3f5f9]"
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

export default CreditOriginationChainTab;
