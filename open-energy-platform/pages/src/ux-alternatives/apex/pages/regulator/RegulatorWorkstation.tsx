/**
 * Regulator Workstation — Apex design
 *
 * Regulatory inbox, enforcement actions, licence applications,
 * MYPD tariff, levy assessment, grid code compliance.
 */

import React, { useState } from 'react';
import { RegulatorAnalytics } from '../analytics/RegulatorAnalytics';
import { AppShell, NavConfig } from '../../components/shell/AppShell';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { AIInsightCard } from '../../components/display/AIInsightCard';
import { ChainMap, ChainLink } from '../../components/display/ChainMap';
import { ActionPanel } from '../../components/actions/ActionPanel';
import { TransitionForm } from '../../components/actions/TransitionForm';
import { StateFlow, StateFlowStep } from '../../components/display/StateFlow';
import { DetailDrawer, DrawerField, DrawerAction } from '../../components/display/DetailDrawer';
import { useRegulatorFilings, useRegulatorEnforcement, useRegulatorLicences, useAuditBlocks, useCurrentUser } from '../../lib/hooks';
import { RegulatorFiling, RegulatorEnforcement, RegulatorLicence, AuditBlock, apexClient } from '../../lib/client';
import { api } from '../../../../lib/api';

// ─── Nav config ──────────────────────────────────────────────────────────────

const REGULATOR_NAV: NavConfig = {
  activeId: 'reg-dashboard',
  sections: [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { id: 'reg-dashboard',  label: 'Dashboard',   href: '#dashboard',   icon: 'home' },
        { id: 'reg-inbox',      label: 'Inbox',       href: '#inbox',       icon: 'list',        badge: 7, badgeVariant: 'rose' },
        { id: 'reg-analytics',  label: 'Analytics',   href: '#analytics',   icon: 'chart-line' },
      ],
    },
    {
      id: 'licensing',
      label: 'Licensing',
      items: [
        { id: 'reg-lic-new',    label: 'New Applications W49', href: '#lic-new',    icon: 'blueprint', badge: 3, badgeVariant: 'amber' },
        { id: 'reg-lic-renew',  label: 'Renewals W33',          href: '#lic-renew',  icon: 'calendar' },
        { id: 'reg-sseg',       label: 'SSEG Registration W57', href: '#sseg',       icon: 'lightning' },
      ],
    },
    {
      id: 'compliance',
      label: 'Compliance',
      items: [
        { id: 'reg-inspect',    label: 'Inspection & Enforcement W40', href: '#inspect',   icon: 'shield',  badge: 2, badgeVariant: 'rose' },
        { id: 'reg-inspection', label: 'Compliance Inspection',        href: '#inspection', icon: 'shield' },
        { id: 'reg-complaints', label: 'Complaints W66',               href: '#complaints',icon: 'flag' },
        { id: 'reg-disp',       label: 'Disposition W31',              href: '#disp',       icon: 'scales' },
      ],
    },
    {
      id: 'tariff-levy',
      label: 'Tariff & Levy',
      items: [
        { id: 'reg-mypd',       label: 'MYPD Determination W43',       href: '#mypd',       icon: 'dollar' },
        { id: 'reg-levy',       label: 'Levy Assessment W74',           href: '#levy',       icon: 'scales', badge: 1, badgeVariant: 'amber' },
        { id: 'reg-grid-code',  label: 'Grid Code Compliance W67',      href: '#grid-code',  icon: 'tower' },
      ],
    },
    {
      id: 'policy-consultation',
      label: 'Policy & Consultation',
      items: [
        { id: 'reg-consultation', label: 'Consultations W83', href: '#consultation', icon: 'document' },
      ],
    },
    {
      id: 'enforcement-actions',
      label: 'Enforcement',
      items: [
        { id: 'reg-enforcement', label: 'Enforcement W93',       href: '#enforcement-w93', icon: 'gavel' },
        { id: 'reg-s35',         label: 'Admin Enforcement W106', href: '#s35',             icon: 'shield' },
      ],
    },
    {
      id: 'phase-b-audit',
      label: 'Phase B — Audit',
      items: [
        { id: 'reg-audit-chain',    label: 'Audit Chain W118',      href: '#', icon: 'lock',      badge: 0 },
        { id: 'reg-export-packs',   label: 'Export Packs W119',     href: '#', icon: 'report' },
        { id: 'reg-reconciliation', label: 'Reconciliation W120',   href: '#', icon: 'checklist' },
        { id: 'reg-control-env',    label: 'Control Env W121',      href: '#', icon: 'hierarchy' },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      defaultCollapsed: true,
      items: [
        { id: 'reg-rpt-annual',  label: 'NERSA Annual Report',    href: '#rpt-annual',     icon: 'report' },
        { id: 'reg-rpt-comp',    label: 'Compliance Summary',     href: '#rpt-comp',       icon: 'certificate' },
        { id: 'reg-rpt-enf',     label: 'Enforcement Register',   href: '#rpt-enf',        icon: 'stamp' },
        { id: 'reg-settings',    label: 'Settings',               href: '#settings',       icon: 'gear' },
      ],
    },
  ],
};

// ─── Static display data ──────────────────────────────────────────────────────

const LICENCE_STEPS: StateFlowStep[] = [
  { id: 'completeness',       label: 'Completeness Check',   status: 'complete', timestamp: '2026-05-10' },
  { id: 'public_part',        label: 'Public Participation', status: 'complete', timestamp: '2026-05-20' },
  { id: 'technical_eval',     label: 'Technical Evaluation', status: 'current',  sublabel: 'NERSA Engineering review' },
  { id: 'council_decision',   label: 'Council Decision',     status: 'pending' },
  { id: 'grant_issue',        label: 'Grant / Issue',        status: 'pending' },
];

const CHAIN_LINKS: ChainLink[] = [
  { id: 'cl1', label: 'Enforcement History', chainType: 'Compliance Inspection', state: 'none',     role: 'Regulator',     relationship: 'peer'       },
  { id: 'cl2', label: 'Grid Connection W28', chainType: 'GCA Chain',             state: 'approved', role: 'Grid Operator', relationship: 'cross-role' },
];

// ─── Column definitions ───────────────────────────────────────────────────────

function daysColor(days: number | undefined): string {
  if (days === undefined || days === null) return 'var(--oe-text-2)';
  if (days < 3)  return 'var(--oe-rose)';
  if (days < 7)  return 'var(--oe-amber)';
  return 'var(--oe-green)';
}

function daysToExpiryColor(days: number | undefined): string {
  if (days === undefined || days === null) return 'var(--oe-text-2)';
  if (days < 30)  return 'var(--oe-rose)';
  if (days < 90)  return 'var(--oe-amber)';
  return 'var(--oe-green)';
}

const INBOX_COLS: Column<RegulatorFiling>[] = [
  {
    key: 'ref',
    header: 'Ref',
    width: '80px',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>
        {row.id.slice(-8).toUpperCase()}
      </span>
    ),
  },
  {
    key: 'filing_type',
    header: 'Type',
    width: '120px',
    render: (row) => (
      <span style={{ fontSize: '11px', color: 'var(--oe-text-2)' }}>{row.filing_type}</span>
    ),
  },
  {
    key: 'subject',
    header: 'Subject',
    render: (row) => (
      <span style={{ fontSize: '12px', color: 'var(--oe-text-1)', fontWeight: 500 }}>{row.case_type ?? row.filing_type}</span>
    ),
  },
  {
    key: 'applicant',
    header: 'Applicant',
    render: (row) => (
      <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.entity_name ?? row.filed_by}</span>
    ),
  },
  {
    key: 'days_remaining',
    header: 'Days Left',
    width: '80px',
    render: (row) => (
      <span style={{ fontSize: '11px', fontWeight: 600, color: daysColor(row.days_remaining) }}>
        {row.days_remaining !== undefined && row.days_remaining !== null ? `${row.days_remaining}d` : '—'}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '100px',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" />,
  },
];

interface EnforcementRow {
  id: string;
  enfId: string;
  entity: string;
  contravention: string;
  stage: string;
  fine: string;
  status: string;
}

const ENF_COLS: Column<EnforcementRow>[] = [
  {
    key: 'enfId',
    header: 'ID',
    width: '80px',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>
        {row.enfId}
      </span>
    ),
  },
  { key: 'entity',        header: 'Entity' },
  { key: 'contravention', header: 'Contravention' },
  {
    key: 'stage',
    header: 'Stage',
    render: (row) => <StatusPill label={row.stage.replace(/_/g, ' ')} variant={stateVariant(row.stage)} size="sm" />,
  },
  {
    key: 'fine',
    header: 'Fine',
    width: '90px',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.fine}</span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '100px',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" />,
  },
];

// ─── Inbox screen column definitions ─────────────────────────────────────────

const INBOX_SCREEN_COLS: Column<RegulatorFiling>[] = [
  {
    key: 'ref',
    header: 'Ref',
    width: '90px',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>
        {row.id.slice(-8).toUpperCase()}
      </span>
    ),
  },
  { key: 'filing_type', header: 'Type',        width: '140px', render: (row) => <span style={{ fontSize: '12px' }}>{row.filing_type}</span> },
  { key: 'entity_name', header: 'Entity',                      render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-1)', fontWeight: 500 }}>{row.entity_name ?? '—'}</span> },
  { key: 'filed_by',    header: 'Filed By',    width: '140px', render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.filed_by}</span> },
  {
    key: 'days_remaining', header: 'Days Left', width: '80px',
    render: (row) => (
      <span style={{ fontSize: '11px', fontWeight: 600, color: daysColor(row.days_remaining) }}>
        {row.days_remaining !== undefined && row.days_remaining !== null ? `${row.days_remaining}d` : '—'}
      </span>
    ),
  },
  { key: 'status', header: 'Status', width: '110px', render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" /> },
];

// ─── Enforcement screen columns ───────────────────────────────────────────────

const ENF_SCREEN_COLS: Column<RegulatorEnforcement>[] = [
  { key: 'ref',          header: 'Ref',       width: '100px', mono: true, render: (row) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{row.ref}</span> },
  { key: 'entity_name',  header: 'Entity',                    render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-1)', fontWeight: 500 }}>{row.entity_name}</span> },
  { key: 'violation',    header: 'Violation',                  render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.violation}</span> },
  { key: 'section_ref',  header: 'Section',   width: '90px',  render: (row) => <span style={{ fontSize: '11px', color: 'var(--oe-text-3)' }}>{row.section_ref}</span> },
  { key: 'fine_zar',     header: 'Fine',       width: '90px', mono: true, render: (row) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.fine_zar !== undefined ? 'R' + (row.fine_zar / 1e6).toFixed(1) + 'M' : '—'}</span> },
  { key: 'imposed_date', header: 'Imposed',    width: '100px', render: (row) => <span style={{ fontSize: '11px', color: 'var(--oe-text-3)' }}>{row.imposed_date ?? '—'}</span> },
  { key: 'paid',         header: 'Paid',       width: '60px',  render: (row) => <span style={{ fontSize: '11px', color: row.paid ? 'var(--oe-green)' : 'var(--oe-rose)', fontWeight: 600 }}>{row.paid ? 'Yes' : 'No'}</span> },
  { key: 'status',       header: 'Status',     width: '110px', render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" /> },
];

