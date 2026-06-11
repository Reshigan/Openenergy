// Wave 225 — Carbon Scope 3 Value Chain Emission Calculation & Third-Party
// Assurance lifecycle tab. TCFD + ISSB IFRS S2 + GHG Protocol Scope 3 + CDP.
//
// Distinct from the ESG disclosure chain (which carries a single Scope 3 total
// as one field of a broad ESG filing): THIS chain is the dedicated 15-category
// value-chain calculation plus the third-party assurance state machine.
//
//   scope3_initiated → category_boundaries_set → data_collection_open →
//     data_collection_complete → emission_calculations → calculations_reviewed →
//     [submit_for_assurance → limited/reasonable_assurance_complete →] disclosure_filed.
//   A reviewed disclosure may file directly (no assurance). Assurance may return a
//   qualified opinion (material error; terminal). Any pre-collection disclosure may
//   be withdrawn. INVERTED SLA: a wider Scope 3 boundary earns more data-collection
//   time (micro 21d → full_chain 60d). qualified opinions always cross to the
//   regulator inbox; large-scope filings cross the CDP/JSE mandatory threshold.
//
// Carbon-fund desk write (admin / carbon_fund / support). Action inputs use the
// same window.prompt convention as the sibling carbon chain tabs.

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
  | 'scope3_initiated' | 'category_boundaries_set' | 'data_collection_open'
  | 'data_collection_complete' | 'emission_calculations' | 'calculations_reviewed'
  | 'assurance_submitted' | 'limited_assurance_complete' | 'reasonable_assurance_complete'
  | 'disclosure_filed' | 'assurance_qualified' | 'withdrawn';

type Tier = 'micro' | 'standard' | 'comprehensive' | 'full_chain';

interface S3Row {
  [key: string]: unknown;
  id: string;
  participant_id: string;
  s3_tier: Tier;
  reporting_year: number;
  entity_name: string | null;
  reporting_framework: string | null;
  category_count: number | null;
  category_list: string | null;
  primary_data_coverage_pct: number | null;
  spend_based_pct: number | null;
  supplier_responses: number | null;
  scope3_total_tco2e: number | null;
  cat1_purchased_goods_tco2e: number | null;
  cat3_fuel_energy_tco2e: number | null;
  cat11_use_of_products_tco2e: number | null;
  cat12_eol_treatment_tco2e: number | null;
  assurance_provider: string | null;
  assurance_standard: string | null;
  assurance_type: string | null;
  assurance_completed_at: string | null;
  qualified_opinion_reason: string | null;
  filing_platform: string | null;
  filing_ref: string | null;
  filing_submitted_at: string | null;
  categories_set_at: string | null;
  data_collection_opened_at: string | null;
  data_collection_closed_at: string | null;
  calculations_completed_at: string | null;
  review_completed_at: string | null;
  chain_status: ChainStatus;
  sla_deadline: string;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditEvent {
  id: string;
  entity_type: string;
  entity_id: string | null;
  event_type: string;
  actor_id: string;
  payload_json: string;
  sequence_no: number;
  created_at: string;
}

interface Kpis {
  total: number;
  in_progress: number;
  filed: number;
  qualified: number;
  sla_breached: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'scope3_initiated',
  'category_boundaries_set',
  'data_collection_open',
  'data_collection_complete',
  'emission_calculations',
  'calculations_reviewed',
  'assurance_submitted',
  'limited_assurance_complete',
  'reasonable_assurance_complete',
  'disclosure_filed',
];

const BRANCH_STATES: readonly string[] = [
  'assurance_qualified',
  'withdrawn',
];

const TERMINALS: ChainStatus[] = ['disclosure_filed', 'assurance_qualified', 'withdrawn'];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',        label: 'Active' },
  { key: 'all',           label: 'All' },
  { key: 'assurance',     label: 'In assurance' },
  { key: 'filed',         label: 'Filed' },
  { key: 'breached',      label: 'SLA breached' },
  { key: 'micro',         label: 'Micro' },
  { key: 'standard',      label: 'Standard' },
  { key: 'comprehensive', label: 'Comprehensive' },
  { key: 'full_chain',    label: 'Full chain' },
];

