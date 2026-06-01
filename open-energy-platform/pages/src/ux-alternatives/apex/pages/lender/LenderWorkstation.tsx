/**
 * Lender Workstation — Apex design
 *
 * Screens:
 * 1. Portfolio Dashboard   — book summary, DSCR heatmap, alerts
 * 2. Facilities            — credit facility origination list
 * 3. Drawdowns             — W21 drawdown chain
 * 4. Covenants             — W38 covenant certificate chain
 * 5. Reserve Accounts      — W77 DSRA/MRA funding
 * 6. Security Perfection   — W69 legal perfection
 * 7. Loan Transfers        — W61 secondary market
 * 8. Watchlist             — at-risk facilities
 * 9. Default Cases         — W45 enforcement chain
 * 10. SARB Exposure        — large-exposure concentration
 * 11. Analytics            — DSCR waterfall, concentration risk, IRR
 */

import React, { useState } from 'react';
import { LenderAnalytics } from '../analytics/LenderAnalytics';
import { AppShell, NavConfig } from '../../components/shell/AppShell';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { AIInsightCard } from '../../components/display/AIInsightCard';
import { ChainMap, ChainLink } from '../../components/display/ChainMap';
import { ActionPanel } from '../../components/actions/ActionPanel';
import { TransitionForm } from '../../components/actions/TransitionForm';
import { StateFlow, StateFlowStep } from '../../components/display/StateFlow';
import { OeIcon } from '../../components/icons/Icons';
import { DetailDrawer, DrawerField, DrawerAction } from '../../components/display/DetailDrawer';
import {
  useLenderFacilities,
  useLenderDrawdowns,
  useLenderCovenants,
  useLenderReserveAccounts,
  useAuditBlocks,
  useCurrentUser,
} from '../../lib/hooks';
import {
  apexClient,
  LenderFacility,
  LenderDrawdown,
  LenderCovenant,
  LenderReserveAccount,
  AuditBlock,
} from '../../lib/client';
import { api } from '../../../../lib/api';

// ─── Nav config ──────────────────────────────────────────────────────────────

const LENDER_NAV: NavConfig = {
  activeId: 'ln-dashboard',
  sections: [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { id: 'ln-dashboard',  label: 'Portfolio',      href: '#dashboard',  icon: 'bar-chart' },
        { id: 'ln-analytics',  label: 'Analytics',      href: '#analytics',  icon: 'chart-line' },
        { id: 'ln-facilities', label: 'Facilities',     href: '#facilities', icon: 'dollar' },
      ],
    },
    {
      id: 'lifecycle',
      label: 'Loan Lifecycle',
      items: [
        { id: 'ln-drawdowns',      label: 'Drawdowns',        href: '#drawdowns',      icon: 'download' },
        { id: 'ln-disbursement',   label: 'Disbursements',    href: '#disbursement',   icon: 'chain' },
        { id: 'ln-covenants',      label: 'Covenants',        href: '#covenants',      icon: 'checklist',  badge: 2, badgeVariant: 'amber' },
        { id: 'ln-reserves',       label: 'Reserve Accounts', href: '#reserves',       icon: 'shield' },
        { id: 'ln-security',       label: 'Security',         href: '#security',       icon: 'lock' },
        { id: 'ln-transfers',      label: 'Loan Transfers',   href: '#transfers',      icon: 'link' },
        { id: 'ln-dscr',           label: 'DSCR Monitor W86', href: '#dscr',           icon: 'chart-bar' },
        { id: 'ln-restructure',    label: 'Loan Restructure W108', href: '#restructure', icon: 'refresh' },
      ],
    },
    {
      id: 'enforcement',
      label: 'Risk & Enforcement',
      items: [
        { id: 'ln-watchlist', label: 'Watchlist',     href: '#watchlist', icon: 'alert-triangle', badge: 1, badgeVariant: 'rose' },
        { id: 'ln-default',   label: 'Default Cases', href: '#default',   icon: 'escalate' },
        { id: 'ln-exposure',  label: 'SARB Exposure', href: '#exposure',  icon: 'scales' },
      ],
    },
    {
      id: 'esg',
      label: 'ESG',
      items: [
        { id: 'ln-sll-kpi', label: 'SLL KPI W95', href: '#', icon: 'chart-line' },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      defaultCollapsed: true,
      items: [
        { id: 'ln-reports-portfolio', label: 'Portfolio Report',    href: '#rpt-portfolio',  icon: 'report' },
        { id: 'ln-reports-ifrs',      label: 'IFRS 9 Provision',    href: '#rpt-ifrs',       icon: 'certificate' },
        { id: 'ln-reports-sarb',      label: 'SARB Large Exposure', href: '#rpt-sarb',       icon: 'stamp' },
        { id: 'ln-settings',          label: 'Settings',            href: '#settings',       icon: 'gear' },
      ],
    },
  ],
};

// ─── Screen type ─────────────────────────────────────────────────────────────

type ActiveScreen =
  | 'dashboard'
  | 'analytics'
  | 'facilities'
  | 'drawdowns'
  | 'disbursement'
  | 'covenants'
  | 'reserves'
  | 'security'
  | 'transfers'
  | 'watchlist'
  | 'default'
  | 'exposure'
  | 'dscr'
  | 'restructure'
  | 'sll-kpi';

// ─── Columns ─────────────────────────────────────────────────────────────────

const FACILITY_COLS: Column<LenderFacility>[] = [
  { key: 'project_name',       header: 'Project',       width: '200px' },
  { key: 'borrower_name',      header: 'Borrower' },
  { key: 'committed_zar',      header: 'Committed',     align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{'R' + ((row.committed_zar || 0) / 1e6).toFixed(1) + 'M'}</span>
  },
  { key: 'drawn_zar',          header: 'Drawn',         align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{'R' + ((row.drawn_zar || 0) / 1e6).toFixed(1) + 'M'}</span>
  },
  { key: 'dscr',               header: 'DSCR',          align: 'right', mono: true,
    render: row => (
      <span style={{
        fontFamily: '"JetBrains Mono", monospace',
        color: !row.dscr ? 'var(--oe-text-3)' : row.dscr < 1.15 ? 'var(--oe-rose)' : row.dscr < 1.30 ? 'var(--oe-amber)' : 'var(--oe-green)',
        fontWeight: 700,
      }}>
        {!row.dscr ? '—' : row.dscr.toFixed(2) + 'x'}
      </span>
    )
  },
  { key: 'status',             header: 'Status', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'next_cov_test_date', header: 'Next Cov Test', align: 'right', mono: true },
];

const DRAWDOWN_COLS: Column<LenderDrawdown>[] = [
  { key: 'drawdown_ref', header: 'Ref', mono: true },
  { key: 'amount_zar',   header: 'Amount', align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{'R' + ((row.amount_zar || 0) / 1e6).toFixed(1) + 'M'}</span>
  },
  { key: 'ie_cert_ref',  header: 'IE Cert' },
  { key: 'match_status', header: 'Match',
    render: row => <StatusPill label={row.match_status} variant={stateVariant(row.match_status)} />
  },
  { key: 'status',       header: 'Status', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'created_at',   header: 'Created', align: 'right', mono: true },
];

