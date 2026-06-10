// Wave 35 — Esums O&M warranty vendor-side escalation chain tab.
//
// Supplier-defect escalation surfaced as a P6 audit chain (CPA §56/§61 + NRCS).
//
//   • KPI strip: total / safety open / systemic open / SLA breached /
//     recalls / units affected / claim value (ZAR)
//   • Filter pills by defect class + chain state + SLA breach
//   • Listing with class pill + URGENT SLA countdown
//   • Drill-down: timeline (operator/vendor/oem party tags) + per-state actions
//
// No create form — cases originate from W15 RMA / W24 PR provenance and the
// operator field workflow; this surface drives the escalation forward.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'filed' | 'vendor_triage' | 'vendor_decision' | 'escalated_to_oem'
  | 'oem_field_investigation' | 'oem_decision' | 'remediation' | 'closed'
  | 'recall_issued' | 'arbitration' | 'withdrawn';

type DefectClass = 'safety_recall' | 'fleet_systemic' | 'batch_defect' | 'single_unit';

interface EscalationRow {
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

interface EscalationEvent {
  id: string;
  escalation_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
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

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  filed:                   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Filed' },
  vendor_triage:           { bg: '#fff4d6', fg: '#a06200', label: 'Vendor triage' },
  vendor_decision:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Vendor decision' },
  escalated_to_oem:        { bg: '#fff4d6', fg: '#a06200', label: 'Escalated to OEM' },
  oem_field_investigation: { bg: '#dbecfb', fg: '#1a3a5c', label: 'OEM field investigation' },
  oem_decision:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'OEM decision' },
  remediation:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Remediation' },
  closed:                  { bg: '#e3e7ec', fg: '#557',    label: 'Closed' },
  recall_issued:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'Recall issued' },
  arbitration:             { bg: '#fde0e0', fg: '#9b1f1f', label: 'Arbitration' },
  withdrawn:               { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
};

const CLASS_TONE: Record<DefectClass, { bg: string; fg: string; label: string }> = {
  safety_recall: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Safety recall' },
  fleet_systemic:{ bg: '#ffe7cc', fg: '#9a4d00', label: 'Fleet systemic' },
  batch_defect:  { bg: '#fff4d6', fg: '#a06200', label: 'Batch defect' },
  single_unit:   { bg: '#e3e7ec', fg: '#557',    label: 'Single unit' },
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  operator: { bg: '#dbecfb', fg: '#1a3a5c' },
  vendor:   { bg: '#fff4d6', fg: '#a06200' },
  oem:      { bg: '#ede0fb', fg: '#5b2a9b' },
  system:   { bg: '#e3e7ec', fg: '#557' },
};

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

function fmtZar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

export function VendorEscalationChainTab() {
  const [rows, setRows] = useState<EscalationRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<EscalationRow | null>(null);
  const [events, setEvents] = useState<EscalationEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: EscalationRow[] } }>('/esums/vendor-escalation/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load vendor escalations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: EscalationRow; events: EscalationEvent[] } }>(`/esums/vendor-escalation/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load escalation history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')      return true;
      if (filter === 'active')   return !r.is_terminal;
      if (filter === 'breached') return r.sla_breached;
      if (['safety_recall', 'fleet_systemic', 'batch_defect', 'single_unit'].includes(filter)) {
        return r.defect_class === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/esums/vendor-escalation/chain/${selected.id}/${path}`, body ?? {});
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [selected, load, loadEvents]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-3">
        <Kpi label="Total" value={kpis?.total ?? 0} />
        <Kpi label="Safety open"   value={kpis?.safety_open ?? 0}   tone={(kpis?.safety_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Systemic open" value={kpis?.systemic_open ?? 0} tone={(kpis?.systemic_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached"  value={kpis?.breached ?? 0}      tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Recalls"       value={kpis?.recall_count ?? 0}  tone={(kpis?.recall_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Units affected" value={kpis?.total_units_affected ?? 0} />
        <Kpi label="Claim value"   value={fmtZar(kpis?.total_claim_zar ?? 0)} small />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#c2873a] text-white border-[#1a3a5c]'
                : 'bg-white text-[#4a5568] border-[#dde4ec] hover:bg-[#eef2f7]'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {err && <div className="px-3 py-2 bg-red-50 text-red-700 text-[12px] rounded-md">{err}</div>}

      <div className="bg-white border border-[#e5ebf2] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f7f9fb] text-[11px] uppercase tracking-wide text-[#6b7685]">
            <tr>
              <th className="px-3 py-2 text-left">Case #</th>
              <th className="px-3 py-2 text-left">Component</th>
              <th className="px-3 py-2 text-left">Vendor / OEM</th>
              <th className="px-3 py-2 text-left">Class</th>
              <th className="px-3 py-2 text-right">Units</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">Δ SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">No escalations match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const clsTone   = CLASS_TONE[r.defect_class];
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.case_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.component_type}${r.component_model ? ' · ' + r.component_model : ''}`}>
                    {r.component_type}{r.component_model ? <span className="text-[#6b7685]"> · {r.component_model}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-[#4a5568]">
                    {r.vendor_party_name}{r.oem_party_name ? <span className="text-[#6b7685]"> → {r.oem_party_name}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: clsTone.bg, color: clsTone.fg }}>
                      {clsTone.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[12px]">
                    {r.fleet_units_affected}{r.fleet_units_total ? <span className="text-[#6b7685]">/{r.fleet_units_total}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: stateTone.bg, color: stateTone.fg }}>
                      {stateTone.label}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                    {r.is_terminal ? '—' : fmtMin(r.minutes_until_sla)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <EscalationDrawer
          row={selected}
          events={events}
          onClose={() => { setSelected(null); setEvents([]); }}
          doAction={doAction}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone = 'ok', small = false }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad'; small?: boolean }) {
  const fg = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0f1c2e';
  return (
    <div className="bg-white border border-[#e5ebf2] rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className={small ? 'text-[15px] font-semibold tabular-nums mt-0.5' : 'text-[20px] font-semibold tabular-nums mt-0.5'} style={{ color: fg }}>{value}</div>
    </div>
  );
}

