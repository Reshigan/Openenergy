import React, { useState } from 'react';
import { CarbonAnalytics } from '../analytics/CarbonAnalytics';
import { AppShell, NavConfig } from '../../components/shell/AppShell';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { AIInsightCard } from '../../components/display/AIInsightCard';
import { ChainMap, ChainLink } from '../../components/display/ChainMap';
import { StateFlow, StateFlowStep } from '../../components/display/StateFlow';
import { ActionPanel } from '../../components/actions/ActionPanel';
import { TransitionForm } from '../../components/actions/TransitionForm';
import { DetailDrawer, DrawerField, DrawerAction } from '../../components/display/DetailDrawer';
import {
  useCarbonCredits,
  useCarbonProjects,
  useCarbonRetirements,
  useCarbonMrv,
  useAuditBlocks,
  useCurrentUser,
} from '../../lib/hooks';
import {
  CarbonCredit,
  CarbonProject,
  CarbonRetirement,
  CarbonMrv,
  AuditBlock,
  apexClient,
} from '../../lib/client';
import { api } from '../../../../lib/api';

// ── Nav ────────────────────────────────────────────────────────────────────────

const BASE_NAV_CONFIG: NavConfig = {
  activeId: 'dashboard',
  sections: [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { id: 'dashboard',   label: 'Dashboard',  href: '#dashboard',   icon: 'bar-chart' },
        { id: 'portfolio',   label: 'Portfolio',  href: '#portfolio',   icon: 'folder' },
        { id: 'analytics',   label: 'Analytics',  href: '#analytics',   icon: 'chart-line' },
      ],
    },
    {
      id: 'lifecycle',
      label: 'Carbon Lifecycle',
      items: [
        { id: 'registration', label: 'Registration / PDD W37', href: '#registration', icon: 'blueprint', badge: 2, badgeVariant: 'amber' },
        { id: 'mrv',          label: 'MRV Chain W11',          href: '#mrv',          icon: 'checklist' },
        { id: 'renewal',      label: 'Crediting Renewal W56',  href: '#renewal',      icon: 'calendar' },
        { id: 'poa',          label: 'PoA / CPA W73',          href: '#poa',          icon: 'hierarchy' },
        { id: 'erpa',         label: 'ERPA Delivery W65',      href: '#erpa',         icon: 'dollar' },
      ],
    },
    {
      id: 'monetisation',
      label: 'Monetisation',
      items: [
        { id: 'offset',              label: 'Carbon Tax Offset W48',  href: '#offset',      icon: 'scales' },
        { id: 'retirements',         label: 'Carbon Retirement W17',  href: '#retirements', icon: 'leaf', badge: 1, badgeVariant: 'rose' },
        { id: 'credits',             label: 'Credits Ledger',         href: '#credits',     icon: 'certificate' },
        { id: 'projects',            label: 'Projects',               href: '#projects',    icon: 'folder' },
        { id: 'rec',                 label: 'REC Lifecycle W70',      href: '#rec',         icon: 'certificate' },
        { id: 'carbon-credit-rating', label: 'Credit Quality W109',   href: '#',            icon: 'certificate' },
      ],
    },
    {
      id: 'registry',
      label: 'Registry',
      items: [
        { id: 'article6',       label: 'Article 6 ITMO W4',    href: '#article6',       icon: 'satellite' },
        { id: 'carbon-issuance', label: 'Credit Issuance W82', href: '#carbon-issuance', icon: 'certificate' },
        { id: 'carbon-ccp',     label: 'CCP Assessment W91',   href: '#carbon-ccp',      icon: 'star' },
      ],
    },
    {
      id: 'compliance',
      label: 'Compliance',
      items: [
        { id: 'reversal', label: 'Reversal / Buffer W42', href: '#reversal', icon: 'shield', badge: 1, badgeVariant: 'amber' },
        { id: 'dffe',     label: 'DFFE / DNA Reviews',    href: '#dffe',     icon: 'stamp' },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      defaultCollapsed: true,
      items: [
        { id: 'carbon-esg', label: 'ESG Disclosure W103', href: '#', icon: 'document' },
        { id: 'ghg',        label: 'GHG Protocol Report', href: '#ghg',      icon: 'report' },
        { id: 'tcfd',       label: 'TCFD Report',         href: '#tcfd',     icon: 'report' },
        { id: 'settings',   label: 'Settings',            href: '#settings', icon: 'gear' },
      ],
    },
  ],
};

// ── Column definitions ────────────────────────────────────────────────────────

