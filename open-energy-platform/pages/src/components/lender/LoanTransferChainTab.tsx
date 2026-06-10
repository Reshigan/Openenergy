// Wave 61 — Lender Loan Transfer / Secondary Participation chain —
// LMA secondary-trading documentation + Banks Act 94/1990 large-exposure +
// SARB Exchange Control (non-resident transferees) + FIC Act 38/2001 KYC/AML.
//
// A lender of record (transferor) sells down / participates out part of a
// committed facility to another financier (transferee). Before the lender of
// record can be changed, the transfer must clear KYC / sanctions screening on
// the incoming lender (FIC), obtain the obligor's (borrower's) consent where the
// facility agreement requires it, pass SARB exchange-control review when the
// transferee is non-resident, be approved, have the transfer certificate
// executed, settle the purchase price, and complete with the facility register
// updated.
//
//   transfer_requested → kyc_screening → consent_solicitation → regulatory_review
//     → transfer_approved → certificate_executed → settled → completed
//   remediation loop:  kyc_screening → screening_remediation → kyc_screening
//   refusal / failure: kyc_screening → rejected (FIC) ; consent → declined
//
// INVERTED tier SLA — the bigger the transfer, the more diligence time every
// window allows; regulatory review is deepest at systemic. The SIGNATURE
// crossing is RESIDENCY-driven: approving a NON-RESIDENT transfer crosses the
// SARB exchange-control inbox at EVERY tier; a screening failure always crosses
// (FIC); completing a large/systemic transfer crosses (Banks Act large-exposure).
// Two-party write — the OBLIGOR grants/refuses consent; the LENDER side drives
// every other step.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'transfer_requested' | 'kyc_screening' | 'screening_remediation'
  | 'consent_solicitation' | 'regulatory_review' | 'transfer_approved'
  | 'certificate_executed' | 'settled' | 'completed'
  | 'declined' | 'rejected' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'systemic';
type Residency = 'resident' | 'non_resident';

