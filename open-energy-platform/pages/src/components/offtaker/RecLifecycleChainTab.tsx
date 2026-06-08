// Wave 70 — REC / Guarantee-of-Origin Certificate Lifecycle tab.
//
// A best-in-class offtaker does not just buy electricity — it buys (and must be
// able to PROVE it owns and has CONSUMED) the renewable ATTRIBUTE of that
// electricity. The attribute travels separately from the energy as a tradeable
// certificate, one per MWh of verified renewable generation (I-REC, SAREC / AReP,
// EU Guarantee-of-Origin). The offtaker RETIRES the certificate to substantiate a
// renewable-consumption claim under the GHG Protocol Scope 2 market-based method
// (RE100 / CDP / carbon-tax offset). The lifecycle integrity prevents DOUBLE
// COUNTING — one MWh attribute is issued once, owned by one party at a time, and
// retired once. Distinct from the rest of the offtaker suite, which all govern the
// ENERGY / MONEY relationship (W22 PPA exec, W32 take-or-pay, W39 tariff CPI, W46
// curtailment, W54 payment security, W62 termination); W70 governs the ATTRIBUTE.
//
//   issuance_requested → eligibility_review → issued → listed_for_transfer
//     → transferred → allocated → retired
//   eligibility fail:  eligibility_review → rejected
//   dispute:   {transferred, allocated} → disputed → allocated (dismissed)
//                                                  | clawed_back (upheld)
//   cancel:    {issuance_requested, issued, listed_for_transfer} → cancelled
//   expiry:    {issued, listed_for_transfer, transferred, allocated} → expired
//
// INVERTED SLA — the LARGER the volume / the more it is a compliance claim, the
// MORE time each verification window allows. Tier (5) by MWh represented with a
// compliance floor at major. Two-party write: the ISSUER / REGISTRY (generator +
// registry) drives issuance, eligibility, listing, transfer, dispute resolution,
// claw-back, cancel and expiry; the HOLDER (offtaker) allocates consumption,
// retires the certificate and raises integrity disputes. The W70 signature — a
// CLAWED-BACK certificate crosses to the regulator for EVERY tier (always a
// double-counting / integrity event); a rejected issuance and an SLA breach cross
// for the high tiers (major + critical).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'issuance_requested' | 'eligibility_review' | 'issued' | 'listed_for_transfer'
  | 'transferred' | 'allocated' | 'retired' | 'cancelled'
  | 'rejected' | 'disputed' | 'clawed_back' | 'expired';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

interface RecRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  generator_id: string | null;
  generator_name: string | null;
  project_id: string | null;
  project_name: string | null;
  offtaker_id: string;
  offtaker_name: string;
  certificate_standard: string;
  energy_source: string | null;
  certificate_serial: string | null;
  vintage_year: number | null;
  generation_period_start: string | null;
  generation_period_end: string | null;
  mwh_represented: number | null;
  registry: string | null;
  claim_purpose: string | null;
  compliance_critical: number;
  double_counting_checked: number;
  severity_tier: Tier;
  issuer_id: string | null;
  issuer_name: string | null;
  holder_id: string | null;
  holder_name: string | null;
  issuance_ref: string | null;
  eligibility_ref: string | null;
  transfer_ref: string | null;
  allocation_ref: string | null;
  retirement_ref: string | null;
  dispute_ref: string | null;
  claim_certificate_number: string | null;
  eligibility_basis: string | null;
  issuance_basis: string | null;
  transfer_basis: string | null;
  allocation_basis: string | null;
  retirement_basis: string | null;
  dispute_basis: string | null;
  clawback_basis: string | null;
  rejection_basis: string | null;
  reason_code: string | null;
  resolution_summary: string | null;
  chain_status: ChainStatus;
  issuance_requested_at: string;
  eligibility_review_at: string | null;
  issued_at: string | null;
  listed_for_transfer_at: string | null;
  transferred_at: string | null;
  allocated_at: string | null;
  retired_at: string | null;
  cancelled_at: string | null;
  rejected_at: string | null;
  disputed_at: string | null;
  clawed_back_at: string | null;
  expired_at: string | null;
  vintage_expiry_at: string | null;
  dispute_round: number;
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