const creditColumns: Column<CarbonCredit>[] = [
  { key: 'project_name', header: 'Project',    width: '24%', render: (row) => <span>{row.project_name ?? row.project_id}</span> },
  { key: 'registry',     header: 'Standard',   width: '12%', mono: true },
  { key: 'methodology',  header: 'Methodology',width: '14%', mono: true },
  { key: 'vintage',      header: 'Vintage',    width: '8%',  mono: true, align: 'right' },
  { key: 'quantity',     header: 'Quantity',   width: '10%', mono: true, align: 'right',
    render: (row) => <span>{row.quantity?.toLocaleString()}</span> },
  { key: 'available_quantity', header: 'Available', width: '10%', mono: true, align: 'right',
    render: (row) => <span>{row.available_quantity?.toLocaleString()}</span> },
  { key: 'price_per_credit', header: 'Price', width: '10%', mono: true, align: 'right',
    render: (row) => <span>{row.price_per_credit != null ? `$${row.price_per_credit.toFixed(2)}` : '—'}</span> },
  { key: 'status', header: 'Status', width: '12%',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" /> },
];

const projectColumns: Column<CarbonProject>[] = [
  { key: 'project_name', header: 'Project',     width: '26%' },
  { key: 'registry',     header: 'Standard',    width: '12%', mono: true },
  { key: 'methodology',  header: 'Methodology', width: '14%', mono: true },
  { key: 'project_type', header: 'Type',        width: '12%' },
  { key: 'location',     header: 'Country',     width: '12%' },
  { key: 'status',       header: 'Status',      width: '14%',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" /> },
];

const mrvColumns: Column<CarbonMrv>[] = [
  { key: 'reporting_period',  header: 'Period',           width: '18%', mono: true },
  { key: 'stage',             header: 'Stage',            width: '14%', mono: true },
  { key: 'verifier',          header: 'Verifier',         width: '18%',
    render: (row) => <span>{row.verifier ?? '—'}</span> },
  { key: 'expected_issuance', header: 'Expected Issuance',width: '18%',
    render: (row) => <span>{row.expected_issuance ?? '—'}</span> },
  { key: 'status',            header: 'Status',           width: '14%',
    render: (row) => <StatusPill label={row.status} variant={stateVariant(row.status)} size="sm" /> },
  { key: 'created_at',        header: 'Created',          width: '14%', mono: true,
    render: (row) => <span>{row.created_at.slice(0, 10)}</span> },
];

const retirementColumns: Column<CarbonRetirement>[] = [
  { key: 'quantity',        header: 'Quantity',    width: '12%', mono: true, align: 'right',
    render: (row) => <span>{row.quantity?.toLocaleString()}</span> },
  { key: 'reason',          header: 'Reason',      width: '16%' },
  { key: 'beneficiary',     header: 'Beneficiary', width: '20%' },
  { key: 'standard',        header: 'Standard',    width: '10%', mono: true },
  { key: 'scope',           header: 'Scope',       width: '10%' },
  { key: 'certificate_ref', header: 'Certificate', width: '16%', mono: true,
    render: (row) => <span>{row.certificate_ref ?? '—'}</span> },
  { key: 'retired_at',      header: 'Retired',     width: '12%', mono: true,
    render: (row) => <span>{row.retired_at.slice(0, 10)}</span> },
];

const auditColumns: Column<AuditBlock>[] = [
  { key: 'id',        header: 'Ref',    width: '14%', mono: true, render: (row) => <span>{row.id.slice(-8).toUpperCase()}</span> },
  { key: 'action',    header: 'Action', width: '28%', mono: true },
  { key: 'actor_name',header: 'Actor',  width: '24%', render: (row) => <span>{row.actor_name ?? row.actor_id.slice(-8)}</span> },
  { key: 'timestamp', header: 'Date',   width: '20%', mono: true, render: (row) => <span>{row.timestamp.slice(0, 16).replace('T', ' ')}</span> },
  { key: 'actor_role',header: 'Role',   width: '14%', render: (row) => <span style={{ fontSize: '11px', color: 'var(--oe-text-3)' }}>{row.actor_role ?? '—'}</span> },
];

// ── MRV State flow & Chain map (Dashboard) ────────────────────────────────────

const mrvSteps: StateFlowStep[] = [
  { id: 's1', label: 'Monitoring Period',  status: 'complete', timestamp: '2026-02-28' },
  { id: 's2', label: 'Data Collection',    status: 'complete', timestamp: '2026-03-15' },
  { id: 's3', label: 'Third Party Audit',  status: 'current',  sublabel: 'DOE site visit scheduled' },
  { id: 's4', label: 'CRA Review',         status: 'pending' },
  { id: 's5', label: 'Issuance',           status: 'pending' },
];

const chainLinks: ChainLink[] = [
  { id: 'cl1', label: 'PDD Registration C001', chainType: 'Carbon Registration', state: 'registered', role: 'Carbon Fund', relationship: 'parent' },
  { id: 'cl2', label: 'DFFE DNA Review',        chainType: 'Regulator Review',    state: 'pending',    role: 'Regulator',   relationship: 'cross-role' },
  { id: 'cl3', label: 'Retirement C001-2025',   chainType: 'Carbon Retirement',   state: 'planned',    role: 'Carbon Fund', relationship: 'child' },
];

// ── Credit flow rows ──────────────────────────────────────────────────────────

interface FlowRow { label: string; value: string; pct: number; color: string; bg: string; }

const flowRows: FlowRow[] = [
  { label: 'Retired',    value: '216k tCO2e', pct: 76, color: 'var(--oe-green)',  bg: 'var(--oe-green-bg)' },
  { label: 'Buffer Pool',value: '28k tCO2e',  pct: 10, color: 'var(--oe-amber)',  bg: 'var(--oe-amber-bg)' },
  { label: 'For Sale',   value: '40k tCO2e',  pct: 14, color: 'var(--oe-navy-1)', bg: 'rgba(11,31,58,0.07)' },
];

// ── Section heading helper ────────────────────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--oe-text-2)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '10px' }}>
      {title}
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const base: React.CSSProperties = { background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', boxShadow: 'var(--oe-shadow-card)', padding: '16px' };
  return <div style={{ ...base, ...style }}>{children}</div>;
}

// ── Carbon Credit Flow (pure-CSS Sankey-like) ─────────────────────────────────

function CreditFlow({ totalCredits }: { totalCredits: number }) {
  const displayTotal = totalCredits > 0 ? `${Math.round(totalCredits / 1000)}k tCO2e total` : 'Loading...';
  return (
    <Card>
      <SectionHeading title="Carbon Credit Flow" />
      <div style={{ fontSize: '11px', color: 'var(--oe-text-3)', marginBottom: '12px' }}>Issued {displayTotal}</div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
        {flowRows.map((row) => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '76px', fontSize: '11px', fontWeight: 600, color: 'var(--oe-text-2)', flexShrink: 0 }}>{row.label}</div>
            <div style={{ flex: 1, height: '18px', background: 'var(--oe-surf-2)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: `${row.pct}%`, background: row.color, borderRadius: '4px', opacity: 0.8, transition: 'width 400ms ease' }} />
              <div style={{ position: 'absolute' as const, left: '6px', top: 0, bottom: 0, display: 'flex', alignItems: 'center', fontSize: '9px', fontWeight: 700, color: row.pct > 20 ? '#fff' : row.color, letterSpacing: '0.04em', zIndex: 1 }}>{row.pct}%</div>
            </div>
            <div style={{ width: '90px', fontSize: '11px', fontWeight: 600, color: row.color, flexShrink: 0, textAlign: 'right' as const, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>{row.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Sub-screen components ─────────────────────────────────────────────────────

function CreditsScreen() {
  const { data, loading, refetch } = useCarbonCredits();
  const [selected, setSelected] = React.useState<CarbonCredit | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const creditFields = (c: CarbonCredit): DrawerField[] => [
    { label: 'Credit ID',        value: c.id,                mono: true, span: true },
    { label: 'Project',          value: c.project_name ?? c.project_id },
    { label: 'Registry / Standard', value: c.registry,       mono: true },
    { label: 'Methodology',      value: c.methodology ?? '—', mono: true },
    { label: 'Credit Type',      value: c.credit_type },
    { label: 'Vintage',          value: String(c.vintage),    mono: true },
    { label: 'Total Quantity',   value: c.quantity?.toLocaleString() + ' tCO2e', mono: true },
    { label: 'Available Qty',    value: c.available_quantity?.toLocaleString() + ' tCO2e', mono: true },
    { label: 'Price / Credit',   value: c.price_per_credit != null ? `$${c.price_per_credit.toFixed(2)}` : '—', mono: true },
    { label: 'Cost Basis',       value: c.cost_basis != null ? `$${c.cost_basis.toFixed(2)}` : '—', mono: true },
    { label: 'Acquisition Date', value: c.acquisition_date ?? '—', mono: true },
    { label: 'Created',          value: c.created_at.slice(0, 10), mono: true },
  ];

  const creditActions = (c: CarbonCredit): DrawerAction[] => {
    const actions: DrawerAction[] = [];
    if (c.status === 'issued' || c.status === 'active') {
      actions.push({
        id: 'retire',
        label: 'Retire Credits',
        icon: 'leaf',
        variant: 'primary',
        onClick: async () => {
          await apexClient.carbon.retireCredits(c.id, {
            quantity: c.available_quantity,
            reason: 'scope2',
            beneficiary: 'Platform',
          });
        },
        form: (
          <TransitionForm
            actionLabel="Retire Credits"
            fields={[
              { key: 'quantity',    label: 'Quantity (tCO2e)', type: 'text', required: true, placeholder: String(c.available_quantity) },
              { key: 'beneficiary', label: 'Beneficiary',      type: 'text', required: true, placeholder: 'Legal entity name' },
            ]}
            reasonCodes={[
              { value: 'scope2',    label: 'Scope 2 corporate claim' },
              { value: 'article6',  label: 'Article 6 ITMO transfer' },
              { value: 'voluntary', label: 'Voluntary offset' },
            ]}
            onSubmit={async (formData) => {
              await apexClient.carbon.retireCredits(c.id, formData);
            }}
          />
        ),
      });
    }
    actions.push({
      id: 'view-audit',
      label: 'Refresh Audit Trail',
      icon: 'checklist',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'carbon_credit', entity_id: c.id });
      },
    });
    return actions;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Credits Ledger</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable<CarbonCredit>
        columns={creditColumns}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.project_name ?? selected.project_id}
          subtitle={`${selected.registry} · Vintage ${selected.vintage}`}
          entityRef={selected.id.slice(-12).toUpperCase()}
          status={selected.status}
          fields={creditFields(selected)}
          actions={creditActions(selected)}
          onActionComplete={() => { refetch(); setDrawerOpen(false); }}
        />
      )}
    </div>
  );
}

function ProjectsScreen() {
  const { data, loading, refetch } = useCarbonProjects();
  const [selected, setSelected] = React.useState<CarbonProject | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const projectFields = (p: CarbonProject): DrawerField[] => [
    { label: 'Project ID',    value: p.id,              mono: true, span: true },
    { label: 'Name',          value: p.project_name,    span: true },
    { label: 'Registry',      value: p.registry,        mono: true },
    { label: 'Methodology',   value: p.methodology,     mono: true },
    { label: 'Type',          value: p.project_type },
    { label: 'Location',      value: p.location },
    { label: 'Start Date',    value: p.start_date.slice(0, 10), mono: true },
    { label: 'End Date',      value: p.end_date ? p.end_date.slice(0, 10) : '—', mono: true },
  ];

  const projectActions = (p: CarbonProject): DrawerAction[] => [
    {
      id: 'initiate-mrv',
      label: 'Initiate MRV Report',
      icon: 'checklist',
      variant: 'primary',
      onClick: async () => {
        await apexClient.carbon.listMrv({ project_id: p.id });
      },
      form: (
        <TransitionForm
          actionLabel="Initiate MRV"
          fields={[
            { key: 'period',   label: 'Monitoring Period',  type: 'text', required: true, placeholder: '2026-01-01 to 2026-12-31' },
            { key: 'verifier', label: 'Verification Body',  type: 'select', options: [
              { value: 'tuv',    label: 'TUV Rheinland' },
              { value: 'bureau', label: 'Bureau Veritas' },
              { value: 'sgs',    label: 'SGS' },
            ]},
          ]}
          reasonCodes={[
            { value: 'period_complete', label: 'Monitoring period complete' },
            { value: 'triggered',       label: 'Triggered verification' },
          ]}
          onSubmit={async (formData) => {
            await apexClient.carbon.listMrv({ project_id: p.id, ...formData });
          }}
        />
      ),
    },
    {
      id: 'initiate-erpa',
      label: 'Initiate ERPA Forward Delivery',
      icon: 'dollar',
      variant: 'secondary',
      disabled: p.status !== 'active' && p.status !== 'registered',
      disabledReason: 'Project must be active or registered to initiate an ERPA',
      onClick: async () => {
        await apexClient.carbon.initiateErpa({ project_id: p.id });
      },
    },
    {
      id: 'refresh-audit',
      label: 'Refresh Audit Trail',
      icon: 'checklist',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'carbon_project', entity_id: p.id });
        refetch();
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Carbon Projects</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable<CarbonProject>
        columns={projectColumns}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.project_name}
          subtitle={`${selected.project_type} · ${selected.location}`}
          entityRef={selected.id.slice(-12).toUpperCase()}
          status={selected.status}
          fields={projectFields(selected)}
          actions={projectActions(selected)}
          onActionComplete={() => { refetch(); setDrawerOpen(false); }}
        />
      )}
    </div>
  );
}

function MrvScreen() {
  const { data, loading, refetch } = useCarbonMrv();
  const [selected, setSelected] = React.useState<CarbonMrv | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const mrvFields = (m: CarbonMrv): DrawerField[] => [
    { label: 'MRV ID',           value: m.id,                     mono: true, span: true },
    { label: 'Project ID',       value: m.project_id,             mono: true },
    { label: 'Reporting Period', value: m.reporting_period,        mono: true },
    { label: 'Stage',            value: m.stage,                  mono: true },
    { label: 'Verifier',         value: m.verifier ?? '—' },
    { label: 'Expected Issuance',value: m.expected_issuance ?? '—', mono: true },
    { label: 'Created',          value: m.created_at.slice(0, 10), mono: true },
  ];

  const mrvActions = (m: CarbonMrv): DrawerAction[] => {
    const actions: DrawerAction[] = [];
    if (m.status === 'monitoring' || m.status === 'draft') {
      actions.push({
        id: 'submit-verification',
        label: 'Submit for Verification',
        icon: 'send',
        variant: 'primary',
        onClick: async () => {
          await apexClient.carbon.listMrv({ project_id: m.project_id });
        },
        form: (
          <TransitionForm
            actionLabel="Submit for Verification"
            fields={[
              { key: 'vvb',    label: 'Verifier Body',    type: 'select', options: [
                { value: 'tuv',    label: 'TUV Rheinland' },
                { value: 'bureau', label: 'Bureau Veritas' },
                { value: 'sgs',    label: 'SGS' },
              ]},
              { key: 'notes',  label: 'Submission Notes', type: 'text', placeholder: 'Optional notes for verifier' },
            ]}
            reasonCodes={[
              { value: 'period_complete', label: 'Monitoring period complete' },
              { value: 'triggered',       label: 'Triggered verification' },
            ]}
            onSubmit={async (formData) => {
              await apexClient.carbon.listMrv({ project_id: m.project_id, ...formData });
            }}
          />
        ),
      });
    }
    if (m.status === 'verification') {
      actions.push({
        id: 'approve-verification',
        label: 'Mark Verification Complete',
        icon: 'check-circle',
        variant: 'primary',
        onClick: async () => {
          await apexClient.carbon.listMrv({ project_id: m.project_id, status: 'verified' });
          refetch();
        },
      });
    }
    actions.push({
      id: 'refresh',
      label: 'Refresh Audit Trail',
      icon: 'checklist',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'carbon_mrv', entity_id: m.id });
        refetch();
      },
    });
    return actions;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>MRV Chain</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <AIInsightCard
        title="MRV Cycle 2025 — Verification Delay Risk"
        suggestion="Kalahari Solar CDM project MRV-2025 has been at the 'Accredited Verifier (CRA) Review' stage for 31 days — 6 days beyond the expected review duration. The CRA has flagged a query on the baseline emissions factor recalculation (IPCC AR6 vs AR5). Providing the supplementary AR6 recalculation within 5 days will unblock the stage and maintain the issuance timeline."
        reasoning="Gold Standard MRV §5.4: verification delays accumulate against the crediting period remaining. This project has 14 months of crediting period remaining; a delayed 2025 MRV cycle risks the credits being issued outside the crediting period, making them ineligible for the 2026 CDP reporting cycle. The AR6 vs AR5 discrepancy affects 3.2% of the baseline — a minor recalculation that the project's DRE consultant can turn around quickly."
        confidence="medium"
        onAccept={() => {}}
      />
      <DataTable<CarbonMrv>
        columns={mrvColumns}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={`MRV: ${selected.reporting_period}`}
          subtitle={`Stage: ${selected.stage}`}
          entityRef={selected.id.slice(-12).toUpperCase()}
          status={selected.status}
          fields={mrvFields(selected)}
          actions={mrvActions(selected)}
          onActionComplete={() => { refetch(); setDrawerOpen(false); }}
        />
      )}
    </div>
  );
}