// ── helpers ────────────────────────────────────────────────────────────────
function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}
function fmtTco2e(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA')} tCO₂e`;
}
function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n}%`;
}

const TIER_LABEL: Record<Tier, string> = {
  micro:         'Micro (<5 cat · 21d)',
  standard:      'Standard (5–10 · 30d)',
  comprehensive: 'Comprehensive (10–13 · 45d)',
  full_chain:    'Full chain (15+ · 60d)',
};

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: S3Row): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  if (s === 'scope3_initiated') {
    actions.push({
      key: 'set_categories',
      label: 'Set category boundaries',
      tone: 'primary',
      fields: [
        {
          key: 'category_count',
          label: 'Number of Scope 3 categories in scope (1–15)',
          type: 'number',
          required: false,
          placeholder: String(row.category_count ?? ''),
        },
        {
          key: 'category_list',
          label: 'Category list — comma-separated category numbers (e.g. 1,3,4,11,12)',
          type: 'text',
          required: false,
          placeholder: row.category_list ?? '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'withdraw',
      label: 'Withdraw',
      tone: 'danger',
      fields: [
        {
          key: 'reason',
          label: 'Withdrawal reason',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'category_boundaries_set') {
    actions.push({
      key: 'open_data_collection',
      label: 'Open data collection',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'withdraw',
      label: 'Withdraw',
      tone: 'danger',
      fields: [
        {
          key: 'reason',
          label: 'Withdrawal reason',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'data_collection_open') {
    actions.push({
      key: 'close_data_collection',
      label: 'Close data collection',
      tone: 'primary',
      fields: [
        {
          key: 'primary_data_coverage_pct',
          label: 'Primary-data coverage (% of spend/activity covered by primary data)',
          type: 'number',
          required: false,
          placeholder: String(row.primary_data_coverage_pct ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'data_collection_complete') {
    actions.push({
      key: 'run_calculations',
      label: 'Run GHG calculations',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (s === 'emission_calculations') {
    actions.push({
      key: 'complete_internal_review',
      label: 'Complete internal review',
      tone: 'primary',
      fields: [
        {
          key: 'scope3_total_tco2e',
          label: 'Reviewed Scope 3 total (tCO₂e)',
          type: 'number',
          required: false,
          placeholder: String(row.scope3_total_tco2e ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'calculations_reviewed') {
    actions.push({
      key: 'submit_for_assurance',
      label: 'Submit for assurance',
      tone: 'primary',
      fields: [
        {
          key: 'assurance_provider',
          label: 'Assurance provider',
          type: 'text',
          required: false,
          placeholder: row.assurance_provider ?? '',
        },
        {
          key: 'assurance_standard',
          label: 'Assurance standard — AA1000AS / ISO 14064-3 / ISAE 3000',
          type: 'text',
          required: false,
          placeholder: row.assurance_standard ?? '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'file_disclosure',
      label: 'File disclosure',
      tone: 'ghost',
      fields: [
        {
          key: 'filing_platform',
          label: 'Filing platform — CDP / JSE / ISSB registry / SA Climate Registry',
          type: 'text',
          required: false,
          placeholder: row.filing_platform ?? '',
        },
        {
          key: 'filing_ref',
          label: 'Filing reference',
          type: 'text',
          required: false,
          placeholder: row.filing_ref ?? '',
        },
      ],
      // comprehensive + full_chain cross CDP/JSE threshold → regulator
      cascadeTo: ['comprehensive', 'full_chain'].includes(row.s3_tier) ? ['regulator'] : [],
    });
  }

  if (s === 'assurance_submitted') {
    actions.push({
      key: 'issue_limited_assurance',
      label: 'Issue limited assurance',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'issue_reasonable_assurance',
      label: 'Issue reasonable assurance',
      tone: 'ghost',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'qualify_assurance',
      label: 'Qualify (material error)',
      tone: 'danger',
      fields: [
        {
          key: 'qualified_opinion_reason',
          label: 'Qualified-opinion reason — the material misstatement found',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      // qualified opinions always cross to regulator (all tiers)
      cascadeTo: ['regulator'],
    });
  }

  if (s === 'limited_assurance_complete') {
    actions.push({
      key: 'issue_reasonable_assurance',
      label: 'Issue reasonable assurance',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'file_disclosure',
      label: 'File disclosure',
      tone: 'ghost',
      fields: [
        {
          key: 'filing_platform',
          label: 'Filing platform — CDP / JSE / ISSB registry / SA Climate Registry',
          type: 'text',
          required: false,
          placeholder: row.filing_platform ?? '',
        },
        {
          key: 'filing_ref',
          label: 'Filing reference',
          type: 'text',
          required: false,
          placeholder: row.filing_ref ?? '',
        },
      ],
      cascadeTo: ['comprehensive', 'full_chain'].includes(row.s3_tier) ? ['regulator'] : [],
    });
  }

  if (s === 'reasonable_assurance_complete') {
    actions.push({
      key: 'file_disclosure',
      label: 'File disclosure',
      tone: 'primary',
      fields: [
        {
          key: 'filing_platform',
          label: 'Filing platform — CDP / JSE / ISSB registry / SA Climate Registry',
          type: 'text',
          required: false,
          placeholder: row.filing_platform ?? '',
        },
        {
          key: 'filing_ref',
          label: 'Filing reference',
          type: 'text',
          required: false,
          placeholder: row.filing_ref ?? '',
        },
      ],
      cascadeTo: ['comprehensive', 'full_chain'].includes(row.s3_tier) ? ['regulator'] : [],
    });
  }

  return actions;
}

function renderDetail(row: S3Row): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Tier"                   value={TIER_LABEL[row.s3_tier]} />
      <DetailPair label="Reporting year"         value={String(row.reporting_year)} />
      <DetailPair label="Framework"              value={row.reporting_framework ?? '—'} />
      <DetailPair label="Categories in scope"    value={row.category_count != null ? `${row.category_count}${row.category_list ? ` (${row.category_list})` : ''}` : '—'} />
      <DetailPair label="Primary-data coverage"  value={fmtPct(row.primary_data_coverage_pct)} />
      <DetailPair label="Supplier responses"     value={row.supplier_responses != null ? String(row.supplier_responses) : '—'} />
      <DetailPair label="Scope 3 total"          value={fmtTco2e(row.scope3_total_tco2e)} />
      <DetailPair label="Cat 1 purchased goods"  value={fmtTco2e(row.cat1_purchased_goods_tco2e)} />
      <DetailPair label="Cat 3 fuel & energy"    value={fmtTco2e(row.cat3_fuel_energy_tco2e)} />
      <DetailPair label="Cat 11 use of products" value={fmtTco2e(row.cat11_use_of_products_tco2e)} />
      <DetailPair label="Cat 12 end-of-life"     value={fmtTco2e(row.cat12_eol_treatment_tco2e)} />
      <DetailPair label="Assurance provider"     value={row.assurance_provider ?? '—'} />
      <DetailPair label="Assurance standard"     value={row.assurance_standard ?? '—'} />
      <DetailPair label="Assurance type"         value={row.assurance_type ?? '—'} />
      <DetailPair label="Assurance completed"    value={fmtDate(row.assurance_completed_at)} />
      <DetailPair label="Filing platform"        value={row.filing_platform ?? '—'} />
      <DetailPair label="Filing ref"             value={row.filing_ref ?? '—'} />
      <DetailPair label="Filing submitted"       value={fmtDate(row.filing_submitted_at)} />
      <DetailPair label="Categories set"         value={fmtDate(row.categories_set_at)} />
      <DetailPair label="Collection opened"      value={fmtDate(row.data_collection_opened_at)} />
      <DetailPair label="Collection closed"      value={fmtDate(row.data_collection_closed_at)} />
      <DetailPair label="Calculations done"      value={fmtDate(row.calculations_completed_at)} />
      <DetailPair label="Review done"            value={fmtDate(row.review_completed_at)} />
      <DetailPair label="SLA deadline"           value={fmtDate(row.sla_deadline)} />
      <DetailPair label="Regulator notified"     value={row.regulator_notified ? 'Yes' : 'No'} />
      {row.qualified_opinion_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Qualified-opinion reason</div>
          <div style={{ color: BAD }}>{row.qualified_opinion_reason}</div>
        </div>
      )}
      {row.reason && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Last reason</div>
          <div style={{ color: TX2 }}>{row.reason}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function Scope3DisclosureChainTab() {
  const [rows, setRows] = useState<S3Row[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: S3Row[]; kpis: Kpis }>('/carbon/scope3-disclosure/chain');
      setRows(res.data?.data || []);
      setKpis(res.data?.kpis || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load Scope 3 disclosures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/carbon/scope3-disclosure/chain/${rowId}/action`, { action: key, ...values });
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: S3Row; timeline: AuditEvent[] }>(`/carbon/scope3-disclosure/chain/${rowId}`);
          const evts: ChainEvent[] = (res.data?.timeline ?? []).map((e) => ({
            id: e.id,
            event_type: e.event_type,
            actor_id: e.actor_id,
            created_at: e.created_at,
            payload: e.payload_json,
          }));
          setExpandedEvents(prev => ({ ...prev, [rowId]: evts }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: S3Row; timeline: AuditEvent[] }>(`/carbon/scope3-disclosure/chain/${id}`);
      const evts: ChainEvent[] = (res.data?.timeline ?? []).map((e) => ({
        id: e.id,
        event_type: e.event_type,
        actor_id: e.actor_id,
        created_at: e.created_at,
        payload: e.payload_json,
      }));
      setExpandedEvents(prev => ({ ...prev, [id]: evts }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (filter === 'all')       return true;
    if (filter === 'active')    return !TERMINALS.includes(r.chain_status);
    if (filter === 'filed')     return r.chain_status === 'disclosure_filed';
    if (filter === 'assurance') return ['assurance_submitted', 'limited_assurance_complete', 'reasonable_assurance_complete'].includes(r.chain_status);
    if (filter === 'breached')  return !!r.sla_breached;
    if (['micro', 'standard', 'comprehensive', 'full_chain'].includes(filter)) return r.s3_tier === filter;
    return r.chain_status === filter;
  }), [rows, filter]);

  const k = kpis ?? { total: rows.length, in_progress: 0, filed: 0, qualified: 0, sla_breached: 0 };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Scope 3 value-chain disclosure &amp; assurance</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2, maxWidth: 720 }}>
          12-stage GHG Protocol Scope 3 chain · initiated → categories set → data collection → calculations →
          internal review → third-party assurance → filed. A reviewed disclosure may file directly without
          assurance; assurance may return a qualified opinion (material error). INVERTED SLA: a wider Scope 3
          boundary earns more data-collection time (micro 21d to full_chain 60d). Qualified opinions always cross
          to the regulator inbox; comprehensive and full-chain filings cross the CDP/JSE mandatory threshold
          (TCFD + ISSB IFRS S2 + GHG Protocol Scope 3 + CDP).
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"       value={k.total} />
        <KpiTile label="In progress" value={k.in_progress} tone={k.in_progress > 0 ? 'warn' : undefined} />
        <KpiTile label="Filed"       value={k.filed} />
        <KpiTile label="Qualified"   value={k.qualified}   tone={k.qualified > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached" value={k.sla_breached} tone={k.sla_breached > 0 ? 'bad' : undefined} />
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

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>{err}</div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{
                ...row,
                sla_deadline_at: row.sla_deadline ?? null,
                sla_breached: !!row.sla_breached,
                is_terminal: TERMINALS.includes(row.chain_status),
              }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.entity_name ?? row.id.slice(0, 12)}
              meta={
                <span style={{ color: TX3, fontSize: 11 }}>
                  {TIER_LABEL[row.s3_tier]} · FY{row.reporting_year}
                  {row.reporting_framework ? ` · ${row.reporting_framework}` : ''}
                  {row.regulator_notified ? ' · ⚑ regulator notified' : ''}
                </span>
              }
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No Scope 3 disclosures match.</div>
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
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default Scope3DisclosureChainTab;
