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
} from '../../lib/hooks';
import {
  CarbonCredit,
  CarbonProject,
  CarbonRetirement,
  CarbonMrv,
  AuditBlock,
  apexClient,
} from '../../lib/client';

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
        { id: 'offset',      label: 'Carbon Tax Offset W48',  href: '#offset',      icon: 'scales' },
        { id: 'retirements', label: 'Carbon Retirement W17',  href: '#retirements', icon: 'leaf', badge: 1, badgeVariant: 'rose' },
        { id: 'credits',     label: 'Credits Ledger',         href: '#credits',     icon: 'certificate' },
        { id: 'projects',    label: 'Projects',               href: '#projects',    icon: 'folder' },
        { id: 'rec',         label: 'REC Lifecycle W70',      href: '#rec',         icon: 'certificate' },
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
        { id: 'ghg',      label: 'GHG Protocol Report', href: '#ghg',      icon: 'report' },
        { id: 'tcfd',     label: 'TCFD Report',         href: '#tcfd',     icon: 'report' },
        { id: 'article6', label: 'Article 6 Report',    href: '#article6', icon: 'report' },
        { id: 'settings', label: 'Settings',            href: '#settings', icon: 'gear' },
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

// ── Main component ────────────────────────────────────────────────────────────

type Screen = 'dashboard' | 'analytics' | 'credits' | 'projects' | 'mrv' | 'retirements' | 'registration' | 'erpa' | 'offset' | 'reversal' | 'renewal' | 'poa';

export function CarbonWorkstation() {
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
  };

  const liveNavConfig: NavConfig = {
    ...BASE_NAV_CONFIG,
    activeId: activeScreen,
    sections: BASE_NAV_CONFIG.sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        onClick: navClickMap[item.id] ?? undefined,
      })),
    })),
  };

  const breadcrumbLabel: Record<Screen, string> = {
    dashboard:    'Dashboard',
    analytics:    'Analytics & Reports',
    credits:      'Credits Ledger',
    projects:     'Projects',
    mrv:          'MRV Chain',
    retirements:  'Retirements',
    registration: 'Registration / PDD',
    erpa:         'ERPA Delivery',
    offset:       'Carbon Tax Offset',
    reversal:     'Reversal / Buffer Pool',
    renewal:      'Crediting Period Renewal',
    poa:          'PoA / CPA Inclusion',
  };

  return (
    <AppShell
      role="carbon_fund"
      userName="Thabo Nkosi"
      userEmail="carbon@openenergy.co.za"
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