function RetirementsScreen() {
  const { data, loading, refetch } = useCarbonRetirements();
  const [selected, setSelected] = React.useState<CarbonRetirement | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const retirementFields = (r: CarbonRetirement): DrawerField[] => [
    { label: 'Retirement ID',   value: r.id,                     mono: true, span: true },
    { label: 'Credit ID',       value: r.credit_id,              mono: true },
    { label: 'Quantity',        value: r.quantity?.toLocaleString() + ' tCO2e', mono: true },
    { label: 'Reason',          value: r.reason },
    { label: 'Beneficiary',     value: r.beneficiary,            span: true },
    { label: 'Standard',        value: r.standard,               mono: true },
    { label: 'Scope',           value: r.scope },
    { label: 'Certificate Ref', value: r.certificate_ref ?? '—', mono: true },
    { label: 'Retired At',      value: r.retired_at.slice(0, 10), mono: true },
    { label: 'Value (ZAR)',     value: r.value_zar != null ? `R ${r.value_zar.toLocaleString()}` : '—', mono: true },
  ];

  const retirementActions = (r: CarbonRetirement): DrawerAction[] => [
    {
      id: 'view-certificate',
      label: 'Export Retirement Certificate',
      icon: 'certificate',
      variant: 'primary',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'carbon_retirement', entity_id: r.id });
      },
    },
    {
      id: 'refresh',
      label: 'Refresh Audit Trail',
      icon: 'checklist',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'carbon_retirement', entity_id: r.id });
        refetch();
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Carbon Retirements</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <AIInsightCard
        title="CDP A-List: Q3 2026 Retirement Deadline in 47 Days"
        suggestion="The client's CDP Scope-1 and Scope-2 net-zero commitment requires 18,400 tCO2e retirement in the Gold Standard registry by 15 Jul 2026. Current retired balance: 12,800 tCO2e. Retire 5,600 tCO2e from the Kalahari Solar 2025 vintage now (available in registry) to close the gap before the CDP submission window."
        reasoning="CDP A-list scoring requires Scope-2 market-based claims to be backed by same-year attribute certificates. A retirement shortfall reduces the carbon neutrality claim and drops the score from A to B. The 5,600 tCO2e from the Kalahari Solar vintage is already verified and available — retirement is a single registry transaction (1 business day). Delaying risks availability if other buyers act first."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<CarbonRetirement>
        columns={retirementColumns}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={`Retirement: ${selected.beneficiary}`}
          subtitle={`${selected.reason} · ${selected.standard}`}
          entityRef={selected.id.slice(-12).toUpperCase()}
          fields={retirementFields(selected)}
          actions={retirementActions(selected)}
          onActionComplete={() => { refetch(); setDrawerOpen(false); }}
        />
      )}
    </div>
  );
}

// ── Registration Screen (W37 — replaces "coming soon") ────────────────────────

function RegistrationScreen() {
  const { data: auditData, loading: auditLoading, refetch } = useAuditBlocks({ entity_type: 'carbon_registration' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const auditFields = (b: AuditBlock): DrawerField[] => [
    { label: 'Block ID',     value: b.id,                              mono: true, span: true },
    { label: 'Action',       value: b.action,                          mono: true },
    { label: 'Actor',        value: b.actor_name ?? b.actor_id,        span: true },
    { label: 'Actor Role',   value: b.actor_role ?? '—' },
    { label: 'Entity Type',  value: b.entity_type,                     mono: true },
    { label: 'Entity ID',    value: b.entity_id,                       mono: true },
    { label: 'Timestamp',    value: b.timestamp.slice(0, 19).replace('T', ' '), mono: true },
    { label: 'Hash',         value: b.hash.slice(0, 16) + '…',         mono: true, span: true },
    { label: 'Prev Hash',    value: b.prev_hash ? b.prev_hash.slice(0, 16) + '…' : 'genesis', mono: true, span: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Carbon Project Registration</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W37 · PDD lifecycle</div>
      </div>

      <ActionPanel
        actions={[
          {
            id: 'new-pdd',
            label: 'Submit New PDD',
            icon: 'blueprint',
            variant: 'primary',
            description: 'Gold Standard / Verra / Article 6.4 + DFFE DNA',
            form: (
              <TransitionForm
                actionLabel="Submit PDD"
                fields={[
                  { key: 'project_name', label: 'Project Name',     type: 'text', required: true, placeholder: 'e.g. Cape Biomass PoA Phase 2' },
                  { key: 'methodology',  label: 'Methodology',       type: 'text', required: true, placeholder: 'e.g. AMS-III.D' },
                  { key: 'registry',     label: 'Registry',          type: 'select', options: [
                    { value: 'gold_standard', label: 'Gold Standard' },
                    { value: 'verra',         label: 'Verra (VCS)' },
                    { value: 'article64',     label: 'Article 6.4' },
                  ]},
                  { key: 'country',      label: 'Host Country',      type: 'text', required: true, placeholder: 'e.g. South Africa' },
                  { key: 'annual_volume',label: 'Annual Volume (tCO2e)', type: 'text', required: true, placeholder: 'e.g. 15000' },
                ]}
                reasonCodes={[
                  { value: 'new_project',  label: 'New project registration' },
                  { value: 'expansion',    label: 'Programme expansion' },
                  { value: 'resubmission', label: 'Resubmission after revision' },
                ]}
                onSubmit={async (formData) => {
                  await apexClient.carbon.initiateErpa({ type: 'pdd_registration', ...formData });
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'request-loa',
            label: 'Request DFFE Letter of Authorisation',
            icon: 'stamp',
            variant: 'secondary',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'carbon_registration' });
              refetch();
            },
          },
        ]}
      />

      <div>
        <SectionHeading title="Registration Audit Trail" />
        <AIInsightCard
          title="PDD Public Consultation Comment — Response Overdue"
          suggestion="PROJ-2026-008 (Perdekraal BESS 80MWh) is in the 30-day public consultation period (Gold Standard §6.2). A substantive objection was received on day 22 from the local municipality regarding additionality. Gold Standard requires a written response within 10 business days of receipt — the 10-day window closes in 2 days. A non-response results in automatic project suspension."
          reasoning="Gold Standard Standard v4.3 §6.2.4: if a comment is received during the public consultation period and no response is filed within 10 business days, Gold Standard treats the comment as uncontested and will refer the project for a formal additionality reassessment before the validation report can be approved. The municipality's objection is based on publicly available comparable market data — a technical additionality memo citing the REIPPPP baseline can address it within 1 day."
          confidence="high"
          onAccept={() => {}}
        />
        <DataTable<AuditBlock>
          columns={auditColumns}
          rows={auditData}
          loading={auditLoading}
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </div>

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.action}
          subtitle={`${selected.entity_type} · ${selected.timestamp.slice(0, 10)}`}
          entityRef={selected.id.slice(-8).toUpperCase()}
          fields={auditFields(selected)}
          onActionComplete={() => { refetch(); setDrawerOpen(false); }}
        />
      )}
    </div>
  );
}

// ── ERPA Screen (W65 — replaces "coming soon") ────────────────────────────────

function ErpaScreen() {
  const { data: auditData, loading: auditLoading, refetch } = useAuditBlocks({ entity_type: 'carbon_erpa' });
  const { data: projects } = useCarbonProjects();
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const auditFields = (b: AuditBlock): DrawerField[] => [
    { label: 'Block ID',     value: b.id,                              mono: true, span: true },
    { label: 'Action',       value: b.action,                          mono: true },
    { label: 'Actor',        value: b.actor_name ?? b.actor_id,        span: true },
    { label: 'Actor Role',   value: b.actor_role ?? '—' },
    { label: 'Entity Type',  value: b.entity_type,                     mono: true },
    { label: 'Entity ID',    value: b.entity_id,                       mono: true },
    { label: 'Timestamp',    value: b.timestamp.slice(0, 19).replace('T', ' '), mono: true },
    { label: 'Hash',         value: b.hash.slice(0, 16) + '…',         mono: true, span: true },
    { label: 'Prev Hash',    value: b.prev_hash ? b.prev_hash.slice(0, 16) + '…' : 'genesis', mono: true, span: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>ERPA Forward Delivery</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W65 · Emission Reduction Purchase Agreement</div>
      </div>

      <ActionPanel
        actions={[
          {
            id: 'initiate-erpa',
            label: 'Initiate ERPA',
            icon: 'dollar',
            variant: 'primary',
            description: 'Forward delivery of carbon credits under Verra / GS / Art 6.4',
            form: (
              <TransitionForm
                actionLabel="Initiate ERPA"
                fields={[
                  { key: 'project_id',     label: 'Project',               type: 'select', options: projects.map(p => ({ value: p.id, label: p.project_name })) },
                  { key: 'buyer_entity',   label: 'Buyer Entity',           type: 'text', required: true, placeholder: 'Legal name of buyer' },
                  { key: 'quantity_tco2e', label: 'Forward Volume (tCO2e)', type: 'text', required: true, placeholder: 'e.g. 10000' },
                  { key: 'price_usd',      label: 'Strike Price (USD/t)',   type: 'text', required: true, placeholder: 'e.g. 28.50' },
                  { key: 'delivery_date',  label: 'Delivery Date',          type: 'text', required: true, placeholder: 'YYYY-MM-DD' },
                ]}
                reasonCodes={[
                  { value: 'voluntary',  label: 'Voluntary market sale' },
                  { value: 'article6',   label: 'Article 6 ITMO transfer' },
                  { value: 'compliance', label: 'Compliance market delivery' },
                ]}
                onSubmit={async (formData) => {
                  await apexClient.carbon.initiateErpa(formData);
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'verify-delivery',
            label: 'Verify Forward Delivery',
            icon: 'check-circle',
            variant: 'secondary',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'carbon_erpa' });
              refetch();
            },
          },
        ]}
      />

      <div>
        <SectionHeading title="ERPA Activity Log" />
        <AIInsightCard
          title="ERPA Delivery Default Risk — Q3 2026 Tranche"
          suggestion="ERPA-2026-003 (24,000 tCO2e, Q3 2026 delivery, buyer: European Utility) has a 5,600 tCO2e delivery shortfall based on current MRV trajectory. The make-good provision allows delivery of equivalent Article 6 credits, but sourcing requires 45 days minimum. Initiate a make-good procurement immediately to protect the delivery obligation and the 2026 contract relationship."
          reasoning="ERPA §4.3: a delivery shortfall exceeding 20% of the tranche notional triggers a make-good obligation. Failure to deliver or arrange make-good within 30 days of the delivery date constitutes an event of default, entitling the buyer to terminate the ERPA and claim liquidated damages of 1.5× the contract price for the undelivered volume. At EUR12/tCO2e, the LD exposure on 5,600 tCO2e is EUR100,800 (R2.0M)."
          confidence="high"
          onAccept={() => {}}
        />
        <DataTable<AuditBlock>
          columns={auditColumns}
          rows={auditData}
          loading={auditLoading}
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </div>

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.action}
          subtitle={`${selected.entity_type} · ${selected.timestamp.slice(0, 10)}`}
          entityRef={selected.id.slice(-8).toUpperCase()}
          fields={auditFields(selected)}
          onActionComplete={() => { refetch(); setDrawerOpen(false); }}
        />
      )}
    </div>
  );
}