interface RecEvent {
  id: string;
  rec_id: string;
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
  issued_count: number;
  retired_count: number;
  disputed_count: number;
  clawed_back_count: number;
  rejected_count: number;
  expired_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  compliance_open: number;
  high_open: number;
  total_mwh: number;
  retired_mwh: number;
  clawed_back_mwh: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  issuance_requested:  { bg: '#e3e7ec', fg: '#557',    label: 'Issuance requested' },
  eligibility_review:  { bg: '#fff4d6', fg: '#a06200', label: 'Eligibility review' },
  issued:              { bg: '#dbecfb', fg: '#1a3a5c', label: 'Issued' },
  listed_for_transfer: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Listed for transfer' },
  transferred:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Transferred' },
  allocated:           { bg: '#cfe8e0', fg: '#0d5c47', label: 'Allocated' },
  retired:             { bg: '#d4edda', fg: '#155724', label: 'Retired' },
  cancelled:           { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
  rejected:            { bg: '#f8d0d0', fg: '#6b1f1f', label: 'Rejected' },
  disputed:            { bg: '#fde0e0', fg: '#9b1f1f', label: 'Disputed' },
  clawed_back:         { bg: '#f3c0c0', fg: '#5a1818', label: 'Clawed back' },
  expired:             { bg: '#e3e7ec', fg: '#557',    label: 'Expired' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<1k MWh)' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate (<10k MWh)' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material (<50k MWh)' },
  major:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major (<200k MWh)' },
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical (≥200k MWh)' },
};

const STANDARD_LABEL: Record<string, string> = {
  i_rec:               'I-REC',
  sarec:               'SAREC',
  arep:                'AReP',
  guarantee_of_origin: 'Guarantee of Origin',
  other:               'Other',
};

const SOURCE_LABEL: Record<string, string> = {
  solar_pv: 'Solar PV',
  wind:     'Wind',
  hydro:    'Hydro',
  biomass:  'Biomass',
  biogas:   'Biogas',
  csp:      'CSP',
  other:    'Other',
};

const REGISTRY_LABEL: Record<string, string> = {
  i_rec_registry:    'I-REC Registry',
  national_registry: 'National registry',
  strate:            'STRATE',
  contractual:       'Contractual',
  other:             'Other',
};

const PURPOSE_LABEL: Record<string, string> = {
  re100:                 'RE100',
  scope2_market_based:   'Scope 2 (market-based)',
  carbon_tax_offset:     'Carbon-tax offset',
  voluntary:             'Voluntary',
  compliance_obligation: 'Compliance obligation',
  other:                 'Other',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                label: 'Open' },
  { key: 'all',                 label: 'All' },
  { key: 'minor',               label: 'Minor' },
  { key: 'moderate',            label: 'Moderate' },
  { key: 'material',            label: 'Material' },
  { key: 'major',               label: 'Major' },
  { key: 'critical',            label: 'Critical' },
  { key: 'issuance_requested',  label: 'Requested' },
  { key: 'eligibility_review',  label: 'Eligibility' },
  { key: 'issued',              label: 'Issued' },
  { key: 'listed_for_transfer', label: 'Listed' },
  { key: 'transferred',         label: 'Transferred' },
  { key: 'allocated',           label: 'Allocated' },
  { key: 'disputed',            label: 'Disputed' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'reportable',          label: 'Reportable' },
  { key: 'retired',             label: 'Retired' },
  { key: 'clawed_back',         label: 'Clawed back' },
  { key: 'rejected',            label: 'Rejected' },
  { key: 'expired',             label: 'Expired' },
  { key: 'cancelled',           label: 'Cancelled' },
];

type ActionKind =
  | 'begin-eligibility-review' | 'approve-issuance' | 'reject-issuance' | 'list-for-transfer'
  | 'transfer-certificate' | 'allocate-consumption' | 'retire-certificate' | 'raise-dispute'
  | 'resolve-dispute' | 'claw-back' | 'cancel-certificate' | 'expire-certificate';