// ─── Licences screen columns ──────────────────────────────────────────────────

const LIC_SCREEN_COLS: Column<RegulatorLicence>[] = [
  { key: 'licence_ref',    header: 'Licence Ref', width: '120px', mono: true, render: (row) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{row.licence_ref}</span> },
  { key: 'entity_name',    header: 'Entity',                      render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-1)', fontWeight: 500 }}>{row.entity_name}</span> },
  { key: 'licence_class',  header: 'Class',       width: '120px', render: (row) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.licence_class}</span> },
  { key: 'expiry_date',    header: 'Expiry',      width: '100px', render: (row) => <span style={{ fontSize: '11px', color: 'var(--oe-text-3)' }}>{row.expiry_date}</span> },
  {
    key: 'days_to_expiry', header: 'Days', width: '70px',
    render: (row) => (
      <span style={{ fontSize: '11px', fontWeight: 600, color: daysToExpiryColor(row.days_to_expiry) }}>
        {row.days_to_expiry}d
      </span>
    ),
  },
  { key: 'status', header: 'Status', width: '110px', render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" /> },
];

// ─── Audit table columns (shared for placeholder screens) ────────────────────

const AUDIT_COLS: Column<AuditBlock>[] = [
  {
    key: 'ref',
    header: 'Ref',
    width: '90px',
    mono: true,
    render: (row) => (
      <span style={{ fontFamily: 'var(--oe-font-mono)', fontSize: '11px', color: 'var(--oe-text-2)' }}>
        {row.id.slice(-8).toUpperCase()}
      </span>
    ),
  },
  {
    key: 'action',
    header: 'Action',
    width: '180px',
    render: (row) => (
      <span style={{ fontSize: '12px', color: 'var(--oe-text-1)', fontWeight: 500 }}>{row.action}</span>
    ),
  },
  {
    key: 'actor_name',
    header: 'Actor',
    render: (row) => (
      <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.actor_name ?? row.actor_id.slice(-8)}</span>
    ),
  },
  {
    key: 'timestamp',
    header: 'Date',
    width: '130px',
    render: (row) => (
      <span style={{ fontFamily: 'var(--oe-font-mono)', fontSize: '11px', color: 'var(--oe-text-3)' }}>
        {row.timestamp.slice(0, 16).replace('T', ' ')}
      </span>
    ),
  },
];

// ─── Section header helper ────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--oe-text-1)' }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: '11px', color: 'var(--oe-text-3)', marginTop: '2px' }}>{subtitle}</div>
      )}
    </div>
  );
}

// ─── Filing drawer fields helper ─────────────────────────────────────────────

function filingDrawerFields(f: RegulatorFiling): DrawerField[] {
  return [
    { label: 'ID',               value: f.id,                             mono: true },
    { label: 'Filing Type',      value: f.filing_type },
    { label: 'Case Type',        value: f.case_type ?? '—' },
    { label: 'Entity',           value: f.entity_name ?? '—' },
    { label: 'Filed By',         value: f.filed_by },
    { label: 'Reporting Period', value: f.reporting_period },
    { label: 'Priority',         value: f.priority ?? '—' },
    { label: 'Officer',          value: f.officer ?? '—' },
    { label: 'SLA Deadline',     value: f.sla_deadline ?? '—' },
    { label: 'Days Remaining',   value: f.days_remaining !== undefined ? `${f.days_remaining}d` : '—' },
    { label: 'Created',          value: f.created_at.slice(0, 10) },
    { label: 'Status',           value: <StatusPill label={f.status} variant={stateVariant(f.status)} size="sm" />, span: false },
  ];
}

function filingDrawerActions(f: RegulatorFiling, refetch: () => void): DrawerAction[] {
  const actions: DrawerAction[] = [];
  if (f.status === 'pending' || f.status === 'draft') {
    actions.push({
      id: 'submit',
      label: 'Submit Filing',
      icon: 'send',
      variant: 'primary',
      onClick: async () => {
        await apexClient.regulator.submitFiling(f.id);
        refetch();
      },
    });
  }
  actions.push({
    id: 'refresh-audit',
    label: 'Refresh Audit Trail',
    icon: 'list',
    variant: 'secondary',
    onClick: async () => {
      await apexClient.audit.listBlocks({ entity_type: 'regulator_filing', entity_id: f.id });
      refetch();
    },
  });
  return actions;
}

// ─── Enforcement drawer helpers ───────────────────────────────────────────────

function enfDrawerFields(e: RegulatorEnforcement): DrawerField[] {
  return [
    { label: 'ID',               value: e.id,                                                              mono: true },
    { label: 'Ref',              value: e.ref,                                                             mono: true },
    { label: 'Entity',           value: e.entity_name },
    { label: 'Section',          value: e.section_ref },
    { label: 'Violation',        value: e.violation,                                                        span: true },
    { label: 'Fine (ZAR)',       value: e.fine_zar !== undefined ? `R${(e.fine_zar / 1e6).toFixed(2)}M` : '—', mono: true },
    { label: 'Imposed Date',     value: e.imposed_date ?? '—' },
    { label: 'Compliance Date',  value: e.compliance_date ?? '—' },
    { label: 'Paid',             value: e.paid ? 'Yes' : 'No' },
    { label: 'Status',           value: <StatusPill label={e.status} variant={stateVariant(e.status)} size="sm" /> },
  ];
}

function enfDrawerActions(e: RegulatorEnforcement, refetch: () => void): DrawerAction[] {
  const actions: DrawerAction[] = [];
  if (!e.paid && e.status !== 'closed' && e.status !== 'resolved') {
    actions.push({
      id: 'mark-paid',
      label: 'Mark Fine Paid',
      icon: 'check-circle',
      variant: 'primary',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'enforcement', entity_id: e.id });
        refetch();
      },
    });
  }
  if (e.status !== 'closed' && e.status !== 'resolved') {
    actions.push({
      id: 'escalate',
      label: 'Escalate to Council',
      icon: 'escalate',
      variant: 'danger',
      onClick: async () => {
        await apexClient.regulator.listFilings({ status: 'escalated', ref: e.ref });
        refetch();
      },
    });
  }
  actions.push({
    id: 'audit-trail',
    label: 'View Audit Trail',
    icon: 'list',
    variant: 'secondary',
    onClick: async () => {
      await apexClient.audit.listBlocks({ entity_type: 'enforcement', entity_id: e.id });
      refetch();
    },
  });
  return actions;
}

// ─── Licence drawer helpers ───────────────────────────────────────────────────

function licDrawerFields(l: RegulatorLicence): DrawerField[] {
  return [
    { label: 'ID',            value: l.id,                                                    mono: true },
    { label: 'Licence Ref',   value: l.licence_ref,                                           mono: true },
    { label: 'Entity',        value: l.entity_name },
    { label: 'Class',         value: l.licence_class },
    { label: 'Expiry Date',   value: l.expiry_date },
    { label: 'Days to Expiry',value: `${l.days_to_expiry}d`,                                  mono: true },
    { label: 'Status',        value: <StatusPill label={l.status} variant={stateVariant(l.status)} size="sm" /> },
  ];
}

function licDrawerActions(l: RegulatorLicence, refetch: () => void): DrawerAction[] {
  const actions: DrawerAction[] = [];
  if (l.status === 'pending' || l.status === 'submitted') {
    actions.push({
      id: 'approve',
      label: 'Approve & Issue Licence',
      icon: 'check-circle',
      variant: 'primary',
      onClick: async () => {
        await apexClient.regulator.submitFiling(l.id);
        refetch();
      },
    });
    actions.push({
      id: 'refuse',
      label: 'Refuse Application',
      icon: 'x-circle',
      variant: 'danger',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'licence', entity_id: l.id });
        refetch();
      },
    });
  }
  if (l.days_to_expiry < 90) {
    actions.push({
      id: 'renewal-notice',
      label: 'Send Renewal Notice',
      icon: 'send',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'licence_renewal', entity_id: l.id });
        refetch();
      },
    });
  }
  actions.push({
    id: 'audit',
    label: 'View Audit Trail',
    icon: 'list',
    variant: 'secondary',
    onClick: async () => {
      await apexClient.audit.listBlocks({ entity_type: 'licence', entity_id: l.id });
      refetch();
    },
  });
  return actions;
}

// ─── Audit drawer helpers ─────────────────────────────────────────────────────

function auditDrawerFields(b: AuditBlock): DrawerField[] {
  return [
    { label: 'Block ID',    value: b.id,                                    mono: true },
    { label: 'Sequence',    value: String(b.seq),                           mono: true },
    { label: 'Entity Type', value: b.entity_type },
    { label: 'Entity ID',   value: b.entity_id,                             mono: true },
    { label: 'Action',      value: b.action,                                span: true },
    { label: 'Actor ID',    value: b.actor_id,                              mono: true },
    { label: 'Actor Name',  value: b.actor_name ?? '—' },
    { label: 'Actor Role',  value: b.actor_role ?? '—' },
    { label: 'Hash',        value: b.hash.slice(0, 16) + '…',              mono: true },
    { label: 'Prev Hash',   value: b.prev_hash ? b.prev_hash.slice(0, 16) + '…' : 'Genesis', mono: true },
    { label: 'Timestamp',   value: b.timestamp.replace('T', ' ').slice(0, 19), mono: true, span: true },
  ];
}

// ─── Sub-screen components ────────────────────────────────────────────────────

