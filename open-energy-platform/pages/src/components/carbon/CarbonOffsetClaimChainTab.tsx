// Wave 48 — Carbon Tax Offset Claim & Allowance lifecycle tab.
//
// The monetisation / utilisation end of the carbon-credit lifecycle. Where W37
// registers a project, W11 verifies its reductions (MRV), W17 retires the
// resulting credits and W42 protects their permanence, THIS chain governs the
// taxpayer claiming RETIRED, ELIGIBLE credits against their SA carbon-tax
// liability — up to 5% (general) or 10% (Annex-2 mining/petroleum) of gross
// liability per Carbon Tax Act 15 of 2019 §13.
//
//   claim_drafted → eligibility_screening → credits_earmarked → claim_submitted →
//     sars_review → allowance_granted → applied_to_return → reconciled.
//   SARS query loop: sars_review → sars_query → (respond) → sars_review.
//   rejected from sars_review; clawed_back from allowance_granted|applied_to_return;
//   withdrawn from any pre-submission state.
//
// INVERTED SLA — the larger the claim, the longer every window (a material offset
// claim warrants deeper SARS scrutiny). Single carbon-fund desk write; actor_party
// records the functional party (taxpayer / registry-COAS / sars) for audit.
// Reportability: claw_back crosses for EVERY tier; reject_claim for material tiers
// (major + standard); grant_allowance for major_claim; sla_breach for material tiers.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'claim_drafted' | 'eligibility_screening' | 'credits_earmarked' | 'claim_submitted'
  | 'sars_review' | 'sars_query' | 'allowance_granted' | 'applied_to_return'
  | 'reconciled' | 'rejected' | 'clawed_back' | 'withdrawn';

type Tier = 'major_claim' | 'standard_claim' | 'minor_claim';

interface ClaimRow {
  id: string;
  claim_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  taxpayer_party_id: string;
  taxpayer_party_name: string;
  registry_name: string | null;
  sars_office_name: string | null;
  tax_year: number;
  industry_group: 'general' | 'annex_2';
  offset_tier: Tier;
  gross_tax_liability_zar: number | null;
  offset_limit_pct: number | null;
  offset_limit_zar: number | null;
  ct_rate_zar_per_tco2e: number | null;
  credits_claimed_tco2e: number | null;
  offset_value_zar: number | null;
  net_tax_liability_zar: number | null;
  credits_unused_tco2e: number | null;
  coas_reference: string | null;
  retirement_ref: string | null;
  sars_reference: string | null;
  query_ref: string | null;
  allowance_ref: string | null;
  return_ref: string | null;
  assessment_ref: string | null;
  clawback_ref: string | null;
  reversal_ref: string | null;
  eligibility_basis: string | null;
  earmark_basis: string | null;
  submission_basis: string | null;
  review_basis: string | null;
  query_basis: string | null;
  allowance_basis: string | null;
  reconciliation_basis: string | null;
  rejection_basis: string | null;
  clawback_basis: string | null;
  reason_code: string | null;
  claim_summary: string | null;
  chain_status: ChainStatus;
  claim_drafted_at: string;
  eligibility_screening_at: string | null;
  credits_earmarked_at: string | null;
  claim_submitted_at: string | null;
  sars_review_at: string | null;
  sars_query_at: string | null;
  allowance_granted_at: string | null;
  applied_to_return_at: string | null;
  reconciled_at: string | null;
  rejected_at: string | null;
  clawed_back_at: string | null;
  withdrawn_at: string | null;
  query_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: boolean;
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

interface ClaimEvent {
  id: string;
  claim_id: string;
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
  reconciled_count: number;
  rejected_count: number;
  clawed_back_count: number;
  withdrawn_count: number;
  in_review_count: number;
  granted_count: number;
  breached: number;
  reportable_total: number;
  major_open: number;
  total_credits_claimed: number;
  total_offset_value: number;
  total_credits_unused: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  claim_drafted:         { bg: '#e3e7ec', fg: '#557',    label: 'Drafted' },
  eligibility_screening: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Eligibility screening' },
  credits_earmarked:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Credits earmarked' },
  claim_submitted:       { bg: '#fff4d6', fg: '#a06200', label: 'Submitted' },
  sars_review:           { bg: '#fff4d6', fg: '#a06200', label: 'SARS review' },
  sars_query:            { bg: '#ffe9d6', fg: '#8a4a00', label: 'SARS query' },
  allowance_granted:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Allowance granted' },
  applied_to_return:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Applied to return' },
  reconciled:            { bg: '#d4edda', fg: '#155724', label: 'Reconciled' },
  rejected:              { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  clawed_back:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'Clawed back' },
  withdrawn:             { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  major_claim:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Major (≥R10m)' },
  standard_claim: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Standard (R1m–R10m)' },
  minor_claim:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<R1m)' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'major_claim',           label: 'Major' },
  { key: 'standard_claim',        label: 'Standard' },
  { key: 'minor_claim',           label: 'Minor' },
  { key: 'in_review',             label: 'In review' },
  { key: 'granted',               label: 'Granted / applied' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'claim_drafted',         label: 'Drafted' },
  { key: 'eligibility_screening', label: 'Screening' },
  { key: 'credits_earmarked',     label: 'Earmarked' },
  { key: 'claim_submitted',       label: 'Submitted' },
  { key: 'sars_review',           label: 'SARS review' },
  { key: 'sars_query',            label: 'SARS query' },
  { key: 'allowance_granted',     label: 'Granted' },
  { key: 'applied_to_return',     label: 'Applied' },
  { key: 'reconciled',            label: 'Reconciled' },
  { key: 'rejected',              label: 'Rejected' },
  { key: 'clawed_back',           label: 'Clawed back' },
  { key: 'withdrawn',             label: 'Withdrawn' },
];

type ActionKind =
  | 'screen-eligibility' | 'earmark-credits' | 'submit-claim' | 'begin-review'
  | 'raise-query' | 'respond-query' | 'grant-allowance' | 'reject-claim'
  | 'apply-to-return' | 'reconcile' | 'claw-back' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  claim_drafted:         'screen-eligibility',
  eligibility_screening: 'earmark-credits',
  credits_earmarked:     'submit-claim',
  claim_submitted:       'begin-review',
  sars_review:           'grant-allowance',
  sars_query:            'respond-query',
  allowance_granted:     'apply-to-return',
  applied_to_return:     'reconcile',
  reconciled:            null,
  rejected:              null,
  clawed_back:           null,
  withdrawn:             null,
};

