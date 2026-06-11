// Wave 35 — Esums O&M warranty vendor-side escalation chain tab.
//
// Supplier-defect escalation surfaced as a P6 audit chain (CPA §56/§61 + NRCS).
//
//   • KPI strip: total / safety open / systemic open / SLA breached /
//     recalls / units affected / claim value (ZAR)
//   • Filter pills by defect class + chain state + SLA breach
//   • ChainCard list (expandable inline) with class pill + URGENT SLA countdown
//   • Actions via ActionModal — no window.prompt, no Drawer
//
// No create form — cases originate from W15 RMA / W24 PR provenance and the
// operator field workflow; this surface drives the escalation forward.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'filed' | 'vendor_triage' | 'vendor_decision' | 'escalated_to_oem'
  | 'oem_field_investigation' | 'oem_decision' | 'remediation' | 'closed'
  | 'recall_issued' | 'arbitration' | 'withdrawn';

type DefectClass = 'safety_recall' | 'fleet_systemic' | 'batch_defect' | 'single_unit';

interface EscalationRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  operator_party_name: string;
  vendor_party_name: string;
  oem_party_name: string | null;
  component_type: string;
  component_model: string | null;
  serial_range: string | null;
  fleet_units_affected: number;
  fleet_units_total: number;
  fleet_fraction: number | null;
  site_name: string | null;
  site_province: string | null;
  defect_class: DefectClass;
  safety_critical: number;
  warranty_clause: string | null;
  filing_ref: string | null;
  vendor_decision_ref: string | null;
  oem_decision_ref: string | null;
  remediation_ref: string | null;
  recall_ref: string | null;
  arbitration_case_ref: string | null;
  claim_value_zar: number | null;
  liability_accepted: number | null;
  remedy_type: string | null;
  remedy_cost_zar: number | null;
  defect_summary: string | null;
  vendor_decision_basis: string | null;
  oem_decision_basis: string | null;
  remediation_plan: string | null;
  recall_basis: string | null;
  arbitration_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable?: boolean;
  breach_crosses_regulator?: boolean;
  created_at: string;
}

interface KpiData {
  total: number;
  open_count: number;
  closed_count: number;
  recall_count: number;
  arbitration_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  safety_open: number;
  systemic_open: number;
  total_units_affected: number;
  total_claim_zar: number;
  total_remedy_zar: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'filed',
  'vendor_triage',
  'vendor_decision',
  'escalated_to_oem',
  'oem_field_investigation',
  'oem_decision',
  'remediation',
  'closed',
];
const BRANCH_STATES: readonly string[] = [
  'recall_issued',
  'arbitration',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                  label: 'Active (pre-terminal)' },
  { key: 'all',                     label: 'All' },
  { key: 'safety_recall',           label: 'Safety recall' },
  { key: 'fleet_systemic',          label: 'Fleet systemic' },
  { key: 'batch_defect',            label: 'Batch defect' },
  { key: 'single_unit',             label: 'Single unit' },
  { key: 'filed',                   label: 'Filed' },
  { key: 'vendor_triage',           label: 'Vendor triage' },
  { key: 'vendor_decision',         label: 'Vendor decision' },
  { key: 'escalated_to_oem',        label: 'Escalated to OEM' },
  { key: 'oem_field_investigation', label: 'OEM investigation' },
  { key: 'oem_decision',            label: 'OEM decision' },
  { key: 'remediation',             label: 'Remediation' },
  { key: 'recall_issued',           label: 'Recall issued' },
  { key: 'arbitration',             label: 'Arbitration' },
  { key: 'closed',                  label: 'Closed' },
  { key: 'breached',                label: 'SLA breached' },
];

