// Wave 46 — Offtaker PPA Curtailment / Deemed-Energy Compensation lifecycle tab.
//
// 12-state P6 chain on oe_curtailment_claims — the SUPPLY-side mirror of W32
// take-or-pay. When the buyer or System Operator curtails an AVAILABLE plant for
// economic / system-security / grid-constraint reasons NOT attributable to the
// IPP, the PPA compensates the seller for "deemed energy" — the MWh the plant
// WOULD have generated, valued at the PPA tariff. The buyer classifies, validates,
// proposes/agrees quantum and settles; the seller (IPP) prepares + submits the
// claim, disputes the quantum, and may withdraw. A classification gate diverts
// IPP-fault / force-majeure / scheduled events to non_compensable.
//
// URGENT SLA — utility_scale gets the TIGHTEST windows (debt-service depends on
// the deemed-energy cash flow). Reportability:
//   • refer_arbitration crosses for EVERY tier (universal hard line)
//   • reject_non_compensable + settle_compensation + SLA breaches cross for
//     utility_scale + commercial only
//
// Seller-write split: the seller (IPP) submits / disputes / withdraws; the buyer
// (offtaker) drives the classification / validation / quantum / settlement
// machinery. actor_party (seller / buyer / arbiter) is derived from the action.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'curtailment_logged' | 'classification_review' | 'claim_prepared'
  | 'claim_submitted' | 'validation_underway' | 'quantum_proposed'
  | 'quantum_agreed' | 'compensation_settled' | 'disputed'
  | 'arbitrated' | 'non_compensable' | 'withdrawn';

type Tier = 'utility_scale' | 'commercial' | 'embedded';

interface ClaimRow {
  id: string;
  claim_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  seller_party_id: string;
  seller_party_name: string;
  buyer_party_name: string | null;
  arbiter_name: string | null;
  ppa_ref: string | null;
  facility_name: string;
  facility_tier: Tier;
  contracted_capacity_mw: number | null;
  tariff_per_mwh: number | null;
  curtailment_type: string | null;
  curtailment_event: string | null;
  curtailment_hours: number | null;
  deemed_energy_mwh: number | null;
  claimed_amount: number | null;
  proposed_amount: number | null;
  agreed_amount: number | null;
  settled_amount: number | null;
  log_ref: string | null;
  classification_ref: string | null;
  claim_ref: string | null;
  validation_ref: string | null;
  quantum_ref: string | null;
  settlement_ref: string | null;
  dispute_ref: string | null;
  arbitration_ref: string | null;
  log_basis: string | null;
  classification_basis: string | null;
  claim_basis: string | null;
  validation_basis: string | null;
  quantum_basis: string | null;
  settlement_basis: string | null;
  dispute_basis: string | null;
  arbitration_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  curtailment_logged_at: string;
  classification_review_at: string | null;
  claim_prepared_at: string | null;
  claim_submitted_at: string | null;
  validation_underway_at: string | null;
  quantum_proposed_at: string | null;
  quantum_agreed_at: string | null;
  compensation_settled_at: string | null;
  disputed_at: string | null;
  arbitrated_at: string | null;
  non_compensable_at: string | null;
  withdrawn_at: string | null;
  dispute_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_reportable?: boolean;
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
  settled_count: number;
  non_compensable_count: number;
  arbitrated_count: number;
  withdrawn_count: number;
  disputed_count: number;
  breached: number;
  reportable_total: number;
  utility_open: number;
  total_claimed: number;
  total_proposed: number;
  total_agreed: number;
  total_settled: number;
  total_deemed_mwh: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  curtailment_logged:    { bg: '#e3e7ec', fg: '#557',    label: 'Curtailment logged' },
  classification_review: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Classification review' },
  claim_prepared:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Claim prepared' },
  claim_submitted:       { bg: '#fff4d6', fg: '#a06200', label: 'Claim submitted' },
  validation_underway:   { bg: '#fff4d6', fg: '#a06200', label: 'Validation underway' },
  quantum_proposed:      { bg: '#fff4d6', fg: '#a06200', label: 'Quantum proposed' },
  quantum_agreed:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'Quantum agreed' },
  compensation_settled:  { bg: '#d4edda', fg: '#155724', label: 'Compensation settled' },
  disputed:              { bg: '#ffe4e1', fg: '#a04040', label: 'Disputed' },
  arbitrated:            { bg: '#fde0e0', fg: '#9b1f1f', label: 'Arbitrated' },
  non_compensable:       { bg: '#ede0e0', fg: '#6b3a3a', label: 'Non-compensable' },
  withdrawn:             { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  utility_scale: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Utility scale' },
  commercial:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Commercial' },
  embedded:      { bg: '#e3e7ec', fg: '#557',    label: 'Embedded' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'utility_scale',         label: 'Utility' },
  { key: 'commercial',            label: 'Commercial' },
  { key: 'embedded',              label: 'Embedded' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'curtailment_logged',    label: 'Logged' },
  { key: 'classification_review', label: 'Classifying' },
  { key: 'claim_prepared',        label: 'Prepared' },
  { key: 'claim_submitted',       label: 'Submitted' },
  { key: 'validation_underway',   label: 'Validating' },
  { key: 'quantum_proposed',      label: 'Quantum prop.' },
  { key: 'quantum_agreed',        label: 'Quantum agreed' },
  { key: 'compensation_settled',  label: 'Settled' },
  { key: 'disputed',              label: 'Disputed' },
  { key: 'arbitrated',            label: 'Arbitrated' },
  { key: 'non_compensable',       label: 'Non-comp.' },
  { key: 'withdrawn',             label: 'Withdrawn' },
];

