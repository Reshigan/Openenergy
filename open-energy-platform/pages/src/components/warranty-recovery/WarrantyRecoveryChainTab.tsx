// Wave 63 — OEM-Support Warranty-Recovery / Supplier-Recovery Claim tab.
//
// The COMMERCIAL cost-recovery counterpart to W15 (warranty / RMA): W15 processes
// the FIELD-side return (repair/replace); this chain recovers OUR cost from the
// manufacturer under the supply-agreement warranty. Completes the asset-warranty
// lifecycle — an RMA (W15) and/or a work-order repair (W16) generates a cost,
// then that cost is pursued against the OEM here.
//
// Forward path: claim_drafted → submitted_to_oem → oem_acknowledged →
//   under_assessment → assessment_complete → approved → recovery_pending →
//   recovered. Rejection: assessment_complete → rejected. Dispute loop:
//   assessment_complete | recovery_pending → disputed → resolve_dispute (→approved)
//   OR write_off (→written_off). Withdraw: any pre-approval state → withdrawn.
//
// MIXED SLA — claim_drafted / under_assessment / disputed INVERTED (bigger
// recovery = MORE time); recovery_pending URGENT (bigger approved recovery chased
// faster). Reportability is DEFECT-CLASS-driven: assessment complete crosses for
// EVERY tier when the defect is systemic (serial/safety), otherwise large tiers
// only; write-off + SLA breach cross for large tiers. Single-party write
// {admin, support}; actor_party (claimant / oem_supplier / assessor) is functional.
// OEM supply-agreement warranty + NRCS safety-recall + CPA s55/s56/s61 + NERSA.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'claim_drafted' | 'submitted_to_oem' | 'oem_acknowledged' | 'under_assessment'
  | 'assessment_complete' | 'approved' | 'disputed' | 'recovery_pending'
  | 'recovered' | 'rejected' | 'withdrawn' | 'written_off';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';
type DefectClass = 'isolated' | 'batch' | 'serial' | 'safety' | 'wear_out';

interface RecoveryRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  claimant_party_id: string;
  claimant_party_name: string;
  oem_party_id: string;
  oem_party_name: string;
  assessor_party_id: string | null;
  assessor_party_name: string | null;
  asset_name: string | null;
  component_type: string | null;
  oem_name: string | null;
  product_model: string | null;
  serial_or_batch_ref: string | null;
  warranty_ref: string | null;
  warranty_expiry: string | null;
  defect_class: DefectClass;
  defect_description: string | null;
  failure_mode: string | null;
  units_affected: number | null;
  fleet_size: number | null;
  repair_cost_zar_m: number | null;
  replacement_cost_zar_m: number | null;
  lost_generation_zar_m: number | null;
  claimed_zar_m: number | null;
  recovery_zar_m: number;
  recovered_zar_m: number | null;
  recovery_method: string | null;
  recovery_tier: Tier;
  draft_basis: string | null;
  submission_basis: string | null;
  acknowledgement_basis: string | null;
  assessment_basis: string | null;
  approval_basis: string | null;
  rejection_basis: string | null;
  dispute_basis: string | null;
  resolution_basis: string | null;
  recovery_basis: string | null;
  writeoff_basis: string | null;
  withdrawal_basis: string | null;
  regulator_ref: string | null;
  reason_code: string | null;
  notes: string | null;
  dispute_round: number;
  chain_status: ChainStatus;
  claim_drafted_at: string;
  submitted_to_oem_at: string | null;
  oem_acknowledged_at: string | null;
  under_assessment_at: string | null;
  assessment_complete_at: string | null;
  approved_at: string | null;
  disputed_at: string | null;
  recovery_pending_at: string | null;
  recovered_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  written_off_at: string | null;
  is_reportable: number;
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
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
}