// Party annotation per action — the functional party. Registry (DFFE COAS) owns
// eligibility screening + credit earmark; the taxpayer submits / responds /
// applies-to-return / withdraws; SARS owns review / query / grant / reject /
// reconcile / claw-back.
const ACTION_LABEL: Record<ActionKind, string> = {
  'screen-eligibility': 'Screen eligibility (registry)',
  'earmark-credits':    'Earmark credits (registry)',
  'submit-claim':       'Submit claim (taxpayer)',
  'begin-review':       'Begin review (SARS)',
  'raise-query':        'Raise query (SARS)',
  'respond-query':      'Respond to query (taxpayer)',
  'grant-allowance':    'Grant allowance (SARS)',
  'reject-claim':       'Reject claim (SARS)',
  'apply-to-return':    'Apply to return (taxpayer)',
  'reconcile':          'Reconcile (SARS)',
  'claw-back':          'Claw back allowance (SARS)',
  'withdraw':           'Withdraw claim (taxpayer)',
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

function fmtZar(n: number | null | undefined): string {
  if (!n) return '—';
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtTco2e(n: number | null | undefined): string {
  if (!n) return '—';
  return `${n.toLocaleString('en-ZA')} tCO₂e`;
}

const TERMINAL_STATES: ChainStatus[] = ['reconciled', 'rejected', 'clawed_back', 'withdrawn'];
const IN_REVIEW_STATES: ChainStatus[] = ['sars_review', 'sars_query'];
const GRANTED_STATES: ChainStatus[] = ['allowance_granted', 'applied_to_return'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['claim_drafted', 'eligibility_screening', 'credits_earmarked', 'claim_submitted'];

export function CarbonOffsetClaimChainTab() {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ClaimRow | null>(null);
  const [events, setEvents] = useState<ClaimEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ClaimRow[] } & KpiSummary }>('/carbon-offset-claim/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, reconciled_count: d.reconciled_count,
          rejected_count: d.rejected_count, clawed_back_count: d.clawed_back_count,
          withdrawn_count: d.withdrawn_count, in_review_count: d.in_review_count,
          granted_count: d.granted_count, breached: d.breached, reportable_total: d.reportable_total,
          major_open: d.major_open, total_credits_claimed: d.total_credits_claimed,
          total_offset_value: d.total_offset_value, total_credits_unused: d.total_credits_unused,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load offset claim records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ClaimRow; events: ClaimEvent[] } }>(
        `/carbon-offset-claim/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load claim history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'in_review')  return IN_REVIEW_STATES.includes(r.chain_status);
      if (filter === 'granted')    return GRANTED_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'major_claim' || filter === 'standard_claim' || filter === 'minor_claim') {
        return r.offset_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ClaimRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'screen-eligibility') {
        const basis = window.prompt('Eligibility basis — COAS confirmation the retired credits are SA-domestic, in-vintage and locked to this taxpayer:') || '';
        const ref = window.prompt('COAS reference (e.g. COAS-LOCK-2026-0007):') || '';
        body = { eligibility_basis: basis };
        if (ref) body.coas_reference = ref;
      } else if (action === 'earmark-credits') {
        const basis = window.prompt('Earmark basis — which retired credit block is reserved against this tax period:');
        if (!basis) return;
        const tco2e = window.prompt('Credits claimed (tCO₂e):', String(row.credits_claimed_tco2e || ''));
        const ret = window.prompt('Retirement reference (W17 retirement that yielded the credits):', row.retirement_ref || '') || '';
        body = { earmark_basis: basis };
        if (tco2e && !Number.isNaN(Number(tco2e))) body.credits_claimed_tco2e = Number(tco2e);
        if (ret) body.retirement_ref = ret;
      } else if (action === 'submit-claim') {
        const basis = window.prompt('Submission basis — confirm the s.13 offset claim lodged via SARS eFiling:');
        if (!basis) return;
        const sars = window.prompt('SARS reference (e.g. SARS-CTR-2026-0007):') || '';
        const gross = window.prompt('Gross carbon-tax liability (ZAR):', String(row.gross_tax_liability_zar || ''));
        const value = window.prompt('Offset value claimed (ZAR, capped at the s.13 limit):', String(row.offset_value_zar || ''));
        body = { submission_basis: basis };
        if (sars) body.sars_reference = sars;
        if (gross && !Number.isNaN(Number(gross))) body.gross_tax_liability_zar = Number(gross);
        if (value && !Number.isNaN(Number(value))) body.offset_value_zar = Number(value);
      } else if (action === 'begin-review') {
        const basis = window.prompt('Review basis — scope of the SARS assessment of the offset claim:') || '';
        body = { review_basis: basis };
      } else if (action === 'raise-query') {
        const basis = window.prompt('Query basis — the request-for-information SARS needs before it can decide:');
        if (!basis) return;
        const ref = window.prompt('Query reference (e.g. SARS-RFI-2026-0007):') || '';
        body = { query_basis: basis };
        if (ref) body.query_ref = ref;
      } else if (action === 'respond-query') {
        const basis = window.prompt('Response basis — the taxpayer reply / evidence furnished to SARS:');
        if (!basis) return;
        body = { review_basis: basis };
      } else if (action === 'grant-allowance') {
        const basis = window.prompt('Allowance basis — SARS confirmation the s.13 offset allowance is granted:');
        if (!basis) return;
        const ref = window.prompt('Allowance reference (e.g. SARS-ALLOW-2026-0007):') || '';
        const value = window.prompt('Offset value granted (ZAR):', String(row.offset_value_zar || ''));
        body = { allowance_basis: basis };
        if (ref) body.allowance_ref = ref;
        if (value && !Number.isNaN(Number(value))) body.offset_value_zar = Number(value);
      } else if (action === 'reject-claim') {
        const basis = window.prompt('Rejection basis — why the claim fails (ineligible / double-counted / out-of-vintage / non-SA project):');
        if (!basis) return;
        body = { rejection_basis: basis, reason_code: 'ineligible_credits' };
      } else if (action === 'apply-to-return') {
        const ref = window.prompt('Return reference — the carbon-tax return the allowance is applied to (e.g. SARS-CTR-2026-0007):') || '';
        body = { submission_basis: 'Allowance applied to the carbon-tax return for the period.' };
        if (ref) body.return_ref = ref;
      } else if (action === 'reconcile') {
        const basis = window.prompt('Reconciliation basis — SARS confirmation the allowance matches the assessed return:');
        if (!basis) return;
        const ref = window.prompt('Assessment reference (e.g. SARS-ASSESS-2026-0007):') || '';
        body = { reconciliation_basis: basis };
        if (ref) body.assessment_ref = ref;
      } else if (action === 'claw-back') {
        const basis = window.prompt('Clawback basis — audit finding the credits ineligible, OR a W42 reversal of the underlying credits:');
        if (!basis) return;
        const ref = window.prompt('Clawback reference (e.g. SARS-CLAWBACK-2026-0007):') || '';
        const rev = window.prompt('Reversal reference (the W42 reversal that triggered it, if any):', row.reversal_ref || '') || '';
        body = { clawback_basis: basis, reason_code: 'allowance_recovered' };
        if (ref) body.clawback_ref = ref;
        if (rev) body.reversal_ref = rev;
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason — why the taxpayer is pulling the claim before assessment:');
        if (!reason) return;
        body = { reason_code: reason };
      }
      await api.post(`/carbon-offset-claim/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Carbon tax offset claims &amp; allowances</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage s.13 offset-allowance chain · drafted → eligibility screening → credits earmarked → submitted →
            SARS review → allowance granted → applied to return → reconciled. SARS may raise a query mid-review (respond
            to return to review). Claims reject from review; granted/applied allowances can be clawed back when an audit
            finds the credits ineligible or a W42 reversal undoes them; pre-submission claims can be withdrawn. The
            monetisation end of the carbon-credit lifecycle — a taxpayer reduces gross carbon-tax liability by up to 5%
            (general) or 10% (Annex-2) using retired COAS credits. INVERTED SLA: the larger the claim, the longer every
            window (deeper SARS scrutiny). Clawback crosses to the regulator inbox for every tier; rejection and SLA
            breach for material tiers; a material allowance grant for major claims (Carbon Tax Act §13 + GNR 1556 + DFFE
            COAS + SARS eFiling).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Major open" value={kpis?.major_open ?? 0} tone={(kpis?.major_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In review" value={kpis?.in_review_count ?? 0} tone={(kpis?.in_review_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Granted / applied" value={kpis?.granted_count ?? 0} tone="ok" />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reconciled" value={kpis?.reconciled_count ?? 0} tone="ok" />
        <Kpi label="Rejected" value={kpis?.rejected_count ?? 0} tone={(kpis?.rejected_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Clawed back" value={kpis?.clawed_back_count ?? 0} tone={(kpis?.clawed_back_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Credits claimed" value={fmtTco2e(kpis?.total_credits_claimed ?? 0)} />
        <Kpi label="Offset value" value={fmtZar(kpis?.total_offset_value ?? 0)} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Claim #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Taxpayer</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Industry / year</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Offset value</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.offset_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.claim_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[240px] truncate" title={r.taxpayer_party_name}>
                      {r.taxpayer_party_name}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <span className={r.industry_group === 'annex_2' ? 'text-[#8a4a00]' : 'text-[#4a5568]'}>
                        {r.industry_group === 'annex_2' ? 'Annex 2 (10%)' : 'General (5%)'}
                      </span>
                      <span className="text-[#4a5568]"> · {r.tax_year}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZar(r.offset_value_zar)}</td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No offset claims match.</td></tr>
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
  row: ClaimRow;
  events: ClaimEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ClaimRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRaiseQuery = row.chain_status === 'sars_review';
  const canReject = row.chain_status === 'sars_review';
  const canClawBack = GRANTED_STATES.includes(row.chain_status);
  const canWithdraw = WITHDRAWABLE_STATES.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.claim_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.taxpayer_party_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.offset_tier].label} · {row.industry_group === 'annex_2' ? 'Annex 2 (10%)' : 'General (5%)'} · tax year {row.tax_year}
                {row.registry_name ? ` · ${row.registry_name}` : ''}
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
            <Pair label="Tier"                 value={TIER_TONE[row.offset_tier].label} />
            <Pair label="Industry group"       value={row.industry_group === 'annex_2' ? 'Annex 2 (mining / petroleum)' : 'General'} />
            <Pair label="Tax year"             value={String(row.tax_year)} />
            <Pair label="SARS office"          value={row.sars_office_name ?? '—'} />
            <Pair label="Registry (COAS)"      value={row.registry_name ?? '—'} />
            <Pair label="Gross liability"      value={fmtZar(row.gross_tax_liability_zar)} />
            <Pair label="Offset limit"         value={`${row.offset_limit_pct ?? '—'}% · ${fmtZar(row.offset_limit_zar)}`} />
            <Pair label="CT rate"              value={row.ct_rate_zar_per_tco2e ? `R${row.ct_rate_zar_per_tco2e}/tCO₂e` : '—'} />
            <Pair label="Credits claimed"      value={fmtTco2e(row.credits_claimed_tco2e)} />
            <Pair label="Offset value"         value={fmtZar(row.offset_value_zar)} />
            <Pair label="Net liability"        value={fmtZar(row.net_tax_liability_zar)} />
            <Pair label="Credits unused (cap)" value={fmtTco2e(row.credits_unused_tco2e)} />
            <Pair label="Query round"          value={String(row.query_round)} />
            <Pair label="COAS ref"             value={row.coas_reference ?? '—'} />
            <Pair label="Retirement ref"       value={row.retirement_ref ?? '—'} />
            <Pair label="SARS ref"             value={row.sars_reference ?? '—'} />
            <Pair label="Query ref"            value={row.query_ref ?? '—'} />
            <Pair label="Allowance ref"        value={row.allowance_ref ?? '—'} />
            <Pair label="Return ref"           value={row.return_ref ?? '—'} />
            <Pair label="Assessment ref"       value={row.assessment_ref ?? '—'} />
            <Pair label="Clawback ref"         value={row.clawback_ref ?? '—'} />
            <Pair label="Reversal ref"         value={row.reversal_ref ?? '—'} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Drafted"              value={fmtDate(row.claim_drafted_at)} />
            <Pair label="Screening"            value={fmtDate(row.eligibility_screening_at)} />
            <Pair label="Earmarked"            value={fmtDate(row.credits_earmarked_at)} />
            <Pair label="Submitted"            value={fmtDate(row.claim_submitted_at)} />
            <Pair label="SARS review"          value={fmtDate(row.sars_review_at)} />
            <Pair label="SARS query"           value={fmtDate(row.sars_query_at)} />
            <Pair label="Allowance granted"    value={fmtDate(row.allowance_granted_at)} />
            <Pair label="Applied to return"    value={fmtDate(row.applied_to_return_at)} />
            <Pair label="Reconciled"           value={fmtDate(row.reconciled_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.claim_summary && (
            <BasisBlock label="Claim summary" tone="#1a3a5c" text={row.claim_summary} />
          )}
          {row.eligibility_basis && (
            <BasisBlock label="Eligibility basis" tone="#1a3a5c" text={row.eligibility_basis} />
          )}
          {row.earmark_basis && (
            <BasisBlock label="Earmark basis" tone="#1a3a5c" text={row.earmark_basis} />
          )}
          {row.submission_basis && (
            <BasisBlock label="Submission basis" tone="#a06200" text={row.submission_basis} />
          )}
          {row.review_basis && (
            <BasisBlock label="Review basis" tone="#a06200" text={row.review_basis} />
          )}
          {row.query_basis && (
            <BasisBlock label="Query basis" tone="#8a4a00" text={row.query_basis} />
          )}
          {row.allowance_basis && (
            <BasisBlock label="Allowance basis" tone="#1f6b3a" text={row.allowance_basis} />
          )}
          {row.reconciliation_basis && (
            <BasisBlock label="Reconciliation basis" tone="#155724" text={row.reconciliation_basis} />
          )}
          {row.rejection_basis && (
            <BasisBlock label="Rejection basis" tone="#9b1f1f" text={row.rejection_basis} />
          )}
          {row.clawback_basis && (
            <BasisBlock label="Clawback basis" tone="#9b1f1f" text={row.clawback_basis} />
          )}
        </section>

        {(nextAction || canRaiseQuery || canReject || canClawBack || canWithdraw) && (
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
              {canRaiseQuery && (
                <button type="button"
                  onClick={() => onAct('raise-query', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['raise-query']}
                </button>
              )}
              {canReject && (
                <button type="button"
                  onClick={() => onAct('reject-claim', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject-claim']}
                </button>
              )}
              {canClawBack && (
                <button type="button"
                  onClick={() => onAct('claw-back', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['claw-back']}
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