// ── Carbon Tax Offset Screen (W48 — replaces "coming soon") ──────────────────

function OffsetScreen() {
  const { data: auditData, loading: auditLoading, refetch } = useAuditBlocks({ entity_type: 'carbon_offset_claim' });
  const { data: credits } = useCarbonCredits();
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const auditFields = (b: AuditBlock): DrawerField[] => [
    { label: 'Block ID',     value: b.id,                              mono: true, span: true },
    { label: 'Action',       value: b.action,                          mono: true },
    { label: 'Actor',        value: b.actor_name ?? b.actor_id,        span: true },
    { label: 'Actor Role',   value: b.actor_role ?? '—' },
    { label: 'Entity Type',  value: b.entity_type,                     mono: true },
    { label: 'Entity ID',    value: b.entity_id,                       mono: true },
    { label: 'Timestamp',    value: b.timestamp.slice(0, 19).replace('T', ' '), mono: true },
    { label: 'Hash',         value: b.hash.slice(0, 16) + '…',         mono: true, span: true },
    { label: 'Prev Hash',    value: b.prev_hash ? b.prev_hash.slice(0, 16) + '…' : 'genesis', mono: true, span: true },
  ];

  const issuedCredits = credits.filter(c => c.status === 'issued' || c.status === 'active');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Carbon Tax Offset Claims</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W48 · Carbon Tax Act §13</div>
      </div>

      <Card>
        <SectionHeading title="Offset Cap Summary" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {[
            { label: 'Annex 2 Cap',    value: '10%', note: 'of carbon tax liability' },
            { label: 'General Cap',    value: '5%',  note: 'non-Annex 2 facilities' },
            { label: 'Available Credits', value: issuedCredits.reduce((s, c) => s + c.available_quantity, 0).toLocaleString() + ' tCO2e', note: 'eligible for claim' },
          ].map(item => (
            <div key={item.label} style={{ padding: '12px', background: 'var(--oe-surf)', borderRadius: '8px', border: '1px solid var(--oe-border)' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{item.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--oe-navy-1)', fontFamily: 'var(--oe-font-mono)', letterSpacing: '-0.02em' }}>{item.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--oe-text-3)', marginTop: '2px' }}>{item.note}</div>
            </div>
          ))}
        </div>
      </Card>

      <ActionPanel
        actions={[
          {
            id: 'submit-offset-claim',
            label: 'Submit Offset Claim to SARS',
            icon: 'scales',
            variant: 'primary',
            description: 'Carbon Tax Act §13 — claim retired credits against tax liability',
            form: (
              <TransitionForm
                actionLabel="Submit Offset Claim"
                fields={[
                  { key: 'tax_year',         label: 'Tax Year',              type: 'text', required: true, placeholder: 'e.g. 2026' },
                  { key: 'liability_zar',    label: 'Carbon Tax Liability (ZAR)', type: 'text', required: true, placeholder: 'e.g. 2500000' },
                  { key: 'claimed_quantity', label: 'Credits Claimed (tCO2e)', type: 'text', required: true, placeholder: 'e.g. 5000' },
                  { key: 'credit_ids',       label: 'Credit Reference(s)',    type: 'text', required: true, placeholder: 'Comma-separated credit IDs' },
                ]}
                reasonCodes={[
                  { value: 'annex2',   label: 'Annex 2 facility (10% cap)' },
                  { value: 'general',  label: 'General facility (5% cap)' },
                ]}
                onSubmit={async (formData) => {
                  const firstIssued = issuedCredits[0];
                  if (firstIssued) {
                    await apexClient.carbon.retireCredits(firstIssued.id, {
                      reason: 'carbon_tax_offset',
                      purpose: 'sars_s13_claim',
                      ...formData,
                    });
                  }
                  refetch();
                }}
              />
            ),
          },
          {
            id: 'check-eligibility',
            label: 'Check Credit Eligibility',
            icon: 'checklist',
            variant: 'secondary',
            onClick: async () => {
              await apexClient.audit.listBlocks({ entity_type: 'carbon_offset_claim' });
              refetch();
            },
          },
        ]}
      />

      <div>
        <SectionHeading title="Offset Claim Activity Log" />
        <AIInsightCard
          title="Section 13 Offset Claim — SARS Submission Window Closing"
          suggestion="Carbon tax return for the period ending 31 Dec 2025 is due 31 Jul 2026 — 60 days away. The Section 13 offset claim of 42,800 tCO2e (against a R18.4M carbon tax liability) requires pre-approval from DFFE before SARS submission. DFFE's current processing time is 45-50 days. Submit the DFFE pre-approval application this week to allow time for SARS filing."
          reasoning="Carbon Tax Act §13(4): offset credits must be pre-approved by the Department of Forestry, Fisheries and the Environment before they can be applied against a carbon tax liability in the SARS return. The 10% offset cap (Annex 2 activities) applies here — the 42,800 tCO2e claim is within the cap, but the DFFE application must include the original retirement certificates from the Gold Standard registry."
          confidence="high"
          onAccept={() => {}}
        />
        <DataTable<AuditBlock>
          columns={auditColumns}
          rows={auditData}
          loading={auditLoading}
          onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
        />
      </div>

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.action}
          subtitle={`${selected.entity_type} · ${selected.timestamp.slice(0, 10)}`}
          entityRef={selected.id.slice(-8).toUpperCase()}
          fields={auditFields(selected)}
          onActionComplete={() => { refetch(); setDrawerOpen(false); }}
        />
      )}
    </div>
  );
}

// ─── Carbon Reversal / Buffer Pool (W42) ─────────────────────────────────────

type ReversalRow = { id: string; ref: string; project_name: string; reversal_type: string; tonnes_reversed: number; buffer_cancellation_zar: number | null; chain_status: string; created_at: string };

