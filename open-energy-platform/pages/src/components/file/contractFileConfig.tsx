// ════════════════════════════════════════════════════════════════════════
// contractFileConfig — tab map + hero for the contract document file.
//
// Consumed by ContractDetail.tsx. Mirrors the project-file pattern:
//   - The shell fetches /contracts/:id/file once.
//   - heroFor() builds the gradient hero from data.contract + summary.
//   - Each tab pulls rows from the matching aggregator section.
//
// Aggregator shape (src/routes/contracts.ts → /:id/file):
//   { contract, phase, summary,
//     document, commercial, settlement, metering, variations,
//     linked, compliance, audit, ai_suggestions }
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { OEIcon } from '../OEIcon';
import {
  FileSection,
  FileTable,
  StatusCell,
  fmtDate,
  fmtZAR,
  fmtNum,
} from './FileTable';
import type { EntityFileHero, EntityFileTab, EntityFileSummary } from './EntityFileShell';

// ── Shape of /contracts/:id/file response ─────────────────────────────────
export interface ContractFileData {
  contract: {
    id: string;
    title: string;
    document_type?: string;
    phase?: string;
    creator_id?: string;
    counterparty_id?: string;
    creator_name?: string;
    creator_company?: string;
    counterparty_name?: string;
    counterparty_company?: string;
    project_id?: string;
    integrity_seal?: string;
    template_id?: string;
    version?: number;
    created_at?: string;
    updated_at?: string;
  };
  phase: string;
  summary: EntityFileSummary;
  document: {
    signatories: any[];
    statutory_checks: any[];
    template: any;
    rendered_body: string;
    can_sign: boolean;
    current_user_id: string;
  };
  commercial: {
    terms: Record<string, unknown>;
    template_code: string | null;
  };
  settlement: {
    invoices: any[];
    payments: any[];
    disputes: any[];
    dlq: any[];
    run_events: any[];
  };
  metering: {
    daily_readings: any[];
    nominations: any[];
    delivery_schedule: any[];
  };
  variations: {
    epc_contracts: any[];
    epc_variations: any[];
    epc_liquidated_damages: any[];
  };
  linked: {
    project: any | null;
    source_lois: any[];
    om_sites: any[];
  };
  compliance: {
    covenants: any[];
    env_authorisations: any[];
    kyc_screenings: any[];
    kyc_risk_scores: any[];
  };
  audit: {
    events: any[];
    logs: any[];
  };
  ai_suggestions: any[];
}

// ── Hero ──────────────────────────────────────────────────────────────────
export function contractHero(data: ContractFileData): EntityFileHero {
  const c = data.contract;
  const s = data.summary;
  const docType = (c.document_type || '').toLowerCase();
  const typeIcon = ({ size }: { size?: number }) => (
    <OEIcon
      name={
        docType.includes('ppa') || docType.includes('wheel') ? 'bolt'
          : docType.includes('epc') ? 'wrench'
          : docType.includes('carbon') || docType.includes('erpa') ? 'leaf'
          : docType.includes('loi') || docType.includes('term') ? 'loi'
          : 'doc'
      }
      size={size || 12}
    />
  );
  const phaseLabel: Record<string, string> = {
    draft: 'Draft',
    legal_review: 'In legal review',
    hoa: 'HoA signed',
    signed: 'Executed',
    active: 'Active',
    expired: 'Expired',
    terminated: 'Terminated',
  };
  const niceType = (c.document_type || 'contract')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
  return {
    eyebrowIcon: typeIcon,
    eyebrowLabel: `${niceType} · ${phaseLabel[c.phase || ''] || c.phase || 'unknown'}`,
    title: c.title || 'Untitled contract',
    subtitle: `${c.creator_company || c.creator_name || 'Seller'} ↔ ${c.counterparty_company || c.counterparty_name || 'Buyer'}`,
    accentFrom: '#1f2a4d',
    accentTo: '#0b1733',
    kpis: [
      {
        key: 'signatures',
        label: 'Signatures',
        value: `${Number(s.signatories_signed || 0)} / ${Number(s.signatories_total || 0)}`,
        tone: Number(s.signatories_signed || 0) === Number(s.signatories_total || 0) && Number(s.signatories_total || 0) > 0 ? 'good' : 'warn',
      },
      {
        key: 'invoices',
        label: 'Invoices paid',
        value: `${Number(s.invoices_paid || 0)} / ${Number(s.invoices_total || 0)}`,
      },
      {
        key: 'covenants',
        label: 'Covenants',
        value: Number(s.covenants_breached || 0) > 0
          ? `${Number(s.covenants_breached || 0)} breached`
          : `${Number(s.covenants_active || 0)} active`,
        tone: Number(s.covenants_breached || 0) > 0 ? 'bad' : 'good',
      },
      {
        key: 'variations',
        label: 'Variations',
        value: `${Number(s.variations_approved || 0)} / ${Number(s.variations_total || 0)}`,
      },
    ],
  };
}