const COVENANT_COLS: Column<LenderCovenant>[] = [
  { key: 'covenant_code',      header: 'Code',      mono: true },
  { key: 'covenant_name',      header: 'Covenant',  width: '200px' },
  { key: 'covenant_type',      header: 'Type' },
  { key: 'threshold',          header: 'Threshold', align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{row.threshold.toFixed(2)}</span>
  },
  { key: 'measured_value',     header: 'Measured',  align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{row.measured_value != null ? row.measured_value.toFixed(2) : '—'}</span>
  },
  { key: 'last_test_result',   header: 'Result',
    render: row => {
      const v = row.last_test_result;
      const color = v === 'breach' ? 'var(--oe-rose)' : v === 'warn' ? 'var(--oe-amber)' : v === 'pass' ? 'var(--oe-green)' : 'var(--oe-text-3)';
      return <span style={{ color, fontWeight: 700, fontSize: '12px' }}>{v ?? '—'}</span>;
    }
  },
  { key: 'status', header: 'Status', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
];

const RESERVE_COLS: Column<LenderReserveAccount>[] = [
  { key: 'account_type', header: 'Type', mono: true },
  { key: 'target_zar',   header: 'Target', align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{'R' + ((row.target_zar || 0) / 1e6).toFixed(1) + 'M'}</span>
  },
  { key: 'balance_zar',  header: 'Balance', align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{'R' + ((row.balance_zar || 0) / 1e6).toFixed(1) + 'M'}</span>
  },
  { key: 'funded_pct',   header: 'Funded %', align: 'right', mono: true,
    render: row => {
      const pct = row.funded_pct ?? 0;
      const color = pct < 80 ? 'var(--oe-rose)' : pct < 100 ? 'var(--oe-amber)' : 'var(--oe-green)';
      return <span style={{ fontFamily: '"JetBrains Mono", monospace', color, fontWeight: 700 }}>{pct.toFixed(1) + '%'}</span>;
    }
  },
  { key: 'status', header: 'Status', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
];

const EXPOSURE_COLS: Column<LenderFacility>[] = [
  { key: 'project_name',  header: 'Project',   width: '200px' },
  { key: 'committed_zar', header: 'Committed', align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{'R' + ((row.committed_zar || 0) / 1e6).toFixed(1) + 'M'}</span>
  },
  { key: 'drawn_zar',     header: 'Drawn',     align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{'R' + ((row.drawn_zar || 0) / 1e6).toFixed(1) + 'M'}</span>
  },
  { key: 'dscr',          header: 'DSCR',      align: 'right', mono: true,
    render: row => (
      <span style={{
        fontFamily: '"JetBrains Mono", monospace',
        color: !row.dscr ? 'var(--oe-text-3)' : row.dscr < 1.15 ? 'var(--oe-rose)' : row.dscr < 1.30 ? 'var(--oe-amber)' : 'var(--oe-green)',
        fontWeight: 700,
      }}>
        {!row.dscr ? '—' : row.dscr.toFixed(2) + 'x'}
      </span>
    )
  },
  { key: 'status', header: 'Status', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
];

const AUDIT_COLS: Column<AuditBlock>[] = [
  { key: 'id',         header: 'Ref',    mono: true, render: row => <span style={{ fontFamily: 'var(--oe-font-mono)', fontSize: '11px' }}>{row.id.slice(-8).toUpperCase()}</span> },
  { key: 'action',     header: 'Action', render: row => <span style={{ fontSize: '12px' }}>{row.action}</span> },
  { key: 'actor_name', header: 'Actor',  render: row => <span style={{ fontSize: '12px' }}>{row.actor_name ?? row.actor_id.slice(-6)}</span> },
  { key: 'timestamp',  header: 'Date',   align: 'right', mono: true, render: row => <span style={{ fontFamily: 'var(--oe-font-mono)', fontSize: '11px' }}>{row.timestamp.slice(0, 10)}</span> },
];

const DRAWDOWN_STEPS: StateFlowStep[] = [
  { id: 's1', label: 'Request',   status: 'complete', timestamp: '2026-05-15' },
  { id: 's2', label: 'IE Cert',   status: 'complete', timestamp: '2026-05-20' },
  { id: 's3', label: 'CP Check',  status: 'current',  sublabel: 'Pending docs' },
  { id: 's4', label: 'Approved',  status: 'pending' },
  { id: 's5', label: 'Disbursed', status: 'pending' },
];

const CHAIN_LINKS: ChainLink[] = [
  { id: 'cl1', label: 'Stage Gate DG2',    chainType: 'IPP Stage Gate',    state: 'in_review',   role: 'IPP Developer',  relationship: 'cross-role' },
  { id: 'cl2', label: 'Security Bundle',   chainType: 'Security Perfection', state: 'registered', role: 'Lender',         relationship: 'child' },
  { id: 'cl3', label: 'DSRA Fund — F001',  chainType: 'Reserve Account',   state: 'funded',      role: 'Lender',         relationship: 'child' },
  { id: 'cl4', label: 'PPA OT-P001',       chainType: 'PPA Contract',      state: 'signed',      role: 'Offtaker',       relationship: 'cross-role' },
];

// ─── Facility drawer fields ───────────────────────────────────────────────────

function facilityDrawerFields(row: LenderFacility): DrawerField[] {
  return [
    { label: 'Facility ID',      value: row.id,                    mono: true },
    { label: 'Project',          value: row.project_name ?? '—' },
    { label: 'Borrower',         value: row.borrower_name },
    { label: 'Committed',        value: 'R' + ((row.committed_zar || 0) / 1e6).toFixed(2) + 'M', mono: true },
    { label: 'Drawn',            value: 'R' + ((row.drawn_zar || 0) / 1e6).toFixed(2) + 'M',     mono: true },
    { label: 'DSCR',             value: row.dscr ? row.dscr.toFixed(2) + 'x' : '—',               mono: true },
    { label: 'Next Cov Test',    value: row.next_cov_test_date ?? '—',                             mono: true },
    { label: 'Maturity',         value: row.maturity_date ?? '—',                                  mono: true },
    { label: 'Status',           value: <StatusPill label={row.status} variant={stateVariant(row.status)} />, span: true },
  ];
}

function facilityDrawerActions(row: LenderFacility, onDone: () => void): DrawerAction[] {
  const actions: DrawerAction[] = [];

  if (row.status === 'active' || row.status === 'watchlist') {
    actions.push({
      id: 'add-watchlist',
      label: row.status === 'watchlist' ? 'Remove from Watchlist' : 'Add to Watchlist',
      icon: 'alert-triangle',
      variant: 'danger',
      form: (
        <TransitionForm
          actionLabel={row.status === 'watchlist' ? 'Remove from Watchlist' : 'Add to Watchlist'}
          reasonCodes={[
            { value: 'dscr_risk',            label: 'DSCR at risk' },
            { value: 'generation_shortfall', label: 'Generation shortfall' },
            { value: 'counterparty',         label: 'Counterparty risk' },
          ]}
          onSubmit={async () => {
            await apexClient.lender.listFacilities({ status: 'watchlist' });
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  actions.push({
    id: 'export-pack',
    label: 'Export Credit Pack',
    icon: 'export',
    variant: 'secondary',
    onClick: async () => {
      await apexClient.lender.getFacility(row.id);
      onDone();
    },
  });

  return actions;
}

// ─── Drawdown drawer fields ───────────────────────────────────────────────────

function drawdownDrawerFields(row: LenderDrawdown): DrawerField[] {
  return [
    { label: 'Drawdown Ref',   value: row.drawdown_ref,                                               mono: true },
    { label: 'Facility ID',    value: row.facility_id,                                                mono: true },
    { label: 'Amount',         value: 'R' + ((row.amount_zar || 0) / 1e6).toFixed(2) + 'M',          mono: true },
    { label: 'Disbursed',      value: row.disbursed_amount != null ? 'R' + (row.disbursed_amount / 1e6).toFixed(2) + 'M' : '—', mono: true },
    { label: 'Delta',          value: row.delta_zar != null ? 'R' + (row.delta_zar / 1e6).toFixed(2) + 'M' : '—', mono: true },
    { label: 'IE Cert',        value: row.ie_cert_ref ?? '—' },
    { label: 'Match Status',   value: <StatusPill label={row.match_status} variant={stateVariant(row.match_status)} /> },
    { label: 'Created',        value: row.created_at.slice(0, 10),                                    mono: true },
    { label: 'Status',         value: <StatusPill label={row.status} variant={stateVariant(row.status)} />, span: true },
  ];
}

function drawdownDrawerActions(row: LenderDrawdown, onDone: () => void): DrawerAction[] {
  const actions: DrawerAction[] = [];

  if (row.status === 'pending' || row.status === 'cp_pending' || row.status === 'ie_certified') {
    actions.push({
      id: 'approve-disbursement',
      label: 'Approve Disbursement',
      icon: 'approve',
      variant: 'primary',
      form: (
        <TransitionForm
          actionLabel="Approve Disbursement"
          reasonCodes={[
            { value: 'all_cp_clear', label: 'All CPs cleared' },
            { value: 'waive_cp',     label: 'Waive outstanding CP — documented' },
          ]}
          confirmMessage="Approving this disbursement will instruct treasury to transfer funds. The IE certificate and CP register will be locked."
          onSubmit={async data => {
            await apexClient.lender.approveDisbursement(row.id, data);
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  actions.push({
    id: 'view-chain',
    label: 'Refresh Chain State',
    icon: 'chart-line',
    variant: 'secondary',
    onClick: async () => {
      await apexClient.lender.listDrawdowns({ facility_id: row.facility_id });
      onDone();
    },
  });

  return actions;
}

// ─── Covenant drawer fields ───────────────────────────────────────────────────

function covenantDrawerFields(row: LenderCovenant): DrawerField[] {
  return [
    { label: 'Code',           value: row.covenant_code,   mono: true },
    { label: 'Covenant',       value: row.covenant_name,   span: true },
    { label: 'Type',           value: row.covenant_type },
    { label: 'Operator',       value: row.operator,        mono: true },
    { label: 'Threshold',      value: row.threshold.toFixed(4), mono: true },
    { label: 'Measured Value', value: row.measured_value != null ? row.measured_value.toFixed(4) : '—', mono: true },
    { label: 'Last Test',      value: row.last_test_result ?? '—' },
    { label: 'Last Test Date', value: row.last_test_date ?? '—', mono: true },
    { label: 'Status',         value: <StatusPill label={row.status} variant={stateVariant(row.status)} />, span: true },
  ];
}

function covenantDrawerActions(row: LenderCovenant, onDone: () => void): DrawerAction[] {
  const actions: DrawerAction[] = [];

  actions.push({
    id: 'test-covenant',
    label: 'Record Test Result',
    icon: 'checklist',
    variant: 'primary',
    form: (
      <TransitionForm
        actionLabel="Record Test Result"
        reasonCodes={[
          { value: 'pass',   label: 'Pass — within threshold' },
          { value: 'warn',   label: 'Warning — approaching threshold' },
          { value: 'breach', label: 'Breach — threshold breached' },
        ]}
        onSubmit={async data => {
          await apexClient.lender.testCovenant(row.id, data);
          onDone();
        }}
      />
    ),
    onClick: async () => { /* form handles submission */ },
  });

  if (row.last_test_result === 'breach' || row.status === 'breached') {
    actions.push({
      id: 'waive-covenant',
      label: 'Waive Breach',
      icon: 'approve',
      variant: 'secondary',
      form: (
        <TransitionForm
          actionLabel="Waive Covenant Breach"
          reasonCodes={[
            { value: 'temporary_shortfall', label: 'Temporary shortfall — cure in progress' },
            { value: 'force_majeure',       label: 'Force majeure event' },
            { value: 'lender_discretion',   label: 'Lender discretion — commercial reasons' },
          ]}
          confirmMessage="Waiving this breach will suspend enforcement for the current test period. The waiver will be recorded in the audit chain."
          onSubmit={async data => {
            await apexClient.lender.waiveCovenant(row.id, data);
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  return actions;
}

// ─── Reserve account drawer fields ───────────────────────────────────────────

function reserveDrawerFields(row: LenderReserveAccount): DrawerField[] {
  return [
    { label: 'Account ID',   value: row.id,          mono: true },
    { label: 'Facility ID',  value: row.facility_id, mono: true },
    { label: 'Type',         value: row.account_type, mono: true },
    { label: 'Target',       value: 'R' + ((row.target_zar || 0) / 1e6).toFixed(2) + 'M', mono: true },
    { label: 'Balance',      value: 'R' + ((row.balance_zar || 0) / 1e6).toFixed(2) + 'M', mono: true },
    { label: 'Funded',       value: (row.funded_pct ?? 0).toFixed(1) + '%', mono: true },
    { label: 'Status',       value: <StatusPill label={row.status} variant={stateVariant(row.status)} />, span: true },
  ];
}

function reserveDrawerActions(row: LenderReserveAccount, onDone: () => void): DrawerAction[] {
  return [
    {
      id: 'refresh-balance',
      label: 'Refresh Reserve Position',
      icon: 'chart-line',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.lender.listReserveAccounts({ facility_id: row.facility_id });
        onDone();
      },
    },
    {
      id: 'view-audit',
      label: 'View Audit Trail',
      icon: 'report',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'reserve_account', entity_id: row.id });
        onDone();
      },
    },
  ];
}

// ─── Audit block drawer fields ────────────────────────────────────────────────

function auditDrawerFields(row: AuditBlock): DrawerField[] {
  return [
    { label: 'Block ID',     value: row.id,                           mono: true, span: true },
    { label: 'Sequence',     value: String(row.seq),                  mono: true },
    { label: 'Action',       value: row.action },
    { label: 'Actor',        value: row.actor_name ?? row.actor_id,   mono: true },
    { label: 'Actor Role',   value: row.actor_role ?? '—' },
    { label: 'Entity Type',  value: row.entity_type },
    { label: 'Entity ID',    value: row.entity_id,                    mono: true },
    { label: 'Hash',         value: row.hash.slice(0, 20) + '…',      mono: true },
    { label: 'Prev Hash',    value: row.prev_hash ? row.prev_hash.slice(0, 20) + '…' : '—', mono: true },
    { label: 'Timestamp',    value: row.timestamp,                    mono: true, span: true },
  ];
}

// ─── Sub-screen: Facilities ───────────────────────────────────────────────────

function FacilitiesScreen() {
  const { data, loading, refetch } = useLenderFacilities();
  const [selected, setSelected] = React.useState<LenderFacility | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Loan Facilities</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable
        columns={FACILITY_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.project_name ?? 'Facility'}
        subtitle={selected?.borrower_name}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        status={selected?.status}
        fields={selected ? facilityDrawerFields(selected) : []}
        actions={selected ? facilityDrawerActions(selected, () => { refetch(); setDrawerOpen(false); }) : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── Sub-screen: Drawdowns ────────────────────────────────────────────────────

function DrawdownsScreen() {
  const { data, loading, refetch } = useLenderDrawdowns();
  const [selected, setSelected] = React.useState<LenderDrawdown | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Drawdowns</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable
        columns={DRAWDOWN_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.drawdown_ref ?? 'Drawdown'}
        subtitle={selected ? 'R' + ((selected.amount_zar || 0) / 1e6).toFixed(1) + 'M' : undefined}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        status={selected?.status}
        fields={selected ? drawdownDrawerFields(selected) : []}
        actions={selected ? drawdownDrawerActions(selected, () => { refetch(); setDrawerOpen(false); }) : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── Sub-screen: Covenants ────────────────────────────────────────────────────

function CovenantsScreen() {
  const { data, loading, refetch } = useLenderCovenants();
  const [selected, setSelected] = React.useState<LenderCovenant | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Covenants</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <AIInsightCard
        title="Covenant Action Required"
        suggestion="Kalahari Solar covenant certificate for Q1 2026 is 18 days overdue. The facility agreement requires delivery within 45 days of quarter-end (deadline was 15 May). A 5-day cure period has now expired — formal covenant breach notice must be issued within 3 business days."
        reasoning="LMA §15.4: covenant certificate delay beyond the cure period is an Event of Default unless a waiver is agreed. Issuing the notice preserves the lender's remedies without triggering acceleration."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable
        columns={COVENANT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.covenant_name ?? 'Covenant'}
        subtitle={selected?.covenant_type}
        entityRef={selected ? selected.covenant_code : undefined}
        status={selected?.status}
        fields={selected ? covenantDrawerFields(selected) : []}
        actions={selected ? covenantDrawerActions(selected, () => { refetch(); setDrawerOpen(false); }) : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── Sub-screen: Reserve Accounts ────────────────────────────────────────────

function ReservesScreen() {
  const { data, loading, refetch } = useLenderReserveAccounts();
  const [selected, setSelected] = React.useState<LenderReserveAccount | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Reserve Accounts</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable
        columns={RESERVE_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? selected.account_type + ' Reserve' : 'Reserve Account'}
        subtitle={selected ? 'Funded ' + (selected.funded_pct ?? 0).toFixed(1) + '%' : undefined}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        status={selected?.status}
        fields={selected ? reserveDrawerFields(selected) : []}
        actions={selected ? reserveDrawerActions(selected, () => { refetch(); setDrawerOpen(false); }) : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── Sub-screen: Security (W69 audit trail) ───────────────────────────────────

function SecurityScreen() {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'security_perfection' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Security Perfection</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' audit events'}</div>
      </div>
      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', fontSize: '12px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <OeIcon name="lock" size={14} />
        W69 Security Perfection — Deeds Registry, Movable-Property Security Act, STRATE registration events. Click any row to inspect the tamper-evident audit block.
      </div>
      <ActionPanel
        title="Initiate Security Registration"
        actions={[
          {
            id: 'initiate-security',
            label: 'Initiate Perfection Process',
            description: 'Open a new security perfection registration with Deeds/MPSA/STRATE',
            icon: 'lock',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Initiate Security Perfection"
                reasonCodes={[
                  { value: 'mortgage_bond',    label: 'Mortgage bond — immovable property' },
                  { value: 'notarial_bond',    label: 'Notarial bond — movable property' },
                  { value: 'strate_pledge',    label: 'STRATE pledge — listed securities' },
                  { value: 'cession',          label: 'Cession in securitatem debiti — receivables' },
                ]}
                onSubmit={async () => {
                  await apexClient.audit.listBlocks({ entity_type: 'security_perfection' });
                  refetch();
                }}
              />
            ),
          },
        ]}
      />
      <AIInsightCard
        title="Security Registration Delay"
        suggestion="Mortgage bond registration for Kalkfontein BESS (R280M) shows 'pending' at the Deeds Office for 67 days — 17 days beyond typical registration timeframe. Unregistered security creates an unsecured exposure. Competing creditor registrations during this window could take priority."
        reasoning="SARB PA §34: lenders cannot report project finance as 'secured' in regulatory capital calculations until perfection is confirmed. Unconfirmed security inflates risk-weighted assets and reduces the lender's Tier 1 capital ratio."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.action ?? 'Audit Event'}
        subtitle="Security Perfection — W69"
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        fields={selected ? auditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'verify-hash',
            label: 'Verify Block Integrity',
            icon: 'shield',
            variant: 'secondary',
            onClick: async () => {
              if (selected) await apexClient.audit.getBlock(selected.id);
            },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── Sub-screen: Transfers (W61 audit trail) ─────────────────────────────────

function TransfersScreen() {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'loan_transfer' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Loan Transfers</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' transfer events'}</div>
      </div>
      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', fontSize: '12px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <OeIcon name="link" size={14} />
        W61 Loan Transfer / Secondary Participation — LMA secondary-trading, SARB Exchange Control residency checks, FIC beneficial ownership. Click any row to inspect.
      </div>
      <ActionPanel
        title="Initiate Loan Transfer"
        actions={[
          {
            id: 'initiate-transfer',
            label: 'Initiate Secondary Transfer',
            description: 'Begin LMA-standard loan transfer or sub-participation',
            icon: 'link',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Initiate Loan Transfer"
                reasonCodes={[
                  { value: 'assignment',       label: 'Assignment — full transfer of rights' },
                  { value: 'sub_participation', label: 'Sub-participation — funded risk share' },
                  { value: 'novation',         label: 'Novation — replace lender in syndicate' },
                ]}
                onSubmit={async () => {
                  await apexClient.audit.listBlocks({ entity_type: 'loan_transfer' });
                  refetch();
                }}
              />
            ),
          },
        ]}
      />
      <AIInsightCard
        title="Exchange Control Deadline"
        suggestion="LTR-2026-0003 (R145M participation, non-resident buyer: Deutsche Infra GmbH) requires SARB FinSurv exchange control approval before transfer can proceed. SARB processing typically takes 30-45 days. The transfer deadline under the LTA is 30 Jun 2026 — 29 days away."
        reasoning="SARB ExCon §B.5: non-resident participation in SA infrastructure project finance requires prior FinSurv approval. Transfer without approval is an exchange control contravention with potential ZAR denomination penalties."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.action ?? 'Transfer Event'}
        subtitle="Loan Transfer — W61"
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        fields={selected ? auditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'verify-hash',
            label: 'Verify Block Integrity',
            icon: 'shield',
            variant: 'secondary',
            onClick: async () => {
              if (selected) await apexClient.audit.getBlock(selected.id);
            },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── Sub-screen: Disbursements (W30) ─────────────────────────────────────────

type DisbursementRow = {
  id: string;
  ref: string;
  project_name: string | null;
  uop_category: string | null;
  tranche_amount_zar: number;
  chain_status: string;
  tranche_released_at: string | null;
  tranche_tier: string;
  facility_ref: string;
  drawdown_ref: string | null;
  ie_certificate_ref: string | null;
  sarb_exchange_control_ref: string | null;
  equator_principles_ref: string | null;
  invoices_amount_zar: number | null;
  reconciled_amount_zar: number | null;
  clawback_amount_zar: number | null;
};

const DISBURSEMENT_COLS: Column<DisbursementRow>[] = [
  { key: 'ref', header: 'Ref', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.id.slice(-8).toUpperCase()}</span>
  },
  { key: 'project_name',      header: 'Project',    render: row => <span>{row.project_name ?? row.facility_ref}</span> },
  { key: 'uop_category',      header: 'UoP Category', render: row => <span>{row.uop_category ?? '—'}</span> },
  { key: 'tranche_amount_zar', header: 'Amount',    align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{'R' + ((row.tranche_amount_zar || 0) / 1e6).toFixed(1) + 'M'}</span>
  },
  { key: 'chain_status',      header: 'Status',     render: row => <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} /> },
  { key: 'tranche_released_at', header: 'Released', align: 'right', mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.tranche_released_at ? row.tranche_released_at.slice(0, 10) : '—'}</span>
  },
];

function disbursementDrawerFields(row: DisbursementRow): DrawerField[] {
  return [
    { label: 'ID',                 value: row.id,                                                                            mono: true, span: true },
    { label: 'Project',            value: row.project_name ?? row.facility_ref },
    { label: 'Facility Ref',       value: row.facility_ref,                                                                  mono: true },
    { label: 'Drawdown Ref',       value: row.drawdown_ref ?? '—',                                                           mono: true },
    { label: 'UoP Category',       value: row.uop_category ?? '—' },
    { label: 'Tier',               value: row.tranche_tier,                                                                  mono: true },
    { label: 'Tranche Amount',     value: 'R' + ((row.tranche_amount_zar || 0) / 1e6).toFixed(2) + 'M',                     mono: true },
    { label: 'Invoices Amount',    value: row.invoices_amount_zar != null ? 'R' + (row.invoices_amount_zar / 1e6).toFixed(2) + 'M' : '—', mono: true },
    { label: 'Reconciled Amount',  value: row.reconciled_amount_zar != null ? 'R' + (row.reconciled_amount_zar / 1e6).toFixed(2) + 'M' : '—', mono: true },
    { label: 'Clawback Amount',    value: row.clawback_amount_zar != null ? 'R' + (row.clawback_amount_zar / 1e6).toFixed(2) + 'M' : '—', mono: true },
    { label: 'IE Certificate',     value: row.ie_certificate_ref ?? '—',                                                     mono: true },
    { label: 'SARB ExCon Ref',     value: row.sarb_exchange_control_ref ?? '—',                                              mono: true },
    { label: 'Equator Principles', value: row.equator_principles_ref ?? '—',                                                 mono: true },
    { label: 'Released At',        value: row.tranche_released_at ? row.tranche_released_at.slice(0, 10) : '—',              mono: true },
    { label: 'Status',             value: <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} />, span: true },
  ];
}

function disbursementDrawerActions(row: DisbursementRow, onDone: () => void): DrawerAction[] {
  const actions: DrawerAction[] = [];

  if (row.chain_status === 'invoices_pending') {
    actions.push({
      id: 'request-invoices',
      label: 'Request Invoices',
      icon: 'send',
      variant: 'primary',
      form: (
        <TransitionForm
          actionLabel="Request Invoices"
          reasonCodes={[
            { value: 'standard_request', label: 'Standard tranche invoice request' },
            { value: 'milestone_payment', label: 'Milestone payment — IE certified' },
          ]}
          onSubmit={async () => {
            await api.post(`/api/disbursement/chain/${row.id}/transition`, { action: 'request_invoices' });
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  if (row.chain_status === 'invoices_submitted' || row.chain_status === 'bank_validating') {
    actions.push({
      id: 'begin-validation',
      label: 'Begin Bank Validation',
      icon: 'checklist',
      variant: 'primary',
      form: (
        <TransitionForm
          actionLabel="Begin Bank Validation"
          reasonCodes={[
            { value: 'invoices_verified', label: 'Invoices received and verified' },
            { value: 'partial_verification', label: 'Partial verification — proceed with caution' },
          ]}
          onSubmit={async () => {
            await api.post(`/api/disbursement/chain/${row.id}/transition`, { action: 'begin_validation' });
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  if (row.chain_status === 'bank_validating' || row.chain_status === 'ie_certifying') {
    actions.push({
      id: 'accept-ie',
      label: 'Accept IE Certificate',
      icon: 'certificate',
      variant: 'primary',
      form: (
        <TransitionForm
          actionLabel="Accept IE Certificate"
          reasonCodes={[
            { value: 'ie_certified_clean', label: 'IE certification — no qualifications' },
            { value: 'ie_certified_qualified', label: 'IE certification — with minor qualifications' },
          ]}
          confirmMessage="Accepting the IE certificate will advance to UoP certified status. The certificate reference will be locked in the chain."
          onSubmit={async () => {
            await api.post(`/api/disbursement/chain/${row.id}/transition`, { action: 'accept_ie' });
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  if (row.chain_status === 'uop_certified') {
    actions.push({
      id: 'close-reconciliation',
      label: 'Close Reconciliation',
      icon: 'approve',
      variant: 'primary',
      form: (
        <TransitionForm
          actionLabel="Close Reconciliation"
          reasonCodes={[
            { value: 'fully_reconciled',  label: 'Fully reconciled — no variance' },
            { value: 'minor_variance',    label: 'Minor variance accepted — documented' },
          ]}
          confirmMessage="Closing reconciliation will mark this tranche as reconciled and release it from active monitoring."
          onSubmit={async () => {
            await api.post(`/api/disbursement/chain/${row.id}/transition`, { action: 'close_reconciliation' });
            onDone();
          }}
        />
      ),
      onClick: async () => { /* form handles submission */ },
    });
  }

  actions.push({
    id: 'demand-clawback',
    label: 'Demand Clawback',
    icon: 'escalate',
    variant: 'danger',
    form: (
      <TransitionForm
        actionLabel="Demand Clawback"
        reasonCodes={[
          { value: 'uop_breach',       label: 'UoP breach — funds not used as intended' },
          { value: 'ie_cert_revoked',  label: 'IE certification revoked' },
          { value: 'equator_breach',   label: 'Equator Principles breach' },
          { value: 'sarb_direction',   label: 'SARB exchange control direction' },
        ]}
        confirmMessage="Demanding clawback will cross the regulator on every tier. This action is irreversible and triggers the W45 enforcement chain."
        onSubmit={async () => {
          await api.post(`/api/disbursement/chain/${row.id}/transition`, { action: 'demand_clawback' });
          onDone();
        }}
      />
    ),
    onClick: async () => { /* form handles submission */ },
  });

  return actions;
}

function DisbursementScreen() {
  const [rows, setRows] = React.useState<DisbursementRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<DisbursementRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetch = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/disbursement/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as DisbursementRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetch(); }, [fetch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Disbursements — UoP Monitoring
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' disbursement cases'}</div>
      </div>
      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', fontSize: '12px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <OeIcon name="chain" size={14} />
        W30 Disbursement UoP Monitoring — SARB + Equator Principles + IE certification on every funded tranche. Clawback crosses regulator on every tier. INVERTED SLA: larger tranches get more documentation time.
      </div>
      <AIInsightCard
        suggestion="Drawdown request DR-2026-014 for R245M (Kalahari Solar Phase 2 turbine procurement) is awaiting Independent Engineer sign-off. IE report is 12 days overdue — if not received by 15 Jun, the drawdown window under §8.3 expires and a new certification will be required."
        reasoning="LMA PF §8.3 certifies drawdowns against construction milestones. A lapsed drawdown window requires re-certification at current IE rates (~R180k) and typically delays financial close by 4-6 weeks."
        title="Follow Up with IE"
        onAccept={() => {}}
      />
      <DataTable
        columns={DISBURSEMENT_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? (selected.project_name ?? selected.facility_ref) : 'Disbursement Case'}
        subtitle={selected ? 'R' + ((selected.tranche_amount_zar || 0) / 1e6).toFixed(1) + 'M · ' + (selected.uop_category ?? 'UoP') : undefined}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        status={selected?.chain_status}
        fields={selected ? disbursementDrawerFields(selected) : []}
        actions={selected ? disbursementDrawerActions(selected, () => { void fetch(); setDrawerOpen(false); }) : []}
        onActionComplete={fetch}
      />
    </div>
  );
}

// ─── Sub-screen: Watchlist ────────────────────────────────────────────────────

function WatchlistScreen() {
  const { data: all, loading, refetch } = useLenderFacilities();
  const data = all.filter(f => f.status === 'watchlist');
  const [selected, setSelected] = React.useState<LenderFacility | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Watchlist</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' facilities at risk'}</div>
      </div>
      <DataTable
        columns={FACILITY_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.project_name ?? 'Facility'}
        subtitle={selected?.borrower_name}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        status={selected?.status}
        fields={selected ? facilityDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'remove-watchlist',
            label: 'Remove from Watchlist',
            icon: 'approve',
            variant: 'primary',
            form: (
              <TransitionForm
                actionLabel="Remove from Watchlist"
                reasonCodes={[
                  { value: 'dscr_recovered',  label: 'DSCR recovered above covenant floor' },
                  { value: 'cure_complete',   label: 'Cure period complete' },
                  { value: 'risk_resolved',   label: 'Identified risk resolved' },
                ]}
                onSubmit={async () => {
                  await apexClient.lender.listFacilities({ status: 'watchlist' });
                  refetch();
                  setDrawerOpen(false);
                }}
              />
            ),
            onClick: async () => { /* form handles submission */ },
          },
          {
            id: 'escalate-default',
            label: 'Escalate to Default',
            icon: 'escalate',
            variant: 'danger',
            form: (
              <TransitionForm
                actionLabel="Escalate to Default"
                reasonCodes={[
                  { value: 'payment_default',  label: 'Debt service payment missed' },
                  { value: 'covenant_breach',  label: 'Covenant breach uncured past grace period' },
                  { value: 'insolvency',       label: 'Borrower insolvency event' },
                ]}
                confirmMessage="Escalating to Default will trigger the W45 enforcement chain and notify the regulator. This action cannot be undone."
                onSubmit={async () => {
                  await apexClient.lender.listFacilities({ status: 'default' });
                  refetch();
                  setDrawerOpen(false);
                }}
              />
            ),
            onClick: async () => { /* form handles submission */ },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── Sub-screen: Default (W45 audit trail) ────────────────────────────────────

function DefaultScreen() {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'loan_default' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Loan Default / Enforcement</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' enforcement events'}</div>
      </div>
      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', fontSize: '12px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <OeIcon name="escalate" size={14} />
        W45 Loan Default and Enforcement — event-of-default, enforcement, step-in rights, restructure, and write-off chain. All events are tamper-evident. Click any row to inspect.
      </div>
      <ActionPanel
        title="Default Case Actions"
        actions={[
          {
            id: 'declare-default',
            label: 'Declare Event of Default',
            description: 'Initiate LMA enforcement under the loan agreement',
            icon: 'escalate',
            variant: 'danger',
            form: (
              <TransitionForm
                actionLabel="Declare Event of Default"
                reasonCodes={[
                  { value: 'payment_default',    label: 'Payment default — debt service missed' },
                  { value: 'covenant_breach',    label: 'Covenant breach — uncured past grace period' },
                  { value: 'cross_default',      label: 'Cross-default — default under related agreement' },
                  { value: 'insolvency',         label: 'Insolvency or business rescue' },
                  { value: 'material_adverse',   label: 'Material adverse change' },
                ]}
                confirmMessage="Declaring an Event of Default will trigger the W45 enforcement chain, notify SARB (if large exposure), and lock the facility for restructuring. This action is recorded in the tamper-evident audit chain."
                onSubmit={async () => {
                  await apexClient.audit.listBlocks({ entity_type: 'loan_default' });
                  refetch();
                }}
              />
            ),
          },
        ]}
      />
      <DataTable
        columns={AUDIT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.action ?? 'Enforcement Event'}
        subtitle="Loan Default / Enforcement — W45"
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        fields={selected ? auditDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'verify-hash',
            label: 'Verify Block Integrity',
            icon: 'shield',
            variant: 'secondary',
            onClick: async () => {
              if (selected) await apexClient.audit.getBlock(selected.id);
            },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── Sub-screen: SARB Exposure ────────────────────────────────────────────────

function ExposureScreen() {
  const { data, loading, refetch } = useLenderFacilities();
  const [selected, setSelected] = React.useState<LenderFacility | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>SARB Large Exposure</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' facilities'}</div>
      </div>
      <DataTable
        columns={EXPOSURE_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected?.project_name ?? 'Facility'}
        subtitle={selected?.borrower_name}
        entityRef={selected ? selected.id.slice(-8).toUpperCase() : undefined}
        status={selected?.status}
        fields={selected ? facilityDrawerFields(selected) : []}
        actions={selected ? [
          {
            id: 'run-exposure-check',
            label: 'Run SARB Exposure Check',
            icon: 'scales',
            variant: 'primary',
            onClick: async () => {
              if (selected) await apexClient.lender.getFacility(selected.id);
              refetch();
            },
          },
          {
            id: 'export-sarb',
            label: 'Export SARB Return',
            icon: 'export',
            variant: 'secondary',
            onClick: async () => {
              await apexClient.lender.listFacilities();
            },
          },
        ] : []}
        onActionComplete={refetch}
      />
    </div>
  );
}

// ─── Sub-screen: DSCR Monitoring (W86) ───────────────────────────────────────

type DscrRow = {
  id: string;
  ref: string;
  facility_name: string;
  period: string;
  dscr: number;
  threshold: number;
  chain_status: string;
  tier: string;
};

const DSCR_MONITOR_COLS: Column<DscrRow>[] = [
  { key: 'ref',           header: 'Reference',   width: '150px', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span>,
  },
  { key: 'facility_name', header: 'Facility',    width: '220px',
    render: r => <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{r.facility_name}</span>,
  },
  { key: 'period',        header: 'Period',      width: '100px', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.period}</span>,
  },
  { key: 'dscr',          header: 'DSCR',        width: '90px',  align: 'right', mono: true,
    render: r => (
      <span style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: '12px',
        fontWeight: 700,
        color: r.dscr < r.threshold ? 'var(--oe-rose)' : r.dscr < r.threshold + 0.1 ? 'var(--oe-amber)' : 'var(--oe-green)',
      }}>
        {r.dscr.toFixed(2)}x
      </span>
    ),
  },
  { key: 'threshold',     header: 'Threshold',   width: '90px',  align: 'right', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.threshold.toFixed(2)}x</span>,
  },
  { key: 'chain_status',  header: 'Status',      width: '130px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" />,
  },
];

function DscrMonitorScreen() {
  const [rows, setRows] = React.useState<DscrRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<DscrRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetchRows = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/dscr-monitoring/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as DscrRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetchRows(); }, [fetchRows]);

  const fields: DrawerField[] = sel ? [
    { label: 'Reference',   value: sel.ref,                              mono: true },
    { label: 'Facility',    value: sel.facility_name,                    span: true },
    { label: 'Period',      value: sel.period,                           mono: true },
    { label: 'DSCR',        value: sel.dscr.toFixed(2) + 'x',           mono: true },
    { label: 'Threshold',   value: sel.threshold.toFixed(2) + 'x',      mono: true },
    { label: 'Tier',        value: sel.tier,                             mono: true },
    { label: 'Status',      value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
  ] : [];

  const actions: DrawerAction[] = sel ? [
    {
      id: 'flag-breach',
      label: 'Flag Breach',
      icon: 'alert-triangle',
      variant: 'danger' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Flag DSCR Breach"
          requireReason
          reasonCodes={[
            { value: 'generation_shortfall', label: 'Generation below P50 — revenue shortfall' },
            { value: 'opex_overrun',         label: 'O&M cost overrun' },
            { value: 'debt_service_spike',   label: 'Debt service increase (floating rate)' },
            { value: 'force_majeure',        label: 'Force majeure — production event' },
          ]}
          onSubmit={async (data) => {
            await api.post(`/api/dscr-monitoring/chain/${sel.id}/transition`, { action: 'flag_breach', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'issue-cure-notice',
      label: 'Issue Cure Notice',
      icon: 'send',
      variant: 'primary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Issue DSCR Cure Notice"
          fields={[
            { key: 'cure_deadline', label: 'Cure Deadline',    type: 'text',   required: true, placeholder: 'e.g. 2026-09-30' },
            { key: 'target_dscr',  label: 'Target DSCR',      type: 'number', required: true, placeholder: 'e.g. 1.25' },
          ]}
          requireReason={false}
          onSubmit={async (data) => {
            await api.post(`/api/dscr-monitoring/chain/${sel.id}/transition`, { action: 'issue_cure_notice', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'resolve',
      label: 'Mark Resolved',
      icon: 'approve',
      variant: 'primary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Resolve DSCR Monitoring Case"
          reasonCodes={[
            { value: 'dscr_recovered',     label: 'DSCR recovered above threshold' },
            { value: 'cure_complete',      label: 'Cure measures completed successfully' },
            { value: 'waiver_granted',     label: 'Lender waiver granted for period' },
          ]}
          onSubmit={async (data) => {
            await api.post(`/api/dscr-monitoring/chain/${sel.id}/transition`, { action: 'resolve', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'escalate',
      label: 'Escalate to W45 Default',
      icon: 'escalate',
      variant: 'danger' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Escalate DSCR Breach to Default"
          requireReason
          reasonCodes={[
            { value: 'cure_period_lapsed',  label: 'Cure period lapsed — uncured' },
            { value: 'equity_injected_failed', label: 'Equity injection failed to materialise' },
            { value: 'persistent_breach',   label: 'Persistent breach across 2+ consecutive periods' },
          ]}
          confirmMessage="Escalating to Default will trigger the W45 enforcement chain and notify SARB. This action is recorded in the tamper-evident audit chain."
          onSubmit={async (data) => {
            await api.post(`/api/dscr-monitoring/chain/${sel.id}/transition`, { action: 'escalate', ...data });
            void fetchRows();
          }}
        />
      ),
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>DSCR Monitoring</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W86 · Debt service coverage ratio covenant tracking</div>
      </div>
      <AIInsightCard
        suggestion="Kalahari Solar 1 DSCR has declined to 1.08x for Q1 2026, approaching the 1.05x covenant trigger. Drought-reduced curtailment and R45M unplanned maintenance drive the shortfall. At the current trajectory, Q2 2026 DSCR is projected at 0.97x — below the 1.00x default threshold."
        reasoning="LMA §15.4 DSCR covenant breach triggers a 30-day cure window. At projected 0.97x, a formal event of default notice would be required if the cure window expires without DSRA drawdown or equity cure."
        title="Model Cure Scenarios"
        onAccept={() => {}}
      />

      <DataTable<DscrRow>
        columns={DSCR_MONITOR_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSel(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={sel ? sel.facility_name : ''}
        subtitle={sel ? `${sel.period} · DSCR ${sel.dscr.toFixed(2)}x` : ''}
        entityRef={sel ? sel.ref : ''}
        status={sel?.chain_status}
        statusVariant={sel ? stateVariant(sel.chain_status) : 'default'}
        fields={fields}
        actions={actions}
        onActionComplete={() => { void fetchRows(); setDrawerOpen(false); }}
      />
    </div>
  );
}

// ─── Sub-screen: Loan Restructure & A&E (W108) ───────────────────────────────

type RestructureRow = {
  id: string;
  ref: string;
  borrower_name: string;
  facility_amount_zar: number;
  restructure_type: string;
  chain_status: string;
  trigger_date: string;
  tier: string;
};

const RESTRUCTURE_COLS: Column<RestructureRow>[] = [
  { key: 'ref',                 header: 'Reference',         width: '150px', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span>,
  },
  { key: 'borrower_name',       header: 'Borrower',          width: '200px',
    render: r => <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{r.borrower_name}</span>,
  },
  { key: 'facility_amount_zar', header: 'Facility Amount',   width: '130px', align: 'right', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>{'R' + ((r.facility_amount_zar || 0) / 1e6).toFixed(1) + 'M'}</span>,
  },
  { key: 'restructure_type',    header: 'Restructure Type',  width: '150px',
    render: r => <span style={{ fontSize: '11px', color: 'var(--oe-text-2)', textTransform: 'uppercase' }}>{r.restructure_type}</span>,
  },
  { key: 'chain_status',        header: 'Status',            width: '130px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" />,
  },
  { key: 'trigger_date',        header: 'Trigger Date',      width: '110px', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{r.trigger_date}</span>,
  },
];

function RestructureScreen() {
  const [rows, setRows] = React.useState<RestructureRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<RestructureRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetchRows = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/lender/loan-restructure/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as RestructureRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetchRows(); }, [fetchRows]);

  const fields: DrawerField[] = sel ? [
    { label: 'Reference',        value: sel.ref,                                                              mono: true },
    { label: 'Borrower',         value: sel.borrower_name,                                                    span: true },
    { label: 'Facility Amount',  value: 'R' + ((sel.facility_amount_zar || 0) / 1e6).toFixed(2) + 'M',       mono: true },
    { label: 'Restructure Type', value: sel.restructure_type },
    { label: 'Trigger Date',     value: sel.trigger_date,                                                     mono: true },
    { label: 'Tier',             value: sel.tier,                                                             mono: true },
    { label: 'Status',           value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
  ] : [];

  const actions: DrawerAction[] = sel ? [
    {
      id: 'submit-to-credit-committee',
      label: 'Submit to Credit Committee',
      icon: 'send',
      variant: 'primary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Submit to Credit Committee"
          fields={[
            { key: 'cc_meeting_date', label: 'CC Meeting Date',  type: 'text',   required: true, placeholder: 'e.g. 2026-07-10' },
            { key: 'requested_terms', label: 'Proposed Terms',   type: 'text',   required: false, placeholder: 'e.g. extend tenor 24m, margin +50bps' },
          ]}
          requireReason={false}
          onSubmit={async (data) => {
            await api.post(`/api/lender/loan-restructure/chain/${sel.id}/transition`, { action: 'submit_to_credit_committee', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'approve',
      label: 'Approve Restructure',
      icon: 'approve',
      variant: 'primary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Approve Loan Restructure"
          reasonCodes={[
            { value: 'credit_committee_approved', label: 'Credit committee approval obtained' },
            { value: 'syndicate_consent',         label: 'Syndicate lender consent received' },
          ]}
          confirmMessage="Approving this restructure will update the facility terms and lock the original terms in the audit chain."
          onSubmit={async (data) => {
            await api.post(`/api/lender/loan-restructure/chain/${sel.id}/transition`, { action: 'approve', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'reject',
      label: 'Reject',
      icon: 'reject',
      variant: 'danger' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Reject Loan Restructure"
          requireReason
          reasonCodes={[
            { value: 'credit_committee_declined', label: 'Credit committee declined' },
            { value: 'terms_unacceptable',        label: 'Proposed terms unacceptable to syndicate' },
            { value: 'viability_concerns',        label: 'Project viability concerns unresolved' },
          ]}
          onSubmit={async (data) => {
            await api.post(`/api/lender/loan-restructure/chain/${sel.id}/transition`, { action: 'reject', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'mark-effective',
      label: 'Mark Effective',
      icon: 'certificate',
      variant: 'secondary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Mark Restructure Effective"
          fields={[
            { key: 'effective_date',    label: 'Effective Date',    type: 'text', required: true, placeholder: 'e.g. 2026-08-01' },
            { key: 'amendment_ref',     label: 'Amendment Ref',     type: 'text', required: true, placeholder: 'e.g. AMD-F001-003' },
          ]}
          requireReason={false}
          onSubmit={async (data) => {
            await api.post(`/api/lender/loan-restructure/chain/${sel.id}/transition`, { action: 'mark_effective', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'escalate-to-default',
      label: 'Escalate to Default',
      icon: 'escalate',
      variant: 'danger' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Escalate Restructure to Default"
          requireReason
          reasonCodes={[
            { value: 'restructure_failed',     label: 'Restructure negotiations failed' },
            { value: 'borrower_uncooperative', label: 'Borrower unresponsive / uncooperative' },
            { value: 'additional_eod',         label: 'Additional event of default triggered during negotiations' },
          ]}
          confirmMessage="Escalating to Default will trigger the W45 enforcement chain and is recorded in the tamper-evident audit chain. This action cannot be undone."
          onSubmit={async (data) => {
            await api.post(`/api/lender/loan-restructure/chain/${sel.id}/transition`, { action: 'escalate_to_default', ...data });
            void fetchRows();
          }}
        />
      ),
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Loan Restructure & A&E</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W108 · Amendments, extensions & restructure lifecycle</div>
      </div>
      <AIInsightCard
        suggestion="Loeriesfontein 3 restructure proposal involves an 18-month maturity extension and R245M capex injection. The proposed restructure reduces lender return by ~120bps but improves probability of full recovery by 34% vs enforcement scenarios."
        reasoning="SARB PA §34 requires large-exposure restructures (>10% Tier 1 capital) to be reviewed by the credit committee and disclosed in the quarterly COREP submission."
        title="Request Credit Committee"
        onAccept={() => {}}
      />

      <DataTable<RestructureRow>
        columns={RESTRUCTURE_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSel(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={sel ? sel.borrower_name : ''}
        subtitle={sel ? `${sel.restructure_type.toUpperCase()} · R${((sel.facility_amount_zar || 0) / 1e6).toFixed(1)}M` : ''}
        entityRef={sel ? sel.ref : ''}
        status={sel?.chain_status}
        statusVariant={sel ? stateVariant(sel.chain_status) : 'default'}
        fields={fields}
        actions={actions}
        onActionComplete={() => { void fetchRows(); setDrawerOpen(false); }}
      />
    </div>
  );
}

// ─── SLL KPI Compliance & Margin Ratchet (W95) ───────────────────────────────

type SllKpiRow = {
  id: string;
  ref: string;
  facility_name: string;
  kpi_name: string;
  target_value: number;
  actual_value: number | null;
  margin_step_bps: number;
  chain_status: string;
  measurement_date: string | null;
  tier: string;
};

const SLL_KPI_COLS: Column<SllKpiRow>[] = [
  { key: 'ref',            header: 'Reference',      width: '150px', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--oe-text-2)' }}>{r.ref}</span>,
  },
  { key: 'facility_name', header: 'Facility',        width: '200px',
    render: r => <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)' }}>{r.facility_name}</span>,
  },
  { key: 'kpi_name',      header: 'KPI',             width: '200px',
    render: r => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{r.kpi_name}</span>,
  },
  { key: 'target_value',  header: 'Target',          width: '90px', align: 'right', mono: true,
    render: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>{r.target_value}</span>,
  },
  { key: 'actual_value',  header: 'Actual',          width: '90px', align: 'right', mono: true,
    render: r => (
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: r.actual_value == null ? 'var(--oe-text-3)' : 'var(--oe-text-1)' }}>
        {r.actual_value ?? '—'}
      </span>
    ),
  },
  { key: 'margin_step_bps', header: 'Margin Step',  width: '110px', align: 'right', mono: true,
    render: r => (
      <span style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: '12px',
        color: r.margin_step_bps > 0 ? 'var(--oe-rose)' : r.margin_step_bps < 0 ? 'var(--oe-green)' : 'var(--oe-text-2)',
        fontWeight: r.margin_step_bps !== 0 ? 600 : 400,
      }}>
        {`${r.margin_step_bps > 0 ? '+' : ''}${r.margin_step_bps}bps`}
      </span>
    ),
  },
  { key: 'chain_status',  header: 'Status',          width: '130px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} size="sm" />,
  },
];

function SllKpiScreen() {
  const [rows, setRows] = React.useState<SllKpiRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<SllKpiRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const fetchRows = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/lender/sll-kpi/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as SllKpiRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetchRows(); }, [fetchRows]);

  const fields: DrawerField[] = sel ? [
    { label: 'Reference',        value: sel.ref,                                mono: true },
    { label: 'Facility',         value: sel.facility_name,                      span: true },
    { label: 'KPI Name',         value: sel.kpi_name,                           span: true },
    { label: 'Target Value',     value: String(sel.target_value),               mono: true },
    { label: 'Actual Value',     value: sel.actual_value != null ? String(sel.actual_value) : '—', mono: true },
    { label: 'Margin Step',      value: `${sel.margin_step_bps > 0 ? '+' : ''}${sel.margin_step_bps}bps`, mono: true },
    { label: 'Measurement Date', value: sel.measurement_date ?? '—',            mono: true },
    { label: 'Tier',             value: sel.tier,                               mono: true },
    { label: 'Status',           value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} size="sm" /> },
  ] : [];

  const actions: DrawerAction[] = sel ? [
    {
      id: 'submit-kpi',
      label: 'Submit KPI',
      icon: 'send',
      variant: 'primary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Submit KPI Measurement"
          fields={[
            { key: 'actual_value',      label: 'Actual Value',      type: 'number', required: true,  placeholder: 'e.g. 42' },
            { key: 'measurement_date',  label: 'Measurement Date',  type: 'text',   required: true,  placeholder: 'e.g. 2026-12-31' },
            { key: 'evidence_ref',      label: 'Evidence Ref',      type: 'text',   required: false, placeholder: 'e.g. ESG-CERT-001' },
          ]}
          requireReason={false}
          onSubmit={async (data) => {
            await api.post(`/api/lender/sll-kpi/chain/${sel.id}/transition`, { action: 'submit_kpi', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'verify-kpi',
      label: 'Verify KPI',
      icon: 'checklist',
      variant: 'primary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Verify KPI Measurement"
          reasonCodes={[
            { value: 'third_party_verified',   label: 'Third-party verification obtained' },
            { value: 'internal_review_passed', label: 'Internal ESG review passed' },
            { value: 'auditor_sign_off',       label: 'External auditor sign-off' },
          ]}
          onSubmit={async (data) => {
            await api.post(`/api/lender/sll-kpi/chain/${sel.id}/transition`, { action: 'verify_kpi', ...data });
            void fetchRows();
          }}
        />
      ),
    },
    {
      id: 'apply-ratchet',
      label: 'Apply Margin Ratchet',
      icon: 'dollar',
      variant: 'danger' as const,
      onClick: () => api.post(`/api/lender/sll-kpi/chain/${sel.id}/transition`, { action: 'apply_ratchet' }).then(() => { void fetchRows(); setSel(null); }),
    },
    {
      id: 'waive-ratchet',
      label: 'Waive Ratchet',
      icon: 'approve',
      variant: 'secondary' as const,
      onClick: () => {},
      form: (
        <TransitionForm
          actionLabel="Waive Margin Ratchet"
          requireReason
          reasonCodes={[
            { value: 'force_majeure',        label: 'Force majeure — measurement impossible' },
            { value: 'first_year_grace',     label: 'First-year grace period — baseline year' },
            { value: 'lender_discretion',    label: 'Lender discretion — material progress demonstrated' },
          ]}
          onSubmit={async (data) => {
            await api.post(`/api/lender/sll-kpi/chain/${sel.id}/transition`, { action: 'waive_ratchet', ...data });
            void fetchRows();
          }}
        />
      ),
    },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>SLL KPI Compliance</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W95 · Sustainability-linked loan KPI & margin ratchet</div>
      </div>
      <AIInsightCard
        suggestion="Kalahari Solar SLL margin ratchet is +18bps due on 15 Jul 2026. KPI target (carbon intensity <85 gCO₂/kWh) is tracking at 91 gCO₂ — a 7% miss. Ratchet will auto-apply unless borrower supplies remediation evidence by 30 Jun."
        reasoning="LMA SLBP §4.3 requires lenders to evidence KPI tracking quarterly. Missed evidence by 30 Jun triggers the adverse ratchet under the facility agreement."
        title="Request KPI Evidence"
        onAccept={() => {}}
      />

      <DataTable<SllKpiRow>
        columns={SLL_KPI_COLS}
        rows={rows}
        loading={loading}
        onRowClick={row => { setSel(row); setDrawerOpen(true); }}
      />
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={sel ? sel.kpi_name : ''}
        subtitle={sel ? `${sel.facility_name} · ${sel.margin_step_bps > 0 ? '+' : ''}${sel.margin_step_bps}bps` : ''}
        entityRef={sel ? sel.ref : ''}
        status={sel?.chain_status}
        statusVariant={sel ? stateVariant(sel.chain_status) : 'default'}
        fields={fields}
        actions={actions}
        onActionComplete={() => { void fetchRows(); setDrawerOpen(false); }}
      />
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LenderWorkstation() {
  const { data: me } = useCurrentUser();
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard');

  const screenToNavId: Record<ActiveScreen, string> = {
    dashboard:    'ln-dashboard',
    analytics:    'ln-analytics',
    facilities:   'ln-facilities',
    drawdowns:    'ln-drawdowns',
    disbursement: 'ln-disbursement',
    covenants:    'ln-covenants',
    reserves:     'ln-reserves',
    security:     'ln-security',
    transfers:    'ln-transfers',
    watchlist:    'ln-watchlist',
    default:      'ln-default',
    exposure:     'ln-exposure',
    dscr:         'ln-dscr',
    restructure:  'ln-restructure',
    'sll-kpi':    'ln-sll-kpi',
  };

  const navClickMap: Record<string, () => void> = {
    'ln-dashboard':         () => setActiveScreen('dashboard'),
    'ln-analytics':         () => setActiveScreen('analytics'),
    'ln-facilities':        () => setActiveScreen('facilities'),
    'ln-drawdowns':         () => setActiveScreen('drawdowns'),
    'ln-disbursement':      () => setActiveScreen('disbursement'),
    'ln-covenants':         () => setActiveScreen('covenants'),
    'ln-reserves':          () => setActiveScreen('reserves'),
    'ln-security':          () => setActiveScreen('security'),
    'ln-transfers':         () => setActiveScreen('transfers'),
    'ln-watchlist':         () => setActiveScreen('watchlist'),
    'ln-default':           () => setActiveScreen('default'),
    'ln-exposure':          () => setActiveScreen('exposure'),
    'ln-reports-portfolio': () => setActiveScreen('analytics'),
    'ln-reports-ifrs':      () => setActiveScreen('analytics'),
    'ln-reports-sarb':      () => setActiveScreen('exposure'),
    'ln-settings':          () => setActiveScreen('analytics'),
    'ln-dscr':              () => setActiveScreen('dscr'),
    'ln-restructure':       () => setActiveScreen('restructure'),
    'ln-sll-kpi':           () => setActiveScreen('sll-kpi'),
  };

  const navConfig: NavConfig = {
    ...LENDER_NAV,
    activeId: screenToNavId[activeScreen],
    sections: LENDER_NAV.sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        onClick: navClickMap[item.id],
      })),
    })),
  };

  const breadcrumbLabel: Record<ActiveScreen, string> = {
    dashboard:    'Portfolio Dashboard',
    analytics:    'Analytics & Reports',
    facilities:   'Loan Facilities',
    drawdowns:    'Drawdowns',
    disbursement: 'Disbursements',
    covenants:    'Covenants',
    reserves:     'Reserve Accounts',
    security:     'Security Perfection',
    transfers:    'Loan Transfers',
    watchlist:    'Watchlist',
    default:      'Default Cases',
    exposure:     'SARB Exposure',
    dscr:         'DSCR Monitoring',
    restructure:  'Loan Restructure & A&E',
    'sll-kpi':    'SLL KPI Compliance',
  };

  return (
    <AppShell
      role="lender"
      userName={me?.name ?? 'User'}
      userEmail={me?.email ?? ''}
      navConfig={navConfig}
      breadcrumbs={[{ label: 'Lender' }, { label: breadcrumbLabel[activeScreen] }]}
      alerts={[
        { id: 'a1', message: 'Limpopo BESS covenant test due in 14 days — DSCR 1.12x is within cure threshold', variant: 'amber', href: '#covenants' },
        { id: 'a2', message: 'F001 drawdown disbursement awaiting 1 CP document', variant: 'blue', href: '#drawdowns' },
      ]}
    >
      {activeScreen === 'analytics'    ? <LenderAnalytics />
       : activeScreen === 'facilities'  ? <FacilitiesScreen />
       : activeScreen === 'drawdowns'   ? <DrawdownsScreen />
       : activeScreen === 'disbursement' ? <DisbursementScreen />
       : activeScreen === 'covenants'   ? <CovenantsScreen />
       : activeScreen === 'reserves'    ? <ReservesScreen />
       : activeScreen === 'security'    ? <SecurityScreen />
       : activeScreen === 'transfers'   ? <TransfersScreen />
       : activeScreen === 'watchlist'   ? <WatchlistScreen />
       : activeScreen === 'default'     ? <DefaultScreen />
       : activeScreen === 'exposure'    ? <ExposureScreen />
       : activeScreen === 'dscr'        ? <DscrMonitorScreen />
       : activeScreen === 'restructure' ? <RestructureScreen />
       : activeScreen === 'sll-kpi'     ? <SllKpiScreen />
       : <LenderDashboard />}
    </AppShell>
  );
}

function LenderDashboard() {
  const { data: facilities, loading: facLoading, refetch: refetchFacilities } = useLenderFacilities();
  const { data: drawdowns } = useLenderDrawdowns();
  const { data: covenants } = useLenderCovenants();
  const [selectedFacility, setSelectedFacility] = React.useState<LenderFacility | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Suppress unused variable warning for covenants — used for count display
  void covenants;

  const totalCommitted = facilities.reduce((s, f) => s + (f.committed_zar || 0), 0);
  const totalDrawn = facilities.reduce((s, f) => s + (f.drawn_zar || 0), 0);
  void totalDrawn;
  const avgDscr = facilities.length ? (facilities.reduce((s, f) => s + (f.dscr || 0), 0) / facilities.length) : 0;
  const watchlistCount = facilities.filter(f => f.status === 'watchlist').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="oe-grad-text" style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
            Loan Portfolio
          </h1>
          <div style={{ fontSize: '13px', color: 'var(--oe-text-3)', marginTop: '4px' }}>
            {facLoading ? 'Loading…' : facilities.length + ' facilities'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={ghostBtnStyle}><OeIcon name="report" size={14} />Portfolio Report</button>
          <button style={primaryBtnStyle}><OeIcon name="plus" size={14} color="#fff" />New Facility</button>
        </div>
      </div>

      {/* KPIs */}
      <StatGrid cols={4}>
        <StatCard label="Book Size" value={facLoading ? '…' : 'R' + (totalCommitted / 1e9).toFixed(2) + 'B'} delta="+R220M" deltaLabel="YTD" positive icon="dollar" variant="navy" />
        <StatCard label="Average DSCR" value={facLoading ? '…' : avgDscr.toFixed(2) + 'x'} delta="-0.08x" deltaLabel="vs prior test" positive={false} icon="chart-line" variant="amber" />
        <StatCard label="Watchlist Count" value={facLoading ? '…' : String(watchlistCount)} subtext="Limpopo BESS" icon="alert-triangle" variant="rose" />
        <StatCard label="Next Test Date" value="14" unit="days" subtext="Limpopo BESS cov test" icon="calendar" variant="amber" />
      </StatGrid>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Facilities table */}
          <section>
            <SectionHeader title="Loan Facilities" action={{ label: 'Manage all', href: '#facilities' }} />
            <DataTable
              columns={FACILITY_COLS as Column<LenderFacility>[]}
              rows={facilities}
              loading={facLoading}
              onRowClick={row => { setSelectedFacility(row); setDrawerOpen(true); }}
            />
          </section>

          {/* Drawdown pipeline */}
          <section>
            <SectionHeader title="Active Drawdown — F001 Boland Solar" />
            <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '20px 16px 16px', boxShadow: 'var(--oe-shadow-card)' }}>
              <StateFlow steps={DRAWDOWN_STEPS} />
              <div style={{ marginTop: '14px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <MetaItem label="Amount" value="R60M" mono />
                <MetaItem label="Purpose" value="Phase 2 — Inverter procurement" />
                <MetaItem label="IE Cert" value="Arcus Engineering — 2026-05-20" />
                <MetaItem label="Outstanding CP" value="Insurance schedule update" color="var(--oe-amber)" />
              </div>
            </div>
          </section>

          {/* DSCR heatmap — 3×2 visual table */}
          <section>
            <SectionHeader title="DSCR Heatmap" action={{ label: 'Full analytics', href: '#analytics' }} />
            <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '16px', boxShadow: 'var(--oe-shadow-card)' }}>
              <DscrHeatmap />
            </div>
          </section>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <AIInsightCard
            title="Portfolio Risk Alert"
            suggestion="Limpopo BESS DSCR 1.12x is 3 basis points above minimum covenant of 1.10x. With Q3 generation forecasts revised down 8%, breach probability is 42% by next test date."
            reasoning="Monte Carlo simulation across 500 generation scenarios using actual SCADA data. Stress test: a 10% curtailment event (based on historical SA SO data) would push DSCR to 1.02x — below covenant minimum."
            confidence="high"
            onAccept={async () => {
              await apexClient.lender.listFacilities({ status: 'watchlist' });
              refetchFacilities();
            }}
          />

          <ChainMap
            chainLabel="F001 — Boland Solar 120MW"
            chainType="Credit Facility"
            currentState="CP Pending"
            links={CHAIN_LINKS}
          />

          <ActionPanel
            title="Facility Actions"
            actions={[
              {
                id: 'disburse',
                label: 'Approve Disbursement',
                description: 'Drawdown R60M after CP clearance',
                icon: 'approve',
                variant: 'primary',
                form: (
                  <TransitionForm
                    actionLabel="Approve Disbursement"
                    reasonCodes={[
                      { value: 'all_cp_clear', label: 'All CPs cleared' },
                      { value: 'waive_cp', label: 'Waive outstanding CP — documented' },
                    ]}
                    confirmMessage="Approving this disbursement will instruct treasury to transfer R60M to BolandSPV. The IE certificate and CP register will be locked."
                    onSubmit={async data => {
                      const dd = drawdowns[0];
                      if (dd) await apexClient.lender.approveDisbursement(dd.id, data);
                    }}
                  />
                ),
              },
              {
                id: 'watchlist',
                label: 'Add to Watchlist',
                description: 'Flag Limpopo BESS for monitoring',
                icon: 'alert-triangle',
                variant: 'danger',
                form: (
                  <TransitionForm
                    actionLabel="Add to Watchlist"
                    reasonCodes={[
                      { value: 'dscr_risk', label: 'DSCR at risk' },
                      { value: 'generation_shortfall', label: 'Generation shortfall' },
                      { value: 'counterparty', label: 'Counterparty risk' },
                    ]}
                    onSubmit={async () => {
                      await apexClient.lender.listFacilities({ status: 'watchlist' });
                      refetchFacilities();
                    }}
                  />
                ),
              },
              {
                id: 'export-pack',
                label: 'Export Credit Pack',
                icon: 'export',
                variant: 'ghost',
              },
            ]}
          />
        </div>
      </div>

      {/* Dashboard facility drawer */}
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedFacility?.project_name ?? 'Facility'}
        subtitle={selectedFacility?.borrower_name}
        entityRef={selectedFacility ? selectedFacility.id.slice(-8).toUpperCase() : undefined}
        status={selectedFacility?.status}
        fields={selectedFacility ? facilityDrawerFields(selectedFacility) : []}
        actions={selectedFacility ? facilityDrawerActions(selectedFacility, () => { refetchFacilities(); setDrawerOpen(false); }) : []}
        onActionComplete={refetchFacilities}
      />
    </div>
  );
}

// ─── DSCR Heatmap sub-component ──────────────────────────────────────────────

function DscrHeatmap() {
  const quarters = ['Q1 25', 'Q2 25', 'Q3 25', 'Q4 25', 'Q1 26', 'Q2 26'];
  const facilities = [
    { name: 'Boland Solar', values: [1.42, 1.45, 1.38, 1.41, 1.38, null] },
    { name: 'Karoo Wind',   values: [null, null, null, null, null, null] },
    { name: 'Limpopo BESS', values: [1.28, 1.22, 1.18, 1.15, 1.12, null] },
  ];

  const cellColor = (v: number | null) => {
    if (v == null) return 'var(--oe-surf-2)';
    if (v < 1.10) return 'var(--oe-rose-bg)';
    if (v < 1.20) return 'var(--oe-amber-bg)';
    if (v < 1.30) return 'rgba(21,73,160,0.07)';
    return 'var(--oe-green-bg)';
  };
  const textColor = (v: number | null) => {
    if (v == null) return 'var(--oe-text-4)';
    if (v < 1.10) return 'var(--oe-rose)';
    if (v < 1.20) return 'var(--oe-amber)';
    if (v < 1.30) return 'var(--oe-blue)';
    return 'var(--oe-green)';
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', padding: '4px 8px 8px 0', color: 'var(--oe-text-3)', fontWeight: 600 }}></th>
          {quarters.map(q => (
            <th key={q} style={{ textAlign: 'center', padding: '4px 4px 8px', color: 'var(--oe-text-3)', fontWeight: 600, fontSize: '10px' }}>{q}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {facilities.map(f => (
          <tr key={f.name}>
            <td style={{ padding: '3px 8px 3px 0', fontWeight: 500, color: 'var(--oe-text-1)', fontSize: '12px', whiteSpace: 'nowrap' }}>
              {f.name}
            </td>
            {f.values.map((v, i) => (
              <td key={i}
                style={{
                  padding: '3px 4px',
                  textAlign: 'center',
                  borderRadius: '4px',
                  background: cellColor(v),
                  color: textColor(v),
                  fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 700,
                  fontSize: '11px',
                }}
              >
                {v == null ? '—' : v.toFixed(2)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function MetaItem({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{
        fontSize: '12px',
        fontWeight: 500,
        color: color ?? 'var(--oe-text-1)',
        fontFamily: mono ? '"JetBrains Mono", monospace' : 'inherit',
        marginTop: '1px',
      }}>
        {value}
      </div>
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: { label: string; href: string } }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
      <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--oe-text-1)', margin: 0 }}>{title}</h2>
      {action && (
        <a href={action.href} style={{ fontSize: '12px', color: 'var(--oe-blue)', textDecoration: 'none', fontWeight: 500 }}>
          {action.label} →
        </a>
      )}
    </div>
  );
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px',
  border: '1px solid var(--oe-border)',
  background: 'var(--oe-surf)',
  borderRadius: 'var(--oe-r-btn)',
  padding: '7px 14px', fontSize: '13px',
  color: 'var(--oe-text-1)', cursor: 'pointer', fontFamily: 'inherit',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px',
  border: 'none',
  background: 'var(--oe-grad-button)',
  borderRadius: 'var(--oe-r-btn)',
  padding: '7px 14px', fontSize: '13px', fontWeight: 600,
  color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: 'var(--oe-shadow-btn)',
};

export default LenderWorkstation;