type ActionKind =
  | 'begin-classification' | 'confirm-compensable' | 'reject-non-compensable'
  | 'submit-claim' | 'begin-validation' | 'propose-quantum' | 'agree-quantum'
  | 'settle-compensation' | 'dispute' | 'recalculate' | 'refer-arbitration'
  | 'withdraw';

// Primary forward action per state. Branches (reject / dispute / arbitrate /
// withdraw) are surfaced separately in the drawer.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  curtailment_logged:    'begin-classification',
  classification_review: 'confirm-compensable',
  claim_prepared:        'submit-claim',
  claim_submitted:       'begin-validation',
  validation_underway:   'propose-quantum',
  quantum_proposed:      'agree-quantum',
  quantum_agreed:        'settle-compensation',
  compensation_settled:  null,
  disputed:              'recalculate',
  arbitrated:            null,
  non_compensable:       null,
  withdrawn:             null,
};

// Party annotation per action (buyer = offtaker drives machinery, seller = IPP
// submits / disputes / withdraws, arbiter on referral).
const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-classification':   'Begin classification (buyer)',
  'confirm-compensable':    'Confirm compensable (buyer)',
  'reject-non-compensable': 'Reject — non-compensable (buyer)',
  'submit-claim':           'Submit claim (seller)',
  'begin-validation':       'Begin validation (buyer)',
  'propose-quantum':        'Propose quantum (buyer)',
  'agree-quantum':          'Agree quantum (buyer)',
  'settle-compensation':    'Settle compensation (buyer)',
  'dispute':                'Dispute quantum (seller)',
  'recalculate':            'Recalculate quantum (buyer)',
  'refer-arbitration':      'Refer to arbitration',
  'withdraw':               'Withdraw claim (seller)',
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
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(1)}k`;
  return `R${n.toFixed(0)}`;
}

function fmtMwh(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(2)} GWh`;
  return `${n.toFixed(1)} MWh`;
}

const TERMINAL_STATES: ChainStatus[] = [
  'compensation_settled', 'arbitrated', 'non_compensable', 'withdrawn',
];

