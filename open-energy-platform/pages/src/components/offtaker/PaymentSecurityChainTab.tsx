// Wave 54 — Offtaker PPA Payment Security / Credit Support Instrument lifecycle tab.
//
// 12-state P6 chain on oe_ppa_payment_securities — the financial-assurance
// backbone of a bankable PPA. The BUYER (offtaker) posts and maintains a payment-
// security instrument (letter of credit / on-demand bank guarantee / parent
// guarantee) sized to its rolling payment exposure; the SELLER (IPP beneficiary or
// facility agent) verifies it, activates it, runs periodic adequacy review, draws
// down on a buyer payment default, forfeits an un-replenished instrument, and
// releases it at PPA term. The buyer-side credit-support counterpart to the
// seller-side bonds in W10.
//
// URGENT SLA — the larger the secured exposure, the TIGHTER every window.
// Reportability (the W54 signature):
//   • forfeit crosses the regulator for EVERY tier (security-of-supply red flag)
//   • initiate_drawdown + reject_instrument cross for major + critical only
//   • SLA breaches cross for major + critical only
//
// Two-party split write: the offtaker posts / re-posts the instrument
// (submit-instrument); the seller administers everything else. actor_party
// (offtaker / seller) is derived from the action.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'security_required' | 'instrument_submitted' | 'under_verification'
  | 'active' | 'adequacy_review' | 'drawdown_initiated'
  | 'replenishment_pending' | 'expiry_pending' | 'substitution_pending'
  | 'released' | 'forfeited' | 'rejected';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

interface SecurityRow {
  id: string;
  security_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  offtaker_party_id: string;
  offtaker_party_name: string;
  seller_party_name: string | null;
  agent_name: string | null;
  security_tier: Tier;
  instrument_name: string;
  instrument_type: string | null;
  issuer_name: string | null;
  issuer_rating: string | null;
  secured_amount_zar_m: number | null;
  required_amount_zar_m: number | null;
  cover_months: number | null;
  ppa_id: string | null;
  ppa_reference: string | null;
  project_id: string | null;
  project_name: string | null;
  sector: string | null;
  expiry_date: string | null;
  drawn_amount_zar_m: number | null;
  outstanding_invoice_zar_m: number | null;
  replenishment_due_zar_m: number | null;
  adequacy_shortfall_zar_m: number | null;
  drawdown_count: number;
  submission_ref: string | null;
  verification_ref: string | null;
  activation_ref: string | null;
  adequacy_ref: string | null;
  drawdown_ref: string | null;
  replenishment_ref: string | null;
  expiry_ref: string | null;
  release_ref: string | null;
  forfeit_ref: string | null;
  reject_ref: string | null;
  regulator_ref: string | null;
  submission_basis: string | null;
  verification_basis: string | null;
  activation_basis: string | null;
  adequacy_basis: string | null;
  drawdown_basis: string | null;
  replenishment_basis: string | null;
  expiry_basis: string | null;
  release_basis: string | null;
  forfeit_basis: string | null;
  reason_code: string | null;
  decision_notes: string | null;
  notes: string | null;
  chain_status: ChainStatus;
  security_required_at: string;
  instrument_submitted_at: string | null;
  under_verification_at: string | null;
  active_at: string | null;
  adequacy_review_at: string | null;
  drawdown_initiated_at: string | null;
  replenishment_pending_at: string | null;
  expiry_pending_at: string | null;
  substitution_pending_at: string | null;
  released_at: string | null;
  forfeited_at: string | null;
  rejected_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_reportable?: boolean;
  is_large_tier?: boolean;
}