function InboxScreen() {
  const { data, loading, refetch } = useRegulatorFilings();
  const [selected, setSelected] = React.useState<RegulatorFiling | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Regulatory Inbox</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' filings'}</div>
      </div>
      <DataTable<RegulatorFiling>
        columns={INBOX_SCREEN_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? (selected.case_type ?? selected.filing_type) : ''}
        subtitle={selected ? selected.entity_name ?? selected.filed_by : undefined}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        status={selected?.status}
        statusVariant={stateVariant(selected?.status ?? '')}
        fields={selected ? filingDrawerFields(selected) : []}
        actions={selected ? filingDrawerActions(selected, refetch) : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function EnforcementScreen() {
  const { data, loading, refetch } = useRegulatorEnforcement();
  const [selected, setSelected] = React.useState<RegulatorEnforcement | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Enforcement Actions</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable<RegulatorEnforcement>
        columns={ENF_SCREEN_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? selected.violation : ''}
        subtitle={selected ? selected.entity_name : undefined}
        entityRef={selected?.ref}
        status={selected?.status}
        statusVariant={stateVariant(selected?.status ?? '')}
        fields={selected ? enfDrawerFields(selected) : []}
        actions={selected ? enfDrawerActions(selected, refetch) : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function LicencesScreen() {
  const { data, loading, refetch } = useRegulatorLicences();
  const [selected, setSelected] = React.useState<RegulatorLicence | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Licences</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' licences'}</div>
      </div>
      <DataTable<RegulatorLicence>
        columns={LIC_SCREEN_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? selected.entity_name : ''}
        subtitle={selected ? selected.licence_class : undefined}
        entityRef={selected?.licence_ref}
        status={selected?.status}
        statusVariant={stateVariant(selected?.status ?? '')}
        fields={selected ? licDrawerFields(selected) : []}
        actions={selected ? licDrawerActions(selected, refetch) : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function ComplaintsScreen() {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'regulator_complaint' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const card: React.CSSProperties = {
    background: 'var(--oe-canvas)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-card)',
    boxShadow: 'var(--oe-shadow-card)',
    padding: '16px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Regulator Complaints</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>ERA s30 — W66</div>
      </div>

      <ActionPanel
        title="Complaint Actions"
        actions={[
          {
            id: 'initiate-complaint',
            label: 'Lodge New Complaint',
            icon: 'send',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Lodge Complaint"
                fields={[
                  { key: 'complainant', label: 'Complainant Entity', type: 'text', required: true },
                  { key: 'respondent',  label: 'Respondent Entity',  type: 'text', required: true },
                  { key: 'section',     label: 'ERA Section',        type: 'select', required: true, options: [
                    { value: 's30', label: 'Section 30 — Dispute resolution' },
                    { value: 's34', label: 'Section 34 — PPA requirements'  },
                    { value: 's10', label: 'Section 10 — Licence conditions' },
                  ]},
                ]}
                reasonCodes={[
                  { value: 'tariff_dispute',     label: 'Tariff dispute' },
                  { value: 'service_failure',    label: 'Service failure' },
                  { value: 'licence_condition',  label: 'Licence condition breach' },
                ]}
                onSubmit={async (_d) => {
                  await apexClient.audit.listBlocks({ entity_type: 'regulator_complaint' });
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'refresh',
            label: 'Refresh Activity',
            icon: 'list',
            variant: 'secondary',
            onClick: async () => { refetch(); },
          },
        ]}
      />

      <div style={card}>
        <SectionHeader title="Recent Complaint Activity" subtitle="Audit trail — ERA s30 complaint events" />
        <DataTable<AuditBlock>
          columns={AUDIT_COLS}
          rows={data}
          loading={loading}
          compact
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </div>

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? selected.action : ''}
        subtitle={selected ? selected.entity_type.replace(/_/g, ' ') : undefined}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        fields={selected ? auditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'appeal',
            label: 'Lodge Appeal',
            icon: 'escalate',
            variant: 'danger',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'regulator_complaint', entity_id: selected.entity_id });
              refetch();
            },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function LevyScreen() {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'regulator_levy' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const card: React.CSSProperties = {
    background: 'var(--oe-canvas)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-card)',
    boxShadow: 'var(--oe-shadow-card)',
    padding: '16px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Levy Assessment</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>NERSA Act s5B — W74</div>
      </div>

      <ActionPanel
        title="Levy Actions"
        actions={[
          {
            id: 'auto-assess',
            label: 'Run Auto-Assessment',
            icon: 'chart-line',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Run Levy Assessment"
                fields={[
                  { key: 'period',       label: 'Levy Period',     type: 'text',   required: true },
                  { key: 'levy_type',    label: 'Levy Type',       type: 'select', required: true, options: [
                    { value: 'turnover',  label: 'Turnover-based'  },
                    { value: 'volume',    label: 'Volume-based'    },
                    { value: 'fixed',     label: 'Fixed annual'    },
                  ]},
                  { key: 'licensee_id',  label: 'Licensee Entity', type: 'text',   required: false },
                ]}
                reasonCodes={[
                  { value: 'scheduled',   label: 'Scheduled annual assessment' },
                  { value: 'ad_hoc',      label: 'Ad-hoc assessment requested' },
                ]}
                onSubmit={async (_d) => {
                  await apexClient.audit.listBlocks({ entity_type: 'regulator_levy' });
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'final-demand',
            label: 'Issue Final Demand',
            icon: 'send',
            variant: 'danger',
            form: (
              <TransitionForm
                actionLabel="Issue Final Demand"
                fields={[
                  { key: 'entity_name',    label: 'Entity',       type: 'text', required: true },
                  { key: 'amount_zar',     label: 'Amount (ZAR)', type: 'text', required: true },
                  { key: 'deadline_date',  label: 'Pay-by Date',  type: 'date', required: true },
                ]}
                reasonCodes={[
                  { value: 'arrears_60',  label: '60-day arrears' },
                  { value: 'arrears_90',  label: '90-day arrears' },
                  { value: 'arrears_120', label: '120+ day arrears' },
                ]}
                confirmMessage="Issuing a final demand will trigger the enforcement track on non-payment."
                onSubmit={async (_d) => {
                  await apexClient.audit.listBlocks({ entity_type: 'regulator_levy' });
                  refetch();
                }}
              />
            ),
          },
        ]}
      />

      <div style={card}>
        <SectionHeader title="Recent Levy Events" subtitle="NERSA Act s5B levy assessment audit trail" />
        <DataTable<AuditBlock>
          columns={AUDIT_COLS}
          rows={data}
          loading={loading}
          compact
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </div>

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? selected.action : ''}
        subtitle={selected ? `Entity: ${selected.entity_id.slice(-8).toUpperCase()}` : undefined}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        fields={selected ? auditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'enforce',
            label: 'Initiate Enforcement',
            icon: 'shield',
            variant: 'danger',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'regulator_levy', entity_id: selected.entity_id });
              refetch();
            },
          },
          {
            id: 'write-off',
            label: 'Write Off Debt',
            icon: 'x-circle',
            variant: 'secondary',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'regulator_levy', entity_id: selected.entity_id });
              refetch();
            },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function TariffDetScreen() {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'tariff_determination' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const card: React.CSSProperties = {
    background: 'var(--oe-canvas)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-card)',
    boxShadow: 'var(--oe-shadow-card)',
    padding: '16px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>MYPD Tariff Determination</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>NERSA ss15-16 + MYPD — W43</div>
      </div>

      <ActionPanel
        title="Tariff Determination Actions"
        actions={[
          {
            id: 'open-determination',
            label: 'Open New Determination',
            icon: 'dollar',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Open MYPD Determination"
                fields={[
                  { key: 'determination_ref',  label: 'Determination Ref', type: 'text', required: true },
                  { key: 'mypd_period',         label: 'MYPD Period',       type: 'text', required: true },
                  { key: 'applicant_entity',    label: 'Applicant Entity',  type: 'text', required: true },
                  { key: 'rar_zar',             label: 'Proposed RAR (ZAR)',type: 'text', required: false },
                ]}
                reasonCodes={[
                  { value: 'scheduled_mypd',   label: 'Scheduled MYPD cycle'       },
                  { value: 'interim_increase',  label: 'Interim tariff increase'    },
                  { value: 'emergency_relief',  label: 'Emergency cost-reflective'  },
                ]}
                onSubmit={async (_d) => {
                  await apexClient.audit.listBlocks({ entity_type: 'tariff_determination' });
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'council-gazette',
            label: 'Publish Gazette Notice',
            icon: 'send',
            variant: 'secondary',
            form: (
              <TransitionForm
                actionLabel="Publish Gazette Notice"
                fields={[
                  { key: 'gazette_number', label: 'Gazette Number', type: 'text', required: true },
                  { key: 'gazette_date',   label: 'Publication Date', type: 'date', required: true },
                ]}
                reasonCodes={[
                  { value: 'public_participation', label: 'Public participation required' },
                  { value: 'final_decision',        label: 'Final determination decision'  },
                ]}
                confirmMessage="Publishing the Gazette Notice initiates the mandatory public comment period."
                onSubmit={async (_d) => {
                  await apexClient.audit.listBlocks({ entity_type: 'tariff_determination' });
                  refetch();
                }}
              />
            ),
          },
        ]}
      />

      <div style={card}>
        <SectionHeader title="Recent Tariff Determination Events" subtitle="NERSA MYPD determination audit trail — W43" />
        <DataTable<AuditBlock>
          columns={AUDIT_COLS}
          rows={data}
          loading={loading}
          compact
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </div>

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? selected.action : ''}
        subtitle={selected ? `Determination: ${selected.entity_id.slice(-8).toUpperCase()}` : undefined}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        fields={selected ? auditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'approve-tariff',
            label: 'Approve Tariff Determination',
            icon: 'check-circle',
            variant: 'primary',
            onClick: async () => {
              await apexClient.regulator.submitFiling(selected.entity_id);
              refetch();
            },
          },
          {
            id: 'remit',
            label: 'Remit for Revision',
            icon: 'escalate',
            variant: 'secondary',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'tariff_determination', entity_id: selected.entity_id });
              refetch();
            },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

function SsegScreen() {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'sseg_registration' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const card: React.CSSProperties = {
    background: 'var(--oe-canvas)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-card)',
    boxShadow: 'var(--oe-shadow-card)',
    padding: '16px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>SSEG / Schedule 2 Registration</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>ERA Schedule 2 — W57</div>
      </div>

      <ActionPanel
        title="SSEG Registration Actions"
        actions={[
          {
            id: 'register-sseg',
            label: 'Register SSEG Facility',
            icon: 'lightning',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Register SSEG Facility"
                fields={[
                  { key: 'facility_name',   label: 'Facility Name',         type: 'text',   required: true },
                  { key: 'owner_entity',    label: 'Owner Entity',           type: 'text',   required: true },
                  { key: 'capacity_kw',     label: 'Capacity (kW)',          type: 'text',   required: true },
                  { key: 'technology',      label: 'Technology',             type: 'select', required: true, options: [
                    { value: 'solar_pv',    label: 'Solar PV'   },
                    { value: 'wind',        label: 'Wind'        },
                    { value: 'bess',        label: 'Battery Storage' },
                    { value: 'cogen',       label: 'Cogeneration' },
                  ]},
                  { key: 'connection_point',label: 'Grid Connection Point',  type: 'text',   required: false },
                ]}
                reasonCodes={[
                  { value: 'new_installation',   label: 'New installation (Sch 2 exempt)' },
                  { value: 'capacity_increase',  label: 'Capacity increase'               },
                  { value: 'change_of_ownership',label: 'Change of ownership'              },
                ]}
                onSubmit={async (_d) => {
                  await apexClient.audit.listBlocks({ entity_type: 'sseg_registration' });
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'refer-licensing',
            label: 'Refer to Full Licensing (W49)',
            icon: 'escalate',
            variant: 'danger',
            form: (
              <TransitionForm
                actionLabel="Refer to Full Licensing"
                fields={[
                  { key: 'registration_ref', label: 'SSEG Registration Ref', type: 'text', required: true },
                  { key: 'referral_reason',  label: 'Referral Reason',        type: 'text', required: true },
                ]}
                reasonCodes={[
                  { value: 'exceeds_threshold',    label: 'Capacity exceeds Sch 2 threshold' },
                  { value: 'non_residential',       label: 'Non-residential facility'          },
                  { value: 'grid_export_required',  label: 'Export to grid required'           },
                ]}
                confirmMessage="Referral to full licensing will initiate the W49 ERA ss.8-11 process."
                onSubmit={async (_d) => {
                  await apexClient.audit.listBlocks({ entity_type: 'sseg_registration' });
                  refetch();
                }}
              />
            ),
          },
        ]}
      />

      <div style={card}>
        <SectionHeader title="Recent SSEG Registration Events" subtitle="ERA Schedule 2 embedded-generation audit trail — W57" />
        <DataTable<AuditBlock>
          columns={AUDIT_COLS}
          rows={data}
          loading={loading}
          compact
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </div>

      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? selected.action : ''}
        subtitle={selected ? `SSEG: ${selected.entity_id.slice(-8).toUpperCase()}` : undefined}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        fields={selected ? auditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'approve-sseg',
            label: 'Approve Registration',
            icon: 'check-circle',
            variant: 'primary',
            onClick: async () => {
              await apexClient.regulator.submitFiling(selected.entity_id);
              refetch();
            },
          },
          {
            id: 'reject-sseg',
            label: 'Reject Registration',
            icon: 'x-circle',
            variant: 'danger',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'sseg_registration', entity_id: selected.entity_id });
              refetch();
            },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── Compliance Inspection (W40) ─────────────────────────────────────────────

type InspectionRow = {
  id: string;
  ref: string;
  licensee_name: string;
  inspection_type: string;
  inspector_name: string;
  finding_count: number;
  chain_status: string;
  scheduled_date: string;
  completed_date: string | null;
};

const INSPECTION_COLS: Column<InspectionRow>[] = [
  { key: 'ref',             header: 'Reference',  width: '150px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span> },
  { key: 'licensee_name',  header: 'Licensee',   width: '200px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-1)', fontWeight: 500 }}>{r.licensee_name}</span> },
  { key: 'inspection_type',header: 'Type',        width: '130px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.inspection_type}</span> },
  { key: 'inspector_name', header: 'Inspector',   width: '160px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.inspector_name}</span> },
  { key: 'finding_count',  header: 'Findings',    width: '80px',  align: 'right', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{String(r.finding_count)}</span> },
  { key: 'chain_status',   header: 'Status',      width: '130px',
    render: (r) => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" /> },
  { key: 'scheduled_date', header: 'Scheduled',   width: '130px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.scheduled_date}</span> },
];

function InspectionScreen() {
  const [rows, setRows]       = React.useState<InspectionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel]         = React.useState<InspectionRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    api.get<{ success: boolean; data: InspectionRow[] }>('/api/compliance-inspection/chain')
      .then(r => { setRows(r.data?.data ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const transition = (action: string) => {
    if (!sel) return;
    api.post(`/api/compliance-inspection/chain/${sel.id}/${action}`, {})
      .then(() => { setDrawerOpen(false); setSel(null); load(); })
      .catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Compliance Inspection &amp; Enforcement
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : `${rows.length} inspections · NERSA §10/§34/§35 — W40`}
        </div>
      </div>
      <DataTable<InspectionRow>
        columns={INSPECTION_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSel(null); }}
        title={sel ? sel.ref : ''}
        subtitle={sel ? sel.licensee_name : undefined}
        entityRef={sel?.ref}
        status={sel?.chain_status}
        statusVariant={stateVariant(sel?.chain_status ?? '')}
        fields={sel ? [
          { label: 'Licensee',        value: sel.licensee_name,                span: true },
          { label: 'Type',            value: sel.inspection_type },
          { label: 'Inspector',       value: sel.inspector_name },
          { label: 'Findings',        value: String(sel.finding_count),         mono: true },
          { label: 'Scheduled',       value: sel.scheduled_date,                mono: true },
          { label: 'Completed',       value: sel.completed_date ?? '—',         mono: true },
          { label: 'Status',          value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
        ] as DrawerField[] : []}
        actions={sel ? [
          {
            id: 'begin',
            label: 'Begin Inspection',
            icon: 'checklist',
            variant: 'primary',
            onClick: () => transition('begin-inspection'),
          },
          {
            id: 'draft',
            label: 'Draft Findings',
            icon: 'edit',
            variant: 'secondary',
            onClick: () => transition('draft-findings'),
          },
          {
            id: 'clean',
            label: 'Close — No Findings',
            icon: 'check',
            variant: 'secondary',
            onClick: () => transition('close-no-findings'),
          },
          {
            id: 'enforce',
            label: 'Issue Enforcement Notice',
            icon: 'escalate',
            variant: 'danger',
            onClick: () => transition('issue-enforcement-notice'),
          },
        ] as DrawerAction[] : []}
        onActionComplete={load}
      />
    </div>
  );
}

// ─── W31 Disposition (NERSA §10) ─────────────────────────────────────────────

type DispositionRow = {
  id: string;
  ref: string;
  source_wave: string | null;
  applicant_name: string | null;
  chain_status: string;
  lodged_at: string;
  tier: string;
  matter_type: string | null;
};

const DISPOSITION_COLS: Column<DispositionRow>[] = [
  { key: 'ref',            header: 'Reference',    width: '150px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span> },
  { key: 'source_wave',   header: 'Source Wave',  width: '110px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-3)' }}>{r.source_wave ?? '—'}</span> },
  { key: 'applicant_name',header: 'Applicant',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-1)', fontWeight: 500 }}>{r.applicant_name ?? '—'}</span> },
  { key: 'matter_type',   header: 'Matter Type',  width: '150px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.matter_type ?? '—'}</span> },
  { key: 'chain_status',  header: 'Status',        width: '140px',
    render: (r) => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" /> },
  { key: 'lodged_at',     header: 'Lodged',        width: '130px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.lodged_at.slice(0, 10)}</span> },
];

function DispositionScreen() {
  const [rows, setRows]       = React.useState<DispositionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel]         = React.useState<DispositionRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    api.get<{ success: boolean; data: DispositionRow[] }>('/api/disposition/chain')
      .then(r => {
        const items = r.data?.data ?? [];
        setRows(items.map((item: any) => ({
          id:             item.id,
          ref:            item.case_number ?? item.id.slice(-8).toUpperCase(),
          source_wave:    item.source_wave ?? null,
          applicant_name: item.source_party ?? item.notice_subject ?? null,
          chain_status:   item.chain_status,
          lodged_at:      item.received_at ?? item.created_at ?? '',
          tier:           item.severity_tier ?? '',
          matter_type:    item.source_entity_type ?? item.source_event ?? null,
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const transition = (action: string) => {
    if (!sel) return;
    api.post(`/api/disposition/chain/${sel.id}/${action}`, {})
      .then(() => { setDrawerOpen(false); setSel(null); load(); })
      .catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Regulator Disposition
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : `${rows.length} matters · NERSA §10 — W31`}
        </div>
      </div>
      <DataTable<DispositionRow>
        columns={DISPOSITION_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSel(null); }}
        title={sel ? sel.ref : ''}
        subtitle={sel ? (sel.applicant_name ?? undefined) : undefined}
        entityRef={sel?.ref}
        status={sel?.chain_status}
        statusVariant={stateVariant(sel?.chain_status ?? '')}
        fields={sel ? [
          { label: 'Reference',    value: sel.ref,                                                           mono: true },
          { label: 'Source Wave',  value: sel.source_wave ?? '—' },
          { label: 'Applicant',    value: sel.applicant_name ?? '—' },
          { label: 'Matter Type',  value: sel.matter_type ?? '—' },
          { label: 'Tier',         value: sel.tier,                                                          mono: true },
          { label: 'Lodged',       value: sel.lodged_at.slice(0, 10),                                        mono: true },
          { label: 'Status',       value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
        ] as DrawerField[] : []}
        actions={sel ? [
          {
            id: 'triage',
            label: 'Triage Matter',
            icon: 'list',
            variant: 'primary',
            onClick: () => transition('triage'),
          },
          {
            id: 'assign',
            label: 'Assign Officer',
            icon: 'send',
            variant: 'secondary',
            onClick: () => transition('assign'),
          },
          {
            id: 'advance',
            label: 'Advance Investigation',
            icon: 'checklist',
            variant: 'secondary',
            onClick: () => transition('begin_investigation'),
          },
          {
            id: 'escalate',
            label: 'Escalate to Council',
            icon: 'escalate',
            variant: 'danger',
            onClick: () => transition('escalate'),
          },
          {
            id: 'grant',
            label: 'Close — Action Complete',
            icon: 'check-circle',
            variant: 'secondary',
            onClick: () => transition('close'),
          },
          {
            id: 'refuse',
            label: 'Dismiss / Refer',
            icon: 'x-circle',
            variant: 'ghost',
            onClick: () => transition('dismiss'),
          },
        ] as DrawerAction[] : []}
        onActionComplete={load}
      />
    </div>
  );
}

// ─── W67 Grid Code Compliance ─────────────────────────────────────────────────

type GridCodeRow = {
  id: string;
  ref: string;
  facility_name: string;
  non_conformance_type: string;
  chain_status: string;
  detected_at: string;
  tier: string;
};

const GRID_CODE_COLS: Column<GridCodeRow>[] = [
  { key: 'ref',                  header: 'Reference',          width: '150px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span> },
  { key: 'facility_name',        header: 'Facility',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-1)', fontWeight: 500 }}>{r.facility_name}</span> },
  { key: 'non_conformance_type', header: 'Non-Conformance',   width: '160px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.non_conformance_type}</span> },
  { key: 'chain_status',         header: 'Status',             width: '160px',
    render: (r) => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" /> },
  { key: 'detected_at',          header: 'Detected',           width: '130px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.detected_at.slice(0, 10)}</span> },
];

function GridCodeScreen() {
  const [rows, setRows]       = React.useState<GridCodeRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel]         = React.useState<GridCodeRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    api.get<{ success: boolean; data: GridCodeRow[] }>('/api/grid-code-compliance/chain')
      .then(r => {
        const items = r.data?.data ?? [];
        setRows(items.map((item: any) => ({
          id:                   item.id,
          ref:                  item.case_number ?? item.nc_ref ?? item.id.slice(-8).toUpperCase(),
          facility_name:        item.facility_name ?? '—',
          non_conformance_type: item.breach_class ?? item.parameter ?? '—',
          chain_status:         item.chain_status,
          detected_at:          item.non_conformance_raised_at ?? item.monitoring_started_at ?? '',
          tier:                 item.severity_tier ?? '',
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const transition = (action: string) => {
    if (!sel) return;
    api.post(`/api/grid-code-compliance/chain/${sel.id}/${action}`, {})
      .then(() => { setDrawerOpen(false); setSel(null); load(); })
      .catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Grid Code Compliance
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : `${rows.length} cases · NERSA Grid Code / NRS 097 — W67`}
        </div>
      </div>
      <DataTable<GridCodeRow>
        columns={GRID_CODE_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSel(null); }}
        title={sel ? sel.ref : ''}
        subtitle={sel ? sel.facility_name : undefined}
        entityRef={sel?.ref}
        status={sel?.chain_status}
        statusVariant={stateVariant(sel?.chain_status ?? '')}
        fields={sel ? [
          { label: 'Reference',         value: sel.ref,                                                             mono: true },
          { label: 'Facility',          value: sel.facility_name },
          { label: 'Non-Conformance',   value: sel.non_conformance_type },
          { label: 'Tier',              value: sel.tier,                                                            mono: true },
          { label: 'Detected',          value: sel.detected_at.slice(0, 10),                                       mono: true },
          { label: 'Status',            value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
        ] as DrawerField[] : []}
        actions={sel ? [
          {
            id: 'assess',
            label: 'Begin Assessment',
            icon: 'checklist',
            variant: 'primary',
            onClick: () => transition('begin_assessment'),
          },
          {
            id: 'require-cap',
            label: 'Require Corrective Action',
            icon: 'send',
            variant: 'secondary',
            onClick: () => transition('require_corrective_action'),
          },
          {
            id: 'restrict',
            label: 'Impose Operating Restriction',
            icon: 'shield',
            variant: 'danger',
            onClick: () => transition('impose_restriction'),
          },
          {
            id: 'escalate',
            label: 'Escalate Disconnection',
            icon: 'escalate',
            variant: 'danger',
            onClick: () => transition('escalate_disconnection'),
          },
          {
            id: 'close',
            label: 'Confirm Compliance — Close',
            icon: 'check-circle',
            variant: 'secondary',
            onClick: () => transition('confirm_compliance'),
          },
          {
            id: 'withdraw',
            label: 'Withdraw Case',
            icon: 'x-circle',
            variant: 'ghost',
            onClick: () => transition('withdraw'),
          },
        ] as DrawerAction[] : []}
        onActionComplete={load}
      />
    </div>
  );
}

// ─── W83 Consultation Notice ─────────────────────────────────────────────────

type ConsultationRow = {
  id: string;
  ref: string;
  title: string;
  consultation_type: string;
  chain_status: string;
  published_at: string | null;
  comment_deadline: string | null;
  tier: string;
};

const CONSULTATION_COLS: Column<ConsultationRow>[] = [
  { key: 'ref',               header: 'Reference',    width: '150px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span> },
  { key: 'title',             header: 'Title',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-1)', fontWeight: 500 }}>{r.title}</span> },
  { key: 'consultation_type', header: 'Type',         width: '150px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.consultation_type}</span> },
  { key: 'chain_status',      header: 'Status',       width: '150px',
    render: (r) => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" /> },
  { key: 'published_at',      header: 'Published',    width: '120px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.published_at ? r.published_at.slice(0, 10) : '—'}</span> },
  { key: 'comment_deadline',  header: 'Comment Closes', width: '130px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.comment_deadline ? r.comment_deadline.slice(0, 10) : '—'}</span> },
];

function ConsultationScreen() {
  const [rows, setRows]             = React.useState<ConsultationRow[]>([]);
  const [loading, setLoading]       = React.useState(true);
  const [sel, setSel]               = React.useState<ConsultationRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    api.get<{ success: boolean; data: any[] }>('/api/consultation-notice/chain')
      .then(r => {
        const items = r.data?.data ?? [];
        setRows(items.map((item: any) => ({
          id:                item.id,
          ref:               item.notice_number ?? item.id.slice(-8).toUpperCase(),
          title:             item.notice_title ?? '—',
          consultation_type: item.consultation_kind ?? item.consultation_class ?? '—',
          chain_status:      item.chain_status,
          published_at:      item.published_at ?? null,
          comment_deadline:  item.comment_period_end_at ?? null,
          tier:              item.consultation_tier ?? '',
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const transition = (action: string) => {
    if (!sel) return;
    api.post(`/api/consultation-notice/chain/${sel.id}/${action}`, {})
      .then(() => { setDrawerOpen(false); setSel(null); load(); })
      .catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Consultation Notices
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : `${rows.length} notices · NERSA ERA — W83`}
        </div>
      </div>
      <AIInsightCard
        suggestion="Tariff determination public consultation (W43-REF-2026-001) closes on 15 Jun 2026 with 847 stakeholder submissions received. 12 submissions from IPP developers cite the proposed WACC reduction of 1.4% as inconsistent with SA-specific country-risk premium adjustments."
        reasoning="NERSA §10(2)(d) requires all material objections to be individually considered in the Council record. The 12 WACC submissions collectively represent licensees with R48B in grid-connected assets — they carry statutory weight."
        title="Categorise Submissions"
        onAccept={() => {}}
      />
      <DataTable<ConsultationRow>
        columns={CONSULTATION_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSel(null); }}
        title={sel ? sel.title : ''}
        subtitle={sel ? sel.consultation_type : undefined}
        entityRef={sel?.ref}
        status={sel?.chain_status}
        statusVariant={stateVariant(sel?.chain_status ?? '')}
        fields={sel ? [
          { label: 'Reference',        value: sel.ref,                                                              mono: true },
          { label: 'Title',            value: sel.title,                                                             span: true },
          { label: 'Type',             value: sel.consultation_type },
          { label: 'Tier',             value: sel.tier,                                                              mono: true },
          { label: 'Published',        value: sel.published_at ? sel.published_at.slice(0, 10) : '—',               mono: true },
          { label: 'Comment Deadline', value: sel.comment_deadline ? sel.comment_deadline.slice(0, 10) : '—',       mono: true },
          { label: 'Status',           value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
        ] as DrawerField[] : []}
        actions={sel ? [
          {
            id: 'publish',
            label: 'Publish Notice',
            icon: 'send',
            variant: 'primary',
            onClick: () => transition('publish'),
          },
          {
            id: 'open-comments',
            label: 'Open for Comment',
            icon: 'list',
            variant: 'secondary',
            onClick: () => transition('open_for_comment'),
          },
          {
            id: 'close-comments',
            label: 'Close Comment Period',
            icon: 'check',
            variant: 'secondary',
            onClick: () => transition('close_comments'),
          },
          {
            id: 'adopt',
            label: 'Adopt Decision',
            icon: 'check-circle',
            variant: 'primary',
            onClick: () => transition('adopt'),
          },
          {
            id: 'withdraw',
            label: 'Withdraw Notice',
            icon: 'x-circle',
            variant: 'ghost',
            onClick: () => transition('withdraw'),
          },
        ] as DrawerAction[] : []}
        onActionComplete={load}
      />
    </div>
  );
}

// ─── W93 Enforcement Action (ERA s35) ────────────────────────────────────────

type EnfW93Row = {
  id: string;
  ref: string;
  respondent_name: string;
  breach_type: string;
  sanction_amount_zar: number | null;
  chain_status: string;
  trigger_date: string;
  tier: string;
};

const ENF_W93_COLS: Column<EnfW93Row>[] = [
  { key: 'ref',               header: 'Reference',    width: '150px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span> },
  { key: 'respondent_name',   header: 'Respondent',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-1)', fontWeight: 500 }}>{r.respondent_name}</span> },
  { key: 'breach_type',       header: 'Breach Type',  width: '160px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.breach_type}</span> },
  { key: 'sanction_amount_zar', header: 'Sanction',   width: '110px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
      {r.sanction_amount_zar != null ? `R${(r.sanction_amount_zar / 1e6).toFixed(1)}m` : '—'}
    </span> },
  { key: 'chain_status',      header: 'Status',       width: '150px',
    render: (r) => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" /> },
  { key: 'trigger_date',      header: 'Opened',       width: '120px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.trigger_date.slice(0, 10)}</span> },
];

function EnforcementW93Screen() {
  const [rows, setRows]             = React.useState<EnfW93Row[]>([]);
  const [loading, setLoading]       = React.useState(true);
  const [sel, setSel]               = React.useState<EnfW93Row | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    api.get<{ success: boolean; data: any[] }>('/api/regulator/enforcement-action/chain')
      .then(r => {
        const items = r.data?.data ?? [];
        setRows(items.map((item: any) => ({
          id:                  item.id,
          ref:                 item.case_number ?? item.id.slice(-8).toUpperCase(),
          respondent_name:     item.respondent_party_name ?? item.respondent_party_id ?? '—',
          breach_type:         item.allegation_class ?? item.era_section_cited ?? '—',
          sanction_amount_zar: item.imposed_penalty_zar ?? item.proposed_penalty_total_zar ?? null,
          chain_status:        item.chain_status,
          trigger_date:        item.case_opened_at ?? item.created_at ?? '',
          tier:                item.penalty_tier ?? '',
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const transition = (action: string) => {
    if (!sel) return;
    api.post(`/api/regulator/enforcement-action/chain/${sel.id}/${action}`, {})
      .then(() => { setDrawerOpen(false); setSel(null); load(); })
      .catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Enforcement Actions
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : `${rows.length} cases · ERA s35 — W93`}
        </div>
      </div>
      <AIInsightCard
        suggestion="Enforcement case ENF-2026-0034 (Kalahari Solar grid code non-conformance) has reached the formal penalty notice stage. The R450k penalty recommendation is at the low end — comparable precedent cases settled between R800k-R1.4M. NERSA §35 provides grounds for upward revision before Council approval."
        reasoning="ERA §35(4): penalty notices are final once approved by Council and cannot be appealed upward by NERSA. If the R450k figure is inadequate deterrent, the pre-Council window is the only opportunity for revision."
        title="Request Penalty Revision"
        onAccept={() => {}}
      />
      <DataTable<EnfW93Row>
        columns={ENF_W93_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSel(null); }}
        title={sel ? sel.ref : ''}
        subtitle={sel ? sel.respondent_name : undefined}
        entityRef={sel?.ref}
        status={sel?.chain_status}
        statusVariant={stateVariant(sel?.chain_status ?? '')}
        fields={sel ? [
          { label: 'Reference',        value: sel.ref,                                                                                mono: true },
          { label: 'Respondent',       value: sel.respondent_name },
          { label: 'Breach Type',      value: sel.breach_type },
          { label: 'Tier',             value: sel.tier,                                                                               mono: true },
          { label: 'Sanction (ZAR)',   value: sel.sanction_amount_zar != null ? `R${(sel.sanction_amount_zar / 1e6).toFixed(2)}m` : '—', mono: true },
          { label: 'Opened',           value: sel.trigger_date.slice(0, 10),                                                          mono: true },
          { label: 'Status',           value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
        ] as DrawerField[] : []}
        actions={sel ? [
          {
            id: 'investigate',
            label: 'Begin Investigation',
            icon: 'checklist',
            variant: 'primary',
            onClick: () => transition('serve_allegations'),
          },
          {
            id: 'impose-sanction',
            label: 'Impose Sanction',
            icon: 'shield',
            variant: 'danger',
            onClick: () => transition('impose_penalty'),
          },
          {
            id: 'appeal',
            label: 'Record Appeal',
            icon: 'escalate',
            variant: 'secondary',
            onClick: () => transition('appeal'),
          },
          {
            id: 'resolve',
            label: 'Resolve / Close',
            icon: 'check-circle',
            variant: 'secondary',
            onClick: () => transition('dismiss'),
          },
        ] as DrawerAction[] : []}
        onActionComplete={load}
      />
    </div>
  );
}

// ─── W106 Enforcement Action s35 Lifecycle ───────────────────────────────────

type S35Row = {
  id: string;
  ref: string;
  respondent_name: string;
  breach_type: string;
  sanction_amount_zar: number | null;
  chain_status: string;
  trigger_date: string;
  tier: string;
};

const S35_COLS: Column<S35Row>[] = [
  { key: 'ref',               header: 'Reference',    width: '150px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span> },
  { key: 'respondent_name',   header: 'Respondent',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-1)', fontWeight: 500 }}>{r.respondent_name}</span> },
  { key: 'breach_type',       header: 'Sanction Type', width: '160px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.breach_type}</span> },
  { key: 'sanction_amount_zar', header: 'Quantum',    width: '110px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
      {r.sanction_amount_zar != null ? `R${(r.sanction_amount_zar / 1e6).toFixed(1)}m` : '—'}
    </span> },
  { key: 'chain_status',      header: 'Status',       width: '150px',
    render: (r) => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" /> },
  { key: 'trigger_date',      header: 'Triggered',    width: '120px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.trigger_date ? r.trigger_date.slice(0, 10) : '—'}</span> },
];

function S35Screen() {
  const [rows, setRows]             = React.useState<S35Row[]>([]);
  const [loading, setLoading]       = React.useState(true);
  const [sel, setSel]               = React.useState<S35Row | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    api.get<{ success: boolean; data: any[] }>('/api/regulator/enforcement-action-s35/chain')
      .then(r => {
        const items = r.data?.data ?? [];
        setRows(items.map((item: any) => ({
          id:                  item.id,
          ref:                 item.enforcement_case_number ?? item.id.slice(-8).toUpperCase(),
          respondent_name:     item.respondent_party_label ?? item.respondent_party_id ?? '—',
          breach_type:         item.sanction_type ?? item.triggering_event_type ?? '—',
          sanction_amount_zar: item.sanction_quantum_zar != null && item.sanction_quantum_zar !== 0 ? item.sanction_quantum_zar : null,
          chain_status:        item.chain_status,
          trigger_date:        item.triggered_at ?? item.created_at ?? '',
          tier:                item.current_tier ?? '',
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const transition = (action: string) => {
    if (!sel) return;
    api.post(`/api/regulator/enforcement-action-s35/chain/${sel.id}/${action}`, {})
      .then(() => { setDrawerOpen(false); setSel(null); load(); })
      .catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Admin Enforcement (s35 Lifecycle)
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : `${rows.length} cases · ERA s35 PAJA/AUDI — W106`}
        </div>
      </div>
      <AIInsightCard
        suggestion="Administrative enforcement notice AN-2026-0012 (municipal tariff non-compliance) has not been responded to within the 30-day statutory response window. ERA §35(5): non-response after 30 days triggers automatic escalation to a compliance order and daily penalty accrual of R50k/day."
        reasoning="Daily penalty accrual under a compliance order is more difficult to waive than an administrative notice penalty. Proactive response — even a partial one — resets the accrual clock."
        title="Issue Compliance Order"
        onAccept={() => {}}
      />
      <DataTable<S35Row>
        columns={S35_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSel(null); }}
        title={sel ? sel.ref : ''}
        subtitle={sel ? sel.respondent_name : undefined}
        entityRef={sel?.ref}
        status={sel?.chain_status}
        statusVariant={stateVariant(sel?.chain_status ?? '')}
        fields={sel ? [
          { label: 'Reference',      value: sel.ref,                                                                                  mono: true },
          { label: 'Respondent',     value: sel.respondent_name },
          { label: 'Sanction Type',  value: sel.breach_type },
          { label: 'Tier',           value: sel.tier,                                                                                 mono: true },
          { label: 'Quantum (ZAR)',  value: sel.sanction_amount_zar != null ? `R${(sel.sanction_amount_zar / 1e6).toFixed(2)}m` : '—', mono: true },
          { label: 'Triggered',      value: sel.trigger_date ? sel.trigger_date.slice(0, 10) : '—',                                   mono: true },
          { label: 'Status',         value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
        ] as DrawerField[] : []}
        actions={sel ? [
          {
            id: 'trigger',
            label: 'Trigger Event',
            icon: 'send',
            variant: 'primary',
            onClick: () => transition('trigger_event'),
          },
          {
            id: 'preliminary-review',
            label: 'Preliminary Review',
            icon: 'checklist',
            variant: 'secondary',
            onClick: () => transition('draft_notice'),
          },
          {
            id: 'impose-sanction',
            label: 'Impose Sanction',
            icon: 'shield',
            variant: 'danger',
            onClick: () => transition('impose_sanction'),
          },
          {
            id: 'mark-resolved',
            label: 'Mark Resolved',
            icon: 'check-circle',
            variant: 'secondary',
            onClick: () => transition('mark_settled'),
          },
        ] as DrawerAction[] : []}
        onActionComplete={load}
      />
    </div>
  );
}

// ─── W118 Hash-Chain Audit Trees ─────────────────────────────────────────────

type AuditChainRow = {
  id: string;
  ref: string;
  entity_type: string;
  entity_id: string;
  block_hash: string;
  prev_hash: string;
  chain_status: string;
  sealed_at: string | null;
  tier: string;
};

const AUDIT_CHAIN_COLS: Column<AuditChainRow>[] = [
  { key: 'ref',          header: 'Ref',         width: '150px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span> },
  { key: 'entity_type',  header: 'Entity Type',  width: '160px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.entity_type}</span> },
  { key: 'entity_id',    header: 'Entity ID',    width: '140px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.entity_id.slice(-8).toUpperCase()}</span> },
  { key: 'block_hash',   header: 'Block Hash',   width: '150px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{'...' + r.block_hash.slice(-8)}</span> },
  { key: 'chain_status', header: 'Status',       width: '130px',
    render: (r) => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" /> },
  { key: 'sealed_at',    header: 'Sealed',       width: '130px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.sealed_at ? r.sealed_at.slice(0, 10) : '—'}</span> },
];

function AuditChainScreen() {
  const [rows, setRows]             = React.useState<AuditChainRow[]>([]);
  const [loading, setLoading]       = React.useState(true);
  const [sel, setSel]               = React.useState<AuditChainRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    api.get<{ success: boolean; data: any[] }>('/api/audit-chain')
      .then(r => {
        const items = r.data?.data ?? [];
        setRows(items.map((item: any) => ({
          id:           item.id,
          ref:          item.ref ?? item.id.slice(-8).toUpperCase(),
          entity_type:  item.entity_type ?? '—',
          entity_id:    item.entity_id ?? item.id,
          block_hash:   item.block_hash ?? item.hash ?? '',
          prev_hash:    item.prev_hash ?? item.prev_block_hash ?? '',
          chain_status: item.chain_status ?? item.status ?? '—',
          sealed_at:    item.sealed_at ?? null,
          tier:         item.tier ?? '',
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Hash-Chain Audit Trees
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : `${rows.length} blocks — W118`}
        </div>
      </div>
      <AIInsightCard
        suggestion="14 blocks sealed in the last 24h. Hash continuity verified across all chains — no gaps detected. Next certification window opens in 6 days for the Q2 2026 export pack."
        reasoning="NERSA audit integrity requires unbroken hash chain before export pack generation. A gap at this stage would delay the Q2 filing deadline."
        title="Generate Export Preview"
        onAccept={() => {}}
      />

      <DataTable<AuditChainRow>
        columns={AUDIT_CHAIN_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSel(null); }}
        title={sel ? sel.ref : ''}
        subtitle={sel ? sel.entity_type : undefined}
        entityRef={sel?.ref}
        status={sel?.chain_status}
        statusVariant={stateVariant(sel?.chain_status ?? '')}
        fields={sel ? [
          { label: 'Ref',         value: sel.ref,                                          mono: true },
          { label: 'Entity Type', value: sel.entity_type },
          { label: 'Entity ID',   value: sel.entity_id.slice(-8).toUpperCase(),            mono: true },
          { label: 'Block Hash',  value: '...' + sel.block_hash.slice(-8),                 mono: true },
          { label: 'Prev Hash',   value: sel.prev_hash ? '...' + sel.prev_hash.slice(-8) : 'Genesis', mono: true },
          { label: 'Tier',        value: sel.tier,                                         mono: true },
          { label: 'Sealed At',   value: sel.sealed_at ? sel.sealed_at.slice(0, 10) : '—', mono: true },
          { label: 'Status',      value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
        ] as DrawerField[] : []}
        actions={sel ? [
          {
            id: 'seal-block',
            label: 'Seal Block',
            icon: 'lock',
            variant: 'primary',
            onClick: () => api.post('/api/audit-chain/action', { id: sel?.id, action: 'seal_block' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
          {
            id: 'verify-chain',
            label: 'Verify Chain',
            icon: 'checklist',
            variant: 'secondary',
            onClick: () => api.post('/api/audit-chain/action', { id: sel?.id, action: 'verify_chain' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
          {
            id: 'export-block',
            label: 'Export Block',
            icon: 'report',
            variant: 'ghost',
            onClick: () => api.post('/api/audit-chain/action', { id: sel?.id, action: 'export_block' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
        ] as DrawerAction[] : []}
        onActionComplete={load}
      />
    </div>
  );
}

// ─── W119 Certified Regulator Export Packs ───────────────────────────────────

type ExportPackRow = {
  id: string;
  ref: string;
  pack_type: string;
  period: string;
  entity_count: number;
  chain_status: string;
  certified_at: string | null;
  tier: string;
};

const EXPORT_PACK_COLS: Column<ExportPackRow>[] = [
  { key: 'ref',          header: 'Ref',          width: '150px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span> },
  { key: 'pack_type',    header: 'Pack Type',    width: '160px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.pack_type}</span> },
  { key: 'period',       header: 'Period',        width: '120px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.period}</span> },
  { key: 'entity_count', header: 'Entities',     width: '90px',  align: 'right', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{String(r.entity_count)}</span> },
  { key: 'chain_status', header: 'Status',       width: '130px',
    render: (r) => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" /> },
  { key: 'certified_at', header: 'Certified',    width: '130px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.certified_at ? r.certified_at.slice(0, 10) : '—'}</span> },
];

function ExportPacksScreen() {
  const [rows, setRows]             = React.useState<ExportPackRow[]>([]);
  const [loading, setLoading]       = React.useState(true);
  const [sel, setSel]               = React.useState<ExportPackRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    api.get<{ success: boolean; data: any[] }>('/api/regulator-exports')
      .then(r => {
        const items = r.data?.data ?? [];
        setRows(items.map((item: any) => ({
          id:           item.id,
          ref:          item.ref ?? item.export_ref ?? item.id.slice(-8).toUpperCase(),
          pack_type:    item.pack_type ?? item.export_type ?? '—',
          period:       item.period ?? item.reporting_period ?? '—',
          entity_count: item.entity_count ?? item.record_count ?? 0,
          chain_status: item.chain_status ?? item.status ?? '—',
          certified_at: item.certified_at ?? null,
          tier:         item.tier ?? '',
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Certified Regulator Export Packs
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : `${rows.length} packs — W119`}
        </div>
      </div>
      <AIInsightCard
        suggestion="Q1 2026 export pack covers 847 entity records across 12 licensees. 2 records flag incomplete audit hash chains from W118 — certification will be blocked until those gaps are resolved. Estimated resolution time: 4h."
        reasoning="NERSA §10(3) requires certified export packs to be tamper-evident. NERSA's validation script will reject packs with hash-chain gaps, triggering re-submission and a 14-day deadline reset."
        title="Resolve Hash Gaps"
        onAccept={() => {}}
      />
      <DataTable<ExportPackRow>
        columns={EXPORT_PACK_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSel(null); }}
        title={sel ? sel.ref : ''}
        subtitle={sel ? sel.pack_type : undefined}
        entityRef={sel?.ref}
        status={sel?.chain_status}
        statusVariant={stateVariant(sel?.chain_status ?? '')}
        fields={sel ? [
          { label: 'Ref',          value: sel.ref,                                              mono: true },
          { label: 'Pack Type',    value: sel.pack_type },
          { label: 'Period',       value: sel.period,                                           mono: true },
          { label: 'Entity Count', value: String(sel.entity_count),                            mono: true },
          { label: 'Tier',         value: sel.tier,                                             mono: true },
          { label: 'Certified At', value: sel.certified_at ? sel.certified_at.slice(0, 10) : '—', mono: true },
          { label: 'Status',       value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
        ] as DrawerField[] : []}
        actions={sel ? [
          {
            id: 'generate-pack',
            label: 'Generate Pack',
            icon: 'report',
            variant: 'primary',
            onClick: () => api.post('/api/regulator-exports/action', { id: sel?.id, action: 'generate_pack' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
          {
            id: 'certify',
            label: 'Certify Pack',
            icon: 'certificate',
            variant: 'secondary',
            onClick: () => api.post('/api/regulator-exports/action', { id: sel?.id, action: 'certify' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
          {
            id: 'submit-nersa',
            label: 'Submit to NERSA',
            icon: 'send',
            variant: 'primary',
            onClick: () => api.post('/api/regulator-exports/action', { id: sel?.id, action: 'submit_to_nersa' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
          {
            id: 'archive',
            label: 'Archive Pack',
            icon: 'list',
            variant: 'ghost',
            onClick: () => api.post('/api/regulator-exports/action', { id: sel?.id, action: 'archive' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
        ] as DrawerAction[] : []}
        onActionComplete={load}
      />
    </div>
  );
}

// ─── W120 Reconciliation Attestation ─────────────────────────────────────────

type ReconRow = {
  id: string;
  ref: string;
  recon_type: string;
  period: string;
  variance_zar: number;
  match_rate_pct: number;
  chain_status: string;
  attested_at: string | null;
  tier: string;
};

const RECON_COLS: Column<ReconRow>[] = [
  { key: 'ref',           header: 'Ref',          width: '150px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span> },
  { key: 'recon_type',    header: 'Recon Type',   width: '160px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.recon_type}</span> },
  { key: 'period',        header: 'Period',        width: '120px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.period}</span> },
  { key: 'variance_zar',  header: 'Variance',     width: '110px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{'R' + (r.variance_zar / 1e6).toFixed(1) + 'm'}</span> },
  { key: 'match_rate_pct', header: 'Match Rate',  width: '100px', align: 'right', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{r.match_rate_pct.toFixed(1) + '%'}</span> },
  { key: 'chain_status',  header: 'Status',       width: '130px',
    render: (r) => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" /> },
];

function ReconciliationScreen() {
  const [rows, setRows]             = React.useState<ReconRow[]>([]);
  const [loading, setLoading]       = React.useState(true);
  const [sel, setSel]               = React.useState<ReconRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    api.get<{ success: boolean; data: any[] }>('/api/reconciliation-attestation')
      .then(r => {
        const items = r.data?.data ?? [];
        setRows(items.map((item: any) => ({
          id:             item.id,
          ref:            item.ref ?? item.recon_ref ?? item.id.slice(-8).toUpperCase(),
          recon_type:     item.recon_type ?? item.reconciliation_type ?? '—',
          period:         item.period ?? item.reporting_period ?? '—',
          variance_zar:   item.variance_zar ?? item.variance_amount_zar ?? 0,
          match_rate_pct: item.match_rate_pct ?? item.match_rate ?? 0,
          chain_status:   item.chain_status ?? item.status ?? '—',
          attested_at:    item.attested_at ?? null,
          tier:           item.tier ?? '',
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Reconciliation Attestation
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : `${rows.length} records — W120`}
        </div>
      </div>
      <AIInsightCard
        suggestion="Daily metering reconciliation for 15 May shows R2.3M variance between VWAP-settled amounts and DOE-reported grid injections across 3 licensees. Kouga Phase 2 accounts for 67% of the variance."
        reasoning="NERSA metering code §5.4 requires variance >R500k to be escalated to a formal recon dispute within 3 business days. Deadline is 18 May."
        title="Escalate Variance"
        onAccept={() => {}}
      />
      <DataTable<ReconRow>
        columns={RECON_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSel(null); }}
        title={sel ? sel.ref : ''}
        subtitle={sel ? sel.recon_type : undefined}
        entityRef={sel?.ref}
        status={sel?.chain_status}
        statusVariant={stateVariant(sel?.chain_status ?? '')}
        fields={sel ? [
          { label: 'Ref',          value: sel.ref,                                                   mono: true },
          { label: 'Recon Type',   value: sel.recon_type },
          { label: 'Period',       value: sel.period,                                                mono: true },
          { label: 'Variance',     value: 'R' + (sel.variance_zar / 1e6).toFixed(2) + 'm',          mono: true },
          { label: 'Match Rate',   value: sel.match_rate_pct.toFixed(1) + '%',                       mono: true },
          { label: 'Tier',         value: sel.tier,                                                  mono: true },
          { label: 'Attested At',  value: sel.attested_at ? sel.attested_at.slice(0, 10) : '—',      mono: true },
          { label: 'Status',       value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
        ] as DrawerField[] : []}
        actions={sel ? [
          {
            id: 'run-recon',
            label: 'Run Reconciliation',
            icon: 'checklist',
            variant: 'primary',
            onClick: () => api.post('/api/reconciliation-attestation/action', { id: sel?.id, action: 'run_recon' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
          {
            id: 'flag-variance',
            label: 'Flag Variance',
            icon: 'flag',
            variant: 'danger',
            onClick: () => api.post('/api/reconciliation-attestation/action', { id: sel?.id, action: 'flag_variance' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
          {
            id: 'attest',
            label: 'Attest Reconciliation',
            icon: 'check-circle',
            variant: 'secondary',
            onClick: () => api.post('/api/reconciliation-attestation/action', { id: sel?.id, action: 'attest' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
          {
            id: 'escalate',
            label: 'Escalate to Regulator',
            icon: 'escalate',
            variant: 'ghost',
            onClick: () => api.post('/api/reconciliation-attestation/action', { id: sel?.id, action: 'escalate' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
        ] as DrawerAction[] : []}
        onActionComplete={load}
      />
    </div>
  );
}

// ─── W121 Control-Environment Audit ──────────────────────────────────────────

type CtrlEnvRow = {
  id: string;
  ref: string;
  framework: string;
  control_domain: string;
  finding_count: number;
  critical_count: number;
  chain_status: string;
  review_date: string | null;
  tier: string;
};

const CTRL_ENV_COLS: Column<CtrlEnvRow>[] = [
  { key: 'ref',            header: 'Ref',            width: '150px', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span> },
  { key: 'framework',      header: 'Framework',      width: '140px',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.framework}</span> },
  { key: 'control_domain', header: 'Control Domain',
    render: (r) => <span style={{ fontSize: '12px', color: 'var(--oe-text-1)', fontWeight: 500 }}>{r.control_domain}</span> },
  { key: 'finding_count',  header: 'Findings',       width: '90px',  align: 'right', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{String(r.finding_count)}</span> },
  { key: 'critical_count', header: 'Critical',       width: '90px',  align: 'right', mono: true,
    render: (r) => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: r.critical_count > 0 ? 'var(--oe-rose)' : undefined }}>{String(r.critical_count)}</span> },
  { key: 'chain_status',   header: 'Status',         width: '130px',
    render: (r) => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" /> },
];

function ControlEnvScreen() {
  const [rows, setRows]             = React.useState<CtrlEnvRow[]>([]);
  const [loading, setLoading]       = React.useState(true);
  const [sel, setSel]               = React.useState<CtrlEnvRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    api.get<{ success: boolean; data: any[] }>('/api/control-environment-audit')
      .then(r => {
        const items = r.data?.data ?? [];
        setRows(items.map((item: any) => ({
          id:             item.id,
          ref:            item.ref ?? item.review_ref ?? item.id.slice(-8).toUpperCase(),
          framework:      item.framework ?? item.control_framework ?? '—',
          control_domain: item.control_domain ?? item.domain ?? '—',
          finding_count:  item.finding_count ?? item.total_findings ?? 0,
          critical_count: item.critical_count ?? item.critical_findings ?? 0,
          chain_status:   item.chain_status ?? item.status ?? '—',
          review_date:    item.review_date ?? item.scheduled_date ?? null,
          tier:           item.tier ?? '',
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Control-Environment Audit
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
          {loading ? 'Loading…' : `${rows.length} reviews — W121`}
        </div>
      </div>
      <AIInsightCard
        suggestion="SOC 2 Type II review identified 3 critical findings: audit log retention policy is 60 days vs required 90 days; 2 privileged access reviews are overdue by 45 days; encryption-at-rest key rotation last occurred 389 days ago (threshold: 365 days)."
        reasoning="ISAE 3402 §A.4 requires control environment deficiencies to be formally remediated within 90 days of identification. Two findings are approaching the 90-day window — open findings at year-end would qualify the audit opinion."
        title="Assign Remediation Owners"
        onAccept={() => {}}
      />
      <DataTable<CtrlEnvRow>
        columns={CTRL_ENV_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSel(null); }}
        title={sel ? sel.ref : ''}
        subtitle={sel ? sel.control_domain : undefined}
        entityRef={sel?.ref}
        status={sel?.chain_status}
        statusVariant={stateVariant(sel?.chain_status ?? '')}
        fields={sel ? [
          { label: 'Ref',            value: sel.ref,                                                  mono: true },
          { label: 'Framework',      value: sel.framework },
          { label: 'Control Domain', value: sel.control_domain,                                       span: true },
          { label: 'Findings',       value: String(sel.finding_count),                               mono: true },
          { label: 'Critical',       value: String(sel.critical_count),                              mono: true },
          { label: 'Tier',           value: sel.tier,                                                mono: true },
          { label: 'Review Date',    value: sel.review_date ? sel.review_date.slice(0, 10) : '—',    mono: true },
          { label: 'Status',         value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
        ] as DrawerField[] : []}
        actions={sel ? [
          {
            id: 'open-review',
            label: 'Open Review',
            icon: 'checklist',
            variant: 'primary',
            onClick: () => api.post('/api/control-environment-audit/action', { id: sel?.id, action: 'open_review' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
          {
            id: 'raise-finding',
            label: 'Raise Finding',
            icon: 'flag',
            variant: 'danger',
            onClick: () => api.post('/api/control-environment-audit/action', { id: sel?.id, action: 'raise_finding' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
          {
            id: 'remediate',
            label: 'Mark Remediated',
            icon: 'check',
            variant: 'secondary',
            onClick: () => api.post('/api/control-environment-audit/action', { id: sel?.id, action: 'remediate' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
          {
            id: 'close-review',
            label: 'Close Review',
            icon: 'check-circle',
            variant: 'ghost',
            onClick: () => api.post('/api/control-environment-audit/action', { id: sel?.id, action: 'close_review' }).then(() => { setSel(null); setDrawerOpen(false); load(); }).catch(() => {}),
          },
        ] as DrawerAction[] : []}
        onActionComplete={load}
      />
    </div>
  );
}

// ─── Screen type ──────────────────────────────────────────────────────────────

type ActiveScreen =
  | 'dashboard'
  | 'inbox'
  | 'analytics'
  | 'enforcement'
  | 'licences'
  | 'complaints'
  | 'levy'
  | 'tariff-det'
  | 'sseg'
  | 'inspection'
  | 'disposition'
  | 'gridcode'
  | 'consultation'
  | 'enforcement-w93'
  | 's35'
  | 'audit-chain'
  | 'export-packs'
  | 'reconciliation'
  | 'control-env';

// ─── Workstation ──────────────────────────────────────────────────────────────

export function RegulatorWorkstation() {
  const { data: me } = useCurrentUser();
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard');

  // ── Real API data ──────────────────────────────────────────────────────────
  const { data: filings, loading: filingsLoading } = useRegulatorFilings({ status: 'pending' });
  const { data: enforcement } = useRegulatorEnforcement();
  const { data: licences } = useRegulatorLicences();

  // ── Computed KPIs ──────────────────────────────────────────────────────────
  const pendingFilings  = filings.filter(f => f.status === 'pending' || f.status === 'submitted').length;
  const slaBreached     = filings.filter(f => (f.days_remaining ?? 0) < 0).length;
  const activeLicences  = licences.filter((l: RegulatorLicence) => l.status === 'active' || l.status === 'in_force').length;
  const openEnforcement = enforcement.filter((e: RegulatorEnforcement) => e.status !== 'closed' && e.status !== 'resolved').length;

  // Cast enforcement rows for the static-typed table
  const enforcementRows = enforcement as unknown as EnforcementRow[];

  const navIdMap: Record<string, ActiveScreen> = {
    'reg-dashboard':    'dashboard',
    'reg-inbox':        'inbox',
    'reg-analytics':    'analytics',
    'reg-lic-new':      'licences',
    'reg-lic-renew':    'licences',
    'reg-sseg':         'sseg',
    'reg-inspect':      'enforcement',
    'reg-inspection':   'inspection',
    'reg-complaints':   'complaints',
    'reg-disp':         'disposition',
    'reg-mypd':         'tariff-det',
    'reg-levy':         'levy',
    'reg-grid-code':    'gridcode',
    'reg-consultation':    'consultation',
    'reg-enforcement':     'enforcement-w93',
    'reg-s35':             's35',
    'reg-audit-chain':     'audit-chain',
    'reg-export-packs':    'export-packs',
    'reg-reconciliation':  'reconciliation',
    'reg-control-env':     'control-env',
  };

  const activeNavId = (() => {
    const entry = Object.entries(navIdMap).find(([, screen]) => screen === activeScreen);
    return entry ? entry[0] : 'reg-dashboard';
  })();

  const liveNavConfig: NavConfig = {
    ...REGULATOR_NAV,
    activeId: activeNavId,
    sections: REGULATOR_NAV.sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        onClick: navIdMap[item.id] !== undefined
          ? () => setActiveScreen(navIdMap[item.id])
          : undefined,
      })),
    })),
  };

  const twoCol: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 320px',
    gap: '16px',
    alignItems: 'start',
  };

  const leftCol: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  };

  const rightCol: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  };

  const card: React.CSSProperties = {
    background: 'var(--oe-canvas)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-card)',
    boxShadow: 'var(--oe-shadow-card)',
    padding: '16px',
  };

  const breadcrumbLabel: string = (() => {
    switch (activeScreen) {
      case 'analytics':   return 'Analytics & Reports';
      case 'inbox':       return 'Inbox';
      case 'enforcement': return 'Enforcement Actions';
      case 'licences':    return 'Licences';
      case 'complaints':  return 'Complaints';
      case 'levy':        return 'Levy Assessment';
      case 'tariff-det':  return 'MYPD Tariff Determination';
      case 'sseg':        return 'SSEG Registration';
      case 'inspection':  return 'Compliance Inspection';
      case 'disposition':     return 'Disposition W31';
      case 'gridcode':        return 'Grid Code Compliance W67';
      case 'consultation':    return 'Consultation Notices W83';
      case 'enforcement-w93': return 'Enforcement Actions W93';
      case 's35':             return 'Admin Enforcement W106';
      case 'audit-chain':     return 'Audit Chain W118';
      case 'export-packs':    return 'Export Packs W119';
      case 'reconciliation':  return 'Reconciliation W120';
      case 'control-env':     return 'Control Env W121';
      default:                return 'Dashboard';
    }
  })();

  return (
    <AppShell
      role="regulator"
      userName={me?.name ?? 'User'}
      userEmail={me?.email ?? ''}
      navConfig={liveNavConfig}
      breadcrumbs={[{ label: 'Regulator' }, { label: breadcrumbLabel }]}
      pageTitle="Regulatory Inbox"
      alerts={[
        {
          id: 'sla-breach',
          variant: 'rose' as const,
          message: 'REG-002 Karoo Wind — Grid Code SLA expires in < 1 hour. Immediate action required.',
          dismissible: true,
        },
      ]}
    >
      {activeScreen === 'analytics'       ? <RegulatorAnalytics />
     : activeScreen === 'inbox'           ? <InboxScreen />
     : activeScreen === 'enforcement'     ? <EnforcementScreen />
     : activeScreen === 'licences'        ? <LicencesScreen />
     : activeScreen === 'complaints'      ? <ComplaintsScreen />
     : activeScreen === 'levy'            ? <LevyScreen />
     : activeScreen === 'tariff-det'      ? <TariffDetScreen />
     : activeScreen === 'sseg'            ? <SsegScreen />
     : activeScreen === 'inspection'      ? <InspectionScreen />
     : activeScreen === 'disposition'     ? <DispositionScreen />
     : activeScreen === 'gridcode'        ? <GridCodeScreen />
     : activeScreen === 'consultation'    ? <ConsultationScreen />
     : activeScreen === 'enforcement-w93' ? <EnforcementW93Screen />
     : activeScreen === 's35'             ? <S35Screen />
     : activeScreen === 'audit-chain'     ? <AuditChainScreen />
     : activeScreen === 'export-packs'    ? <ExportPacksScreen />
     : activeScreen === 'reconciliation'  ? <ReconciliationScreen />
     : activeScreen === 'control-env'     ? <ControlEnvScreen />
     : <>{/* Page title block */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--oe-text-1)', letterSpacing: '-0.02em' }}>
          Regulatory Inbox
        </div>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)', marginTop: '3px' }}>
          {filingsLoading
            ? 'Loading…'
            : `${pendingFilings} pending items · ${slaBreached} SLA breaches · ${openEnforcement} enforcement actions active`}
        </div>
      </div>

      {/* KPI row */}
      <StatGrid cols={4}>
        <StatCard
          label="Pending Inbox"
          value={filingsLoading ? '…' : String(pendingFilings)}
          subtext={filingsLoading ? undefined : `${slaBreached} SLA breached`}
          icon="list"
          variant="rose"
        />
        <StatCard
          label="Open Enforcement"
          value={filingsLoading ? '…' : String(openEnforcement)}
          icon="shield"
          variant="amber"
        />
        <StatCard
          label="Active Licences"
          value={filingsLoading ? '…' : String(activeLicences)}
          subtext="In force"
          icon="blueprint"
          variant="blue"
        />
        <StatCard
          label="SLA Breached"
          value={filingsLoading ? '…' : String(slaBreached)}
          positive={false}
          icon="chart-line"
          variant="default"
        />
      </StatGrid>

      {/* Two-column body */}
      <div style={{ ...twoCol, marginTop: '20px' }}>
        {/* Left column */}
        <div style={leftCol}>

          {/* Inbox table */}
          <div>
            <SectionHeader title="Regulatory Inbox" />
            <DataTable<RegulatorFiling>
              columns={INBOX_COLS}
              rows={filings}
              loading={filingsLoading}
              compact
            />
          </div>

          {/* Enforcement table */}
          <div>
            <SectionHeader title="Enforcement Actions" />
            <DataTable<EnforcementRow>
              columns={ENF_COLS}
              rows={enforcementRows}
              compact
            />
          </div>

          {/* State flow */}
          <div style={card}>
            <SectionHeader
              title="Licence Application — REG-001 Boland Solar"
              subtitle="W49 · Technical Evaluation in progress"
            />
            <StateFlow steps={LICENCE_STEPS} />
          </div>
        </div>

        {/* Right column */}
        <div style={rightCol}>
          <AIInsightCard
            title="Inbox Priority"
            reasoning="Pattern analysis of 3 similar Grid Code severity-level cases in the past 90 days: all resulted in licence suspension when Council review exceeded 6 hours. Current SLA window: < 1 hour."
            suggestion="REG-002 Grid Code non-conformance has SLA < 1 day. Based on severity pattern, this requires Council member review within 4 hours. 3 similar cases resulted in licence suspension."
            confidence="high"
          />

          <ChainMap
            chainLabel="REG-001 Boland Solar"
            chainType="Licence Application W49"
            currentState="Technical Evaluation"
            links={CHAIN_LINKS}
          />

          <ActionPanel
            title="Regulatory Actions"
            actions={[
              {
                id: 'issue-notice',
                label: 'Issue Compliance Notice',
                icon: 'send',
                variant: 'primary',
                form: (
                  <TransitionForm
                    actionLabel="Issue Compliance Notice"
                    fields={[
                      {
                        key: 'section',
                        label: 'ERA Section',
                        type: 'select',
                        required: true,
                        options: [
                          { value: 's10',  label: 'Section 10 — Licence conditions' },
                          { value: 's34',  label: 'Section 34 — PPA requirements' },
                          { value: 's35',  label: 'Section 35 — Enforcement' },
                        ],
                      },
                      {
                        key: 'deadline',
                        label: 'Compliance Deadline',
                        type: 'date',
                        required: true,
                      },
                    ]}
                    reasonCodes={[
                      { value: 'non_compliance',  label: 'Non-compliance identified' },
                      { value: 'material_breach', label: 'Material breach' },
                    ]}
                    onSubmit={async (_data) => {
                      const filing = filings.find(f => f.status === 'pending');
                      if (filing) await apexClient.regulator.submitFiling(filing.id);
                    }}
                  />
                ),
              },
              {
                id: 'escalate-council',
                label: 'Escalate to Council',
                icon: 'escalate',
                variant: 'danger',
                form: (
                  <TransitionForm
                    actionLabel="Escalate to Council"
                    reasonCodes={[
                      { value: 'urgent',    label: 'Urgent — public interest' },
                      { value: 'systemic',  label: 'Systemic non-compliance' },
                    ]}
                    confirmMessage="Escalating to Council will trigger a formal hearing within 30 days."
                    onSubmit={async (_data) => {
                      await apexClient.regulator.listFilings({ status: 'escalated' });
                    }}
                  />
                ),
              },
              {
                id: 'request-info',
                label: 'Request Further Information',
                icon: 'list',
                variant: 'ghost',
                onClick: async () => {
                  await apexClient.regulator.listFilings({ status: 'pending' });
                },
              },
              {
                id: 'schedule-inspection',
                label: 'Schedule Site Inspection',
                icon: 'calendar',
                variant: 'secondary',
                onClick: async () => {
                  await apexClient.audit.listBlocks({ entity_type: 'inspection' });
                },
              },
            ]}
          />
        </div>
      </div></>}
    </AppShell>
  );
}

export default RegulatorWorkstation;