export function CurtailmentClaimTab() {
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
      const res = await api.get<{ data: { items: ClaimRow[] } & KpiSummary }>('/curtailment-claim/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, settled_count: d.settled_count,
          non_compensable_count: d.non_compensable_count, arbitrated_count: d.arbitrated_count,
          withdrawn_count: d.withdrawn_count, disputed_count: d.disputed_count,
          breached: d.breached, reportable_total: d.reportable_total, utility_open: d.utility_open,
          total_claimed: d.total_claimed, total_proposed: d.total_proposed,
          total_agreed: d.total_agreed, total_settled: d.total_settled,
          total_deemed_mwh: d.total_deemed_mwh,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load curtailment claims');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ClaimRow; events: ClaimEvent[] } }>(
        `/curtailment-claim/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load claim history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'active')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'utility_scale') return r.facility_tier === 'utility_scale';
      if (filter === 'commercial')   return r.facility_tier === 'commercial';
      if (filter === 'embedded')     return r.facility_tier === 'embedded';
      if (filter === 'breached')     return r.sla_breached;
      if (filter === 'reportable')   return r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ClaimRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'begin-classification') {
        const ref = window.prompt('Classification reference (e.g. CLASS-2026-014):');
        if (!ref) return;
        const type = window.prompt('Curtailment type (economic / system_security / grid_constraint / network_outage):', row.curtailment_type || 'economic') || 'economic';
        const event = window.prompt('Curtailment event label (e.g. Stage 4 load-shed 18:00-22:00):') || '';
        const basis = window.prompt('Classification basis — what is under review:') || '';
        body = { classification_ref: ref, curtailment_type: type, curtailment_event: event, classification_basis: basis };
      } else if (action === 'confirm-compensable') {
        const basis = window.prompt('Confirmation basis — why this is buyer/SO-side (not IPP fault / FM / scheduled):') || '';
        body = { classification_basis: basis };
      } else if (action === 'reject-non-compensable') {
        const basis = window.prompt('Rejection basis — why no deemed energy is owed (IPP fault / force majeure / scheduled):');
        if (!basis) return;
        const rod = window.prompt('Record-of-decision notes:') || '';
        body = { classification_basis: basis, reason_code: 'non_compensable', rod_notes: rod };
      } else if (action === 'submit-claim') {
        const ref = window.prompt('Claim reference (e.g. CCLAIM-2026-014):');
        if (!ref) return;
        const mwh = window.prompt('Deemed energy claimed (MWh):');
        if (!mwh) return;
        const amount = window.prompt(`Claimed amount ZAR (tariff ${row.tariff_per_mwh ? 'R' + row.tariff_per_mwh + '/MWh' : 'n/a'}):`);
        const basis = window.prompt('Claim basis — methodology for the deemed-energy figure:') || '';
        body = { claim_ref: ref, deemed_energy_mwh: Number(mwh), claim_basis: basis };
        if (amount) body.claimed_amount = Number(amount);
      } else if (action === 'begin-validation') {
        const ref = window.prompt('Validation reference:');
        if (!ref) return;
        const basis = window.prompt('Validation basis — SCADA / resource-model checks being run:') || '';
        body = { validation_ref: ref, validation_basis: basis };
      } else if (action === 'propose-quantum') {
        const ref = window.prompt('Quantum reference:');
        if (!ref) return;
        const proposed = window.prompt(`Proposed compensation ZAR (claimed was ${fmtZar(row.claimed_amount)}):`);
        if (!proposed) return;
        const basis = window.prompt('Quantum basis — adjustment vs the claim:') || '';
        body = { quantum_ref: ref, proposed_amount: Number(proposed), quantum_basis: basis };
      } else if (action === 'agree-quantum') {
        const agreed = window.prompt(`Agreed compensation ZAR (proposed was ${fmtZar(row.proposed_amount)} — blank accepts proposed):`);
        const basis = window.prompt('Agreement basis / reason:') || '';
        body = { quantum_basis: basis };
        if (agreed) body.agreed_amount = Number(agreed);
      } else if (action === 'settle-compensation') {
        const ref = window.prompt('Settlement reference (payment / credit note):');
        if (!ref) return;
        const settled = window.prompt(`Settled amount ZAR (agreed was ${fmtZar(row.agreed_amount)} — blank settles agreed):`);
        const rod = window.prompt('Record-of-decision notes (value date, invoicing reference):') || '';
        body = { settlement_ref: ref, settlement_basis: rod, reason_code: 'compensation_paid', rod_notes: rod };
        if (settled) body.settled_amount = Number(settled);
      } else if (action === 'dispute') {
        const ref = window.prompt('Dispute reference (e.g. CCLAIM-DISPUTE-2026-004):');
        if (!ref) return;
        const basis = window.prompt('Dispute basis — what the seller challenges (deemed-MWh / tariff / adjustment):');
        if (!basis) return;
        body = { dispute_ref: ref, dispute_basis: basis };
      } else if (action === 'recalculate') {
        const ref = window.prompt('Recalculation quantum reference:', row.quantum_ref || '');
        if (!ref) return;
        const proposed = window.prompt('Revised proposed compensation ZAR:', String(row.proposed_amount ?? ''));
        const basis = window.prompt('Recalculation basis — what changed:') || '';
        body = { quantum_ref: ref, quantum_basis: basis };
        if (proposed) body.proposed_amount = Number(proposed);
      } else if (action === 'refer-arbitration') {
        const ref = window.prompt('Arbitration reference (e.g. AFSA-2026-0007):');
        if (!ref) return;
        const arbiter = window.prompt('Arbiter / forum (e.g. AFSA, NERSA tariff arbitration):') || '';
        const basis = window.prompt('Arbitration basis / referral note:') || '';
        body = { arbitration_ref: ref, arbiter_name: arbiter, arbitration_basis: basis, reason_code: 'referred_to_arbitration' };
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason (e.g. superseded, claim abandoned):');
        if (!reason) return;
        body = { reason_code: 'withdrawn', rod_notes: reason };
      }
      await api.post(`/curtailment-claim/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Offtaker PPA curtailment / deemed-energy compensation</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage P6 chain · curtailment logged → classification review → claim prepared → claim submitted → validation
            underway → quantum proposed → quantum agreed → compensation settled. A classification gate diverts IPP-fault /
            force-majeure / scheduled events to non-compensable; quantum disputes branch through recalculation, re-proposal
            and arbitration. The supply-side mirror of take-or-pay — when the buyer or System Operator curtails an available
            plant, the PPA compensates the seller for the MWh it would have generated. The buyer (offtaker) drives the
            classification / validation / quantum / settlement machinery; the seller (IPP) submits, disputes and may withdraw.
            URGENT SLA: utility-scale tightest (debt service depends on the cash flow). Arbitration crosses to the regulator
            inbox for every tier; denied claims, settlements + SLA breaches cross for utility-scale + commercial.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Utility open" value={kpis?.utility_open ?? 0} tone={(kpis?.utility_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In dispute" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Settled" value={kpis?.settled_count ?? 0} />
        <Kpi label="Non-comp." value={kpis?.non_compensable_count ?? 0} tone={(kpis?.non_compensable_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Arbitrated" value={kpis?.arbitrated_count ?? 0} tone={(kpis?.arbitrated_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Deemed energy" value={fmtMwh(kpis?.total_deemed_mwh)} />
        <Kpi label="Claimed" value={fmtZar(kpis?.total_claimed)} />
        <Kpi label="Settled value" value={fmtZar(kpis?.total_settled)} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Facility / seller</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Deemed MWh</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Claimed → settled</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.facility_tier];
                const shownValue = r.settled_amount ?? r.agreed_amount ?? r.proposed_amount ?? r.claimed_amount;
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
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.facility_name} · ${r.seller_party_name}`}>
                      {r.facility_name}
                      <span className="text-[#4a5568]"> · {r.seller_party_name}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtMwh(r.deemed_energy_mwh)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {fmtZar(r.claimed_amount)} → {fmtZar(shownValue)}
                    </td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No claims match.</td></tr>
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
  const canReject = row.chain_status === 'classification_review';
  const canDispute = ['quantum_proposed', 'quantum_agreed'].includes(row.chain_status);
  const canArbitrate = row.chain_status === 'disputed';
  const canWithdraw = !TERMINAL_STATES.includes(row.chain_status);

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
              <div className="text-base font-semibold text-[#0c2a4d]">{row.facility_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.facility_tier].label} · seller {row.seller_party_name}
                {row.buyer_party_name ? ` · buyer ${row.buyer_party_name}` : ''}
                {row.contracted_capacity_mw ? ` · ${row.contracted_capacity_mw} MW` : ''}
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
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"              value={TIER_TONE[row.facility_tier].label} />
            <Pair label="PPA ref"           value={row.ppa_ref ?? '—'} />
            <Pair label="Arbiter"           value={row.arbiter_name ?? '—'} />
            <Pair label="Curtailment type"  value={row.curtailment_type ?? '—'} />
            <Pair label="Curtailment event" value={row.curtailment_event ?? '—'} />
            <Pair label="Curtailment hours" value={row.curtailment_hours != null ? `${row.curtailment_hours} h` : '—'} />
            <Pair label="Tariff"            value={row.tariff_per_mwh != null ? `R${row.tariff_per_mwh}/MWh` : '—'} />
            <Pair label="Deemed energy"     value={fmtMwh(row.deemed_energy_mwh)} />
            <Pair label="Claimed"           value={fmtZar(row.claimed_amount)} />
            <Pair label="Proposed"          value={fmtZar(row.proposed_amount)} />
            <Pair label="Agreed"            value={fmtZar(row.agreed_amount)} />
            <Pair label="Settled"           value={fmtZar(row.settled_amount)} />
            <Pair label="Dispute round"     value={String(row.dispute_round)} />
            <Pair label="Classification ref" value={row.classification_ref ?? '—'} />
            <Pair label="Claim ref"         value={row.claim_ref ?? '—'} />
            <Pair label="Validation ref"    value={row.validation_ref ?? '—'} />
            <Pair label="Quantum ref"       value={row.quantum_ref ?? '—'} />
            <Pair label="Settlement ref"    value={row.settlement_ref ?? '—'} />
            <Pair label="Dispute ref"       value={row.dispute_ref ?? '—'} />
            <Pair label="Arbitration ref"   value={row.arbitration_ref ?? '—'} />
            <Pair label="Reason code"       value={row.reason_code ?? '—'} />
            <Pair label="Logged"            value={fmtDate(row.curtailment_logged_at)} />
            <Pair label="Classification"    value={fmtDate(row.classification_review_at)} />
            <Pair label="Claim prepared"    value={fmtDate(row.claim_prepared_at)} />
            <Pair label="Claim submitted"   value={fmtDate(row.claim_submitted_at)} />
            <Pair label="Validation"        value={fmtDate(row.validation_underway_at)} />
            <Pair label="Quantum proposed"  value={fmtDate(row.quantum_proposed_at)} />
            <Pair label="Quantum agreed"    value={fmtDate(row.quantum_agreed_at)} />
            <Pair label="Settled at"        value={fmtDate(row.compensation_settled_at)} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"        value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"    value={String(row.escalation_level)} />
            <Pair label="Reportable"        value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.classification_basis && (
            <BasisBlock label="Classification basis" tone="#1a3a5c" text={row.classification_basis} />
          )}
          {row.claim_basis && (
            <BasisBlock label="Claim basis" tone="#1a3a5c" text={row.claim_basis} />
          )}
          {row.validation_basis && (
            <BasisBlock label="Validation basis" tone="#1a3a5c" text={row.validation_basis} />
          )}
          {row.quantum_basis && (
            <BasisBlock label="Quantum basis" tone="#8a4a00" text={row.quantum_basis} />
          )}
          {row.settlement_basis && (
            <BasisBlock label="Settlement basis" tone="#155724" text={row.settlement_basis} />
          )}
          {row.dispute_basis && (
            <BasisBlock label="Dispute basis" tone="#a04040" text={row.dispute_basis} />
          )}
          {row.arbitration_basis && (
            <BasisBlock label="Arbitration basis" tone="#9b1f1f" text={row.arbitration_basis} />
          )}
          {row.rod_notes && (
            <BasisBlock label="Record of decision" tone="#155724" text={row.rod_notes} />
          )}
        </section>

        {(nextAction || canReject || canDispute || canArbitrate || canWithdraw) && (
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
              {canReject && (
                <button type="button"
                  onClick={() => onAct('reject-non-compensable', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject-non-compensable']}
                </button>
              )}
              {canDispute && (
                <button type="button"
                  onClick={() => onAct('dispute', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.dispute}
                </button>
              )}
              {canArbitrate && (
                <button type="button"
                  onClick={() => onAct('refer-arbitration', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['refer-arbitration']}
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