// Allowed actions per state, primary forward action first. Mirrors the spec
// TRANSITIONS map so the UI never offers an invalid step.
const ALLOWED_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  issuance_requested:  ['begin-eligibility-review', 'cancel-certificate'],
  eligibility_review:  ['approve-issuance', 'reject-issuance'],
  issued:              ['list-for-transfer', 'cancel-certificate', 'expire-certificate'],
  listed_for_transfer: ['transfer-certificate', 'cancel-certificate', 'expire-certificate'],
  transferred:         ['allocate-consumption', 'raise-dispute', 'expire-certificate'],
  allocated:           ['retire-certificate', 'raise-dispute', 'expire-certificate'],
  disputed:            ['resolve-dispute', 'claw-back'],
  retired:             [],
  cancelled:           [],
  rejected:            [],
  clawed_back:         [],
  expired:             [],
};

// Party annotation per action. The issuer / registry (generator side) drives
// issuance, listing, transfer, dispute resolution, claw-back, cancel and expiry;
// the holder (offtaker) allocates consumption, retires and raises integrity disputes.
const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-eligibility-review': 'Begin eligibility review (issuer/registry)',
  'approve-issuance':         'Approve issuance (issuer/registry)',
  'reject-issuance':          'Reject — eligibility fail (issuer/registry)',
  'list-for-transfer':        'List for transfer (issuer/registry)',
  'transfer-certificate':     'Transfer certificate (issuer/registry)',
  'allocate-consumption':     'Allocate consumption (offtaker/holder)',
  'retire-certificate':       'Retire certificate (offtaker/holder)',
  'raise-dispute':            'Raise integrity dispute (offtaker/holder)',
  'resolve-dispute':          'Resolve dispute — restore (issuer/registry)',
  'claw-back':                'Claw back — revoke (issuer/registry)',
  'cancel-certificate':       'Cancel certificate (issuer/registry)',
  'expire-certificate':       'Expire — vintage lapse (issuer/registry)',
};

const ACTION_TONE: Record<ActionKind, 'primary' | 'danger' | 'warn' | 'good' | 'muted'> = {
  'begin-eligibility-review': 'primary',
  'approve-issuance':         'good',
  'reject-issuance':          'danger',
  'list-for-transfer':        'primary',
  'transfer-certificate':     'primary',
  'allocate-consumption':     'good',
  'retire-certificate':       'good',
  'raise-dispute':            'warn',
  'resolve-dispute':          'good',
  'claw-back':                'danger',
  'cancel-certificate':       'muted',
  'expire-certificate':       'muted',
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

function fmtMwh(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}m MWh`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k MWh`;
  return `${n.toLocaleString('en-ZA')} MWh`;
}

const TERMINAL_STATES: ChainStatus[] = ['retired', 'cancelled', 'rejected', 'clawed_back', 'expired'];