interface SecurityEvent {
  id: string;
  security_id: string;
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
  active_count: number;
  released_count: number;
  forfeited_count: number;
  rejected_count: number;
  drawdown_open_count: number;
  breached: number;
  reportable_total: number;
  large_exposure_open: number;
  total_secured_zar_m: number;
  total_required_zar_m: number;
  active_secured_zar_m: number;
  total_drawn_zar_m: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  security_required:     { bg: '#e3e7ec', fg: '#557',    label: 'Security required' },
  instrument_submitted:  { bg: '#dbecfb', fg: '#1a3a5c', label: 'Instrument submitted' },
  under_verification:    { bg: '#fff4d6', fg: '#a06200', label: 'Under verification' },
  active:                { bg: '#d4edda', fg: '#155724', label: 'Active' },
  adequacy_review:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Adequacy review' },
  drawdown_initiated:    { bg: '#ffe4e1', fg: '#a04040', label: 'Drawdown initiated' },
  replenishment_pending: { bg: '#fff4d6', fg: '#a06200', label: 'Replenishment pending' },
  expiry_pending:        { bg: '#fff4d6', fg: '#a06200', label: 'Expiry pending' },
  substitution_pending:  { bg: '#fff4d6', fg: '#a06200', label: 'Substitution pending' },
  released:              { bg: '#daf5e2', fg: '#1f6b3a', label: 'Released' },
  forfeited:             { bg: '#fde0e0', fg: '#9b1f1f', label: 'Forfeited' },
  rejected:              { bg: '#ede0e0', fg: '#6b3a3a', label: 'Rejected' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate' },
  material: { bg: '#fff4d6', fg: '#8a4a00', label: 'Material' },
  major:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major' },
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active_open',           label: 'Open' },
  { key: 'all',                   label: 'All' },
  { key: 'minor',                 label: 'Minor' },
  { key: 'moderate',              label: 'Moderate' },
  { key: 'material',              label: 'Material' },
  { key: 'major',                 label: 'Major' },
  { key: 'critical',              label: 'Critical' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'security_required',     label: 'Required' },
  { key: 'instrument_submitted',  label: 'Submitted' },
  { key: 'under_verification',    label: 'Verifying' },
  { key: 'active',                label: 'Active' },
  { key: 'adequacy_review',       label: 'Adequacy' },
  { key: 'drawdown_initiated',    label: 'Drawdown' },
  { key: 'replenishment_pending', label: 'Replenish' },
  { key: 'expiry_pending',        label: 'Expiry' },
  { key: 'substitution_pending',  label: 'Substitution' },
  { key: 'released',              label: 'Released' },
  { key: 'forfeited',             label: 'Forfeited' },
  { key: 'rejected',              label: 'Rejected' },
];

type ActionKind =
  | 'submit-instrument' | 'begin-verification' | 'activate' | 'reject-instrument'
  | 'open-adequacy-review' | 'confirm-adequate' | 'require-increase'
  | 'initiate-drawdown' | 'open-replenishment' | 'flag-expiry'
  | 'forfeit' | 'release';

// Primary forward action per state. `active` is a steady state with a fan-out
// of branches (adequacy / drawdown / expiry / release) all surfaced in the
// drawer, so it has no single "next".
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  security_required:     'submit-instrument',
  instrument_submitted:  'begin-verification',
  under_verification:    'activate',
  active:                null,
  adequacy_review:       'confirm-adequate',
  drawdown_initiated:    'open-replenishment',
  replenishment_pending: 'submit-instrument',
  expiry_pending:        'submit-instrument',
  substitution_pending:  'submit-instrument',
  released:              null,
  forfeited:             null,
  rejected:              null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'submit-instrument':    'Submit / re-post instrument (offtaker)',
  'begin-verification':   'Begin verification (seller)',
  'activate':             'Activate (seller)',
  'reject-instrument':    'Reject instrument (seller)',
  'open-adequacy-review': 'Open adequacy review (seller)',
  'confirm-adequate':     'Confirm adequate (seller)',
  'require-increase':     'Require increase → substitute (seller)',
  'initiate-drawdown':    'Initiate drawdown (seller)',
  'open-replenishment':   'Open replenishment (seller)',
  'flag-expiry':          'Flag expiry (seller)',
  'forfeit':              'Forfeit security (seller)',
  'release':              'Release at PPA term (seller)',
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

function fmtDay(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-ZA', { dateStyle: 'medium' });
}

// Amounts are stored in ZAR millions.
function fmtZarM(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1000) return `R${(n / 1000).toFixed(2)}bn`;
  return `R${n.toFixed(1)}m`;
}

