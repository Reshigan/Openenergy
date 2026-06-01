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
import { useRegulatorFilings, useRegulatorEnforcement, useRegulatorLicences, useAuditBlocks } from '../../lib/hooks';
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
  | 'inspection';

// ─── Workstation ──────────────────────────────────────────────────────────────

export function RegulatorWorkstation() {
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
    'reg-dashboard':  'dashboard',
    'reg-inbox':      'inbox',
    'reg-analytics':  'analytics',
    'reg-lic-new':    'licences',
    'reg-lic-renew':  'licences',
    'reg-sseg':       'sseg',
    'reg-inspect':    'enforcement',
    'reg-inspection': 'inspection',
    'reg-complaints': 'complaints',
    'reg-disp':       'dashboard',
    'reg-mypd':       'tariff-det',
    'reg-levy':       'levy',
    'reg-grid-code':  'dashboard',
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
      default:            return 'Dashboard';
    }
  })();

  return (
    <AppShell
      role="regulator"
      userName="Advocate M. Dlamini"
      userEmail="regulator@openenergy.co.za"
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
      {activeScreen === 'analytics'   ? <RegulatorAnalytics />
     : activeScreen === 'inbox'       ? <InboxScreen />
     : activeScreen === 'enforcement' ? <EnforcementScreen />
     : activeScreen === 'licences'    ? <LicencesScreen />
     : activeScreen === 'complaints'  ? <ComplaintsScreen />
     : activeScreen === 'levy'        ? <LevyScreen />
     : activeScreen === 'tariff-det'  ? <TariffDetScreen />
     : activeScreen === 'sseg'        ? <SsegScreen />
     : activeScreen === 'inspection'  ? <InspectionScreen />
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