function EscalationDrawer({
  row, events, onClose, doAction,
}: {
  row: EscalationRow;
  events: EscalationEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.chain_status;
  const transitionable = !row.is_terminal;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-stretch justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Escalation {row.case_number}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
              {row.component_type}{row.component_model ? ` · ${row.component_model}` : ''}
            </h3>
            <div className="flex flex-wrap gap-2 mt-2 text-[12px]">
              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: CLASS_TONE[row.defect_class].bg, color: CLASS_TONE[row.defect_class].fg }}>
                {CLASS_TONE[row.defect_class].label}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: STATE_TONE[cs].bg, color: STATE_TONE[cs].fg }}>
                {STATE_TONE[cs].label}
              </span>
              {row.is_reportable && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">NRCS reportable</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">✕</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="grid grid-cols-2 gap-4">
            <Pair label="Operator" value={row.operator_party_name} />
            <Pair label="Vendor"   value={row.vendor_party_name} />
            <Pair label="OEM"      value={row.oem_party_name ?? '—'} />
            <Pair label="Units affected" value={`${row.fleet_units_affected}${row.fleet_units_total ? ` / ${row.fleet_units_total}` : ''}${row.fleet_fraction != null ? ` (${(row.fleet_fraction * 100).toFixed(1)}%)` : ''}`} />
            {row.site_name && <Pair label="Site" value={`${row.site_name}${row.site_province ? `, ${row.site_province}` : ''}`} />}
            {row.serial_range && <Pair label="Serial range" value={row.serial_range} />}
          </div>

          {row.defect_summary && <Pair label="Defect summary" value={row.defect_summary} />}
          {row.warranty_clause && <Pair label="Warranty clause" value={row.warranty_clause} />}
          {row.vendor_decision_basis && <Pair label="Vendor decision" value={row.vendor_decision_basis} />}
          {row.oem_decision_basis && <Pair label="OEM decision" value={row.oem_decision_basis} />}
          {row.remediation_plan && <Pair label="Remediation plan" value={row.remediation_plan} />}
          {row.recall_basis && <Pair label="Recall basis" value={row.recall_basis} />}
          {row.arbitration_basis && <Pair label="Arbitration basis" value={row.arbitration_basis} />}
          {row.rod_notes && <Pair label="Record of decision" value={row.rod_notes} />}

          <div className="grid grid-cols-2 gap-4">
            {row.recall_ref && <Pair label="Recall ref" value={row.recall_ref} />}
            {row.arbitration_case_ref && <Pair label="Arbitration ref" value={row.arbitration_case_ref} />}
            {row.vendor_decision_ref && <Pair label="Vendor ref" value={row.vendor_decision_ref} />}
            {row.oem_decision_ref && <Pair label="OEM ref" value={row.oem_decision_ref} />}
            {row.remedy_type && <Pair label="Remedy" value={row.remedy_type} />}
            {row.claim_value_zar != null && <Pair label="Claim value" value={fmtZar(row.claim_value_zar)} />}
            {row.remedy_cost_zar != null && <Pair label="Remedy cost" value={fmtZar(row.remedy_cost_zar)} />}
          </div>

          {row.source_wave && (
            <Pair label="Provenance" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}${row.source_event ? ` (${row.source_event})` : ''}`} />
          )}

          {row.sla_deadline_at && !row.is_terminal && (
            <Pair label="Next SLA" value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` · ${row.escalation_level} breach(es)` : ''}`} />
          )}

          {transitionable && (
            <div className="border-t border-[#eef2f6] pt-4">
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                {cs === 'filed' && (
                  <ActionBtn label="Vendor triage" onClick={() => {
                    const vn = window.prompt('Vendor party name (optional):') ?? undefined;
                    void doAction('triage', vn ? { vendor_party_name: vn } : {});
                  }} />
                )}
                {cs === 'vendor_triage' && (
                  <ActionBtn label="Vendor decision" onClick={() => {
                    const accepted = window.confirm('Did the vendor accept liability? OK = yes, Cancel = no');
                    const basis = window.prompt('Vendor decision basis:') ?? undefined;
                    void doAction('vendor-decide', { liability_accepted: accepted, vendor_decision_basis: basis });
                  }} />
                )}
                {cs === 'vendor_decision' && (
                  <ActionBtn label="Escalate to OEM" onClick={() => {
                    const on = window.prompt('OEM party name:') ?? undefined;
                    void doAction('escalate-to-oem', on ? { oem_party_name: on } : {});
                  }} />
                )}
                {cs === 'escalated_to_oem' && <ActionBtn label="OEM field investigation" onClick={() => doAction('oem-investigate')} />}
                {cs === 'oem_field_investigation' && (
                  <ActionBtn label="OEM decision" onClick={() => {
                    const accepted = window.confirm('Did the OEM accept liability? OK = yes, Cancel = no');
                    const basis = window.prompt('OEM decision basis:') ?? undefined;
                    void doAction('oem-decide', { liability_accepted: accepted, oem_decision_basis: basis });
                  }} />
                )}
                {cs === 'oem_decision' && (
                  <ActionBtn label="Start remediation" tone="good" onClick={() => {
                    const plan = window.prompt('Remediation plan:') ?? undefined;
                    void doAction('start-remediation', plan ? { remediation_plan: plan } : {});
                  }} />
                )}
                {(cs === 'oem_decision' || cs === 'remediation') && (
                  <ActionBtn label="Issue recall" tone="bad" onClick={() => {
                    const ref = window.prompt('NRCS / manufacturer recall reference:') ?? undefined;
                    const basis = window.prompt('Recall basis:') ?? undefined;
                    void doAction('issue-recall', { recall_ref: ref, recall_basis: basis });
                  }} />
                )}
                {(cs === 'vendor_decision' || cs === 'oem_decision') && (
                  <ActionBtn label="Escalate to arbitration" tone="bad" onClick={() => {
                    const ref = window.prompt('Arbitration case reference:') ?? undefined;
                    const basis = window.prompt('Arbitration basis:') ?? undefined;
                    void doAction('escalate-to-arbitration', { arbitration_case_ref: ref, arbitration_basis: basis });
                  }} />
                )}
                {(cs === 'vendor_decision' || cs === 'oem_decision' || cs === 'remediation') && (
                  <ActionBtn label="Close" onClick={() => {
                    const rc = window.prompt('Reason code (optional):') ?? undefined;
                    const notes = window.prompt('Record of decision (optional):') ?? undefined;
                    void doAction('close', { reason_code: rc, rod_notes: notes });
                  }} />
                )}
                {(cs === 'filed' || cs === 'vendor_triage' || cs === 'vendor_decision') && (
                  <ActionBtn label="Withdraw" onClick={() => {
                    const basis = window.prompt('Withdrawal basis:') ?? undefined;
                    void doAction('withdraw', basis ? { withdrawal_basis: basis } : {});
                  }} />
                )}
              </div>
            </div>
          )}

          <div className="border-t border-[#eef2f6] pt-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Timeline</div>
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-[12px] text-[#6b7685]">No events yet.</div>
              ) : events.map((e) => {
                const partyTone = PARTY_TONE[e.actor_party ?? 'system'] ?? PARTY_TONE.system;
                return (
                  <div key={e.id} className="flex gap-3 text-[12px] border-l-2 border-[#e5ebf2] pl-3 py-1">
                    <span className="font-mono text-[11px] text-[#6b7685] whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</span>
                    <div>
                      <span className="font-semibold text-[#0f1c2e]">{e.event_type}</span>
                      {e.actor_party && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase" style={{ background: partyTone.bg, color: partyTone.fg }}>
                          {e.actor_party}
                        </span>
                      )}
                      {e.from_status && e.to_status && e.from_status !== e.to_status && (
                        <span className="text-[#6b7685]"> · {e.from_status} → {e.to_status}</span>
                      )}
                      {e.notes && <div className="text-[#4a5568] mt-0.5">{e.notes}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="text-[#0f1c2e] mt-0.5">{value}</div>
    </div>
  );
}

function ActionBtn({ label, onClick, tone = 'neutral' }: { label: string; onClick: () => void; tone?: 'neutral' | 'good' | 'bad' }) {
  const bg = tone === 'good' ? 'bg-emerald-700' : tone === 'bad' ? 'bg-red-700' : 'bg-[#c2873a]';
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 ${bg} text-white text-[12px] rounded-md hover:opacity-90`}>
      {label}
    </button>
  );
}