export function RecLifecycleChainTab() {
  const [rows, setRows] = useState<RecRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<RecRow | null>(null);
  const [events, setEvents] = useState<RecEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RecRow[] } & KpiSummary }>('/rec-lifecycle/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, issued_count: d.issued_count,
          retired_count: d.retired_count, disputed_count: d.disputed_count,
          clawed_back_count: d.clawed_back_count, rejected_count: d.rejected_count,
          expired_count: d.expired_count, cancelled_count: d.cancelled_count,
          breached: d.breached, reportable_total: d.reportable_total,
          compliance_open: d.compliance_open, high_open: d.high_open,
          total_mwh: d.total_mwh, retired_mwh: d.retired_mwh, clawed_back_mwh: d.clawed_back_mwh,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load REC certificates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: RecRow; events: RecEvent[] } }>(
        `/rec-lifecycle/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load certificate history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'minor' || filter === 'moderate' || filter === 'material' || filter === 'major' || filter === 'critical') {
        return r.severity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: RecRow) => {
    try {
      let body: Record<string, string | number | boolean> = {};
      if (action === 'begin-eligibility-review') {
        const basis = window.prompt('Eligibility basis — accreditation / vintage / metering check on the generation:');
        if (!basis) return;
        const ref = window.prompt('Eligibility reference (e.g. ELG-2026-0011):') || '';
        const mwh = window.prompt('MWh represented (restate certified volume):', String(row.mwh_represented ?? ''));
        const comp = window.confirm('Compliance / regulatory claim (carbon-tax offset / mandated obligation)? OK = yes, Cancel = no');
        body = { eligibility_basis: basis, compliance_critical: comp };
        if (ref) body.eligibility_ref = ref;
        if (mwh && !Number.isNaN(Number(mwh))) body.mwh_represented = Number(mwh);
      } else if (action === 'approve-issuance') {
        const basis = window.prompt('Issuance basis — the registry issuing the certificate against verified generation:');
        if (!basis) return;
        const ref = window.prompt('Issuance reference (e.g. ISS-2026-0011):') || '';
        const serial = window.prompt('Certificate serial (registry-assigned):', row.certificate_serial ?? '') || '';
        body = { issuance_basis: basis };
        if (ref) body.issuance_ref = ref;
        if (serial) body.certificate_serial = serial;
      } else if (action === 'reject-issuance') {
        const basis = window.prompt('Rejection basis — why eligibility failed (accreditation / vintage / metering):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. eligibility_fail / vintage_lapsed / metering_gap):') || '';
        body = { rejection_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'list-for-transfer') {
        const basis = window.prompt('Listing basis — putting the issued certificate up for transfer to the offtaker:');
        if (!basis) return;
        body = { transfer_basis: basis };
      } else if (action === 'transfer-certificate') {
        const basis = window.prompt('Transfer basis — moving ownership of the certificate to the holder:');
        if (!basis) return;
        const ref = window.prompt('Transfer reference (e.g. TRF-2026-0011):') || '';
        const hid = window.prompt('Holder id (the offtaker now owning the certificate):', row.holder_id ?? '') || '';
        const hname = window.prompt('Holder name:', row.holder_name ?? row.offtaker_name ?? '') || '';
        body = { transfer_basis: basis };
        if (ref) body.transfer_ref = ref;
        if (hid) body.holder_id = hid;
        if (hname) body.holder_name = hname;
      } else if (action === 'allocate-consumption') {
        const basis = window.prompt('Allocation basis — matching the certificate to a consumption period / reporting boundary:');
        if (!basis) return;
        const ref = window.prompt('Allocation reference (e.g. ALC-2026-0011):') || '';
        body = { allocation_basis: basis };
        if (ref) body.allocation_ref = ref;
      } else if (action === 'retire-certificate') {
        const basis = window.prompt('Retirement basis — the renewable-consumption claim being substantiated (RE100 / Scope 2 / carbon-tax):');
        if (!basis) return;
        const ref = window.prompt('Retirement reference (e.g. RET-2026-0011):') || '';
        const claim = window.prompt('Claim certificate number (the retirement claim record):') || '';
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { retirement_basis: basis };
        if (ref) body.retirement_ref = ref;
        if (claim) body.claim_certificate_number = claim;
        if (summary) body.resolution_summary = summary;
      } else if (action === 'raise-dispute') {
        const basis = window.prompt('Dispute basis — the integrity challenge (double counting / wrong vintage / metering error):');
        if (!basis) return;
        const ref = window.prompt('Dispute reference (e.g. DSP-2026-0011):') || '';
        const reason = window.prompt('Reason code (e.g. double_counting / vintage_mismatch / metering_error):') || '';
        body = { dispute_basis: basis };
        if (ref) body.dispute_ref = ref;
        if (reason) body.reason_code = reason;
      } else if (action === 'resolve-dispute') {
        const basis = window.prompt('Resolution basis — dismissing the dispute and restoring the certificate to allocated:');
        if (!basis) return;
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { dispute_basis: basis };
        if (summary) body.resolution_summary = summary;
      } else if (action === 'claw-back') {
        const basis = window.prompt('Claw-back basis — upholding the dispute and revoking the certificate (double-counting / fraud):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. double_counting / fraudulent_issuance / metering_void):') || '';
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { clawback_basis: basis };
        if (reason) body.reason_code = reason;
        if (summary) body.resolution_summary = summary;
      } else if (action === 'cancel-certificate') {
        const reason = window.prompt('Cancellation reason — certificate withdrawn before issuance / listing (voluntary):');
        if (!reason) return;
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { reason_code: reason };
        if (summary) body.resolution_summary = summary;
      } else if (action === 'expire-certificate') {
        const reason = window.prompt('Expiry reason — the certificate vintage has lapsed (no longer claimable):');
        if (!reason) return;
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { reason_code: reason };
        if (summary) body.resolution_summary = summary;
      }
      await api.post(`/rec-lifecycle/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">REC / Guarantee-of-Origin certificate lifecycle</h2>
          <p className="text-xs text-[#4a5568]">
            12-state renewable-attribute certificate chain (I-REC Standard · SAREC / AReP · EU Guarantee-of-Origin
            · GHG Protocol Scope 2 market-based method) · requested → eligibility → issued → listed → transferred
            → allocated → retired. The offtaker retires the certificate to substantiate a renewable-consumption
            claim (RE100 / CDP / carbon-tax offset); the lifecycle integrity prevents DOUBLE COUNTING — one MWh
            attribute is issued once, owned by one party at a time, and retired once. A failed eligibility review
            rejects the issuance; a post-issuance integrity challenge sends the certificate to dispute, then either
            restored (dismissed) or clawed back (revoked). INVERTED SLA: the larger the volume / the more it is a
            compliance claim, the more time each verification window allows. Tier by MWh represented with a
            compliance floor at major. Two-party write — the issuer / registry drives issuance, listing, transfer,
            dispute resolution, claw-back, cancel and expiry; the holder (offtaker) allocates consumption, retires
            and raises integrity disputes. The W70 signature — a CLAWED-BACK certificate crosses to the regulator
            for every tier (always a double-counting / integrity event); a rejected issuance and an SLA breach
            cross for major + critical.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Compliance open" value={kpis?.compliance_open ?? 0} tone={(kpis?.compliance_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="High open" value={kpis?.high_open ?? 0} tone={(kpis?.high_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Issued" value={kpis?.issued_count ?? 0} tone="ok" />
        <Kpi label="Retired" value={kpis?.retired_count ?? 0} tone="ok" />
        <Kpi label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Clawed back" value={kpis?.clawed_back_count ?? 0} tone={(kpis?.clawed_back_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Retired MWh" value={fmtMwh(kpis?.retired_mwh ?? 0)} tone="ok" />
        <Kpi label="Total MWh" value={fmtMwh(kpis?.total_mwh ?? 0)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Case #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Offtaker</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Standard</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">MWh</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.severity_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.case_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to the regulator">●</span>}
                      {r.compliance_critical ? <span className="ml-1 text-[#8a4a00]" title="Compliance / regulatory claim">★</span> : null}
                      {r.double_counting_checked ? <span className="ml-1 text-[#0d5c47]" title="Double-counting check complete">⊘</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[180px] truncate" title={r.offtaker_name}>
                      {r.offtaker_name}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{STANDARD_LABEL[r.certificate_standard] ?? r.certificate_standard}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {fmtMwh(r.mwh_represented)}
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No certificates match.</td></tr>
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

const BTN_CLASS: Record<'primary' | 'danger' | 'warn' | 'good' | 'muted', string> = {
  primary: 'rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]',
  danger:  'rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 hover:bg-red-50',
  warn:    'rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50',
  good:    'rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-green-800 hover:bg-green-50',
  muted:   'rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]',
};

function Drawer({
  row, events, onClose, onAct,
}: {
  row: RecRow;
  events: RecEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: RecRow) => void;
}) {
  const actions = ALLOWED_ACTIONS[row.chain_status] || [];

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
              <div className="text-base font-semibold text-[#0c2a4d]">
                {row.offtaker_name}
                {row.compliance_critical ? <span className="ml-2 text-[#8a4a00]" title="Compliance / regulatory claim">★ Compliance</span> : null}
              </div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.severity_tier].label}
                {` · ${STANDARD_LABEL[row.certificate_standard] ?? row.certificate_standard}`}
                {row.energy_source ? ` · ${SOURCE_LABEL[row.energy_source] ?? row.energy_source}` : ''}
                {row.registry ? ` · ${REGISTRY_LABEL[row.registry] ?? row.registry}` : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.issuer_name || row.generator_name || 'Issuer/registry'} → {row.holder_name || row.offtaker_name}
                {row.dispute_round > 0 ? ` · dispute round ${row.dispute_round}` : ''}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
              {row.generator_name && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Generator {row.generator_name}{row.project_name ? ` · ${row.project_name}` : ''}
                </div>
              )}
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
            <Pair label="Tier"                 value={TIER_TONE[row.severity_tier].label} />
            <Pair label="Standard"             value={STANDARD_LABEL[row.certificate_standard] ?? row.certificate_standard} />
            <Pair label="Energy source"        value={row.energy_source ? (SOURCE_LABEL[row.energy_source] ?? row.energy_source) : '—'} />
            <Pair label="Registry"             value={row.registry ? (REGISTRY_LABEL[row.registry] ?? row.registry) : '—'} />
            <Pair label="Claim purpose"        value={row.claim_purpose ? (PURPOSE_LABEL[row.claim_purpose] ?? row.claim_purpose) : '—'} />
            <Pair label="MWh represented"      value={fmtMwh(row.mwh_represented)} />
            <Pair label="Vintage year"         value={row.vintage_year != null ? String(row.vintage_year) : '—'} />
            <Pair label="Generation period"    value={row.generation_period_start ? `${fmtDate(row.generation_period_start)} → ${fmtDate(row.generation_period_end)}` : '—'} />
            <Pair label="Certificate serial"   value={row.certificate_serial ?? '—'} />
            <Pair label="Compliance claim"     value={row.compliance_critical ? 'Yes' : 'No'} />
            <Pair label="Double-counting check" value={row.double_counting_checked ? 'Complete' : 'Pending'} />
            <Pair label="Issuance ref"         value={row.issuance_ref ?? '—'} />
            <Pair label="Eligibility ref"      value={row.eligibility_ref ?? '—'} />
            <Pair label="Transfer ref"         value={row.transfer_ref ?? '—'} />
            <Pair label="Allocation ref"       value={row.allocation_ref ?? '—'} />
            <Pair label="Retirement ref"       value={row.retirement_ref ?? '—'} />
            <Pair label="Dispute ref"          value={row.dispute_ref ?? '—'} />
            <Pair label="Claim certificate #"  value={row.claim_certificate_number ?? '—'} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Dispute round"        value={String(row.dispute_round)} />
            <Pair label="Requested"            value={fmtDate(row.issuance_requested_at)} />
            <Pair label="Eligibility review"   value={fmtDate(row.eligibility_review_at)} />
            <Pair label="Issued"               value={fmtDate(row.issued_at)} />
            <Pair label="Listed"               value={fmtDate(row.listed_for_transfer_at)} />
            <Pair label="Transferred"          value={fmtDate(row.transferred_at)} />
            <Pair label="Allocated"            value={fmtDate(row.allocated_at)} />
            <Pair label="Retired"              value={fmtDate(row.retired_at)} />
            <Pair label="Disputed"             value={fmtDate(row.disputed_at)} />
            <Pair label="Clawed back"          value={fmtDate(row.clawed_back_at)} />
            <Pair label="Rejected"             value={fmtDate(row.rejected_at)} />
            <Pair label="Expired"              value={fmtDate(row.expired_at)} />
            <Pair label="Vintage expiry"       value={fmtDate(row.vintage_expiry_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.resolution_summary && (
            <BasisBlock label="Resolution summary" tone="#1a3a5c" text={row.resolution_summary} />
          )}
          {row.eligibility_basis && (
            <BasisBlock label="Eligibility basis" tone="#a06200" text={row.eligibility_basis} />
          )}
          {row.issuance_basis && (
            <BasisBlock label="Issuance basis" tone="#1a3a5c" text={row.issuance_basis} />
          )}
          {row.transfer_basis && (
            <BasisBlock label="Transfer / listing basis" tone="#8a4a00" text={row.transfer_basis} />
          )}
          {row.allocation_basis && (
            <BasisBlock label="Allocation basis (holder)" tone="#0d5c47" text={row.allocation_basis} />
          )}
          {row.retirement_basis && (
            <BasisBlock label="Retirement basis (holder)" tone="#155724" text={row.retirement_basis} />
          )}
          {row.dispute_basis && (
            <BasisBlock label="Dispute basis" tone="#9b1f1f" text={row.dispute_basis} />
          )}
          {row.clawback_basis && (
            <BasisBlock label="Claw-back basis" tone="#5a1818" text={row.clawback_basis} />
          )}
          {row.rejection_basis && (
            <BasisBlock label="Rejection basis" tone="#6b1f1f" text={row.rejection_basis} />
          )}
        </section>

        {actions.length > 0 && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {actions.map((a, idx) => (
                <button type="button"
                  key={a}
                  onClick={() => onAct(a, row)}
                  className={idx === 0 ? BTN_CLASS.primary : BTN_CLASS[ACTION_TONE[a]]}
                >
                  {ACTION_LABEL[a]}
                </button>
              ))}
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