// ── Tabs ──────────────────────────────────────────────────────────────────
export const contractFileTabs: EntityFileTab<ContractFileData>[] = [
  // ── Overview ────────────────────────────────────────────────────────────
  {
    id: 'overview',
    label: 'Overview',
    icon: ({ size }) => <OEIcon name="dashboard" size={size} />,
    render: (data) => {
      const c = data.contract;
      const s = data.summary;
      const ct = data.commercial.terms;
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <FileSection title="Contract facts">
            <div className="p-5">
              <dl className="text-[13px] space-y-2">
                <Row label="Document type" value={(c.document_type || '—').replace(/_/g, ' ')} />
                <Row label="Phase" value={<StatusCell value={c.phase} />} />
                <Row label="Seller" value={c.creator_company || c.creator_name || '—'} />
                <Row label="Buyer" value={c.counterparty_company || c.counterparty_name || '—'} />
                <Row label="Project" value={data.linked.project ? data.linked.project.project_name : (c.project_id || '—')} />
                <Row label="Created" value={fmtDate(c.created_at)} />
                <Row label="Version" value={c.version != null ? `v${c.version}` : '—'} />
                <Row label="Integrity seal" value={c.integrity_seal ? `${String(c.integrity_seal).slice(0, 12)}…` : '—'} />
              </dl>
            </div>
          </FileSection>

          <div className="lg:col-span-2 space-y-4">
            <FileSection title="Commercial highlights" subtitle="Headline terms pulled from commercial_terms JSON.">
              <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3 text-[13px]">
                <Kv label="Volume" value={ct.volume_mwh != null ? `${fmtNum(Number(ct.volume_mwh))} MWh/yr` : '—'} />
                <Kv label="Price" value={ct.price_per_mwh != null ? `${fmtZAR(Number(ct.price_per_mwh))}/MWh` : '—'} />
                <Kv label="Tenor" value={ct.tenor_years != null ? `${ct.tenor_years} years` : '—'} />
                <Kv label="Escalation" value={ct.escalation != null ? `${ct.escalation}%` : '—'} />
                <Kv label="Energy type" value={String(ct.energy_type || '—').replace(/_/g, ' ')} />
                <Kv label="Carbon share" value={ct.carbon_share != null ? `${ct.carbon_share}%` : '—'} />
                <Kv label="Location" value={String(ct.location || '—')} />
                <Kv label="Effective date" value={fmtDate(c.created_at)} />
                <Kv label="Governing law" value="South Africa" />
              </div>
            </FileSection>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MicroKpi label="Outstanding invoices" value={Number(s.invoices_outstanding || 0)} tone={Number(s.invoices_outstanding || 0) > 0 ? 'warn' : 'good'} />
              <MicroKpi label="Disputes filed" value={Number(s.disputes_total || 0)} tone={Number(s.disputes_total || 0) > 0 ? 'warn' : 'good'} />
              <MicroKpi label="O&M sites linked" value={Number(s.linked_om_sites || 0)} />
              <MicroKpi label="Source LOIs" value={Number(s.source_lois || 0)} />
              <MicroKpi label="Env authorisations" value={Number(s.env_authorisations_total || 0)} />
              <MicroKpi label="LDs (R)" value={fmtZAR(Number(s.liquidated_damages_total_zar || 0))} tone={Number(s.liquidated_damages_total_zar || 0) > 0 ? 'warn' : 'good'} />
              <MicroKpi label="Nominations" value={Number(s.nominations_total || 0)} />
              <MicroKpi label="Audit events" value={Number(s.audit_events || 0)} />
            </div>
          </div>
        </div>
      );
    },
  },

  // ── Document (rendered legal text + signatories + statutory checks) ─────
  {
    id: 'document',
    label: 'Document',
    icon: ({ size }) => <OEIcon name="doc" size={size} />,
    badgeFromSummary: (s) => Number(s.signatories_total || 0),
    render: (data) => (
      <>
        <FileSection
          title="Rendered legal text"
          subtitle={data.document.template ? `Template ${data.document.template.code} · v${data.document.template.version}` : 'Fallback contract body.'}
        >
          <div className="px-5 py-4 max-h-[480px] overflow-auto bg-[var(--s1, #fafbfd)] border-t border-[var(--s2, #eef2f7)]">
            <pre className="font-mono text-[12px] text-[var(--ink, #0f1c2e)] whitespace-pre-wrap leading-relaxed">
              {data.document.rendered_body}
            </pre>
          </div>
        </FileSection>

        <FileSection title="Signatories" subtitle="Each signature is hash-anchored to the document at the time of signing.">
          <FileTable
            rows={data.document.signatories as any[]}
            emptyMessage="No signatories on this contract yet."
            columns={[
              { key: 'signatory_name', label: 'Name', render: (r: any) => r.signatory_name || r.participant_name || '—' },
              { key: 'participant_company', label: 'Company' },
              { key: 'signatory_designation', label: 'Designation' },
              { key: 'signed', label: 'Status', render: (r: any) => <StatusCell value={r.signed ? 'signed' : 'pending'} /> },
              { key: 'signed_at', label: 'Signed at', mono: true, render: (r: any) => fmtDate(r.signed_at) },
              { key: 'document_hash_at_signing', label: 'Hash', mono: true, render: (r: any) => r.document_hash_at_signing ? String(r.document_hash_at_signing).slice(0, 10) + '…' : '—' },
            ]}
          />
        </FileSection>

        <FileSection title="Statutory checks" subtitle="POPIA s.18 notice, B-BBEE verification, NERSA disclosure, etc.">
          <FileTable
            rows={data.document.statutory_checks as any[]}
            emptyMessage="No statutory checks logged."
            columns={[
              { key: 'check_type', label: 'Check', render: (r: any) => (r.check_type || '').replace(/_/g, ' ') },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
              { key: 'due_date', label: 'Due', mono: true, render: (r: any) => fmtDate(r.due_date) },
              { key: 'result', label: 'Result' },
              { key: 'notes', label: 'Notes' },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Commercial terms ─────────────────────────────────────────────────────
  {
    id: 'commercial',
    label: 'Commercial',
    icon: ({ size }) => <OEIcon name="wallet" size={size} />,
    render: (data) => {
      const entries = Object.entries(data.commercial.terms || {});
      const rows = entries.map(([key, value]) => ({
        id: key,
        key,
        value: typeof value === 'object' ? JSON.stringify(value) : String(value),
      }));
      return (
        <FileSection
          title="Commercial terms"
          subtitle={data.commercial.template_code ? `Bound to template ${data.commercial.template_code}.` : 'Free-form commercial terms.'}
        >
          <FileTable
            rows={rows}
            emptyMessage="No commercial terms defined."
            columns={[
              { key: 'key', label: 'Term', render: (r: any) => r.key.replace(/_/g, ' ') },
              { key: 'value', label: 'Value', mono: true },
            ]}
          />
        </FileSection>
      );
    },
  },

  // ── Settlement ───────────────────────────────────────────────────────────
  {
    id: 'settlement',
    label: 'Settlement',
    icon: ({ size }) => <OEIcon name="currency-zar" size={size} />,
    badgeFromSummary: (s) => Number(s.invoices_total || 0),
    render: (data) => (
      <>
        <FileSection title="Invoices" subtitle="Settlement invoices raised under this contract / linked project.">
          <FileTable
            rows={data.settlement.invoices as any[]}
            emptyMessage="No invoices generated yet."
            columns={[
              { key: 'invoice_number', label: 'Invoice' },
              { key: 'invoice_type', label: 'Type' },
              { key: 'period_start', label: 'Period', mono: true, render: (r: any) => `${fmtDate(r.period_start)} → ${fmtDate(r.period_end)}` },
              { key: 'total_amount', label: 'Total', align: 'right', mono: true, render: (r: any) => fmtZAR(r.total_amount) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
              { key: 'due_date', label: 'Due', mono: true, render: (r: any) => fmtDate(r.due_date) },
            ]}
          />
        </FileSection>

        <FileSection title="Payments" subtitle="Cash received against invoices under this contract.">
          <FileTable
            rows={data.settlement.payments as any[]}
            emptyMessage="No payments received yet."
            columns={[
              { key: 'payment_reference', label: 'Reference' },
              { key: 'amount', label: 'Amount', align: 'right', mono: true, render: (r: any) => fmtZAR(r.amount) },
              { key: 'payment_method', label: 'Method' },
              { key: 'payment_date', label: 'Date', mono: true, render: (r: any) => fmtDate(r.payment_date) },
              { key: 'reconciled', label: 'Reconciled', render: (r: any) => <StatusCell value={r.reconciled ? 'reconciled' : 'pending'} /> },
              { key: 'bank_reference', label: 'Bank ref', mono: true },
            ]}
          />
        </FileSection>

        <FileSection title="Disputes" subtitle="Settlement disputes raised against invoices.">
          <FileTable
            rows={data.settlement.disputes as any[]}
            emptyMessage="No disputes filed."
            columns={[
              { key: 'reason', label: 'Reason' },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
              { key: 'created_at', label: 'Filed', mono: true, render: (r: any) => fmtDate(r.created_at) },
              { key: 'resolution', label: 'Resolution' },
              { key: 'resolved_at', label: 'Resolved', mono: true, render: (r: any) => fmtDate(r.resolved_at) },
            ]}
          />
        </FileSection>

        <FileSection title="Dead-letter queue" subtitle="Settlement runs that failed for this contract — usually fixable inputs.">
          <FileTable
            rows={data.settlement.dlq as any[]}
            emptyMessage="No settlement runs have failed for this contract."
            columns={[
              { key: 'period_start', label: 'Period', mono: true, render: (r: any) => `${fmtDate(r.period_start)} → ${fmtDate(r.period_end)}` },
              { key: 'error_message', label: 'Error' },
              { key: 'attempt_count', label: 'Attempts', align: 'right', mono: true },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
              { key: 'last_attempt_at', label: 'Last try', mono: true, render: (r: any) => fmtDate(r.last_attempt_at) },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Metering & delivery ──────────────────────────────────────────────────
  {
    id: 'metering',
    label: 'Metering',
    icon: ({ size }) => <OEIcon name="gauge" size={size} />,
    badgeFromSummary: (s) => Number(s.metering_days || 0),
    render: (data) => (
      <>
        <FileSection title="Daily metering" subtitle="ONA daily reads aggregated from raw SCADA / smart-meter ingest.">
          <FileTable
            rows={data.metering.daily_readings as any[]}
            emptyMessage="No daily reads ingested yet."
            columns={[
              { key: 'reading_date', label: 'Date', mono: true, render: (r: any) => fmtDate(r.reading_date) },
              { key: 'export_kwh_sum', label: 'Exported (kWh)', align: 'right', mono: true, render: (r: any) => fmtNum(r.export_kwh_sum) },
              { key: 'import_kwh_sum', label: 'Imported (kWh)', align: 'right', mono: true, render: (r: any) => fmtNum(r.import_kwh_sum) },
              { key: 'peak_demand_kw', label: 'Peak (kW)', align: 'right', mono: true, render: (r: any) => fmtNum(r.peak_demand_kw, 1) },
            ]}
          />
        </FileSection>

        <FileSection title="Nominations" subtitle="Day-ahead delivery nominations against contracted MW/MWh.">
          <FileTable
            rows={data.metering.nominations as any[]}
            emptyMessage="No nominations on file."
            columns={[
              { key: 'delivery_date', label: 'Delivery', mono: true, render: (r: any) => fmtDate(r.delivery_date) },
              { key: 'nominated_mwh', label: 'Nominated', align: 'right', mono: true, render: (r: any) => fmtNum(r.nominated_mwh, 2) },
              { key: 'delivered_mwh', label: 'Delivered', align: 'right', mono: true, render: (r: any) => fmtNum(r.delivered_mwh, 2) },
              { key: 'variance_mwh', label: 'Variance', align: 'right', mono: true, render: (r: any) => fmtNum(r.variance_mwh, 2) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>

        <FileSection title="Trade delivery schedule" subtitle="Per-match delivery obligations and acknowledged volumes.">
          <FileTable
            rows={data.metering.delivery_schedule as any[]}
            emptyMessage="No matched-trade deliveries recorded."
            columns={[
              { key: 'scheduled_date', label: 'Date', mono: true, render: (r: any) => fmtDate(r.scheduled_date) },
              { key: 'scheduled_volume_mwh', label: 'Scheduled', align: 'right', mono: true, render: (r: any) => fmtNum(r.scheduled_volume_mwh, 2) },
              { key: 'actual_volume_mwh', label: 'Actual', align: 'right', mono: true, render: (r: any) => fmtNum(r.actual_volume_mwh, 2) },
              { key: 'variance_percent', label: 'Variance', align: 'right', mono: true, render: (r: any) => r.variance_percent != null ? `${fmtNum(r.variance_percent, 1)}%` : '—' },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Variations & liquidated damages ──────────────────────────────────────
  {
    id: 'variations',
    label: 'Variations',
    icon: ({ size }) => <OEIcon name="edit" size={size} />,
    badgeFromSummary: (s) => Number(s.variations_total || 0),
    render: (data) => (
      <>
        <FileSection title="EPC variations" subtitle="Change orders, scope extensions, and additions to the works.">
          <FileTable
            rows={data.variations.epc_variations as any[]}
            emptyMessage="No variations raised."
            columns={[
              { key: 'variation_number', label: 'VO #' },
              { key: 'description', label: 'Description' },
              { key: 'value_zar', label: 'Value', align: 'right', mono: true, render: (r: any) => fmtZAR(r.value_zar) },
              { key: 'time_impact_days', label: 'Time (d)', align: 'right', mono: true },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
              { key: 'raised_at', label: 'Raised', mono: true, render: (r: any) => fmtDate(r.raised_at) },
            ]}
          />
        </FileSection>

        <FileSection title="Liquidated damages" subtitle="Delay + performance LD events and capped exposure.">
          <FileTable
            rows={data.variations.epc_liquidated_damages as any[]}
            emptyMessage="No liquidated damages levied."
            columns={[
              { key: 'event_type', label: 'Event', render: (r: any) => (r.event_type || '').replace(/_/g, ' ') },
              { key: 'event_date', label: 'Date', mono: true, render: (r: any) => fmtDate(r.event_date) },
              { key: 'description', label: 'Description' },
              { key: 'calculated_amount_zar', label: 'Calculated', align: 'right', mono: true, render: (r: any) => fmtZAR(r.calculated_amount_zar) },
              { key: 'capped_amount_zar', label: 'Capped', align: 'right', mono: true, render: (r: any) => fmtZAR(r.capped_amount_zar) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Linked entities ──────────────────────────────────────────────────────
  {
    id: 'linked',
    label: 'Linked',
    icon: ({ size }) => <OEIcon name="workflow" size={size} />,
    render: (data) => (
      <>
        <FileSection title="Linked project" subtitle="The underlying IPP project this contract sits over.">
          {data.linked.project ? (
            <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3 text-[13px]">
              <Kv label="Project" value={
                <a href={`/projects/${data.linked.project.id}`} className="text-[var(--info, #1a5d97)] font-semibold hover:underline">
                  {data.linked.project.project_name}
                </a>
              } />
              <Kv label="Technology" value={data.linked.project.technology || '—'} />
              <Kv label="Capacity" value={data.linked.project.capacity_mw ? `${fmtNum(data.linked.project.capacity_mw, 1)} MW` : '—'} />
              <Kv label="Status" value={<StatusCell value={data.linked.project.status} />} />
              <Kv label="Developer" value={data.linked.project.developer_name || '—'} />
              <Kv label="Location" value={data.linked.project.location || '—'} />
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-[13px] text-[var(--ink-2, #6b7685)]">No underlying project linked.</div>
          )}
        </FileSection>

        <FileSection title="Source LOIs" subtitle="Letters of Intent that resolved into this contract.">
          <FileTable
            rows={data.linked.source_lois as any[]}
            emptyMessage="No LOIs resulted in this contract."
            columns={[
              { key: 'id', label: 'LOI', render: (r: any) => (
                <a href={`/lois/${r.id}`} className="text-[var(--info, #1a5d97)] font-semibold hover:underline">{r.id}</a>
              ) },
              { key: 'annual_mwh', label: 'Annual MWh', align: 'right', mono: true, render: (r: any) => fmtNum(r.annual_mwh) },
              { key: 'blended_price', label: 'Blended price', align: 'right', mono: true, render: (r: any) => fmtZAR(r.blended_price) },
              { key: 'horizon_years', label: 'Horizon', align: 'right', mono: true, render: (r: any) => r.horizon_years ? `${r.horizon_years} yrs` : '—' },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
              { key: 'resolved_at', label: 'Resolved', mono: true, render: (r: any) => fmtDate(r.resolved_at) },
            ]}
          />
        </FileSection>

        <FileSection title="Linked O&M sites" subtitle="Operating sites whose PPA points to this contract.">
          <FileTable
            rows={data.linked.om_sites as any[]}
            emptyMessage="No O&M sites linked to this contract."
            columns={[
              { key: 'name', label: 'Site', render: (r: any) => (
                <a href={`/esums/sites/${r.id}`} className="text-[var(--info, #1a5d97)] font-semibold hover:underline">{r.name}</a>
              ) },
              { key: 'technology', label: 'Tech', render: (r: any) => (r.technology || '').replace(/_/g, ' ') },
              { key: 'capacity_mw', label: 'Capacity', align: 'right', mono: true, render: (r: any) => r.capacity_mw ? `${fmtNum(r.capacity_mw, 1)} MW` : '—' },
              { key: 'province', label: 'Province' },
              { key: 'ppa_tariff_zar_mwh', label: 'PPA tariff', align: 'right', mono: true, render: (r: any) => fmtZAR(r.ppa_tariff_zar_mwh) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Compliance ───────────────────────────────────────────────────────────
  {
    id: 'compliance',
    label: 'Compliance',
    icon: ({ size }) => <OEIcon name="shield" size={size} />,
    badgeFromSummary: (s) => Number(s.covenants_active || 0) + Number(s.env_authorisations_total || 0),
    render: (data) => (
      <>
        <FileSection title="Project covenants" subtitle="Lender covenants on the underlying project — breaches risk cross-default.">
          <FileTable
            rows={data.compliance.covenants as any[]}
            emptyMessage="No covenants attached to the linked project."
            columns={[
              { key: 'covenant_code', label: 'Code' },
              { key: 'covenant_name', label: 'Covenant' },
              { key: 'covenant_type', label: 'Type' },
              { key: 'threshold', label: 'Threshold', align: 'right', mono: true },
              { key: 'measurement_frequency', label: 'Cadence' },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>

        <FileSection title="Environmental authorisations" subtitle="NEMA s.24, WUL, waste, heritage permits on the linked project.">
          <FileTable
            rows={data.compliance.env_authorisations as any[]}
            emptyMessage="No environmental authorisations linked."
            columns={[
              { key: 'authorisation_type', label: 'Type' },
              { key: 'reference_number', label: 'Reference', mono: true },
              { key: 'competent_authority', label: 'Authority' },
              { key: 'applied_date', label: 'Applied', mono: true, render: (r: any) => fmtDate(r.applied_date) },
              { key: 'decision', label: 'Decision', render: (r: any) => <StatusCell value={r.decision} /> },
              { key: 'expiry_date', label: 'Expires', mono: true, render: (r: any) => fmtDate(r.expiry_date) },
            ]}
          />
        </FileSection>

        <FileSection title="Counterparty KYC screenings" subtitle="Sanction / PEP screens on the parties to this contract.">
          <FileTable
            rows={data.compliance.kyc_screenings as any[]}
            emptyMessage="No KYC screenings on file for the parties."
            columns={[
              { key: 'participant_id', label: 'Party', mono: true },
              { key: 'screening_type', label: 'Type' },
              { key: 'list_source', label: 'Source' },
              { key: 'match_found', label: 'Match', render: (r: any) => <StatusCell value={r.match_found ? 'hit' : 'clear'} /> },
              { key: 'created_at', label: 'Screened', mono: true, render: (r: any) => fmtDate(r.created_at) },
            ]}
          />
        </FileSection>

        <FileSection title="Counterparty risk scores" subtitle="Latest risk scores per party.">
          <FileTable
            rows={data.compliance.kyc_risk_scores as any[]}
            emptyMessage="No risk scores logged for the parties."
            columns={[
              { key: 'participant_id', label: 'Party', mono: true },
              { key: 'risk_rating', label: 'Rating', render: (r: any) => <StatusCell value={r.risk_rating} /> },
              { key: 'risk_score', label: 'Score', align: 'right', mono: true },
              { key: 'scored_at', label: 'Scored', mono: true, render: (r: any) => fmtDate(r.scored_at) },
              { key: 'methodology', label: 'Methodology' },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Audit ────────────────────────────────────────────────────────────────
  {
    id: 'audit',
    label: 'Audit',
    icon: ({ size }) => <OEIcon name="clock" size={size} />,
    badgeFromSummary: (s) => Number(s.audit_events || 0),
    render: (data) => (
      <>
        <FileSection title="Tamper-evident events" subtitle="Hash-chained audit events for this contract. Each row anchors the previous.">
          <FileTable
            rows={data.audit.events as any[]}
            emptyMessage="No tamper-evident events have been emitted yet."
            columns={[
              { key: 'sequence_no', label: 'Seq', align: 'right', mono: true },
              { key: 'event_type', label: 'Event', render: (r: any) => (r.event_type || '').replace(/_/g, ' ') },
              { key: 'created_at', label: 'When', mono: true, render: (r: any) => fmtDate(r.created_at) },
              { key: 'actor_id', label: 'Actor', mono: true },
              { key: 'content_hash', label: 'Hash', mono: true, render: (r: any) => r.content_hash ? String(r.content_hash).slice(0, 12) + '…' : '—' },
            ]}
          />
        </FileSection>

        <FileSection title="Activity log" subtitle="Free-form mutations recorded against the contract.">
          <FileTable
            rows={data.audit.logs as any[]}
            emptyMessage="No activity recorded."
            columns={[
              { key: 'action', label: 'Action' },
              { key: 'actor_name', label: 'Actor' },
              { key: 'created_at', label: 'When', mono: true, render: (r: any) => fmtDate(r.created_at) },
              { key: 'ip_address', label: 'From', mono: true },
            ]}
          />
        </FileSection>
      </>
    ),
  },
];

// ── Small utility cells (mirrors projectFileConfig) ──────────────────────
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-[var(--ink-2, #6b7685)]">{label}</dt>
      <dd className="text-[var(--ink, #0f1c2e)] font-medium text-right">{value}</dd>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle, #dde4ec)] bg-[var(--s1, #fafbfd)] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">{label}</div>
      <div className="mt-1 text-[var(--ink, #0f1c2e)] font-semibold leading-tight">{value}</div>
    </div>
  );
}

function MicroKpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  const toneColor =
    tone === 'good' ? '#1f8a4f'
      : tone === 'warn' ? '#b27a00'
      : tone === 'bad' ? '#b3261e'
      : 'var(--ink, #0f1c2e)';
  return (
    <div className="rounded-lg border border-[var(--border-subtle, #dde4ec)] bg-surface-v2 p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">{label}</div>
      <div className="mt-1 font-mono text-[18px] font-bold leading-tight" style={{ fontVariantNumeric: 'tabular-nums', color: toneColor }}>
        {value}
      </div>
    </div>
  );
}