interface LoanTransferRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  transferor_party_id: string;
  transferor_party_name: string;
  transferee_party_id: string;
  transferee_party_name: string;
  agent_party_id: string;
  agent_party_name: string;
  obligor_party_id: string;
  obligor_party_name: string;
  facility_code: string | null;
  facility_name: string;
  transfer_type: string;
  tranche: string | null;
  borrower_project: string | null;
  facility_currency: string | null;
  facility_total_zar_m: number | null;
  transfer_zar_m: number;
  transfer_price_pct: number | null;
  settlement_zar_m: number | null;
  transfer_tier: Tier;
  transferee_residency: Residency;
  transferee_epfi: number;
  kyc_cleared: number;
  sanctions_cleared: number;
  obligor_consent_granted: number;
  sarb_approval_required: number;
  sarb_approval_obtained: number;
  certificate_signed: number;
  register_updated: number;
  request_ref: string | null;
  screening_ref: string | null;
  remediation_ref: string | null;
  consent_ref: string | null;
  regulatory_ref: string | null;
  approval_ref: string | null;
  certificate_ref: string | null;
  settlement_ref: string | null;
  completion_ref: string | null;
  rejection_ref: string | null;
  decline_ref: string | null;
  withdrawal_ref: string | null;
  regulator_ref: string | null;
  request_basis: string | null;
  screening_basis: string | null;
  remediation_basis: string | null;
  consent_basis: string | null;
  regulatory_basis: string | null;
  approval_basis: string | null;
  certificate_basis: string | null;
  settlement_basis: string | null;
  rejection_basis: string | null;
  decline_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  remediation_round: number;
  chain_status: ChainStatus;
  transfer_requested_at: string;
  kyc_screening_at: string | null;
  screening_remediation_at: string | null;
  consent_solicitation_at: string | null;
  regulatory_review_at: string | null;
  transfer_approved_at: string | null;
  certificate_executed_at: string | null;
  settled_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface LoanTransferEvent {
  id: string;
  transfer_id: string;
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
  transfer_requested:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Transfer requested' },
  kyc_screening:         { bg: '#e0eefb', fg: '#1a4a7a', label: 'KYC / sanctions screening' },
  screening_remediation: { bg: '#fde9c8', fg: '#8a4b00', label: 'Screening remediation' },
  consent_solicitation:  { bg: '#fff4d6', fg: '#a06200', label: 'Obligor consent' },
  regulatory_review:     { bg: '#fbe7d0', fg: '#7a4500', label: 'SARB / regulatory review' },
  transfer_approved:     { bg: '#e6dcf5', fg: '#4a2a7a', label: 'Transfer approved' },
  certificate_executed:  { bg: '#daf5e2', fg: '#1f6b3a', label: 'Certificate executed' },
  settled:               { bg: '#cfeede', fg: '#0e6b4a', label: 'Settled' },
  completed:             { bg: '#1f6b3a', fg: '#ffffff', label: 'Completed' },
  declined:              { bg: '#fde0e0', fg: '#9b1f1f', label: 'Consent declined' },
  rejected:              { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Rejected (FIC)' },
  withdrawn:             { bg: '#cdd7e2', fg: '#33475e', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#eef2f7', fg: '#33475e', label: 'Minor (<R100m)' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate (<R500m)' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material (<R2bn)' },
  major:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Major (<R10bn)' },
  systemic: { bg: '#fbb', fg: '#7a0e0e', label: 'Systemic (R10bn+)' },
};

const RESIDENCY_TONE: Record<Residency, { bg: string; fg: string; label: string }> = {
  resident:     { bg: '#eef2f7', fg: '#33475e', label: 'Resident' },
  non_resident: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Non-resident' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'In pipeline' },
  { key: 'all',                   label: 'All' },
  { key: 'reportable',            label: 'Regulator reportable' },
  { key: 'non_resident',          label: 'Non-resident' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'kyc_screening',         label: 'Screening' },
  { key: 'screening_remediation', label: 'Remediation' },
  { key: 'consent_solicitation',  label: 'Consent' },
  { key: 'regulatory_review',     label: 'Regulatory' },
  { key: 'transfer_approved',     label: 'Approved' },
  { key: 'certificate_executed',  label: 'Certificate' },
  { key: 'settled',               label: 'Settled' },
  { key: 'completed',             label: 'Completed' },
  { key: 'declined',              label: 'Declined' },
  { key: 'rejected',              label: 'Rejected' },
  { key: 'withdrawn',             label: 'Withdrawn' },
];

type ActionKind =
  | 'begin-screening' | 'request-remediation' | 'resubmit-screening'
  | 'fail-screening' | 'clear-screening' | 'refuse-consent' | 'grant-consent'
  | 'approve-transfer' | 'execute-certificate' | 'settle' | 'complete' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  transfer_requested:    'begin-screening',
  kyc_screening:         'clear-screening',
  screening_remediation: 'resubmit-screening',
  consent_solicitation:  'grant-consent',
  regulatory_review:     'approve-transfer',
  transfer_approved:     'execute-certificate',
  certificate_executed:  'settle',
  settled:               'complete',
  completed:             null,
  declined:              null,
  rejected:              null,
  withdrawn:             null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-screening':     'Begin KYC / sanctions screening (Agent)',
  'request-remediation': 'Request screening remediation (Agent)',
  'resubmit-screening':  'Resubmit screening evidence (Transferor)',
  'fail-screening':      'Fail screening — reject (Agent · FIC)',
  'clear-screening':     'Clear screening (Agent)',
  'refuse-consent':      'Refuse consent (Obligor)',
  'grant-consent':       'Grant consent (Obligor)',
  'approve-transfer':    'Approve transfer (Agent)',
  'execute-certificate': 'Execute transfer certificate (Agent)',
  'settle':              'Settle purchase price (Transferor)',
  'complete':            'Complete — update register (Agent)',
  'withdraw':            'Withdraw transfer (Transferor)',
};

// Branch availability per state (in addition to the primary forward action).
const CAN_REQUEST_REMEDIATION: ChainStatus[] = ['kyc_screening'];
const CAN_FAIL_SCREENING: ChainStatus[]      = ['kyc_screening', 'screening_remediation'];
const CAN_REFUSE_CONSENT: ChainStatus[]      = ['consent_solicitation'];
const CAN_WITHDRAW: ChainStatus[]            = [
  'transfer_requested', 'kyc_screening', 'screening_remediation',
  'consent_solicitation', 'regulatory_review', 'transfer_approved',
  'certificate_executed',
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

// Amounts are stored in millions of ZAR.
function fmtZarM(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1000) return `R${(m / 1000).toFixed(2)}bn`;
  return `R${m.toLocaleString('en-ZA')}m`;
}

function fmtPct(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—';
  return `${p}%`;
}

interface KpiSummary {
  total: number;
  open_count: number;
  completed_count: number;
  in_screening: number;
  in_regulatory: number;
  breached: number;
  reportable_total: number;
  non_resident_total: number;
  large_tier_open: number;
  total_transfer_zar_m: number;
  completed_transfer_zar_m: number;
}

export function LoanTransferChainTab() {
  const [rows, setRows] = useState<LoanTransferRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<LoanTransferRow | null>(null);
  const [events, setEvents] = useState<LoanTransferEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: LoanTransferRow[] } & KpiSummary }>('/loan-transfer/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          completed_count: data.completed_count || 0,
          in_screening: data.in_screening || 0,
          in_regulatory: data.in_regulatory || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          non_resident_total: data.non_resident_total || 0,
          large_tier_open: data.large_tier_open || 0,
          total_transfer_zar_m: data.total_transfer_zar_m || 0,
          completed_transfer_zar_m: data.completed_transfer_zar_m || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load loan transfer chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: LoanTransferRow; events: LoanTransferEvent[] } }>(`/loan-transfer/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load transfer history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'active')       return !r.is_terminal;
      if (filter === 'reportable')   return r.is_reportable_flag;
      if (filter === 'non_resident') return r.transferee_residency === 'non_resident';
      if (filter === 'breached')     return r.sla_breached;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, completed_count: 0, in_screening: 0,
    in_regulatory: 0, breached: 0, reportable_total: 0, non_resident_total: 0,
    large_tier_open: 0, total_transfer_zar_m: 0, completed_transfer_zar_m: 0,
  };

  const act = useCallback(async (action: ActionKind, row: LoanTransferRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'begin-screening') {
        const ref = window.prompt('Screening reference (eg "SCR-2026-0007"):', '');
        if (ref) body.screening_ref = ref;
        const basis = window.prompt('Screening basis (KYC / sanctions / FIC scope on the incoming lender — required):');
        if (!basis) return;
        body.screening_basis = basis;
      } else if (action === 'request-remediation') {
        const ref = window.prompt('Remediation reference (eg "REM-2026-0007"):', '');
        if (ref) body.remediation_ref = ref;
        const basis = window.prompt('Remediation basis (what KYC / sanctions gap must be cured — required):');
        if (!basis) return;
        body.remediation_basis = basis;
        const reason = window.prompt('Reason code (eg "UBO_GAP", "SANCTIONS_HIT_REVIEW"):', '');
        if (reason) body.reason_code = reason;
      } else if (action === 'resubmit-screening') {
        const ref = window.prompt('Updated screening reference (eg "SCR-2026-0007-R2"):', '');
        if (ref) body.screening_ref = ref;
        const basis = window.prompt('Resubmission basis (cured evidence — required):');
        if (!basis) return;
        body.screening_basis = basis;
      } else if (action === 'fail-screening') {
        const ref = window.prompt('Rejection reference (eg "REJ-2026-0007"):', '');
        if (ref) body.rejection_ref = ref;
        const basis = window.prompt('Rejection basis (why the incoming lender fails KYC / sanctions — required):');
        if (!basis) return;
        body.rejection_basis = basis;
        const reason = window.prompt('Reason code (eg "SANCTIONS_MATCH", "KYC_UNRESOLVED"):', '');
        if (reason) body.reason_code = reason;
        const reg = window.prompt('FIC reference (a screening failure is always reportable — required):');
        if (!reg) return;
        body.regulator_ref = reg;
      } else if (action === 'clear-screening') {
        const basis = window.prompt('Clearance basis (KYC + sanctions cleared — required):');
        if (!basis) return;
        body.screening_basis = basis;
      } else if (action === 'refuse-consent') {
        const ref = window.prompt('Refusal reference (eg "DEC-2026-0007"):', '');
        if (ref) body.decline_ref = ref;
        const basis = window.prompt('Refusal basis (why the obligor withholds consent — required):');
        if (!basis) return;
        body.decline_basis = basis;
        const reason = window.prompt('Reason code (eg "DISQUALIFIED_LENDER", "MFN_BREACH"):', '');
        if (reason) body.reason_code = reason;
      } else if (action === 'grant-consent') {
        const ref = window.prompt('Consent reference (eg "CONSENT-2026-0007"):', '');
        if (ref) body.consent_ref = ref;
        const basis = window.prompt('Consent basis (obligor approval per facility agreement — required):');
        if (!basis) return;
        body.consent_basis = basis;
      } else if (action === 'approve-transfer') {
        const ref = window.prompt('Approval reference (eg "APPROVAL-2026-0007"):');
        if (!ref) return;
        body.approval_ref = ref;
        const basis = window.prompt('Approval basis (transfer cleared all gates — required):');
        if (!basis) return;
        body.approval_basis = basis;
        if (row.transferee_residency === 'non_resident') {
          const reg = window.prompt('SARB exchange-control reference (non-resident transferee — required):');
          if (!reg) return;
          body.regulator_ref = reg;
        }
      } else if (action === 'execute-certificate') {
        const ref = window.prompt('Transfer certificate reference (eg "TC-2026-0007"):');
        if (!ref) return;
        body.certificate_ref = ref;
        const basis = window.prompt('Certificate basis (LMA transfer certificate executed — required):');
        if (!basis) return;
        body.certificate_basis = basis;
      } else if (action === 'settle') {
        const ref = window.prompt('Settlement reference (eg "STL-2026-0007"):', '');
        if (ref) body.settlement_ref = ref;
        const basis = window.prompt('Settlement basis (purchase price + accrued interest — required):');
        if (!basis) return;
        body.settlement_basis = basis;
        const amt = window.prompt('Settlement amount (ZAR millions, eg 450):', row.transfer_zar_m != null ? String(row.transfer_zar_m) : '');
        if (amt) body.settlement_zar_m = Number(amt);
      } else if (action === 'complete') {
        const ref = window.prompt('Completion reference (eg "CMP-2026-0007"):', '');
        if (ref) body.completion_ref = ref;
        if (row.transfer_tier === 'major' || row.transfer_tier === 'systemic') {
          const reg = window.prompt('Banks Act large-exposure reference (large/systemic transfer — required):');
          if (!reg) return;
          body.regulator_ref = reg;
        }
      } else if (action === 'withdraw') {
        const ref = window.prompt('Withdrawal reference (eg "WD-2026-0007"):', '');
        if (ref) body.withdrawal_ref = ref;
        const basis = window.prompt('Withdrawal basis (why the transfer is being pulled — required):');
        if (!basis) return;
        body.withdrawal_basis = basis;
        const reason = window.prompt('Reason code (eg "PRICE_DISPUTE", "ALT_BUYER"):', '');
        if (reason) body.reason_code = reason;
      }
      await api.post(`/loan-transfer/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Loan Transfer & Secondary Participation — LMA + Banks Act + SARB ExCon + FIC</h2>
          <p className="text-xs text-[#4a5568]">
            A lender of record sells down / participates out part of a committed
            facility to another financier. Before the register can change: KYC /
            sanctions screening on the incoming lender (FIC) → obligor consent →
            SARB exchange-control review (non-resident transferees) → approval →
            transfer certificate executed → purchase-price settlement → completion
            with the facility register updated. INVERTED tier SLA — the bigger the
            transfer, the more diligence time every window allows. Approving a
            non-resident transfer crosses the SARB inbox at every tier; a screening
            failure always crosses (FIC); completing a large/systemic transfer
            crosses the Banks Act large-exposure inbox. Two-party write — the obligor
            grants/refuses consent; the lender side drives the rest.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"             value={kpis.total} />
        <Kpi label="In pipeline"       value={kpis.open_count}        tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="In screening"      value={kpis.in_screening} />
        <Kpi label="Regulatory"        value={kpis.in_regulatory} />
        <Kpi label="Completed"         value={kpis.completed_count}   tone="ok" />
        <Kpi label="Non-resident"      value={kpis.non_resident_total} tone={kpis.non_resident_total > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached"      value={kpis.breached}          tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Completed value"   value={fmtZarM(kpis.completed_transfer_zar_m)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Regulator reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Large tier open: <span className="font-semibold text-[#9b1f1f]">{kpis.large_tier_open}</span></span>
        <span>Pipeline value: <span className="font-semibold text-[#1a3a5c]">{fmtZarM(kpis.total_transfer_zar_m)}</span></span>
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Transfer #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Transferor → transferee</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Residency</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Transfer value</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.transfer_tier];
                const res = RESIDENCY_TONE[r.transferee_residency];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.case_number}
                      {r.is_reportable_flag && <span className="ml-1 rounded bg-[#fde0e0] px-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                    </td>
                    <td className="px-3 py-2 text-[#1a3a5c]">
                      <div className="font-medium">{r.transferor_party_name} → {r.transferee_party_name}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.facility_name}{r.transfer_type ? ` · ${r.transfer_type}` : ''}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: res.bg, color: res.fg }}>
                        {res.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZarM(r.transfer_zar_m)}</td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No transfers match.</td></tr>
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
  row: LoanTransferRow;
  events: LoanTransferEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: LoanTransferRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRequestRemediation = CAN_REQUEST_REMEDIATION.includes(row.chain_status);
  const canFailScreening = CAN_FAIL_SCREENING.includes(row.chain_status);
  const canRefuseConsent = CAN_REFUSE_CONSENT.includes(row.chain_status);
  const canWithdraw = CAN_WITHDRAW.includes(row.chain_status);
  const anyAction = nextAction || canRequestRemediation || canFailScreening || canRefuseConsent || canWithdraw;

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.case_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.transferor_party_name} → {row.transferee_party_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.transfer_tier].label} · {RESIDENCY_TONE[row.transferee_residency].label} · {row.facility_name}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Transferor"          value={row.transferor_party_name} />
            <Pair label="Transferee"          value={row.transferee_party_name} />
            <Pair label="Facility agent"      value={row.agent_party_name} />
            <Pair label="Obligor"             value={row.obligor_party_name} />
            <Pair label="Tier"                value={TIER_TONE[row.transfer_tier].label} />
            <Pair label="Residency"           value={RESIDENCY_TONE[row.transferee_residency].label} />
            <Pair label="Facility"            value={row.facility_name} />
            <Pair label="Transfer type"       value={row.transfer_type} />
            <Pair label="Tranche"             value={row.tranche ?? '—'} />
            <Pair label="Borrower / project"  value={row.borrower_project ?? '—'} />
            <Pair label="Facility total"      value={fmtZarM(row.facility_total_zar_m)} />
            <Pair label="Transfer value"      value={fmtZarM(row.transfer_zar_m)} />
            <Pair label="Transfer price"      value={fmtPct(row.transfer_price_pct)} />
            <Pair label="Settlement value"    value={fmtZarM(row.settlement_zar_m)} />
            <Pair label="Equator FI?"         value={row.transferee_epfi ? 'Yes' : 'No'} />
            <Pair label="KYC cleared"         value={row.kyc_cleared ? 'Yes' : 'No'} />
            <Pair label="Sanctions cleared"   value={row.sanctions_cleared ? 'Yes' : 'No'} />
            <Pair label="Obligor consent"     value={row.obligor_consent_granted ? 'Granted' : 'Pending'} />
            <Pair label="SARB approval req"   value={row.sarb_approval_required ? 'Yes' : 'No'} />
            <Pair label="SARB approval"       value={row.sarb_approval_obtained ? 'Obtained' : 'Pending'} />
            <Pair label="Certificate signed"  value={row.certificate_signed ? 'Yes' : 'No'} />
            <Pair label="Register updated"    value={row.register_updated ? 'Yes' : 'No'} />
            <Pair label="Remediation round"   value={String(row.remediation_round)} />
            <Pair label="Approval ref"        value={row.approval_ref ?? '—'} />
            <Pair label="Certificate ref"     value={row.certificate_ref ?? '—'} />
            <Pair label="Settlement ref"      value={row.settlement_ref ?? '—'} />
            <Pair label="State"               value={STATE_TONE[row.chain_status].label} />
            <Pair label="Reportable"          value={row.is_reportable_flag ? 'Yes — regulator' : 'No'} />
            <Pair label="Escalation level"    value={String(row.escalation_level)} />
            <Pair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"          value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Reason code"         value={row.reason_code ?? '—'} />
            <Pair label="Regulator ref"       value={row.regulator_ref ?? '—'} />
            {row.source_wave && <Pair label="Source" value={`${row.source_wave} · ${row.source_entity_id ?? ''}`} />}
          </div>

          {(row.screening_basis || row.consent_basis || row.regulatory_basis || row.approval_basis
            || row.certificate_basis || row.settlement_basis || row.rejection_basis
            || row.decline_basis || row.withdrawal_basis || row.remediation_basis) && (
            <div className="mt-3 space-y-2">
              <BasisCard label="Screening basis"    value={row.screening_basis} />
              <BasisCard label="Remediation basis"  value={row.remediation_basis} />
              <BasisCard label="Consent basis"      value={row.consent_basis} />
              <BasisCard label="Regulatory basis"   value={row.regulatory_basis} />
              <BasisCard label="Approval basis"     value={row.approval_basis} />
              <BasisCard label="Certificate basis"  value={row.certificate_basis} />
              <BasisCard label="Settlement basis"   value={row.settlement_basis} />
              <BasisCard label="Rejection basis"    value={row.rejection_basis} />
              <BasisCard label="Refusal basis"      value={row.decline_basis} />
              <BasisCard label="Withdrawal basis"   value={row.withdrawal_basis} />
            </div>
          )}

          {row.notes && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Notes</div>
              {row.notes}
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
              {canRequestRemediation && (
                <button type="button"
                  onClick={() => onAct('request-remediation', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4b00] hover:bg-[#fff8e8]"
                >
                  {ACTION_LABEL['request-remediation']}
                </button>
              )}
              {canFailScreening && (
                <button type="button"
                  onClick={() => onAct('fail-screening', row)}
                  className="rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 hover:bg-red-50"
                >
                  {ACTION_LABEL['fail-screening']}
                </button>
              )}
              {canRefuseConsent && (
                <button type="button"
                  onClick={() => onAct('refuse-consent', row)}
                  className="rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 hover:bg-red-50"
                >
                  {ACTION_LABEL['refuse-consent']}
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

function BasisCard({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">{label}</div>
      {value}
    </div>
  );
}

export default LoanTransferChainTab;