const TERMINAL_STATES: ChainStatus[] = ['released', 'forfeited', 'rejected'];

export function PaymentSecurityChainTab() {
  const [rows, setRows] = useState<SecurityRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active_open');
  const [selected, setSelected] = useState<SecurityRow | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: SecurityRow[] } & KpiSummary }>('/payment-security/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, active_count: d.active_count,
          released_count: d.released_count, forfeited_count: d.forfeited_count,
          rejected_count: d.rejected_count, drawdown_open_count: d.drawdown_open_count,
          breached: d.breached, reportable_total: d.reportable_total,
          large_exposure_open: d.large_exposure_open,
          total_secured_zar_m: d.total_secured_zar_m, total_required_zar_m: d.total_required_zar_m,
          active_secured_zar_m: d.active_secured_zar_m, total_drawn_zar_m: d.total_drawn_zar_m,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load payment securities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: SecurityRow; events: SecurityEvent[] } }>(
        `/payment-security/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load security history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active_open') return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'minor')      return r.security_tier === 'minor';
      if (filter === 'moderate')   return r.security_tier === 'moderate';
      if (filter === 'material')   return r.security_tier === 'material';
      if (filter === 'major')      return r.security_tier === 'major';
      if (filter === 'critical')   return r.security_tier === 'critical';
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: SecurityRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'submit-instrument') {
        const ref = window.prompt('Submission reference (e.g. PS-SUB-2026-014):');
        if (!ref) return;
        const name = window.prompt('Instrument name:', row.instrument_name || '') || row.instrument_name || '';
        const type = window.prompt('Instrument type (letter_of_credit / bank_guarantee / parent_guarantee / cash_deposit):', row.instrument_type || 'letter_of_credit') || 'letter_of_credit';
        const issuer = window.prompt('Issuer / guarantor (issuing bank):', row.issuer_name || '') || '';
        const secured = window.prompt('Secured amount (ZAR millions) — drives the tier:', String(row.secured_amount_zar_m ?? ''));
        const cover = window.prompt('Cover (months of invoices):', String(row.cover_months ?? ''));
        const expiry = window.prompt('Instrument expiry date (YYYY-MM-DD):', row.expiry_date || '') || '';
        const basis = window.prompt('Submission basis — instrument terms / sizing:') || '';
        body = { submission_ref: ref, instrument_name: name, instrument_type: type, submission_basis: basis };
        if (issuer) body.issuer_name = issuer;
        if (secured) body.secured_amount_zar_m = Number(secured);
        if (cover) body.cover_months = Number(cover);
        if (expiry) body.expiry_date = expiry;
      } else if (action === 'begin-verification') {
        const ref = window.prompt('Verification reference:');
        if (!ref) return;
        const basis = window.prompt('Verification basis — issuer-rating / wording / drawability checks:') || '';
        body = { verification_ref: ref, verification_basis: basis };
      } else if (action === 'activate') {
        const ref = window.prompt('Activation reference:');
        if (!ref) return;
        const basis = window.prompt('Activation basis — confirmation the instrument is live and conforming:') || '';
        body = { activation_ref: ref, activation_basis: basis };
      } else if (action === 'reject-instrument') {
        const ref = window.prompt('Rejection reference:');
        if (!ref) return;
        const basis = window.prompt('Rejection basis — why the instrument fails verification:');
        if (!basis) return;
        const rod = window.prompt('Decision notes:') || '';
        body = { reject_ref: ref, verification_basis: basis, reason_code: 'instrument_rejected', decision_notes: rod };
      } else if (action === 'open-adequacy-review') {
        const ref = window.prompt('Adequacy review reference:');
        if (!ref) return;
        const basis = window.prompt('Adequacy basis — exposure vs cover being reviewed:') || '';
        body = { adequacy_ref: ref, adequacy_basis: basis };
      } else if (action === 'confirm-adequate') {
        const basis = window.prompt('Confirmation basis — why cover remains adequate:') || '';
        body = { adequacy_basis: basis };
      } else if (action === 'require-increase') {
        const shortfall = window.prompt('Adequacy shortfall (ZAR millions) — cover gap vs exposure:');
        if (!shortfall) return;
        const required = window.prompt('New required cover (ZAR millions):', String(row.required_amount_zar_m ?? ''));
        const basis = window.prompt('Basis — why a bigger instrument is required:') || '';
        body = { adequacy_shortfall_zar_m: Number(shortfall), adequacy_basis: basis, reason_code: 'increase_required' };
        if (required) body.required_amount_zar_m = Number(required);
      } else if (action === 'initiate-drawdown') {
        const ref = window.prompt('Drawdown reference (call on the instrument):');
        if (!ref) return;
        const drawn = window.prompt('Amount drawn (ZAR millions):');
        if (!drawn) return;
        const invoice = window.prompt('Unpaid PPA invoice that triggered the call (ZAR millions):') || '';
        const basis = window.prompt('Drawdown basis — buyer payment default detail:') || '';
        body = { drawdown_ref: ref, drawn_amount_zar_m: Number(drawn), drawdown_basis: basis };
        if (invoice) body.outstanding_invoice_zar_m = Number(invoice);
      } else if (action === 'open-replenishment') {
        const ref = window.prompt('Replenishment reference:');
        if (!ref) return;
        const due = window.prompt('Amount required to restore the instrument (ZAR millions):', String(row.drawn_amount_zar_m ?? ''));
        const basis = window.prompt('Replenishment basis / deadline note:') || '';
        body = { replenishment_ref: ref, replenishment_basis: basis };
        if (due) body.replenishment_due_zar_m = Number(due);
      } else if (action === 'flag-expiry') {
        const ref = window.prompt('Expiry reference:');
        if (!ref) return;
        const expiry = window.prompt('Instrument expiry date (YYYY-MM-DD):', row.expiry_date || '') || '';
        const basis = window.prompt('Expiry basis — renewal / re-posting requirement:') || '';
        body = { expiry_ref: ref, expiry_basis: basis };
        if (expiry) body.expiry_date = expiry;
      } else if (action === 'forfeit') {
        const ref = window.prompt('Forfeit reference:');
        if (!ref) return;
        const basis = window.prompt('Forfeit basis — failed to replenish / renew / substitute:');
        if (!basis) return;
        const rod = window.prompt('Decision notes:') || '';
        body = { forfeit_ref: ref, forfeit_basis: basis, reason_code: 'security_forfeited', decision_notes: rod };
      } else if (action === 'release') {
        const ref = window.prompt('Release reference (PPA term reached — clean close):');
        if (!ref) return;
        const basis = window.prompt('Release basis — confirmation no further exposure:') || '';
        body = { release_ref: ref, release_basis: basis };
      }
      await api.post(`/payment-security/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Offtaker PPA payment security / credit support</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage P6 chain · security required → instrument submitted → under verification → active → adequacy review →
            active. The financial-assurance backbone of a bankable PPA: the buyer (offtaker) posts and maintains a
            payment-security instrument (letter of credit / on-demand bank guarantee / parent guarantee) sized to its
            rolling payment exposure; the seller (IPP beneficiary, or facility agent) verifies, activates, runs periodic
            adequacy review, draws down on a buyer payment default, forfeits an un-replenished instrument, and releases it
            at PPA term. The buyer-side credit-support counterpart to the seller-side bonds. Drawdown / expiry /
            substitution all route the re-posted instrument back through verification (submit-instrument). URGENT SLA:
            critical tier tightest (a large IPP debt service left unsecured). Forfeit crosses to the regulator inbox for
            every tier; drawdowns, rejections + SLA breaches cross for major + critical.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Active" value={kpis?.active_count ?? 0} tone="ok" />
        <Kpi label="In drawdown" value={kpis?.drawdown_open_count ?? 0} tone={(kpis?.drawdown_open_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Large open" value={kpis?.large_exposure_open ?? 0} tone={(kpis?.large_exposure_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Forfeited" value={kpis?.forfeited_count ?? 0} tone={(kpis?.forfeited_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Rejected" value={kpis?.rejected_count ?? 0} tone={(kpis?.rejected_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Secured" value={fmtZarM(kpis?.total_secured_zar_m)} />
        <Kpi label="Active cover" value={fmtZarM(kpis?.active_secured_zar_m)} />
        <Kpi label="Drawn" value={fmtZarM(kpis?.total_drawn_zar_m)} tone={(kpis?.total_drawn_zar_m ?? 0) > 0 ? 'warn' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Security #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Instrument / offtaker</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Secured</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Drawn</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.security_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.security_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.instrument_name} · ${r.offtaker_party_name}`}>
                      {r.instrument_name}
                      <span className="text-[#4a5568]"> · {r.offtaker_party_name}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZarM(r.secured_amount_zar_m)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${(r.drawn_amount_zar_m ?? 0) > 0 ? 'text-[#a04040]' : 'text-[#4a5568]'}`}>{fmtZarM(r.drawn_amount_zar_m)}</td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No securities match.</td></tr>
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
  row: SecurityRow;
  events: SecurityEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: SecurityRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const isActive = row.chain_status === 'active';
  const canReject = row.chain_status === 'under_verification';
  const canRequireIncrease = row.chain_status === 'adequacy_review';
  const canForfeit = ['replenishment_pending', 'expiry_pending', 'substitution_pending'].includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.security_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.instrument_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.security_tier].label} · offtaker {row.offtaker_party_name}
                {row.seller_party_name ? ` · seller ${row.seller_party_name}` : ''}
                {row.issuer_name ? ` · issued by ${row.issuer_name}` : ''}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"              value={TIER_TONE[row.security_tier].label} />
            <Pair label="Instrument type"   value={row.instrument_type ?? '—'} />
            <Pair label="Issuer"            value={row.issuer_name ?? '—'} />
            <Pair label="Issuer rating"     value={row.issuer_rating ?? '—'} />
            <Pair label="PPA reference"     value={row.ppa_reference ?? '—'} />
            <Pair label="Project"           value={row.project_name ?? '—'} />
            <Pair label="Sector"            value={row.sector ?? '—'} />
            <Pair label="Secured"           value={fmtZarM(row.secured_amount_zar_m)} />
            <Pair label="Required cover"    value={fmtZarM(row.required_amount_zar_m)} />
            <Pair label="Cover months"      value={row.cover_months != null ? `${row.cover_months} mo` : '—'} />
            <Pair label="Expiry"            value={fmtDay(row.expiry_date)} />
            <Pair label="Drawn"             value={fmtZarM(row.drawn_amount_zar_m)} />
            <Pair label="Outstanding inv."  value={fmtZarM(row.outstanding_invoice_zar_m)} />
            <Pair label="Replenish due"     value={fmtZarM(row.replenishment_due_zar_m)} />
            <Pair label="Adequacy shortfall" value={fmtZarM(row.adequacy_shortfall_zar_m)} />
            <Pair label="Drawdown count"    value={String(row.drawdown_count)} />
            <Pair label="Agent"             value={row.agent_name ?? '—'} />
            <Pair label="Submission ref"    value={row.submission_ref ?? '—'} />
            <Pair label="Verification ref"  value={row.verification_ref ?? '—'} />
            <Pair label="Activation ref"    value={row.activation_ref ?? '—'} />
            <Pair label="Adequacy ref"      value={row.adequacy_ref ?? '—'} />
            <Pair label="Drawdown ref"      value={row.drawdown_ref ?? '—'} />
            <Pair label="Replenishment ref" value={row.replenishment_ref ?? '—'} />
            <Pair label="Expiry ref"        value={row.expiry_ref ?? '—'} />
            <Pair label="Release ref"       value={row.release_ref ?? '—'} />
            <Pair label="Forfeit ref"       value={row.forfeit_ref ?? '—'} />
            <Pair label="Reject ref"        value={row.reject_ref ?? '—'} />
            <Pair label="Reason code"       value={row.reason_code ?? '—'} />
            <Pair label="Required at"       value={fmtDate(row.security_required_at)} />
            <Pair label="Submitted at"      value={fmtDate(row.instrument_submitted_at)} />
            <Pair label="Verifying at"      value={fmtDate(row.under_verification_at)} />
            <Pair label="Active at"         value={fmtDate(row.active_at)} />
            <Pair label="Drawdown at"       value={fmtDate(row.drawdown_initiated_at)} />
            <Pair label="Released at"       value={fmtDate(row.released_at)} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"        value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"    value={String(row.escalation_level)} />
            <Pair label="Reportable"        value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.submission_basis && (
            <BasisBlock label="Submission basis" tone="#1a3a5c" text={row.submission_basis} />
          )}
          {row.verification_basis && (
            <BasisBlock label="Verification basis" tone="#a06200" text={row.verification_basis} />
          )}
          {row.activation_basis && (
            <BasisBlock label="Activation basis" tone="#155724" text={row.activation_basis} />
          )}
          {row.adequacy_basis && (
            <BasisBlock label="Adequacy basis" tone="#1a3a5c" text={row.adequacy_basis} />
          )}
          {row.drawdown_basis && (
            <BasisBlock label="Drawdown basis" tone="#a04040" text={row.drawdown_basis} />
          )}
          {row.replenishment_basis && (
            <BasisBlock label="Replenishment basis" tone="#a06200" text={row.replenishment_basis} />
          )}
          {row.expiry_basis && (
            <BasisBlock label="Expiry basis" tone="#a06200" text={row.expiry_basis} />
          )}
          {row.forfeit_basis && (
            <BasisBlock label="Forfeit basis" tone="#9b1f1f" text={row.forfeit_basis} />
          )}
          {row.release_basis && (
            <BasisBlock label="Release basis" tone="#155724" text={row.release_basis} />
          )}
          {row.decision_notes && (
            <BasisBlock label="Decision notes" tone="#6b3a3a" text={row.decision_notes} />
          )}
        </section>

        {(nextAction || isActive || canReject || canRequireIncrease || canForfeit) && (
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
              {isActive && (
                <>
                  <button
                    onClick={() => onAct('open-adequacy-review', row)}
                    className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                  >
                    {ACTION_LABEL['open-adequacy-review']}
                  </button>
                  <button
                    onClick={() => onAct('initiate-drawdown', row)}
                    className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                  >
                    {ACTION_LABEL['initiate-drawdown']}
                  </button>
                  <button
                    onClick={() => onAct('flag-expiry', row)}
                    className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#a06200] hover:bg-[#fff8e6]"
                  >
                    {ACTION_LABEL['flag-expiry']}
                  </button>
                  <button
                    onClick={() => onAct('release', row)}
                    className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1f6b3a] hover:bg-[#eafaf0]"
                  >
                    {ACTION_LABEL.release}
                  </button>
                </>
              )}
              {canReject && (
                <button
                  onClick={() => onAct('reject-instrument', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['reject-instrument']}
                </button>
              )}
              {canRequireIncrease && (
                <button
                  onClick={() => onAct('require-increase', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#a06200] hover:bg-[#fff8e6]"
                >
                  {ACTION_LABEL['require-increase']}
                </button>
              )}
              {canForfeit && (
                <button
                  onClick={() => onAct('forfeit', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.forfeit}
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