interface RecoveryEvent {
  id: string;
  recovery_id: string;
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
  recovered_count: number;
  in_assessment_count: number;
  in_dispute_count: number;
  written_off_count: number;
  rejected_count: number;
  breached: number;
  reportable_total: number;
  systemic_total: number;
  large_tier_open: number;
  total_recovery_zar_m: number;
  recovered_zar_m: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  claim_drafted:       { bg: '#e3e7ec', fg: '#557',    label: 'Claim drafted' },
  submitted_to_oem:    { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Submitted to OEM' },
  oem_acknowledged:    { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'OEM acknowledged' },
  under_assessment:    { bg: '#fff4d6', fg: '#a06200', label: 'Under assessment' },
  assessment_complete: { bg: '#ffe9d6', fg: '#8a4a00', label: 'Assessment complete' },
  approved:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  disputed:            { bg: '#fde0e0', fg: '#9b1f1f', label: 'Disputed' },
  recovery_pending:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Recovery pending' },
  recovered:           { bg: '#d4edda', fg: '#155724', label: 'Recovered' },
  rejected:            { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  withdrawn:           { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
  written_off:         { bg: '#fde0e0', fg: '#9b1f1f', label: 'Written off' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  major:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material' },
  moderate: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Moderate' },
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
};

const DEFECT_TONE: Record<DefectClass, { bg: string; fg: string; label: string }> = {
  safety:   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Safety' },
  serial:   { bg: '#ffe4b5', fg: '#8a4a00', label: 'Serial' },
  batch:    { bg: '#fff4d6', fg: '#a06200', label: 'Batch' },
  isolated: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Isolated' },
  wear_out: { bg: '#e3e7ec', fg: '#557',    label: 'Wear-out' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active' },
  { key: 'all',                 label: 'All' },
  { key: 'critical',            label: 'Critical' },
  { key: 'major',               label: 'Major' },
  { key: 'material',            label: 'Material' },
  { key: 'moderate',            label: 'Moderate' },
  { key: 'minor',               label: 'Minor' },
  { key: 'under_assessment',    label: 'In assessment' },
  { key: 'disputed',            label: 'Disputed' },
  { key: 'recovery_pending',    label: 'Recovery pending' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'reportable',          label: 'Reportable' },
  { key: 'recovered',           label: 'Recovered' },
  { key: 'written_off',         label: 'Written off' },
  { key: 'rejected',            label: 'Rejected' },
  { key: 'withdrawn',           label: 'Withdrawn' },
];

type ActionKind =
  | 'submit-claim' | 'acknowledge' | 'begin-assessment' | 'complete-assessment'
  | 'approve-recovery' | 'reject-claim' | 'dispute' | 'resolve-dispute'
  | 'initiate-recovery' | 'confirm-recovery' | 'write-off' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  claim_drafted:       'submit-claim',
  submitted_to_oem:    'acknowledge',
  oem_acknowledged:    'begin-assessment',
  under_assessment:    'complete-assessment',
  assessment_complete: 'approve-recovery',
  approved:            'initiate-recovery',
  disputed:            'resolve-dispute',
  recovery_pending:    'confirm-recovery',
  recovered:           null,
  rejected:            null,
  withdrawn:           null,
  written_off:         null,
};

// claimant submits/disputes/confirms/writes-off/withdraws; oem_supplier
// acknowledges/approves/rejects/initiates; assessor assesses/resolves.
const ACTION_LABEL: Record<ActionKind, string> = {
  'submit-claim':        'Submit claim to OEM (claimant)',
  'acknowledge':         'Acknowledge claim (OEM)',
  'begin-assessment':    'Begin technical assessment (assessor)',
  'complete-assessment': 'Complete assessment (assessor)',
  'approve-recovery':    'Approve recovery (OEM)',
  'reject-claim':        'Reject claim (OEM)',
  'dispute':             'Raise dispute (claimant)',
  'resolve-dispute':     'Resolve dispute (assessor)',
  'initiate-recovery':   'Initiate recovery (OEM)',
  'confirm-recovery':    'Confirm recovery received (claimant)',
  'write-off':           'Write off (claimant)',
  'withdraw':            'Withdraw claim (claimant)',
};

const RECOVERY_METHODS = 'credit_note / replacement_in_kind / cash / repair_at_oem_cost';
const DEFECT_CLASSES = 'isolated / batch / serial / safety / wear_out';

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtZarM(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `R${v.toLocaleString('en-ZA', { maximumFractionDigits: 2 })}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

const TERMINAL_STATES: ChainStatus[] = ['recovered', 'rejected', 'withdrawn', 'written_off'];
const WITHDRAW_STATES: ChainStatus[] = ['claim_drafted', 'submitted_to_oem', 'oem_acknowledged', 'under_assessment', 'assessment_complete'];

export function WarrantyRecoveryChainTab() {
  const [rows, setRows] = useState<RecoveryRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<RecoveryRow | null>(null);
  const [events, setEvents] = useState<RecoveryEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RecoveryRow[] } & KpiSummary }>('/warranty-recovery/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, recovered_count: d.recovered_count,
          in_assessment_count: d.in_assessment_count, in_dispute_count: d.in_dispute_count,
          written_off_count: d.written_off_count, rejected_count: d.rejected_count,
          breached: d.breached, reportable_total: d.reportable_total, systemic_total: d.systemic_total,
          large_tier_open: d.large_tier_open, total_recovery_zar_m: d.total_recovery_zar_m,
          recovered_zar_m: d.recovered_zar_m,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load warranty recoveries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: RecoveryRow; events: RecoveryEvent[] } }>(
        `/warranty-recovery/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load recovery history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable_flag;
      if (['critical', 'major', 'material', 'moderate', 'minor'].includes(filter)) {
        return r.recovery_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: RecoveryRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'submit-claim') {
        const claimed = window.prompt('Amount claimed against the OEM (ZAR millions):', row.claimed_zar_m != null ? String(row.claimed_zar_m) : '') || '';
        const recovery = window.prompt('Recovery amount sought (ZAR millions) — re-derives the tier:', String(row.recovery_zar_m ?? '')) || '';
        const ref = window.prompt('Submission reference (claim pack / portal ref):') || '';
        const basis = window.prompt('Submission basis — warranty clause + cost build-up:') || '';
        body = { submission_basis: basis };
        if (ref) body.submission_ref = ref;
        if (claimed && !Number.isNaN(Number(claimed))) body.claimed_zar_m = Number(claimed);
        if (recovery && !Number.isNaN(Number(recovery))) body.recovery_zar_m = Number(recovery);
      } else if (action === 'acknowledge') {
        const ref = window.prompt('OEM acknowledgement reference (case / ticket no.):') || '';
        const basis = window.prompt('Acknowledgement basis — OEM receipt + assigned handler:') || '';
        body = { acknowledgement_basis: basis };
        if (ref) body.acknowledgement_ref = ref;
      } else if (action === 'begin-assessment') {
        const aid = window.prompt('Assessor party id (independent / joint technical assessor):', row.assessor_party_id || '') || '';
        const aname = window.prompt('Assessor party name:', row.assessor_party_name || '') || '';
        const basis = window.prompt('Assessment basis — scope of the failure investigation:') || '';
        body = { assessment_basis: basis };
        if (aid) body.assessor_party_id = aid;
        if (aname) body.assessor_party_name = aname;
      } else if (action === 'complete-assessment') {
        const defect = window.prompt(`Classified defect (${DEFECT_CLASSES}) — drives reportability:`, row.defect_class || '') || '';
        const mode = window.prompt('Failure mode (root cause):', row.failure_mode || '') || '';
        const units = window.prompt('Units affected:', row.units_affected != null ? String(row.units_affected) : '') || '';
        const fleet = window.prompt('Fleet size (population at risk):', row.fleet_size != null ? String(row.fleet_size) : '') || '';
        const recovery = window.prompt('Assessed recoverable amount (ZAR millions) — re-derives the tier:', String(row.recovery_zar_m ?? '')) || '';
        const basis = window.prompt('Assessment basis — findings + recoverable determination:');
        if (!basis) return;
        body = { assessment_basis: basis };
        if (defect) body.defect_class = defect;
        if (mode) body.failure_mode = mode;
        if (units && !Number.isNaN(Number(units))) body.units_affected = Number(units);
        if (fleet && !Number.isNaN(Number(fleet))) body.fleet_size = Number(fleet);
        if (recovery && !Number.isNaN(Number(recovery))) body.recovery_zar_m = Number(recovery);
      } else if (action === 'approve-recovery') {
        const basis = window.prompt('Approval basis — OEM concession of the warranty claim:');
        if (!basis) return;
        const method = window.prompt(`Recovery method (${RECOVERY_METHODS}):`, row.recovery_method || '') || '';
        const recovery = window.prompt('Approved recovery amount (ZAR millions) — re-derives the tier:', String(row.recovery_zar_m ?? '')) || '';
        body = { approval_basis: basis };
        if (method) body.recovery_method = method;
        if (recovery && !Number.isNaN(Number(recovery))) body.recovery_zar_m = Number(recovery);
      } else if (action === 'reject-claim') {
        const basis = window.prompt('Rejection basis — why the OEM denies the claim (out of warranty / not covered):');
        if (!basis) return;
        body = { rejection_basis: basis, reason_code: 'oem_denied' };
      } else if (action === 'dispute') {
        const basis = window.prompt('Dispute basis — grounds for contesting the OEM position:');
        if (!basis) return;
        body = { dispute_basis: basis, reason_code: 'contested' };
      } else if (action === 'resolve-dispute') {
        const basis = window.prompt('Resolution basis — how the dispute was settled in the claimant favour:');
        if (!basis) return;
        const recovery = window.prompt('Agreed recovery amount (ZAR millions), if revised — re-derives the tier:', String(row.recovery_zar_m ?? '')) || '';
        body = { resolution_basis: basis };
        if (recovery && !Number.isNaN(Number(recovery))) body.recovery_zar_m = Number(recovery);
      } else if (action === 'initiate-recovery') {
        const method = window.prompt(`Recovery method (${RECOVERY_METHODS}):`, row.recovery_method || '') || '';
        const ref = window.prompt('Recovery reference (credit note / RMA replacement / payment ref):') || '';
        const basis = window.prompt('Recovery basis — instrument issued to effect the recovery:') || '';
        body = { recovery_basis: basis };
        if (method) body.recovery_method = method;
        if (ref) body.recovery_ref = ref;
      } else if (action === 'confirm-recovery') {
        const recovered = window.prompt('Amount actually recovered (ZAR millions):', String(row.recovery_zar_m ?? '')) || '';
        const method = window.prompt(`Recovery method realised (${RECOVERY_METHODS}):`, row.recovery_method || '') || '';
        const ref = window.prompt('Confirmation reference (settlement / credit applied):') || '';
        body = {};
        if (recovered && !Number.isNaN(Number(recovered))) body.recovered_zar_m = Number(recovered);
        if (method) body.recovery_method = method;
        if (ref) body.confirmation_ref = ref;
      } else if (action === 'write-off') {
        const basis = window.prompt('Write-off basis — why the recovery is abandoned / unrecoverable:');
        if (!basis) return;
        const reg = window.prompt('Regulator reference (a large unrecovered warranty loss is reportable):') || '';
        body = { writeoff_basis: basis, reason_code: 'unrecoverable' };
        if (reg) body.regulator_ref = reg;
      } else if (action === 'withdraw') {
        const basis = window.prompt('Withdrawal basis — why the claim is being withdrawn:');
        if (!basis) return;
        body = { withdrawal_basis: basis, reason_code: 'withdrawn' };
      }
      await api.post(`/warranty-recovery/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">OEM warranty-recovery / supplier-recovery claims</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage commercial cost-recovery chain · claim drafted → submitted to OEM → acknowledged →
            under assessment → assessment complete → approved → recovery pending → recovered. The COMMERCIAL
            counterpart to the W15 field RMA: an RMA and/or work-order repair generates a cost, then that cost is
            recovered from the manufacturer under the supply-agreement warranty here. The OEM can reject; either
            side can dispute (assessment complete | recovery pending → disputed → resolved-to-approved OR
            written-off); a pre-approval claim can be withdrawn. MIXED SLA — claim drafting / assessment / dispute
            give bigger recoveries MORE time; an approved recovery is chased FASTER for working capital. Reportable
            to the regulator inbox is DEFECT-CLASS-driven: a completed assessment of a SYSTEMIC defect (serial /
            safety) crosses for EVERY tier; a non-systemic defect crosses for large tiers only; write-off + SLA
            breach cross for large tiers. OEM supply-agreement warranty + serial-defect / epidemic-failure clauses +
            NRCS safety-recall + CPA 68/2008 s55/s56/s61 + NERSA Grid Code reliability.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="In assessment" value={kpis?.in_assessment_count ?? 0} tone={(kpis?.in_assessment_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Disputed" value={kpis?.in_dispute_count ?? 0} tone={(kpis?.in_dispute_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Large open" value={kpis?.large_tier_open ?? 0} tone={(kpis?.large_tier_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Systemic" value={kpis?.systemic_total ?? 0} tone={(kpis?.systemic_total ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Recovered" value={kpis?.recovered_count ?? 0} tone="ok" />
        <Kpi label="Written off" value={kpis?.written_off_count ?? 0} tone={(kpis?.written_off_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Recovery sought" value={fmtZarM(kpis?.total_recovery_zar_m)} />
        <Kpi label="Recovered value" value={fmtZarM(kpis?.recovered_zar_m)} tone="ok" />
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Case #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Component / OEM</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Defect</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Recovery</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.recovery_tier];
                const dt = DEFECT_TONE[r.defect_class];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.case_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[260px] truncate" title={`${r.component_type ?? ''} · ${r.oem_name ?? ''} · ${r.product_model ?? ''}`}>
                      {r.component_type ?? '—'}
                      <span className="text-[#4a5568]"> · {r.oem_name ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: dt.bg, color: dt.fg }}>
                        {dt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'oklch(0.46 0.16 55)' }}>{fmtZarM(r.recovery_zar_m)}</td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No recovery claims match.</td></tr>
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
  row: RecoveryRow;
  events: RecoveryEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: RecoveryRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canReject = row.chain_status === 'assessment_complete';
  const canDispute = row.chain_status === 'assessment_complete' || row.chain_status === 'recovery_pending';
  const canWriteOff = row.chain_status === 'disputed';
  const canWithdraw = WITHDRAW_STATES.includes(row.chain_status);

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
              <div className="text-base font-semibold text-[#0c2a4d]">{row.component_type ?? 'Component'} · {row.oem_name ?? 'OEM'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {DEFECT_TONE[row.defect_class].label} defect
                {` · ${TIER_TONE[row.recovery_tier].label}`}
                {` · ${fmtZarM(row.recovery_zar_m)}`}
                {row.asset_name ? ` · ${row.asset_name}` : ''}
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
            <Pair label="State"            value={STATE_TONE[row.chain_status].label} />
            <Pair label="Recovery tier"    value={TIER_TONE[row.recovery_tier].label} />
            <Pair label="Defect class"     value={DEFECT_TONE[row.defect_class].label} />
            <Pair label="Failure mode"     value={row.failure_mode ?? '—'} />
            <Pair label="Claimant"         value={row.claimant_party_name} />
            <Pair label="OEM / supplier"   value={row.oem_party_name} />
            <Pair label="Assessor"         value={row.assessor_party_name ?? '—'} />
            <Pair label="Asset / site"     value={row.asset_name ?? '—'} />
            <Pair label="Component"        value={row.component_type ?? '—'} />
            <Pair label="OEM brand"        value={row.oem_name ?? '—'} />
            <Pair label="Product model"    value={row.product_model ?? '—'} />
            <Pair label="Serial / batch"   value={row.serial_or_batch_ref ?? '—'} />
            <Pair label="Warranty ref"     value={row.warranty_ref ?? '—'} />
            <Pair label="Warranty expiry"  value={row.warranty_expiry ?? '—'} />
            <Pair label="Units affected"   value={row.units_affected != null ? String(row.units_affected) : '—'} />
            <Pair label="Fleet size"       value={row.fleet_size != null ? String(row.fleet_size) : '—'} />
            <Pair label="Repair cost"      value={fmtZarM(row.repair_cost_zar_m)} />
            <Pair label="Replacement cost" value={fmtZarM(row.replacement_cost_zar_m)} />
            <Pair label="Lost generation"  value={fmtZarM(row.lost_generation_zar_m)} />
            <Pair label="Claimed"          value={fmtZarM(row.claimed_zar_m)} />
            <Pair label="Recovery sought"  value={fmtZarM(row.recovery_zar_m)} />
            <Pair label="Recovered"        value={fmtZarM(row.recovered_zar_m)} />
            <Pair label="Recovery method"  value={row.recovery_method ?? '—'} />
            <Pair label="Regulator ref"    value={row.regulator_ref ?? '—'} />
            <Pair label="Reason code"      value={row.reason_code ?? '—'} />
            <Pair label="Dispute round"    value={String(row.dispute_round ?? 0)} />
            <Pair label="Drafted"          value={fmtDate(row.claim_drafted_at)} />
            <Pair label="Submitted"        value={fmtDate(row.submitted_to_oem_at)} />
            <Pair label="Acknowledged"     value={fmtDate(row.oem_acknowledged_at)} />
            <Pair label="Assessment began" value={fmtDate(row.under_assessment_at)} />
            <Pair label="Assessed"         value={fmtDate(row.assessment_complete_at)} />
            <Pair label="Approved"         value={fmtDate(row.approved_at)} />
            <Pair label="Recovery began"   value={fmtDate(row.recovery_pending_at)} />
            <Pair label="Recovered at"     value={fmtDate(row.recovered_at)} />
            <Pair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"       value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"   value={String(row.escalation_level)} />
            <Pair label="Reportable"       value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.defect_description && (
            <BasisBlock label="Defect description" tone="oklch(0.46 0.16 55)" text={row.defect_description} />
          )}
          {row.submission_basis && (
            <BasisBlock label="Submission basis" tone="oklch(0.46 0.16 55)" text={row.submission_basis} />
          )}
          {row.acknowledgement_basis && (
            <BasisBlock label="Acknowledgement basis" tone="oklch(0.46 0.16 55)" text={row.acknowledgement_basis} />
          )}
          {row.assessment_basis && (
            <BasisBlock label="Assessment basis" tone="#a06200" text={row.assessment_basis} />
          )}
          {row.approval_basis && (
            <BasisBlock label="Approval basis" tone="#1f6b3a" text={row.approval_basis} />
          )}
          {row.rejection_basis && (
            <BasisBlock label="Rejection basis" tone="#9b1f1f" text={row.rejection_basis} />
          )}
          {row.dispute_basis && (
            <BasisBlock label="Dispute basis" tone="#9b1f1f" text={row.dispute_basis} />
          )}
          {row.resolution_basis && (
            <BasisBlock label="Resolution basis" tone="#1f6b3a" text={row.resolution_basis} />
          )}
          {row.recovery_basis && (
            <BasisBlock label="Recovery basis" tone="#1f6b3a" text={row.recovery_basis} />
          )}
          {row.writeoff_basis && (
            <BasisBlock label="Write-off basis" tone="#9b1f1f" text={row.writeoff_basis} />
          )}
          {row.withdrawal_basis && (
            <BasisBlock label="Withdrawal basis" tone="#557" text={row.withdrawal_basis} />
          )}
        </section>

        {(nextAction || canReject || canDispute || canWriteOff || canWithdraw) && (
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
                  onClick={() => onAct('reject-claim', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject-claim']}
                </button>
              )}
              {canDispute && (
                <button type="button"
                  onClick={() => onAct('dispute', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['dispute']}
                </button>
              )}
              {canWriteOff && (
                <button type="button"
                  onClick={() => onAct('write-off', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['write-off']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[#f3f5f9]"
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