// ── format helpers ────────────────────────────────────────────────────────
function fmtZar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: EscalationRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const cs = row.chain_status;

  if (cs === 'filed') {
    actions.push({
      key: 'triage',
      label: 'Vendor triage',
      tone: 'primary',
      fields: [
        { key: 'vendor_party_name', label: 'Vendor party name', type: 'text', required: false, placeholder: row.vendor_party_name ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'withdraw',
      label: 'Withdraw',
      tone: 'ghost',
      fields: [
        { key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'vendor_triage') {
    actions.push({
      key: 'vendor-decide',
      label: 'Vendor decision',
      tone: 'primary',
      fields: [
        { key: 'liability_accepted', label: 'Vendor accepts liability? (yes / no)', type: 'text', required: false, placeholder: 'yes' },
        { key: 'vendor_decision_basis', label: 'Vendor decision basis', type: 'textarea', required: false, placeholder: row.vendor_decision_basis ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'withdraw',
      label: 'Withdraw',
      tone: 'ghost',
      fields: [
        { key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'vendor_decision') {
    actions.push({
      key: 'escalate-to-oem',
      label: 'Escalate to OEM',
      tone: 'warn',
      fields: [
        { key: 'oem_party_name', label: 'OEM party name', type: 'text', required: false, placeholder: row.oem_party_name ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'escalate-to-arbitration',
      label: 'Escalate to arbitration',
      tone: 'danger',
      fields: [
        { key: 'arbitration_case_ref', label: 'Arbitration case reference', type: 'text', required: false, placeholder: row.arbitration_case_ref ?? '' },
        { key: 'arbitration_basis', label: 'Arbitration basis', type: 'textarea', required: false, placeholder: row.arbitration_basis ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'close',
      label: 'Close',
      tone: 'ghost',
      fields: [
        { key: 'reason_code', label: 'Reason code', type: 'text', required: false, placeholder: row.reason_code ?? '' },
        { key: 'rod_notes', label: 'Record of decision', type: 'textarea', required: false, placeholder: row.rod_notes ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'withdraw',
      label: 'Withdraw',
      tone: 'ghost',
      fields: [
        { key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'textarea', required: false, placeholder: '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'escalated_to_oem') {
    actions.push({
      key: 'oem-investigate',
      label: 'OEM field investigation',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'oem_field_investigation') {
    actions.push({
      key: 'oem-decide',
      label: 'OEM decision',
      tone: 'primary',
      fields: [
        { key: 'liability_accepted', label: 'OEM accepts liability? (yes / no)', type: 'text', required: false, placeholder: 'yes' },
        { key: 'oem_decision_basis', label: 'OEM decision basis', type: 'textarea', required: false, placeholder: row.oem_decision_basis ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'oem_decision') {
    actions.push({
      key: 'start-remediation',
      label: 'Start remediation',
      tone: 'primary',
      fields: [
        { key: 'remediation_plan', label: 'Remediation plan', type: 'textarea', required: false, placeholder: row.remediation_plan ?? '' },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'issue-recall',
      label: 'Issue recall',
      tone: 'danger',
      fields: [
        { key: 'recall_ref', label: 'NRCS / manufacturer recall reference', type: 'text', required: false, placeholder: row.recall_ref ?? '' },
        { key: 'recall_basis', label: 'Recall basis', type: 'textarea', required: false, placeholder: row.recall_basis ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'escalate-to-arbitration',
      label: 'Escalate to arbitration',
      tone: 'danger',
      fields: [
        { key: 'arbitration_case_ref', label: 'Arbitration case reference', type: 'text', required: false, placeholder: row.arbitration_case_ref ?? '' },
        { key: 'arbitration_basis', label: 'Arbitration basis', type: 'textarea', required: false, placeholder: row.arbitration_basis ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'close',
      label: 'Close',
      tone: 'ghost',
      fields: [
        { key: 'reason_code', label: 'Reason code', type: 'text', required: false, placeholder: row.reason_code ?? '' },
        { key: 'rod_notes', label: 'Record of decision', type: 'textarea', required: false, placeholder: row.rod_notes ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'remediation') {
    actions.push({
      key: 'issue-recall',
      label: 'Issue recall',
      tone: 'danger',
      fields: [
        { key: 'recall_ref', label: 'NRCS / manufacturer recall reference', type: 'text', required: false, placeholder: row.recall_ref ?? '' },
        { key: 'recall_basis', label: 'Recall basis', type: 'textarea', required: false, placeholder: row.recall_basis ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
    actions.push({
      key: 'close',
      label: 'Close',
      tone: 'ghost',
      fields: [
        { key: 'reason_code', label: 'Reason code', type: 'text', required: false, placeholder: row.reason_code ?? '' },
        { key: 'rod_notes', label: 'Record of decision', type: 'textarea', required: false, placeholder: row.rod_notes ?? '' },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: EscalationRow): React.ReactNode {
  const unitsLabel = `${row.fleet_units_affected}${row.fleet_units_total ? ` / ${row.fleet_units_total}` : ''}${row.fleet_fraction != null ? ` (${(row.fleet_fraction * 100).toFixed(1)}%)` : ''}`;
  const siteLabel = row.site_name ? `${row.site_name}${row.site_province ? `, ${row.site_province}` : ''}` : null;
  const provenanceLabel = row.source_wave
    ? `${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}${row.source_event ? ` (${row.source_event})` : ''}`
    : null;
  const slaLabel = row.sla_deadline_at && !row.is_terminal
    ? `${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` · ${row.escalation_level} breach(es)` : ''}`
    : null;

  return (
    <div className="space-y-3 text-[11px]">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <DetailPair label="Operator" value={row.operator_party_name} />
        <DetailPair label="Vendor" value={row.vendor_party_name} />
        <DetailPair label="OEM" value={row.oem_party_name ?? '—'} />
        <DetailPair label="Units affected" value={unitsLabel} />
        {siteLabel && <DetailPair label="Site" value={siteLabel} />}
        {row.serial_range && <DetailPair label="Serial range" value={row.serial_range} />}
        {row.warranty_clause && <DetailPair label="Warranty clause" value={row.warranty_clause} />}
        {row.remedy_type && <DetailPair label="Remedy" value={row.remedy_type} />}
        {row.claim_value_zar != null && <DetailPair label="Claim value" value={fmtZar(row.claim_value_zar)} />}
        {row.remedy_cost_zar != null && <DetailPair label="Remedy cost" value={fmtZar(row.remedy_cost_zar)} />}
        {row.recall_ref && <DetailPair label="Recall ref" value={row.recall_ref} />}
        {row.arbitration_case_ref && <DetailPair label="Arbitration ref" value={row.arbitration_case_ref} />}
        {row.vendor_decision_ref && <DetailPair label="Vendor ref" value={row.vendor_decision_ref} />}
        {row.oem_decision_ref && <DetailPair label="OEM ref" value={row.oem_decision_ref} />}
        {provenanceLabel && <DetailPair label="Provenance" value={provenanceLabel} />}
        {slaLabel && <DetailPair label="Next SLA" value={slaLabel} />}
        {row.is_reportable && <DetailPair label="NRCS" value="Reportable" />}
      </div>

      {row.defect_summary && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Defect summary</div>
          <div style={{ color: TX2 }}>{row.defect_summary}</div>
        </div>
      )}
      {row.vendor_decision_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Vendor decision</div>
          <div style={{ color: TX2 }}>{row.vendor_decision_basis}</div>
        </div>
      )}
      {row.oem_decision_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>OEM decision</div>
          <div style={{ color: TX2 }}>{row.oem_decision_basis}</div>
        </div>
      )}
      {row.remediation_plan && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Remediation plan</div>
          <div style={{ color: TX2 }}>{row.remediation_plan}</div>
        </div>
      )}
      {row.recall_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Recall basis</div>
          <div style={{ color: TX2 }}>{row.recall_basis}</div>
        </div>
      )}
      {row.arbitration_basis && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Arbitration basis</div>
          <div style={{ color: TX2 }}>{row.arbitration_basis}</div>
        </div>
      )}
      {row.rod_notes && (
        <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Record of decision</div>
          <div style={{ color: TX2 }}>{row.rod_notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function VendorEscalationChainTab() {
  const [rows, setRows] = useState<EscalationRow[]>([]);
  const [summary, setSummary] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: EscalationRow[] } }>('/esums/vendor-escalation/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setSummary(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load vendor escalations');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/esums/vendor-escalation/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/esums/vendor-escalation/chain/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/esums/vendor-escalation/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all')      return true;
      if (filter === 'active')   return !r.is_terminal;
      if (filter === 'breached') return r.sla_breached;
      if (['safety_recall', 'fleet_systemic', 'batch_defect', 'single_unit'].includes(filter)) {
        return r.defect_class === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: 0, open_count: 0, closed_count: 0, recall_count: 0, arbitration_count: 0,
    withdrawn_count: 0, breached: 0, reportable_total: 0, safety_open: 0,
    systemic_open: 0, total_units_affected: 0, total_claim_zar: 0, total_remedy_zar: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Vendor Escalation Chain</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>CPA §56/§61 + NRCS supplier-defect escalation — safety recalls, fleet systemic, batch defect, single unit</p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total" value={kpis.total} />
        <KpiTile label="Safety open"   value={kpis.safety_open}   tone={kpis.safety_open > 0 ? 'bad' : undefined} />
        <KpiTile label="Systemic open" value={kpis.systemic_open} tone={kpis.systemic_open > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached"  value={kpis.breached}      tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Recalls"       value={kpis.recall_count}  tone={kpis.recall_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Units affected" value={kpis.total_units_affected} />
        <KpiTile label="Claim value"   value={fmtZar(kpis.total_claim_zar)} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{ background: filter === f.key ? ACC : BG2, color: filter === f.key ? '#fff' : TX2, border: `1px solid ${filter === f.key ? ACC : BORDER}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>{err}</div>}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading…</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const componentTitle = `${row.component_type}${row.component_model ? ` · ${row.component_model}` : ''}`;
            const vendorMeta = (
              <span style={{ color: TX3, fontSize: 11 }}>
                {row.vendor_party_name}{row.oem_party_name ? ` → ${row.oem_party_name}` : ''}{' · '}
                {row.fleet_units_affected} units{' · '}
                {row.defect_class.replace('_', ' ')}
              </span>
            );
            return (
              <ChainCard
                key={row.id}
                item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={componentTitle}
                meta={vendorMeta}
                actions={getActions(row)}
                onAction={(key, values) => handleAction(row.id, key, values)}
                cascadeTo={[]}
                detail={renderDetail(row)}
                events={expandedEvents[row.id]}
                onExpand={handleExpand}
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No escalations match the current filter.</div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[80px]" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default VendorEscalationChainTab;