const REVERSAL_COLS: Column<ReversalRow>[] = [
  { key: 'ref',                   header: 'Reference',       width: '150px', mono: true },
  { key: 'project_name',          header: 'Project',         width: '220px' },
  { key: 'reversal_type',         header: 'Type',            width: '110px' },
  { key: 'tonnes_reversed',       header: 'tCO₂e Reversed',  width: '130px', align: 'right', mono: true, render: r => <span>{r.tonnes_reversed.toLocaleString()}</span> },
  { key: 'buffer_cancellation_zar', header: 'Buffer Cancel.',  width: '120px', align: 'right', mono: true, render: r => <span>{r.buffer_cancellation_zar != null ? `R${(r.buffer_cancellation_zar/1e6).toFixed(2)}M` : '—'}</span> },
  { key: 'chain_status',          header: 'Status',          width: '130px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
];

function ReversalScreen() {
  const [rows, setRows] = React.useState<ReversalRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<ReversalRow | null>(null);
  React.useEffect(() => {
    apexClient.carbon.listReversals().then(r => { setRows(r as ReversalRow[]); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <AIInsightCard
        title="AFOLU Buffer Cancellation — Wildfire Risk Trigger"
        suggestion="REV-2026-001 (Drakensberg Afforestation, 14,200 tCO2e buffer cancellation) is at the 'Permanence Assessment' stage following the February wildfire event. Verra's AFOLU pooled buffer account requires a cancellation report within 60 days of the triggering event (deadline: 15 Jun 2026 — 14 days away). Submit the non-permanence assessment document now."
        reasoning="Verra VCS §4.1.5: verified carbon units from AFOLU projects that are reversed due to non-permanence events must be cancelled from the buffer pool account within 60 days. Failure to file the cancellation report within 60 days results in automatic cancellation plus a 15% punitive buffer deduction, increasing the effective reversal penalty from 14,200 to 16,330 tCO2e. The non-permanence assessment is a 3-5 day document preparation exercise."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<ReversalRow> rows={rows} columns={REVERSAL_COLS} loading={loading} onRowClick={r => setSel(r)} />
      {sel && (
        <DetailDrawer open onClose={() => setSel(null)} title={sel.ref} subtitle={sel.project_name}
          entityRef={sel.ref} status={sel.chain_status}
          fields={[
            { label: 'Project',            value: sel.project_name, span: true },
            { label: 'Type',               value: sel.reversal_type },
            { label: 'Tonnes Reversed',    value: sel.tonnes_reversed.toLocaleString() + ' tCO₂e', mono: true },
            { label: 'Buffer Cancellation',value: sel.buffer_cancellation_zar != null ? `R${(sel.buffer_cancellation_zar/1e6).toFixed(2)}M` : '—', mono: true },
            { label: 'Created',            value: sel.created_at, mono: true },
          ]}
          actions={[
            { id: 'begin', label: 'Begin Assessment', icon: 'send', variant: 'primary',
              onClick: () => apexClient.carbon.transitionReversal(sel.id, 'begin-assessment').then(() => setSel(null)) },
            { id: 'propose', label: 'Propose Buffer Cancellation', icon: 'flag', variant: 'secondary',
              onClick: () => apexClient.carbon.transitionReversal(sel.id, 'propose-buffer-cancellation').then(() => setSel(null)) },
          ]}
        />
      )}
    </div>
  );
}

// ─── Crediting Period Renewal (W56) ──────────────────────────────────────────

type RenewalRow = { id: string; ref: string; project_name: string; crediting_period_end: string; baseline_cut_pct: number | null; chain_status: string; created_at: string };

const RENEWAL_COLS: Column<RenewalRow>[] = [
  { key: 'ref',                  header: 'Reference',        width: '150px', mono: true },
  { key: 'project_name',         header: 'Project',          width: '220px' },
  { key: 'crediting_period_end', header: 'Period End',        width: '130px', mono: true },
  { key: 'baseline_cut_pct',     header: 'Baseline Cut %',   width: '120px', align: 'right', mono: true, render: r => <span>{r.baseline_cut_pct != null ? r.baseline_cut_pct.toFixed(1) + '%' : '—'}</span> },
  { key: 'chain_status',         header: 'Status',           width: '130px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
];

function RenewalScreen() {
  const [rows, setRows] = React.useState<RenewalRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<RenewalRow | null>(null);
  React.useEffect(() => {
    apexClient.carbon.listRenewals().then(r => { setRows(r as RenewalRow[]); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <DataTable<RenewalRow> rows={rows} columns={RENEWAL_COLS} loading={loading} onRowClick={r => setSel(r)} />
      {sel && (
        <DetailDrawer open onClose={() => setSel(null)} title={sel.ref} subtitle={sel.project_name}
          entityRef={sel.ref} status={sel.chain_status}
          fields={[
            { label: 'Project',              value: sel.project_name, span: true },
            { label: 'Crediting Period End', value: sel.crediting_period_end, mono: true },
            { label: 'Baseline Cut',         value: sel.baseline_cut_pct != null ? sel.baseline_cut_pct.toFixed(1) + '%' : '—', mono: true },
            { label: 'Created',              value: sel.created_at, mono: true },
          ]}
          actions={[
            { id: 'submit', label: 'Submit Application', icon: 'send', variant: 'primary',
              onClick: () => apexClient.carbon.transitionRenewal(sel.id, 'submit-application').then(() => setSel(null)) },
            { id: 'renew', label: 'Renew', icon: 'approve', variant: 'primary',
              onClick: () => apexClient.carbon.transitionRenewal(sel.id, 'renew').then(() => setSel(null)) },
          ]}
        />
      )}
    </div>
  );
}

// ─── PoA / CPA Inclusion (W73) ───────────────────────────────────────────────

type PoaRow = { id: string; ref: string; programme_name: string; cpa_name: string; cpa_type: string; estimated_annual_credits: number; chain_status: string; created_at: string };

const POA_COLS: Column<PoaRow>[] = [
  { key: 'ref',                      header: 'Reference',        width: '150px', mono: true },
  { key: 'programme_name',           header: 'Programme',        width: '200px' },
  { key: 'cpa_name',                 header: 'CPA Name',         width: '200px' },
  { key: 'cpa_type',                 header: 'Type',             width: '100px' },
  { key: 'estimated_annual_credits', header: 'Annual tCO₂e',     width: '120px', align: 'right', mono: true, render: r => <span>{r.estimated_annual_credits.toLocaleString()}</span> },
  { key: 'chain_status',             header: 'Status',           width: '130px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
];

function PoaScreen() {
  const [rows, setRows] = React.useState<PoaRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<PoaRow | null>(null);
  React.useEffect(() => {
    apexClient.carbon.listPoaInclusions().then(r => { setRows(r as PoaRow[]); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <DataTable<PoaRow> rows={rows} columns={POA_COLS} loading={loading} onRowClick={r => setSel(r)} />
      {sel && (
        <DetailDrawer open onClose={() => setSel(null)} title={sel.ref} subtitle={sel.cpa_name}
          entityRef={sel.ref} status={sel.chain_status}
          fields={[
            { label: 'Programme',    value: sel.programme_name, span: true },
            { label: 'CPA Name',     value: sel.cpa_name, span: true },
            { label: 'CPA Type',     value: sel.cpa_type },
            { label: 'Annual tCO₂e', value: sel.estimated_annual_credits.toLocaleString(), mono: true },
            { label: 'Created',      value: sel.created_at, mono: true },
          ]}
          actions={[
            { id: 'screen', label: 'Screen Eligibility', icon: 'checklist', variant: 'primary',
              onClick: () => apexClient.carbon.transitionPoa(sel.id, 'screen-eligibility').then(() => setSel(null)) },
            { id: 'include', label: 'Include CPA', icon: 'approve', variant: 'primary',
              onClick: () => apexClient.carbon.transitionPoa(sel.id, 'include').then(() => setSel(null)) },
            { id: 'exclude', label: 'Exclude', icon: 'reject', variant: 'danger',
              onClick: () => apexClient.carbon.transitionPoa(sel.id, 'exclude').then(() => setSel(null)) },
          ]}
        />
      )}
    </div>
  );
}

// ─── REC Lifecycle (W70 — I-REC / SAREC / EU-GO) ─────────────────────────────

type RecRow = {
  id: string;
  case_number: string;
  holder_name: string;
  certificate_standard: string;
  mwh_represented: number | null;
  chain_status: string;
  vintage_year: number | null;
  severity_tier: string;
};

const REC_COLS: Column<RecRow>[] = [
  { key: 'case_number',          header: 'Reference',    width: '160px', mono: true },
  { key: 'holder_name',          header: 'Holder',       width: '200px' },
  { key: 'certificate_standard', header: 'Standard',     width: '110px', mono: true },
  { key: 'mwh_represented',      header: 'MWh',          width: '100px', align: 'right', mono: true,
    render: r => <span>{r.mwh_represented != null ? r.mwh_represented.toLocaleString() : '—'}</span> },
  { key: 'vintage_year',         header: 'Vintage',      width: '90px', mono: true,
    render: r => <span>{r.vintage_year ?? '—'}</span> },
  { key: 'chain_status',         header: 'Status',       width: '140px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
];

function RecScreen() {
  const [rows, setRows] = React.useState<RecRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<RecRow | null>(null);
  React.useEffect(() => {
    apexClient.carbon.listRecLifecycle().then(r => { setRows(r as RecRow[]); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>REC / Guarantee-of-Origin Lifecycle</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W70 · I-REC / SAREC / EU-GO · Scope 2 attribute certificates</div>
      </div>
      <AIInsightCard
        title="I-REC 24-Month Expiry — Offtaker CDP Disclosure at Risk"
        suggestion="2 RECs from Perdekraal Wind (vintage Jan 2025, 4,200 MWh) are approaching the I-REC 24-month expiry window — unclaimed RECs expire on 31 Dec 2026. Offtakers using these for Scope-2 claims must register the RECs in their CDP disclosure before expiry."
        reasoning="I-REC Standard §4.3: expired RECs lose their attribute certificate status and cannot be used in Scope-2 disclosures retroactively. Early retirement locks in the CDP reporting date."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<RecRow> rows={rows} columns={REC_COLS} loading={loading} onRowClick={r => setSel(r)} />
      {sel && (
        <DetailDrawer open onClose={() => setSel(null)}
          title={sel.case_number} subtitle={`${sel.certificate_standard} · Vintage ${sel.vintage_year ?? '—'}`}
          entityRef={sel.case_number} status={sel.chain_status}
          fields={[
            { label: 'Reference',  value: sel.case_number,          mono: true, span: true },
            { label: 'Holder',     value: sel.holder_name,          span: true },
            { label: 'Standard',   value: sel.certificate_standard, mono: true },
            { label: 'MWh',        value: sel.mwh_represented != null ? sel.mwh_represented.toLocaleString() + ' MWh' : '—', mono: true },
            { label: 'Vintage',    value: sel.vintage_year != null ? String(sel.vintage_year) : '—', mono: true },
            { label: 'Tier',       value: sel.severity_tier },
            { label: 'Status',     value: sel.chain_status,         mono: true },
          ]}
          actions={[
            { id: 'transfer', label: 'Transfer Certificate', icon: 'send', variant: 'primary',
              onClick: () => apexClient.carbon.transitionRecLifecycle(sel.id, 'transfer-certificate').then(() => setSel(null)) },
            { id: 'retire', label: 'Retire Certificate', icon: 'leaf', variant: 'secondary',
              onClick: () => apexClient.carbon.transitionRecLifecycle(sel.id, 'retire-certificate').then(() => setSel(null)) },
            { id: 'dispute', label: 'Raise Dispute', icon: 'flag', variant: 'secondary',
              onClick: () => apexClient.carbon.transitionRecLifecycle(sel.id, 'raise-dispute').then(() => setSel(null)) },
          ]}
        />
      )}
    </div>
  );
}

// ─── Article 6 ITMO (W4 — UNFCCC corresponding-adjustment ledger) ─────────────

type ItmoRow = {
  id: string;
  retirement_id: string | null;
  certificate_id: string | null;
  host_country_iso: string;
  beneficiary_country_iso: string;
  tco2e: number;
  vintage_year: number | null;
  registry: string | null;
  article_6_track: string;
  ca_status: string;
  dffe_submitted_at: string | null;
  dffe_clearance_at: string | null;
  unfccc_posted_at: string | null;
  created_at: string;
};

const ITMO_COLS: Column<ItmoRow>[] = [
  { key: 'certificate_id',         header: 'Certificate',     width: '170px', mono: true,
    render: r => <span>{r.certificate_id ?? r.id.slice(-12).toUpperCase()}</span> },
  { key: 'host_country_iso',       header: 'Host Country',    width: '120px', mono: true },
  { key: 'beneficiary_country_iso',header: 'Beneficiary',     width: '120px', mono: true },
  { key: 'tco2e',                  header: 'tCO₂e',           width: '100px', align: 'right', mono: true,
    render: r => <span>{r.tco2e.toLocaleString()}</span> },
  { key: 'vintage_year',           header: 'Vintage',         width: '90px', mono: true,
    render: r => <span>{r.vintage_year ?? '—'}</span> },
  { key: 'ca_status',              header: 'Status',          width: '150px',
    render: r => <StatusPill label={r.ca_status} variant={stateVariant(r.ca_status)} /> },
];

function Article6Screen() {
  const [rows, setRows] = React.useState<ItmoRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<ItmoRow | null>(null);
  React.useEffect(() => {
    apexClient.carbon.listArticle6Adjustments().then(r => { setRows(r as ItmoRow[]); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Article 6 ITMO Corresponding-Adjustment Ledger</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W4 · UNFCCC Paris Agreement · DFFE DNA authority</div>
      </div>
      <AIInsightCard
        title="Unrecorded ITMO Adjustments Risk Invalidating UNFCCC Claims"
        suggestion="South Africa's DNA has approved ITMO transfers for 3 projects totalling 18,400 tCO₂e but corresponding adjustments have not been reflected in the national registry for 2 of them. Unrecorded adjustments invalidate the ITMO claim for buying countries."
        reasoning="Paris Agreement Article 6.2 requires both parties to record corresponding adjustments in their NDC by the end of the calendar year in which the transfer occurs. Failure to record by 31 Dec voids the ITMO's additionality claim."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<ItmoRow> rows={rows} columns={ITMO_COLS} loading={loading} onRowClick={r => setSel(r)} />
      {sel && (
        <DetailDrawer open onClose={() => setSel(null)}
          title={sel.certificate_id ?? sel.id.slice(-12).toUpperCase()}
          subtitle={`${sel.host_country_iso} → ${sel.beneficiary_country_iso} · ${sel.article_6_track}`}
          entityRef={sel.certificate_id ?? sel.id.slice(-12).toUpperCase()}
          status={sel.ca_status}
          fields={[
            { label: 'Certificate ID',       value: sel.certificate_id ?? '—',           mono: true, span: true },
            { label: 'Host Country ISO',     value: sel.host_country_iso,                mono: true },
            { label: 'Beneficiary Country',  value: sel.beneficiary_country_iso,         mono: true },
            { label: 'tCO₂e',               value: sel.tco2e.toLocaleString() + ' tCO₂e', mono: true },
            { label: 'Vintage Year',         value: sel.vintage_year != null ? String(sel.vintage_year) : '—', mono: true },
            { label: 'Registry',             value: sel.registry ?? '—',                 mono: true },
            { label: 'Article 6 Track',      value: sel.article_6_track },
            { label: 'DFFE Submitted',       value: sel.dffe_submitted_at ? sel.dffe_submitted_at.slice(0, 10) : '—', mono: true },
            { label: 'DFFE Cleared',         value: sel.dffe_clearance_at ? sel.dffe_clearance_at.slice(0, 10) : '—', mono: true },
            { label: 'UNFCCC Posted',        value: sel.unfccc_posted_at ? sel.unfccc_posted_at.slice(0, 10) : '—', mono: true },
            { label: 'Created',              value: sel.created_at.slice(0, 10),          mono: true },
          ]}
          actions={[
            { id: 'submit-dffe', label: 'Submit to DFFE', icon: 'send', variant: 'primary',
              onClick: () => apexClient.carbon.transitionArticle6(sel.id, 'submit-dffe').then(() => setSel(null)) },
            { id: 'post-unfccc', label: 'Post to UNFCCC Ledger', icon: 'satellite', variant: 'secondary',
              onClick: () => apexClient.carbon.transitionArticle6(sel.id, 'post-unfccc').then(() => setSel(null)) },
            { id: 'block', label: 'Block Adjustment', icon: 'flag', variant: 'secondary',
              onClick: () => apexClient.carbon.transitionArticle6(sel.id, 'block').then(() => setSel(null)) },
          ]}
        />
      )}
    </div>
  );
}

// ─── Credit Issuance Chain (W82) ─────────────────────────────────────────────

type IssuanceRow = {
  id: string;
  ref: string;
  project_name: string;
  registry: string;
  vintage: number;
  quantity: number;
  chain_status: string;
  issued_at: string | null;
  tier: string;
};

const ISSUANCE_COLS: Column<IssuanceRow>[] = [
  { key: 'ref',          header: 'Reference',   width: '150px', mono: true },
  { key: 'project_name', header: 'Project',     width: '220px' },
  { key: 'registry',     header: 'Registry',    width: '110px', mono: true },
  { key: 'vintage',      header: 'Vintage',     width: '90px',  align: 'right', mono: true },
  { key: 'quantity',     header: 'Quantity',    width: '120px', align: 'right', mono: true,
    render: r => <span>{r.quantity.toLocaleString()}</span> },
  { key: 'chain_status', header: 'Status',      width: '140px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
  { key: 'issued_at',    header: 'Issued',      width: '120px', mono: true,
    render: r => <span>{r.issued_at ? r.issued_at.slice(0, 10) : '—'}</span> },
];

function IssuanceScreen() {
  const [rows, setRows] = React.useState<IssuanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<IssuanceRow | null>(null);

  React.useEffect(() => {
    apexClient.carbon.listIssuanceChain()
      .then(r => { setRows(r as IssuanceRow[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const reload = () => {
    setLoading(true);
    apexClient.carbon.listIssuanceChain()
      .then(r => { setRows(r as IssuanceRow[]); setLoading(false); })
      .catch(() => setLoading(false));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Credit Issuance Chain</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W82 · Registry issuance workflow</div>
      </div>
      <AIInsightCard
        title="VVB Validation Delay — Issuance at Risk"
        suggestion="Kalahari Solar W-001 issuance request (12,400 tCO₂e, Verra VCS) has been pending VVB validation for 34 days. Typical validation takes 45 days — the 11-day window remaining is tight given current VVB workload. Consider parallel UNFCCC CDM as backup methodology."
        reasoning="Verra §4.3 validation delay beyond 60 days requires re-submission with updated baseline calculations, effectively adding 4-6 months to the issuance timeline and affecting project cashflow."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<IssuanceRow>
        rows={rows}
        columns={ISSUANCE_COLS}
        loading={loading}
        onRowClick={r => setSel(r)}
      />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={sel.ref}
          subtitle={`${sel.project_name} · ${sel.registry}`}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',   value: sel.ref,                              mono: true, span: true },
            { label: 'Project',     value: sel.project_name,                     span: true },
            { label: 'Registry',    value: sel.registry,                         mono: true },
            { label: 'Vintage',     value: String(sel.vintage),                  mono: true },
            { label: 'Quantity',    value: sel.quantity.toLocaleString() + ' tCO₂e', mono: true },
            { label: 'Tier',        value: sel.tier },
            { label: 'Issued At',   value: sel.issued_at ? sel.issued_at.slice(0, 10) : '—', mono: true },
            { label: 'Status',      value: sel.chain_status,                     mono: true },
          ]}
          actions={[
            { id: 'submit',  label: 'Submit for Verification', icon: 'send',        variant: 'primary',
              onClick: () => apexClient.carbon.transitionIssuance(sel.id, 'submit').then(() => { setSel(null); reload(); }) },
            { id: 'verify',  label: 'Verify',                  icon: 'check-circle', variant: 'primary',
              onClick: () => apexClient.carbon.transitionIssuance(sel.id, 'verify').then(() => { setSel(null); reload(); }) },
            { id: 'issue',   label: 'Issue to Registry',       icon: 'certificate', variant: 'secondary',
              onClick: () => apexClient.carbon.transitionIssuance(sel.id, 'issue').then(() => { setSel(null); reload(); }) },
            { id: 'reject',  label: 'Reject',                  icon: 'flag',        variant: 'danger',
              onClick: () => apexClient.carbon.transitionIssuance(sel.id, 'reject').then(() => { setSel(null); reload(); }) },
          ]}
          onActionComplete={() => { setSel(null); reload(); }}
        />
      )}
    </div>
  );
}

// ─── CCP Assessment Chain (W91 — ICVCM Carbon Credit Premium) ────────────────

type CcpRow = {
  id: string;
  ref: string;
  project_name: string;
  ccp_score: number | null;
  ccp_grade: string | null;
  chain_status: string;
  assessment_date: string | null;
  tier: string;
};

const CCP_COLS: Column<CcpRow>[] = [
  { key: 'ref',             header: 'Reference',       width: '150px', mono: true },
  { key: 'project_name',   header: 'Project',         width: '220px' },
  { key: 'ccp_score',      header: 'CCP Score',       width: '110px', align: 'right', mono: true,
    render: r => <span>{r.ccp_score != null ? r.ccp_score.toFixed(1) : '—'}</span> },
  { key: 'ccp_grade',      header: 'Grade',           width: '120px',
    render: r => r.ccp_grade
      ? <StatusPill label={r.ccp_grade} variant={stateVariant(r.ccp_grade)} />
      : <span style={{ color: 'var(--oe-text-3)' }}>—</span> },
  { key: 'chain_status',   header: 'Status',          width: '140px',
    render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
  { key: 'assessment_date',header: 'Assessment Date', width: '140px', mono: true,
    render: r => <span>{r.assessment_date ? r.assessment_date.slice(0, 10) : '—'}</span> },
];

function CcpScreen() {
  const [rows, setRows] = React.useState<CcpRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<CcpRow | null>(null);

  React.useEffect(() => {
    apexClient.carbon.listCcpAssessments()
      .then(r => { setRows(r as CcpRow[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const reload = () => {
    setLoading(true);
    apexClient.carbon.listCcpAssessments()
      .then(r => { setRows(r as CcpRow[]); setLoading(false); })
      .catch(() => setLoading(false));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>CCP Assessment</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>W91 · ICVCM Carbon Credit Premium label workflow</div>
      </div>
      <AIInsightCard
        title="Crediting Periods Expiring Without Active Renewals"
        suggestion="2 projects have crediting periods expiring in Q3 2026 without active renewal applications. Total at-risk forward pipeline is 47,200 tCO₂e (R14.6M at current SAREC spot price). W56 renewal typically takes 90 days — applications are already 30 days late."
        reasoning="W56 crediting-period renewal requires current-year monitoring data. Projects expiring without renewal lose their VCS registration and cannot issue credits for the lapsed period retroactively."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<CcpRow>
        rows={rows}
        columns={CCP_COLS}
        loading={loading}
        onRowClick={r => setSel(r)}
      />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={sel.ref}
          subtitle={sel.project_name}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',       value: sel.ref,                                           mono: true, span: true },
            { label: 'Project',         value: sel.project_name,                                  span: true },
            { label: 'CCP Score',       value: sel.ccp_score != null ? sel.ccp_score.toFixed(1) : '—', mono: true },
            { label: 'CCP Grade',       value: sel.ccp_grade ?? '—',                              mono: true },
            { label: 'Tier',            value: sel.tier },
            { label: 'Assessment Date', value: sel.assessment_date ? sel.assessment_date.slice(0, 10) : '—', mono: true },
            { label: 'Status',          value: sel.chain_status,                                  mono: true },
          ]}
          actions={[
            { id: 'submit',      label: 'Submit for Assessment', icon: 'send',        variant: 'primary',
              onClick: () => apexClient.carbon.transitionCcp(sel.id, 'submit').then(() => { setSel(null); reload(); }) },
            { id: 'assess',      label: 'Assess',                icon: 'checklist',   variant: 'primary',
              onClick: () => apexClient.carbon.transitionCcp(sel.id, 'assess').then(() => { setSel(null); reload(); }) },
            { id: 'grant_label', label: 'Grant CCP Label',       icon: 'certificate', variant: 'secondary',
              onClick: () => apexClient.carbon.transitionCcp(sel.id, 'grant-label').then(() => { setSel(null); reload(); }) },
            { id: 'deny_label',  label: 'Deny Label',            icon: 'flag',        variant: 'danger',
              onClick: () => apexClient.carbon.transitionCcp(sel.id, 'deny-label').then(() => { setSel(null); reload(); }) },
          ]}
          onActionComplete={() => { setSel(null); reload(); }}
        />
      )}
    </div>
  );
}

// ─── ESG Disclosure Lifecycle & Assurance (W103) ─────────────────────────────

type EsgRow = {
  id: string;
  ref: string;
  entity_name: string;
  framework: string;
  disclosure_year: string;
  assurance_level: string;
  chain_status: string;
  published_at: string | null;
  tier: string;
};

const ESG_COLS: Column<EsgRow>[] = [
  { key: 'ref',             header: 'Ref',             mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.ref ?? row.id.slice(-8).toUpperCase()}</span> },
  { key: 'entity_name',     header: 'Entity',          render: row => <span style={{ fontSize: '13px' }}>{row.entity_name}</span> },
  { key: 'framework',       header: 'Framework',       render: row => <span style={{ fontSize: '13px', color: 'var(--oe-text-2)' }}>{row.framework}</span> },
  { key: 'disclosure_year', header: 'Year',            mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.disclosure_year}</span> },
  { key: 'assurance_level', header: 'Assurance',       render: row => <span style={{ fontSize: '12px' }}>{row.assurance_level}</span> },
  { key: 'chain_status',    header: 'Status',
    render: row => <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} /> },
  { key: 'published_at',    header: 'Published',       mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.published_at ? row.published_at.slice(0, 10) : '—'}</span> },
];

function EsgDisclosureScreen() {
  const [rows, setRows] = React.useState<EsgRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<EsgRow | null>(null);

  const fetch = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/carbon/esg-disclosure/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as EsgRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetch(); }, [fetch]);

  const drawerFields = (row: EsgRow): DrawerField[] => [
    { label: 'Ref',             value: row.ref ?? row.id,                                     mono: true, span: true },
    { label: 'Entity',          value: row.entity_name,                                       span: true },
    { label: 'Framework',       value: row.framework },
    { label: 'Disclosure Year', value: row.disclosure_year,                                   mono: true },
    { label: 'Assurance Level', value: row.assurance_level },
    { label: 'Status',          value: <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} />, span: true },
    { label: 'Published At',    value: row.published_at ? row.published_at.slice(0, 10) : '—', mono: true },
    { label: 'Tier',            value: row.tier ?? '—',                                       mono: true },
  ];

  const drawerActions = (row: EsgRow): DrawerAction[] => {
    const s = row.chain_status ?? '';
    const actions: DrawerAction[] = [];
    if (s === 'draft' || s === 'open' || s === 'pending') {
      actions.push({ id: 'initiate', label: 'Initiate Disclosure', icon: 'send', variant: 'primary',
        onClick: () => api.post(`/api/carbon/esg-disclosure/chain/${row.id}/transition`, { action: 'initiate_disclosure' }).then(() => { void fetch(); setSel(null); }) });
    }
    if (s === 'draft' || s === 'initiated') {
      actions.push({ id: 'submit-assurance', label: 'Submit for Assurance', icon: 'checklist', variant: 'secondary',
        onClick: () => api.post(`/api/carbon/esg-disclosure/chain/${row.id}/transition`, { action: 'submit_for_assurance' }).then(() => { void fetch(); setSel(null); }) });
    }
    if (s === 'assured') {
      actions.push({ id: 'publish', label: 'Publish', icon: 'check-circle', variant: 'primary',
        onClick: () => api.post(`/api/carbon/esg-disclosure/chain/${row.id}/transition`, { action: 'publish' }).then(() => { void fetch(); setSel(null); }) });
    }
    actions.push({ id: 'restate', label: 'Restate', icon: 'flag', variant: 'danger',
      onClick: () => api.post(`/api/carbon/esg-disclosure/chain/${row.id}/transition`, { action: 'restate' }).then(() => { void fetch(); setSel(null); }) });
    return actions;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          ESG Disclosure Lifecycle &amp; Assurance
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' disclosures'}</div>
      </div>
      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', fontSize: '12px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        W103 — ESG disclosure lifecycle and third-party assurance. GRI / TCFD / ISSB / SASB frameworks; limited or reasonable assurance; publish crosses regulator on material disclosures. Restate always crosses.
      </div>
      <AIInsightCard
        suggestion="Kalahari Solar's GRI 305 disclosure shows Scope 2 emissions at 1,240 tCO₂e — 18% above the baseline in the project's CDM PDD. The TCFD alignment score is 64%, below the 70% threshold required for JSE sustainability index inclusion."
        reasoning="JSE Listings Requirement §3.84(b) requires TCFD-aligned disclosure by FY2026. Missing the 70% threshold in this cycle triggers an automatic 12-month remediation period."
        title="Review TCFD Gap"
        onAccept={() => {}}
      />
      <DataTable<EsgRow> columns={ESG_COLS} rows={rows} loading={loading} onRowClick={r => setSel(r)} />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={`ESG — ${sel.entity_name}`}
          subtitle={`${sel.framework} · ${sel.disclosure_year}`}
          entityRef={sel.ref ?? sel.id.slice(-8).toUpperCase()}
          status={sel.chain_status}
          statusVariant={stateVariant(sel.chain_status)}
          fields={drawerFields(sel)}
          actions={drawerActions(sel)}
          onActionComplete={fetch}
        />
      )}
    </div>
  );
}

// ─── Carbon Credit Quality Rating (W109) ─────────────────────────────────────

type CreditRatingRow = {
  id: string;
  ref: string;
  project_name: string;
  vintage: string;
  methodology: string;
  rating: string;
  rating_basis: string;
  chain_status: string;
  rated_at: string | null;
  tier: string;
};

const CREDIT_RATING_COLS: Column<CreditRatingRow>[] = [
  { key: 'ref',          header: 'Ref',         mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.ref ?? row.id.slice(-8).toUpperCase()}</span> },
  { key: 'project_name', header: 'Project',     render: row => <span style={{ fontSize: '13px' }}>{row.project_name}</span> },
  { key: 'vintage',      header: 'Vintage',     mono: true,
    render: row => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>{row.vintage}</span> },
  { key: 'methodology',  header: 'Methodology', render: row => <span style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>{row.methodology}</span> },
  { key: 'rating',       header: 'Rating',
    render: row => {
      const r = row.rating ?? '';
      const color = r === 'AAA' ? 'var(--oe-green)'
        : r === 'AA' || r === 'A' ? 'var(--oe-teal, var(--oe-green))'
        : r === 'BBB' ? 'var(--oe-amber)'
        : r === 'BB' || r === 'B' ? 'var(--oe-orange, var(--oe-amber))'
        : 'var(--oe-rose)';
      return (
        <span style={{ display: 'inline-block', background: color + '1a', color, border: '1px solid ' + color, borderRadius: '4px', padding: '1px 7px', fontSize: '11px', fontWeight: 800, fontFamily: '"JetBrains Mono", monospace' }}>
          {r || '—'}
        </span>
      );
    } },
  { key: 'chain_status', header: 'Status',
    render: row => <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} /> },
];

function CreditRatingScreen() {
  const [rows, setRows] = React.useState<CreditRatingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<CreditRatingRow | null>(null);

  const fetch = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/carbon/credit-quality/chain');
      setRows((res.data?.data ?? res.data?.results ?? res.data ?? []) as CreditRatingRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetch(); }, [fetch]);

  const drawerFields = (row: CreditRatingRow): DrawerField[] => [
    { label: 'Ref',          value: row.ref ?? row.id,                                     mono: true, span: true },
    { label: 'Project',      value: row.project_name,                                      span: true },
    { label: 'Vintage',      value: row.vintage,                                           mono: true },
    { label: 'Methodology',  value: row.methodology,                                       mono: true },
    { label: 'Rating',       value: row.rating ?? '—',                                    mono: true },
    { label: 'Rating Basis', value: row.rating_basis ?? '—' },
    { label: 'Status',       value: <StatusPill label={row.chain_status} variant={stateVariant(row.chain_status)} />, span: true },
    { label: 'Rated At',     value: row.rated_at ? row.rated_at.slice(0, 10) : '—',        mono: true },
    { label: 'Tier',         value: row.tier ?? '—',                                       mono: true },
  ];

  const drawerActions = (row: CreditRatingRow): DrawerAction[] => {
    const s = row.chain_status ?? '';
    const actions: DrawerAction[] = [];
    if (s === 'pending' || s === 'open' || s === 'draft') {
      actions.push({ id: 'initiate-rating', label: 'Initiate Rating', icon: 'certificate', variant: 'primary',
        onClick: () => api.post(`/api/carbon/credit-quality/chain/${row.id}/transition`, { action: 'initiate_rating' }).then(() => { void fetch(); setSel(null); }) });
    }
    if (s === 'initiated' || s === 'data_requested') {
      actions.push({ id: 'submit-data', label: 'Submit Data', icon: 'send', variant: 'secondary',
        onClick: () => api.post(`/api/carbon/credit-quality/chain/${row.id}/transition`, { action: 'submit_data' }).then(() => { void fetch(); setSel(null); }) });
    }
    if (s === 'under_review') {
      actions.push({ id: 'publish-rating', label: 'Publish Rating', icon: 'check-circle', variant: 'primary',
        onClick: () => api.post(`/api/carbon/credit-quality/chain/${row.id}/transition`, { action: 'publish_rating' }).then(() => { void fetch(); setSel(null); }) });
    }
    actions.push({ id: 'review', label: 'Review', icon: 'checklist', variant: 'secondary',
      onClick: () => api.post(`/api/carbon/credit-quality/chain/${row.id}/transition`, { action: 'review' }).then(() => { void fetch(); setSel(null); }) });
    return actions;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Carbon Credit Quality Rating
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' ratings'}</div>
      </div>
      <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '12px 16px', fontSize: '12px', color: 'var(--oe-text-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        W109 — Independent carbon credit quality assessment. AAA–CCC/D scale; Verra / Gold Standard / ICVCM methodology rating; publish_rating crosses regulator on AAA/AA label grants. Tier drives SLA depth.
      </div>
      <AIInsightCard
        suggestion="3 projects rated BBB show vintage >5 years without a crediting-period renewal (W56). Aging vintage with no renewal is a leading indicator of rating downgrade to BB — portfolio NAV at risk is ~R14.2M."
        reasoning="Verra §4.2 requires crediting-period renewal within 6 months of expiry for active projects. Lapsed renewals create additionality doubts that trigger automatic rating review."
        title="Initiate Renewal Reviews"
        onAccept={() => {}}
      />
      <DataTable<CreditRatingRow> columns={CREDIT_RATING_COLS} rows={rows} loading={loading} onRowClick={r => setSel(r)} />
      {sel && (
        <DetailDrawer
          open
          onClose={() => setSel(null)}
          title={`Rating — ${sel.project_name}`}
          subtitle={`${sel.methodology} · Vintage ${sel.vintage}`}
          entityRef={sel.ref ?? sel.id.slice(-8).toUpperCase()}
          status={sel.chain_status}
          statusVariant={stateVariant(sel.chain_status)}
          fields={drawerFields(sel)}
          actions={drawerActions(sel)}
          onActionComplete={fetch}
        />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Screen = 'dashboard' | 'analytics' | 'credits' | 'projects' | 'mrv' | 'retirements' | 'registration' | 'erpa' | 'offset' | 'reversal' | 'renewal' | 'poa' | 'rec' | 'article6' | 'issuance' | 'ccp' | 'esg' | 'credit-rating';

export function CarbonWorkstation() {
  const { data: me } = useCurrentUser();
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard');

  const { data: credits, loading: credLoading } = useCarbonCredits();
  const { data: projects, loading: projLoading } = useCarbonProjects();
  const { data: retirements } = useCarbonRetirements();

  // KPI computations
  const totalCredits = credits.reduce((s, c) => s + (c.quantity || 0), 0);
  const retiredVolume = retirements.reduce((s, r) => s + (r.quantity || 0), 0);
  const pendingMrv = projects.filter(p => p.status === 'validation' || p.status === 'verification').length;
  const activeProjects = projects.filter(p => p.status === 'active' || p.status === 'registered').length;
  const retirementRate = totalCredits > 0 ? Math.round((retiredVolume / totalCredits) * 100) : 0;

  const navClickMap: Record<string, () => void> = {
    dashboard:    () => setActiveScreen('dashboard'),
    analytics:    () => setActiveScreen('analytics'),
    credits:      () => setActiveScreen('credits'),
    projects:     () => setActiveScreen('projects'),
    mrv:          () => setActiveScreen('mrv'),
    retirements:  () => setActiveScreen('retirements'),
    registration: () => setActiveScreen('registration'),
    erpa:         () => setActiveScreen('erpa'),
    offset:       () => setActiveScreen('offset'),
    reversal:     () => setActiveScreen('reversal'),
    renewal:      () => setActiveScreen('renewal'),
    poa:          () => setActiveScreen('poa'),
    rec:                   () => setActiveScreen('rec'),
    article6:              () => setActiveScreen('article6'),
    'carbon-issuance':     () => setActiveScreen('issuance'),
    'carbon-ccp':          () => setActiveScreen('ccp'),
    'carbon-esg':          () => setActiveScreen('esg'),
    'carbon-credit-rating': () => setActiveScreen('credit-rating'),
  };

  const screenToNavId: Partial<Record<Screen, string>> = {
    issuance:      'carbon-issuance',
    ccp:           'carbon-ccp',
    esg:           'carbon-esg',
    'credit-rating': 'carbon-credit-rating',
  };

  const liveNavConfig: NavConfig = {
    ...BASE_NAV_CONFIG,
    activeId: screenToNavId[activeScreen] ?? activeScreen,
    sections: BASE_NAV_CONFIG.sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        onClick: navClickMap[item.id] ?? undefined,
      })),
    })),
  };

  const breadcrumbLabel: Record<Screen, string> = {
    dashboard:       'Dashboard',
    analytics:       'Analytics & Reports',
    credits:         'Credits Ledger',
    projects:        'Projects',
    mrv:             'MRV Chain',
    retirements:     'Retirements',
    registration:    'Registration / PDD',
    erpa:            'ERPA Delivery',
    offset:          'Carbon Tax Offset',
    reversal:        'Reversal / Buffer Pool',
    renewal:         'Crediting Period Renewal',
    poa:             'PoA / CPA Inclusion',
    rec:             'REC Lifecycle',
    article6:        'Article 6 ITMO',
    issuance:        'Credit Issuance W82',
    ccp:             'CCP Assessment W91',
    esg:             'ESG Disclosure W103',
    'credit-rating': 'Credit Quality W109',
  };

  return (
    <AppShell
      role="carbon_fund"
      userName={me?.name ?? 'User'}
      userEmail={me?.email ?? ''}
      navConfig={liveNavConfig}
      breadcrumbs={[{ label: 'Carbon Fund' }, { label: breadcrumbLabel[activeScreen] }]}
      alerts={[
        {
          id: 'alert1',
          message: 'Reversal event: Cape Biomass PoA buffer pool draw required — review within 48h',
          variant: 'amber',
          href: '#reversal',
          dismissible: true,
        },
      ]}
    >
      {activeScreen === 'analytics'    ? <CarbonAnalytics />
     : activeScreen === 'credits'      ? <CreditsScreen />
     : activeScreen === 'projects'     ? <ProjectsScreen />
     : activeScreen === 'mrv'          ? <MrvScreen />
     : activeScreen === 'retirements'  ? <RetirementsScreen />
     : activeScreen === 'registration' ? <RegistrationScreen />
     : activeScreen === 'erpa'         ? <ErpaScreen />
     : activeScreen === 'offset'       ? <OffsetScreen />
     : activeScreen === 'reversal'     ? <ReversalScreen />
     : activeScreen === 'renewal'      ? <RenewalScreen />
     : activeScreen === 'poa'          ? <PoaScreen />
     : activeScreen === 'rec'          ? <RecScreen />
     : activeScreen === 'article6'     ? <Article6Screen />
     : activeScreen === 'issuance'      ? <IssuanceScreen />
     : activeScreen === 'ccp'           ? <CcpScreen />
     : activeScreen === 'esg'           ? <EsgDisclosureScreen />
     : activeScreen === 'credit-rating' ? <CreditRatingScreen />
     : <>
      {/* Dashboard ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--oe-text-1)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          Carbon Portfolio
        </div>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)', marginTop: '3px' }}>
          {projLoading ? 'Loading...' : `${projects.length} registered projects · ${totalCredits > 0 ? `${Math.round(totalCredits / 1000)}k` : '—'} tCO2e`}
        </div>
      </div>

      <StatGrid cols={4}>
        <StatCard label="Issued Credits"      value={credLoading ? '—' : totalCredits > 0 ? `${Math.round(totalCredits / 1000)}k` : '0'} unit="tCO2e" icon="leaf"       variant="green" />
        <StatCard label="Pending Verification" value={projLoading ? '—' : String(pendingMrv)}  subtext={projLoading ? '' : `${activeProjects} active projects`} icon="checklist" variant="amber" />
        <StatCard label="Active Projects"      value={projLoading ? '—' : String(activeProjects)} icon="folder"     variant="navy" />
        <StatCard label="Retirement Rate"      value={credLoading ? '—' : `${retirementRate}%`}  icon="chart-line" variant="blue" />
      </StatGrid>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', marginTop: '20px' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>
          <div>
            <SectionHeading title="Carbon Credits" />
            <DataTable<CarbonCredit> columns={creditColumns} rows={credits} loading={credLoading} compact />
          </div>
          <div>
            <SectionHeading title="Active Projects" />
            <DataTable<CarbonProject> columns={projectColumns} rows={projects} loading={projLoading} compact />
          </div>
          <CreditFlow totalCredits={totalCredits} />
          <Card>
            <SectionHeading title="MRV Verification Pipeline — Karoo Solar C001" />
            <StateFlow steps={mrvSteps} />
          </Card>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>
          <AIInsightCard
            title="Carbon Market Alert"
            suggestion="Karoo Solar MRV verification expected to yield 14,200 tCO2e — current Gold Standard spot $32/tCO2e vs Article 6 ITMO at $28/tCO2e. Selling to Article 6 buyers delivers 14% higher revenue."
            reasoning="Gold Standard spot price is derived from recent secondary-market transactions indexed against voluntary carbon price trackers. Article 6 ITMO premium applies when the host country DNA issues a Letter of Authorisation under the Paris Agreement. Karoo Solar holds a valid LoA from DFFE, qualifying all credits for Article 6 routing."
            confidence="medium"
          />
          <ChainMap chainLabel="Karoo Solar MRV" chainType="Carbon MRV Chain" currentState="Third Party Audit" links={chainLinks} />
          <ActionPanel
            actions={[
              {
                id: 'submit-verification',
                label: 'Submit MRV Report',
                icon: 'send',
                variant: 'primary',
                form: (
                  <TransitionForm
                    actionLabel="Submit MRV Report"
                    fields={[
                      { key: 'vvb',    label: 'Verifier Body',      type: 'select', options: [{ value: 'tuv', label: 'TUV Rheinland' }, { value: 'bureau', label: 'Bureau Veritas' }] },
                      { key: 'period', label: 'Monitoring Period',   type: 'text', required: true, placeholder: 'e.g. 2025-01-01 to 2025-12-31' },
                    ]}
                    reasonCodes={[
                      { value: 'period_complete', label: 'Monitoring period complete' },
                      { value: 'triggered',       label: 'Triggered verification' },
                    ]}
                    onSubmit={async (formData) => {
                      const proj = projects.find(p => p.status === 'monitoring');
                      await apexClient.carbon.listMrv({ project_id: proj?.id, ...formData });
                    }}
                  />
                ),
              },
              {
                id: 'retire-credits',
                label: 'Retire Credits',
                icon: 'leaf',
                variant: 'secondary',
                description: 'Scope 2 or Article 6 retirement',
                form: (
                  <TransitionForm
                    actionLabel="Retire Credits"
                    fields={[
                      { key: 'quantity',    label: 'Quantity (tCO2e)', type: 'text', required: true, placeholder: 'e.g. 5000' },
                      { key: 'beneficiary', label: 'Beneficiary',      type: 'text', required: true, placeholder: 'Legal entity name' },
                    ]}
                    reasonCodes={[
                      { value: 'scope2',    label: 'Scope 2 corporate claim' },
                      { value: 'article6',  label: 'Article 6 ITMO transfer' },
                      { value: 'voluntary', label: 'Voluntary offset' },
                    ]}
                    onSubmit={async (formData) => {
                      const cred = credits.find(c => c.status === 'issued');
                      if (cred) await apexClient.carbon.retireCredits(cred.id, formData);
                    }}
                  />
                ),
              },
              {
                id: 'issue-credits',
                label: 'Issue Credits to Registry',
                icon: 'certificate',
                variant: 'ghost',
                onClick: async () => {
                  await apexClient.carbon.listCredits({ status: 'pending_issuance' });
                },
              },
            ]}
          />
        </div>
      </div>
    </>}
    </AppShell>
  );
}

export default CarbonWorkstation;
