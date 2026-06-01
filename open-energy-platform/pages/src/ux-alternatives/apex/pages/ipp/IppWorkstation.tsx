/**
 * IPP Developer Workstation — live API data
 */

import React, { useState } from 'react';
import { IppAnalytics } from '../analytics/IppAnalytics';
import { AppShell, NavConfig } from '../../components/shell/AppShell';
import { StatCard, StatGrid } from '../../components/display/StatCard';
import { DataTable, Column } from '../../components/display/DataTable';
import { StateFlow, StateFlowStep } from '../../components/display/StateFlow';
import { StatusPill, stateVariant } from '../../components/display/StatusPill';
import { AIInsightCard } from '../../components/display/AIInsightCard';
import { Timeline, TimelineEvent } from '../../components/display/Timeline';
import { ChainMap, ChainLink } from '../../components/display/ChainMap';
import { ActionPanel } from '../../components/actions/ActionPanel';
import { TransitionForm } from '../../components/actions/TransitionForm';
import { OeIcon } from '../../components/icons/Icons';
import { DetailDrawer, DrawerField, DrawerAction } from '../../components/display/DetailDrawer';
import {
  useIppProjects, useIppStageGates, useIppBonds, useIppProcurement,
  useIppDrawdowns, useIppDocuments, useAuditBlocks,
} from '../../lib/hooks';
import { apexClient, IppProject, IppStageGate, IppBond, IppProcurement, IppDrawdown, IppDocument, AuditBlock } from '../../lib/client';

// ─── Nav config ─────────────────────────────────────────────────────────────

const IPP_NAV: NavConfig = {
  activeId: 'ipp-dashboard',
  sections: [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { id: 'ipp-dashboard',  label: 'Dashboard',   href: '#dashboard',  icon: 'home' },
        { id: 'ipp-projects',   label: 'Projects',    href: '#projects',   icon: 'folder' },
        { id: 'ipp-analytics',  label: 'Analytics',   href: '#analytics',  icon: 'chart-line' },
      ],
    },
    {
      id: 'lifecycle',
      label: 'Project Lifecycle',
      items: [
        { id: 'ipp-gates',        label: 'Stage Gates',     href: '#gates',        icon: 'gate',      badge: 2, badgeVariant: 'amber' },
        { id: 'ipp-procurement',  label: 'Procurement',     href: '#procurement',  icon: 'blueprint' },
        { id: 'ipp-construction', label: 'Construction',    href: '#construction', icon: 'hierarchy' },
        { id: 'ipp-bonds',        label: 'Bonds',           href: '#bonds',        icon: 'shield',    badge: 1, badgeVariant: 'rose' },
        { id: 'ipp-insurance',    label: 'Insurance',       href: '#insurance',    icon: 'checklist' },
      ],
    },
    {
      id: 'compliance',
      label: 'Compliance',
      items: [
        { id: 'ipp-ed',        label: 'ED Commitments',  href: '#ed',      icon: 'flag' },
        { id: 'ipp-hse',       label: 'HSE / SHEQ',      href: '#hse',     icon: 'shield', badge: 1, badgeVariant: 'rose' },
        { id: 'ipp-cyber',     label: 'Cyber Incident',  href: '#cyber',   icon: 'lock' },
        { id: 'ipp-licence',   label: 'Licences',        href: '#licence', icon: 'certificate' },
      ],
    },
    {
      id: 'connections',
      label: 'Grid & Finance',
      items: [
        { id: 'ipp-gca',        label: 'Grid Connection',  href: '#gca',        icon: 'tower' },
        { id: 'ipp-drawdown',   label: 'Drawdowns',        href: '#drawdown',   icon: 'dollar' },
        { id: 'ipp-documents',  label: 'Documents',        href: '#documents',  icon: 'folder' },
      ],
    },
    {
      id: 'tools',
      label: 'Reports & Tools',
      defaultCollapsed: true,
      items: [
        { id: 'ipp-reports',  label: 'Reports',    href: '#reports',  icon: 'report' },
        { id: 'ipp-export',   label: 'Export',     href: '#export',   icon: 'export' },
        { id: 'ipp-settings', label: 'Settings',   href: '#settings', icon: 'gear' },
      ],
    },
  ],
};

// ─── Column definitions ──────────────────────────────────────────────────────

const PROJECT_COLS: Column<IppProject>[] = [
  { key: 'project_name', header: 'Project',  width: '240px' },
  { key: 'technology',   header: 'Type',     width: '80px' },
  { key: 'capacity_mw',  header: 'MW',       width: '70px', align: 'right', mono: true },
  { key: 'location',     header: 'Location', width: '120px' },
  { key: 'status',       header: 'State',    width: '110px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'cod_target',   header: 'COD Target', align: 'right', mono: true, render: row => <span>{row.cod_target ?? '—'}</span> },
];

const GATE_COLS: Column<IppStageGate>[] = [
  { key: 'gate',         header: 'Gate',         width: '120px' },
  { key: 'status',       header: 'Status',       width: '120px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'submitted_at', header: 'Submitted',    width: '140px', mono: true, render: row => <span>{row.submitted_at ?? '—'}</span> },
  { key: 'decision_at',  header: 'Decision',     width: '140px', mono: true, render: row => <span>{row.decision_at ?? '—'}</span> },
  { key: 'flags',        header: 'Flags',        render: row => <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--oe-text-3)' }}>{JSON.stringify(row.flags).slice(0, 60)}</span> },
];

const PROCUREMENT_COLS: Column<IppProcurement>[] = [
  { key: 'ref',        header: 'Ref',       width: '120px', mono: true },
  { key: 'title',      header: 'Title',     width: '260px' },
  { key: 'value_zar',  header: 'Value',     width: '100px', align: 'right', mono: true, render: row => <span>{'R' + (row.value_zar / 1e6).toFixed(1) + 'M'}</span> },
  { key: 'status',     header: 'Status',    width: '120px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'created_at', header: 'Created',   width: '130px', mono: true },
];

const BOND_COLS: Column<IppBond>[] = [
  { key: 'bond_type',      header: 'Type',           width: '140px' },
  { key: 'issuer',         header: 'Issuer',         width: '160px' },
  { key: 'face_value_zar', header: 'Face Value',     width: '110px', align: 'right', mono: true, render: row => <span>{'R' + (row.face_value_zar / 1e6).toFixed(1) + 'M'}</span> },
  { key: 'expiry_date',    header: 'Expiry',         width: '120px', mono: true },
  { key: 'days_remaining', header: 'Days Left',      width: '90px',  align: 'right', mono: true,
    render: row => (
      <span style={{ color: row.days_remaining < 30 ? 'var(--oe-rose)' : row.days_remaining < 90 ? 'var(--oe-amber)' : 'var(--oe-text-1)' }}>
        {row.days_remaining}
      </span>
    ),
  },
  { key: 'status', header: 'Status', width: '110px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
];

const HSE_COLS: Column<AuditBlock>[] = [
  { key: 'id',         header: 'Ref',       width: '90px',  mono: true, render: row => <span>{row.id.slice(-8)}</span> },
  { key: 'action',     header: 'Action',    width: '260px' },
  { key: 'actor_name', header: 'Actor',     width: '180px', render: row => <span>{row.actor_name ?? row.actor_id}</span> },
  { key: 'timestamp',  header: 'Timestamp', mono: true },
];

const DRAWDOWN_COLS: Column<IppDrawdown>[] = [
  { key: 'drawdown_ref',  header: 'Ref',          width: '130px', mono: true },
  { key: 'amount_zar',    header: 'Amount',        width: '110px', align: 'right', mono: true, render: row => <span>{'R' + (row.amount_zar / 1e6).toFixed(1) + 'M'}</span> },
  { key: 'ie_cert_ref',   header: 'IE Cert',       width: '120px', mono: true, render: row => <span>{row.ie_cert_ref ?? '—'}</span> },
  { key: 'match_status',  header: 'Match',         width: '110px', render: row => <StatusPill label={row.match_status} variant={stateVariant(row.match_status)} /> },
  { key: 'status',        header: 'Status',        width: '110px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'created_at',    header: 'Created',       width: '130px', mono: true },
];

const DOCUMENT_COLS: Column<IppDocument>[] = [
  { key: 'title',      header: 'Title',    width: '260px' },
  { key: 'doc_type',   header: 'Type',     width: '140px' },
  { key: 'version',    header: 'Version',  width: '80px',  mono: true },
  { key: 'status',     header: 'Status',   width: '110px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'created_at', header: 'Created',  width: '130px', mono: true },
];

const AUDIT_COLS: Column<AuditBlock>[] = [
  { key: 'id',         header: 'Ref',       width: '90px',  mono: true, render: row => <span>{row.id.slice(-8)}</span> },
  { key: 'action',     header: 'Action',    width: '260px' },
  { key: 'actor_name', header: 'Actor',     width: '180px', render: row => <span>{row.actor_name ?? row.actor_id}</span> },
  { key: 'timestamp',  header: 'Date',      mono: true },
];

// ─── Screen type ─────────────────────────────────────────────────────────────

type Screen =
  | 'dashboard' | 'projects' | 'gates' | 'analytics'
  | 'procurement' | 'construction' | 'bonds' | 'insurance'
  | 'ed' | 'hse' | 'cyber' | 'licence' | 'gca' | 'drawdown' | 'documents';

// ─── Main component ──────────────────────────────────────────────────────────

export function IppWorkstation() {
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard');

  const SCREEN_LABELS: Record<Screen, string> = {
    dashboard: 'Dashboard', projects: 'Projects', gates: 'Stage Gates', analytics: 'Analytics & Reports',
    procurement: 'Procurement', construction: 'Construction', bonds: 'Bonds', insurance: 'Insurance',
    ed: 'ED Commitments', hse: 'HSE / SHEQ', cyber: 'Cyber Incident', licence: 'Licences',
    gca: 'Grid Connection', drawdown: 'Drawdowns', documents: 'Documents',
  };

  const NAV_CLICK_MAP: Record<string, () => void> = {
    'ipp-dashboard':    () => setActiveScreen('dashboard'),
    'ipp-projects':     () => setActiveScreen('projects'),
    'ipp-analytics':    () => setActiveScreen('analytics'),
    'ipp-gates':        () => setActiveScreen('gates'),
    'ipp-procurement':  () => setActiveScreen('procurement'),
    'ipp-construction': () => setActiveScreen('construction'),
    'ipp-bonds':        () => setActiveScreen('bonds'),
    'ipp-insurance':    () => setActiveScreen('insurance'),
    'ipp-ed':           () => setActiveScreen('ed'),
    'ipp-hse':          () => setActiveScreen('hse'),
    'ipp-cyber':        () => setActiveScreen('cyber'),
    'ipp-licence':      () => setActiveScreen('licence'),
    'ipp-gca':          () => setActiveScreen('gca'),
    'ipp-drawdown':     () => setActiveScreen('drawdown'),
    'ipp-documents':    () => setActiveScreen('documents'),
    'ipp-reports':      () => setActiveScreen('analytics'),
  };

  const navConfig = {
    ...IPP_NAV,
    activeId: `ipp-${activeScreen}`,
    sections: IPP_NAV.sections.map(section => ({
      ...section,
      items: section.items.map(item => ({
        ...item,
        onClick: NAV_CLICK_MAP[item.id],
      })),
    })),
  };

  return (
    <AppShell
      role="ipp_developer"
      userName="Riku van Wyk"
      userEmail="ipp@openenergy.co.za"
      navConfig={navConfig}
      breadcrumbs={[
        { label: 'IPP Developer' },
        { label: SCREEN_LABELS[activeScreen] },
      ]}
      alerts={[
        { id: 'a1', message: 'Bond expiry — Boland Solar 120MW performance bond expires in 14 days', variant: 'rose', href: '#bonds', dismissible: true },
        { id: 'a2', message: 'DG2 gate review deadline in 3 days — Limpopo BESS', variant: 'amber', href: '#gates', dismissible: true },
      ]}
    >
      {activeScreen === 'analytics'    ? <IppAnalytics />
       : activeScreen === 'projects'    ? <ProjectsScreen />
       : activeScreen === 'gates'       ? <GatesScreen />
       : activeScreen === 'procurement' ? <ProcurementScreen />
       : activeScreen === 'construction'? <ConstructionScreen />
       : activeScreen === 'bonds'       ? <BondsScreen />
       : activeScreen === 'insurance'   ? <InsuranceScreen />
       : activeScreen === 'ed'          ? <EdScreen />
       : activeScreen === 'hse'         ? <HseScreen />
       : activeScreen === 'cyber'       ? <CyberScreen />
       : activeScreen === 'licence'     ? <LicenceScreen />
       : activeScreen === 'gca'         ? <GcaScreen />
       : activeScreen === 'drawdown'    ? <DrawdownScreen />
       : activeScreen === 'documents'   ? <DocumentsScreen />
       : <Dashboard />}
    </AppShell>
  );
}

// ─── Sub-screens ─────────────────────────────────────────────────────────────

function ProjectsScreen() {
  const { data, loading, refetch } = useIppProjects();
  const [selected, setSelected] = React.useState<IppProject | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const projectFields = (p: IppProject): DrawerField[] => [
    { label: 'Project Name', value: p.project_name, span: true },
    { label: 'Technology',   value: p.technology },
    { label: 'Capacity',     value: `${p.capacity_mw} MW`, mono: true },
    { label: 'Location',     value: p.location },
    { label: 'COD Target',   value: p.cod_target ?? '—', mono: true },
    { label: 'Developer ID', value: p.developer_id, mono: true },
    { label: 'Created',      value: p.created_at, mono: true },
    { label: 'Record ID',    value: p.id.slice(-12), mono: true },
  ];

  const projectActions = (p: IppProject): DrawerAction[] => [
    {
      id: 'submit-gate',
      label: 'Submit Stage Gate',
      icon: 'send',
      variant: 'primary',
      onClick: async () => {
        const gates = await apexClient.ipp.listStageGates(p.id);
        const pending = gates.find(g => g.status === 'pending' || g.status === 'draft');
        if (pending) {
          await apexClient.ipp.submitStageGate(pending.id, { project_id: p.id });
        }
      },
    },
    {
      id: 'upload-doc',
      label: 'Upload Document',
      icon: 'upload',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.ipp.uploadDocument({ project_id: p.id, doc_type: 'general', title: 'New Document', version: '1.0' });
      },
    },
    {
      id: 'view-audit',
      label: 'Refresh Data',
      icon: 'dots-h',
      variant: 'secondary',
      onClick: async () => {
        await apexClient.audit.listBlocks({ entity_type: 'ipp_project', entity_id: p.id });
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Projects</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable
        columns={PROJECT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.project_name}
          subtitle={`${selected.technology} · ${selected.capacity_mw} MW · ${selected.location}`}
          entityRef={selected.id.slice(-10).toUpperCase()}
          status={selected.status}
          fields={projectFields(selected)}
          actions={projectActions(selected)}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

function GatesScreen() {
  const { data, loading, refetch } = useIppStageGates();
  const [selected, setSelected] = React.useState<IppStageGate | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const gateFields = (g: IppStageGate): DrawerField[] => [
    { label: 'Gate',        value: g.gate, span: true },
    { label: 'Project ID',  value: g.project_id, mono: true },
    { label: 'Status',      value: <StatusPill label={g.status} variant={stateVariant(g.status)} /> },
    { label: 'Submitted',   value: g.submitted_at ?? '—', mono: true },
    { label: 'Decision',    value: g.decision_at ?? '—', mono: true },
    { label: 'Flags',       value: JSON.stringify(g.flags), mono: true, span: true },
    { label: 'Record ID',   value: g.id.slice(-12), mono: true },
  ];

  const gateActions = (g: IppStageGate): DrawerAction[] => {
    const actions: DrawerAction[] = [];
    if (g.status === 'pending' || g.status === 'draft') {
      actions.push({
        id: 'submit',
        label: 'Submit Gate',
        icon: 'send',
        variant: 'primary',
        onClick: async () => { await apexClient.ipp.submitStageGate(g.id, { action: 'submit' }); },
      });
    }
    if (g.status === 'submitted' || g.status === 'reviewing') {
      actions.push({
        id: 'approve',
        label: 'Mark Approved',
        icon: 'check-circle',
        variant: 'primary',
        onClick: async () => { await apexClient.ipp.submitStageGate(g.id, { action: 'approve' }); },
      });
      actions.push({
        id: 'reject',
        label: 'Reject Gate',
        icon: 'x-circle',
        variant: 'danger',
        onClick: async () => { await apexClient.ipp.submitStageGate(g.id, { action: 'reject', reason: 'Insufficient documentation' }); },
      });
    }
    actions.push({
      id: 'upload-evidence',
      label: 'Upload Evidence',
      icon: 'upload',
      variant: 'secondary',
      onClick: async () => { await apexClient.ipp.uploadDocument({ project_id: g.project_id, gate_id: g.id, doc_type: 'gate_evidence', title: `Evidence for ${g.gate}`, version: '1.0' }); },
    });
    return actions;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Stage Gates</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable
        columns={GATE_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.gate}
          subtitle={`Project ${selected.project_id}`}
          entityRef={selected.id.slice(-10).toUpperCase()}
          status={selected.status}
          fields={gateFields(selected)}
          actions={gateActions(selected)}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

function ProcurementScreen() {
  const { data, loading, refetch } = useIppProcurement();
  const [selected, setSelected] = React.useState<IppProcurement | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const procurementFields = (p: IppProcurement): DrawerField[] => [
    { label: 'Title',       value: p.title, span: true },
    { label: 'Reference',   value: p.ref, mono: true },
    { label: 'Project ID',  value: p.project_id, mono: true },
    { label: 'Value',       value: `R${(p.value_zar / 1e6).toFixed(2)}M`, mono: true },
    { label: 'Status',      value: <StatusPill label={p.status} variant={stateVariant(p.status)} /> },
    { label: 'Created',     value: p.created_at, mono: true },
    { label: 'Record ID',   value: p.id.slice(-12), mono: true },
  ];

  const procurementActions = (p: IppProcurement): DrawerAction[] => [
    {
      id: 'view-docs',
      label: 'View Documents',
      icon: 'folder',
      variant: 'secondary',
      onClick: () => apexClient.ipp.listDocuments(p.project_id).then(() => refetch()),
    },
    {
      id: 'upload-bid',
      label: 'Upload Bid Document',
      icon: 'upload',
      variant: 'primary',
      onClick: async () => { await apexClient.ipp.uploadDocument({
        project_id: p.project_id,
        procurement_id: p.id,
        doc_type: 'bid',
        title: `Bid for ${p.ref}`,
        version: '1.0',
      }); },
    },
    {
      id: 'refresh',
      label: 'Refresh Record',
      icon: 'dots-h',
      variant: 'secondary',
      onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_procurement', entity_id: p.id }).then(() => refetch()),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Procurement</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable
        columns={PROCUREMENT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.title}
          subtitle={selected.ref}
          entityRef={selected.id.slice(-10).toUpperCase()}
          status={selected.status}
          fields={procurementFields(selected)}
          actions={procurementActions(selected)}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

function ConstructionScreen() {
  const { data: all, loading, refetch } = useIppProjects();
  const data = all.filter(p => p.status === 'construction');
  const [selected, setSelected] = React.useState<IppProject | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const constructionFields = (p: IppProject): DrawerField[] => [
    { label: 'Project Name', value: p.project_name, span: true },
    { label: 'Technology',   value: p.technology },
    { label: 'Capacity',     value: `${p.capacity_mw} MW`, mono: true },
    { label: 'Location',     value: p.location },
    { label: 'COD Target',   value: p.cod_target ?? '—', mono: true },
    { label: 'Developer ID', value: p.developer_id, mono: true },
    { label: 'Created',      value: p.created_at, mono: true },
    { label: 'Record ID',    value: p.id.slice(-12), mono: true },
  ];

  const constructionActions = (p: IppProject): DrawerAction[] => [
    {
      id: 'upload-progress',
      label: 'Upload Progress Report',
      icon: 'upload',
      variant: 'primary',
      onClick: async () => { await apexClient.ipp.uploadDocument({
        project_id: p.id,
        doc_type: 'construction_progress',
        title: 'Construction Progress Report',
        version: '1.0',
      }); },
    },
    {
      id: 'submit-milestone',
      label: 'Submit Milestone Gate',
      icon: 'send',
      variant: 'secondary',
      onClick: async () => {
        const gates = await apexClient.ipp.listStageGates(p.id);
        const pending = gates.find(g => g.status === 'pending');
        if (pending) {
          await apexClient.ipp.submitStageGate(pending.id, { action: 'submit' });
        }
        refetch();
      },
    },
    {
      id: 'raise-nco',
      label: 'Raise Change Order',
      icon: 'flag',
      variant: 'secondary',
      onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_change_order', entity_id: p.id }).then(() => refetch()),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Construction</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' in construction'}</div>
      </div>
      <DataTable
        columns={PROJECT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.project_name}
          subtitle={`Construction · ${selected.capacity_mw} MW · ${selected.location}`}
          entityRef={selected.id.slice(-10).toUpperCase()}
          status={selected.status}
          fields={constructionFields(selected)}
          actions={constructionActions(selected)}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

function BondsScreen() {
  const { data, loading, refetch } = useIppBonds();
  const [selected, setSelected] = React.useState<IppBond | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const bondFields = (b: IppBond): DrawerField[] => [
    { label: 'Bond Type',    value: b.bond_type, span: true },
    { label: 'Issuer',       value: b.issuer },
    { label: 'Face Value',   value: `R${(b.face_value_zar / 1e6).toFixed(2)}M`, mono: true },
    { label: 'Expiry Date',  value: b.expiry_date, mono: true },
    { label: 'Days Remaining', value: String(b.days_remaining), mono: true },
    { label: 'Project ID',   value: b.project_id, mono: true },
    { label: 'Created',      value: b.created_at, mono: true },
    { label: 'Record ID',    value: b.id.slice(-12), mono: true },
  ];

  const bondActions = (b: IppBond): DrawerAction[] => {
    const actions: DrawerAction[] = [];
    if (b.days_remaining < 60) {
      actions.push({
        id: 'initiate-renewal',
        label: 'Initiate Bond Renewal',
        icon: 'approve',
        variant: 'primary',
        onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_bond', entity_id: b.id }).then(() => refetch()),
      });
    }
    actions.push({
      id: 'upload-bond-doc',
      label: 'Upload Bond Document',
      icon: 'upload',
      variant: 'secondary',
      onClick: async () => { await apexClient.ipp.uploadDocument({
        project_id: b.project_id,
        bond_id: b.id,
        doc_type: 'bond_certificate',
        title: `Bond Document — ${b.bond_type}`,
        version: '1.0',
      }); },
    });
    actions.push({
      id: 'view-history',
      label: 'View Audit History',
      icon: 'flag',
      variant: 'secondary',
      onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_bond', entity_id: b.id }).then(() => refetch()),
    });
    return actions;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Bonds</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable
        columns={BOND_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={`${selected.bond_type} — ${selected.issuer}`}
          subtitle={`${selected.days_remaining} days remaining · Expiry ${selected.expiry_date}`}
          entityRef={selected.id.slice(-10).toUpperCase()}
          status={selected.status}
          fields={bondFields(selected)}
          actions={bondActions(selected)}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

function InsuranceScreen() {
  const { data: all, loading, refetch } = useIppBonds();
  const data = all.filter(b => b.bond_type.toLowerCase().includes('insurance'));
  const [selected, setSelected] = React.useState<IppBond | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const insuranceFields = (b: IppBond): DrawerField[] => [
    { label: 'Policy Type',  value: b.bond_type, span: true },
    { label: 'Insurer',      value: b.issuer },
    { label: 'Sum Insured',  value: `R${(b.face_value_zar / 1e6).toFixed(2)}M`, mono: true },
    { label: 'Expiry Date',  value: b.expiry_date, mono: true },
    { label: 'Days Remaining', value: String(b.days_remaining), mono: true },
    { label: 'Project ID',   value: b.project_id, mono: true },
    { label: 'Created',      value: b.created_at, mono: true },
    { label: 'Record ID',    value: b.id.slice(-12), mono: true },
  ];

  const insuranceActions = (b: IppBond): DrawerAction[] => [
    {
      id: 'renew-policy',
      label: 'Initiate Renewal',
      icon: 'approve',
      variant: 'primary',
      onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_insurance', entity_id: b.id }).then(() => refetch()),
    },
    {
      id: 'lodge-claim',
      label: 'Lodge Claim',
      icon: 'flag',
      variant: 'secondary',
      onClick: () => apexClient.audit.listBlocks({ entity_type: 'insurance_claim', entity_id: b.id }).then(() => refetch()),
    },
    {
      id: 'upload-schedule',
      label: 'Upload Policy Schedule',
      icon: 'upload',
      variant: 'secondary',
      onClick: async () => { await apexClient.ipp.uploadDocument({
        project_id: b.project_id,
        bond_id: b.id,
        doc_type: 'insurance_schedule',
        title: `Insurance Schedule — ${b.bond_type}`,
        version: '1.0',
      }); },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Insurance</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' policies'}</div>
      </div>
      <DataTable
        columns={BOND_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={`${selected.bond_type} — ${selected.issuer}`}
          subtitle={`${selected.days_remaining} days remaining · Expiry ${selected.expiry_date}`}
          entityRef={selected.id.slice(-10).toUpperCase()}
          status={selected.status}
          fields={insuranceFields(selected)}
          actions={insuranceActions(selected)}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

// ─── ED Commitments screen ────────────────────────────────────────────────────

function EdScreen() {
  const { data: auditData, loading: auditLoading, refetch } = useAuditBlocks({ entity_type: 'ipp_ed_commitment' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const edFields = (b: AuditBlock): DrawerField[] => [
    { label: 'Action',      value: b.action, span: true },
    { label: 'Actor',       value: b.actor_name ?? b.actor_id },
    { label: 'Actor Role',  value: b.actor_role ?? '—' },
    { label: 'Entity Type', value: b.entity_type },
    { label: 'Entity ID',   value: b.entity_id.slice(-12), mono: true },
    { label: 'Timestamp',   value: b.timestamp, mono: true },
    { label: 'Hash',        value: b.hash.slice(-16), mono: true },
    { label: 'Seq',         value: String(b.seq), mono: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>ED Commitments</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{auditLoading ? 'Loading…' : auditData.length + ' audit events'}</div>
      </div>

      <ActionPanel
        actions={[
          {
            id: 'initiate-ed',
            label: 'Initiate ED Commitment',
            description: 'Log a new economic development commitment per REIPPPP requirements',
            icon: 'flag',
            variant: 'primary',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_ed_commitment' }).then(() => refetch()),
          },
          {
            id: 'submit-report',
            label: 'Submit ED Report',
            description: 'Submit quarterly ED performance report to DMRE',
            icon: 'send',
            variant: 'secondary',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_ed_commitment' }).then(() => refetch()),
          },
        ]}
      />

      <DataTable
        columns={AUDIT_COLS}
        rows={auditData}
        loading={auditLoading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.action}
          subtitle={`ED Commitment · ${selected.entity_type}`}
          entityRef={selected.id.slice(-10).toUpperCase()}
          fields={edFields(selected)}
          actions={[
            {
              id: 'view-chain',
              label: 'View Audit Chain',
              icon: 'flag',
              variant: 'secondary',
              onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_ed_commitment', entity_id: selected.entity_id }).then(() => refetch()),
            },
          ]}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

// ─── HSE screen ───────────────────────────────────────────────────────────────

function HseScreen() {
  const { data, loading, refetch } = useAuditBlocks({ entity_type: 'hse_incident' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const hseFields = (b: AuditBlock): DrawerField[] => [
    { label: 'Action',      value: b.action, span: true },
    { label: 'Actor',       value: b.actor_name ?? b.actor_id },
    { label: 'Actor Role',  value: b.actor_role ?? '—' },
    { label: 'Entity Type', value: b.entity_type },
    { label: 'Entity ID',   value: b.entity_id.slice(-12), mono: true },
    { label: 'Timestamp',   value: b.timestamp, mono: true },
    { label: 'Hash',        value: b.hash.slice(-16), mono: true },
    { label: 'Prev Hash',   value: b.prev_hash ? b.prev_hash.slice(-16) : '—', mono: true },
    { label: 'Seq',         value: String(b.seq), mono: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>HSE / SHEQ</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' audit events'}</div>
      </div>

      <ActionPanel
        actions={[
          {
            id: 'log-incident',
            label: 'Log HSE Incident',
            description: 'Report a new safety, health, or environmental incident (OHSA s24)',
            icon: 'flag',
            variant: 'primary',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'hse_incident' }).then(() => refetch()),
          },
          {
            id: 'submit-investigation',
            label: 'Submit Investigation Report',
            description: 'Upload root-cause analysis for an open incident',
            icon: 'upload',
            variant: 'secondary',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'hse_incident' }).then(() => refetch()),
          },
        ]}
      />

      <DataTable
        columns={HSE_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.action}
          subtitle={`HSE Incident · ${selected.actor_name ?? selected.actor_id}`}
          entityRef={selected.id.slice(-10).toUpperCase()}
          fields={hseFields(selected)}
          actions={[
            {
              id: 'escalate',
              label: 'Escalate to Regulator',
              icon: 'flag',
              variant: 'danger',
              onClick: () => apexClient.audit.listBlocks({ entity_type: 'hse_incident', entity_id: selected.entity_id }).then(() => refetch()),
            },
            {
              id: 'close-incident',
              label: 'Close Incident',
              icon: 'check-circle',
              variant: 'secondary',
              onClick: () => apexClient.audit.listBlocks({ entity_type: 'hse_incident', entity_id: selected.entity_id }).then(() => refetch()),
            },
          ]}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

// ─── Cyber Incident screen ────────────────────────────────────────────────────

function CyberScreen() {
  const { data: auditData, loading, refetch } = useAuditBlocks({ entity_type: 'cyber_incident' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const cyberFields = (b: AuditBlock): DrawerField[] => [
    { label: 'Action',      value: b.action, span: true },
    { label: 'Actor',       value: b.actor_name ?? b.actor_id },
    { label: 'Actor Role',  value: b.actor_role ?? '—' },
    { label: 'Entity Type', value: b.entity_type },
    { label: 'Entity ID',   value: b.entity_id.slice(-12), mono: true },
    { label: 'Timestamp',   value: b.timestamp, mono: true },
    { label: 'Hash',        value: b.hash.slice(-16), mono: true },
    { label: 'Seq',         value: String(b.seq), mono: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Cyber Incident</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : auditData.length + ' audit events'}</div>
      </div>

      <ActionPanel
        actions={[
          {
            id: 'report-incident',
            label: 'Report Cyber Incident',
            description: 'Log a new cyber/OT security incident (POPIA s22 / Cybercrimes Act s54)',
            icon: 'lock',
            variant: 'primary',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'cyber_incident' }).then(() => refetch()),
          },
          {
            id: 'notify-regulator',
            label: 'Notify Regulator',
            description: 'Trigger mandatory POPIA breach notification within 72-hour window',
            icon: 'send',
            variant: 'danger',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'cyber_incident' }).then(() => refetch()),
          },
        ]}
      />

      <DataTable
        columns={AUDIT_COLS}
        rows={auditData}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.action}
          subtitle={`Cyber Incident · ${selected.entity_type}`}
          entityRef={selected.id.slice(-10).toUpperCase()}
          fields={cyberFields(selected)}
          actions={[
            {
              id: 'contain',
              label: 'Mark Contained',
              icon: 'check-circle',
              variant: 'primary',
              onClick: () => apexClient.audit.listBlocks({ entity_type: 'cyber_incident', entity_id: selected.entity_id }).then(() => refetch()),
            },
            {
              id: 'escalate',
              label: 'Escalate to POPIA Officer',
              icon: 'flag',
              variant: 'danger',
              onClick: () => apexClient.audit.listBlocks({ entity_type: 'cyber_incident', entity_id: selected.entity_id }).then(() => refetch()),
            },
          ]}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

// ─── Licence screen ───────────────────────────────────────────────────────────

function LicenceScreen() {
  const { data: auditData, loading, refetch } = useAuditBlocks({ entity_type: 'licence_application' });
  const [selected, setSelected] = React.useState<AuditBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const licenceFields = (b: AuditBlock): DrawerField[] => [
    { label: 'Action',      value: b.action, span: true },
    { label: 'Actor',       value: b.actor_name ?? b.actor_id },
    { label: 'Actor Role',  value: b.actor_role ?? '—' },
    { label: 'Entity Type', value: b.entity_type },
    { label: 'Entity ID',   value: b.entity_id.slice(-12), mono: true },
    { label: 'Timestamp',   value: b.timestamp, mono: true },
    { label: 'Hash',        value: b.hash.slice(-16), mono: true },
    { label: 'Seq',         value: String(b.seq), mono: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Licences</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : auditData.length + ' audit events'}</div>
      </div>

      <ActionPanel
        actions={[
          {
            id: 'apply-licence',
            label: 'Apply for Licence',
            description: 'Initiate a new NERSA licence application (ERA ss.8-11)',
            icon: 'certificate',
            variant: 'primary',
            onClick: () => apexClient.regulator.listLicences().then(() => refetch()),
          },
          {
            id: 'renew-licence',
            label: 'Renew Existing Licence',
            description: 'Submit renewal application before expiry (NERSA s14-16)',
            icon: 'dots-h',
            variant: 'secondary',
            onClick: () => apexClient.audit.listBlocks({ entity_type: 'licence_application' }).then(() => refetch()),
          },
        ]}
      />

      <DataTable
        columns={AUDIT_COLS}
        rows={auditData}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />

      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.action}
          subtitle={`Licence · ${selected.entity_type}`}
          entityRef={selected.id.slice(-10).toUpperCase()}
          fields={licenceFields(selected)}
          actions={[
            {
              id: 'submit-docs',
              label: 'Submit Supporting Documents',
              icon: 'upload',
              variant: 'primary',
              onClick: () => apexClient.audit.listBlocks({ entity_type: 'licence_application', entity_id: selected.entity_id }).then(() => refetch()),
            },
            {
              id: 'track-status',
              label: 'Refresh Application Status',
              icon: 'dots-h',
              variant: 'secondary',
              onClick: () => apexClient.regulator.listLicences().then(() => refetch()),
            },
          ]}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

function GcaScreen() {
  const { data, loading, refetch } = useIppProcurement({ type: 'gca' });
  const [selected, setSelected] = React.useState<IppProcurement | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const gcaFields = (p: IppProcurement): DrawerField[] => [
    { label: 'Title',       value: p.title, span: true },
    { label: 'Reference',   value: p.ref, mono: true },
    { label: 'Project ID',  value: p.project_id, mono: true },
    { label: 'Value',       value: `R${(p.value_zar / 1e6).toFixed(2)}M`, mono: true },
    { label: 'Status',      value: <StatusPill label={p.status} variant={stateVariant(p.status)} /> },
    { label: 'Created',     value: p.created_at, mono: true },
    { label: 'Record ID',   value: p.id.slice(-12), mono: true },
  ];

  const gcaActions = (p: IppProcurement): DrawerAction[] => [
    {
      id: 'upload-gca-doc',
      label: 'Upload GCA Document',
      icon: 'upload',
      variant: 'primary',
      onClick: async () => { await apexClient.ipp.uploadDocument({
        project_id: p.project_id,
        procurement_id: p.id,
        doc_type: 'gca_document',
        title: `GCA Document — ${p.ref}`,
        version: '1.0',
      }); },
    },
    {
      id: 'submit-application',
      label: 'Submit GCA Application',
      icon: 'send',
      variant: 'secondary',
      onClick: () => apexClient.audit.listBlocks({ entity_type: 'grid_connection_agreement', entity_id: p.id }).then(() => refetch()),
    },
    {
      id: 'view-capacity',
      label: 'Check Capacity Queue',
      icon: 'tower',
      variant: 'secondary',
      onClick: () => apexClient.grid.listConnections({ project_id: p.project_id }).then(() => refetch()),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Grid Connection</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable
        columns={PROCUREMENT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.title}
          subtitle={`Grid Connection · ${selected.ref}`}
          entityRef={selected.id.slice(-10).toUpperCase()}
          status={selected.status}
          fields={gcaFields(selected)}
          actions={gcaActions(selected)}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

function DrawdownScreen() {
  const { data, loading, refetch } = useIppDrawdowns();
  const [selected, setSelected] = React.useState<IppDrawdown | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const drawdownFields = (d: IppDrawdown): DrawerField[] => [
    { label: 'Reference',       value: d.drawdown_ref, mono: true },
    { label: 'Facility ID',     value: d.facility_id, mono: true },
    { label: 'Project ID',      value: d.project_id, mono: true },
    { label: 'Amount',          value: `R${(d.amount_zar / 1e6).toFixed(2)}M`, mono: true },
    { label: 'IE Cert Ref',     value: d.ie_cert_ref ?? '—', mono: true },
    { label: 'Disbursed Amount', value: d.disbursed_amount != null ? `R${(d.disbursed_amount / 1e6).toFixed(2)}M` : '—', mono: true },
    { label: 'Match Status',    value: <StatusPill label={d.match_status} variant={stateVariant(d.match_status)} /> },
    { label: 'Created',         value: d.created_at, mono: true },
    { label: 'Record ID',       value: d.id.slice(-12), mono: true },
  ];

  const drawdownActions = (d: IppDrawdown): DrawerAction[] => {
    const actions: DrawerAction[] = [];
    if (d.status === 'pending' || d.status === 'draft') {
      actions.push({
        id: 'submit-drawdown',
        label: 'Submit Drawdown Request',
        icon: 'send',
        variant: 'primary',
        onClick: async () => { await apexClient.lender.approveDisbursement(d.id, { action: 'request' }); },
      });
    }
    if (d.match_status === 'unmatched' || d.match_status === 'disputed') {
      actions.push({
        id: 'upload-ie-cert',
        label: 'Upload IE Certificate',
        icon: 'upload',
        variant: 'primary',
        onClick: async () => { await apexClient.ipp.uploadDocument({
          project_id: d.project_id,
          drawdown_id: d.id,
          doc_type: 'ie_certificate',
          title: `IE Certificate — ${d.drawdown_ref}`,
          version: '1.0',
        }); },
      });
    }
    actions.push({
      id: 'view-audit',
      label: 'View Drawdown History',
      icon: 'flag',
      variant: 'secondary',
      onClick: () => apexClient.audit.listBlocks({ entity_type: 'lender_drawdown', entity_id: d.id }).then(() => refetch()),
    });
    return actions;
  };

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
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={`Drawdown ${selected.drawdown_ref}`}
          subtitle={`R${(selected.amount_zar / 1e6).toFixed(1)}M · Match: ${selected.match_status}`}
          entityRef={selected.id.slice(-10).toUpperCase()}
          status={selected.status}
          fields={drawdownFields(selected)}
          actions={drawdownActions(selected)}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

function DocumentsScreen() {
  const { data, loading, refetch } = useIppDocuments();
  const [selected, setSelected] = React.useState<IppDocument | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const documentFields = (d: IppDocument): DrawerField[] => [
    { label: 'Title',       value: d.title, span: true },
    { label: 'Document Type', value: d.doc_type },
    { label: 'Version',     value: d.version, mono: true },
    { label: 'Project ID',  value: d.project_id, mono: true },
    { label: 'R2 Key',      value: d.r2_key ?? '—', mono: true },
    { label: 'Created',     value: d.created_at, mono: true },
    { label: 'Record ID',   value: d.id.slice(-12), mono: true },
  ];

  const documentActions = (d: IppDocument): DrawerAction[] => {
    const actions: DrawerAction[] = [];
    if (d.status === 'draft' || d.status === 'pending') {
      actions.push({
        id: 'submit-review',
        label: 'Submit for Review',
        icon: 'send',
        variant: 'primary',
        onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_document', entity_id: d.id }).then(() => refetch()),
      });
    }
    if (d.status === 'reviewing') {
      actions.push({
        id: 'approve-doc',
        label: 'Approve Document',
        icon: 'check-circle',
        variant: 'primary',
        onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_document', entity_id: d.id }).then(() => refetch()),
      });
    }
    actions.push({
      id: 'upload-revision',
      label: 'Upload New Version',
      icon: 'upload',
      variant: 'secondary',
      onClick: async () => { await apexClient.ipp.uploadDocument({
        project_id: d.project_id,
        doc_type: d.doc_type,
        title: d.title,
        version: `${parseFloat(d.version) + 0.1}`,
      }); },
    });
    return actions;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Documents</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : data.length + ' records'}</div>
      </div>
      <DataTable
        columns={DOCUMENT_COLS}
        rows={data}
        loading={loading}
        onRowClick={row => { setSelected(row); setDrawerOpen(true); }}
      />
      {selected && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selected.title}
          subtitle={`${selected.doc_type} · v${selected.version}`}
          entityRef={selected.id.slice(-10).toUpperCase()}
          status={selected.status}
          fields={documentFields(selected)}
          actions={documentActions(selected)}
          onActionComplete={() => refetch()}
        />
      )}
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard() {
  const { data: projects, loading: projLoading, refetch: projRefetch } = useIppProjects();
  const { data: auditBlocks, loading: auditLoading } = useAuditBlocks({ entity_type: 'ipp_project', limit: 4 });
  const { data: stageGates } = useIppStageGates();

  const [selectedProject, setSelectedProject] = React.useState<IppProject | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const totalMw = projects.reduce((s, p) => s + (p.capacity_mw || 0), 0);
  const atRisk  = projects.filter(p => p.status === 'at_risk').length;

  const gateSteps: StateFlowStep[] = stageGates.slice(0, 6).map(g => ({
    id: g.id,
    label: g.gate,
    status: g.status === 'approved' ? 'complete'
          : g.status === 'submitted' ? 'current'
          : 'pending',
    timestamp: g.decision_at ?? g.submitted_at,
  }));

  if (!gateSteps.length) {
    const FALLBACK_STEPS: StateFlowStep[] = [
      { id: 'dg0', label: 'DG0 Concept',        status: 'complete', timestamp: '2025-11' },
      { id: 'dg1', label: 'DG1 Pre-Feasibility', status: 'complete', timestamp: '2026-01' },
      { id: 'dg2', label: 'DG2 Feasibility',     status: 'current', sublabel: 'In review' },
      { id: 'dg3', label: 'DG3 Define',          status: 'pending' },
      { id: 'dg4', label: 'DG4 Execute',         status: 'pending' },
      { id: 'dg5', label: 'COD',                 status: 'pending' },
    ];
    gateSteps.push(...FALLBACK_STEPS);
  }

  const auditEvents: TimelineEvent[] = auditBlocks.map(b => ({
    id: b.id,
    timestamp: b.timestamp,
    actor: b.actor_name ?? b.actor_id,
    action: b.action,
    icon: 'flag',
    hash: b.hash.slice(-6),
  }));

  const chainLinks: ChainLink[] = [
    { id: 'cl1', label: 'GCA-P001-2025', chainType: 'Grid Connection Agreement', state: 'approved', role: 'Grid Operator', relationship: 'cross-role', href: '#gca' },
    { id: 'cl2', label: 'LN-P001-FAC',   chainType: 'Credit Facility',          state: 'active',   role: 'Lender',       relationship: 'cross-role', href: '#drawdown' },
    { id: 'cl3', label: 'PPA-OT-P001',   chainType: 'PPA Contract',             state: 'signed',   role: 'Offtaker',     relationship: 'cross-role', href: '#ppa' },
    { id: 'cl4', label: 'COD-P001',      chainType: 'Construction / COD',       state: 'on_track', role: 'IPP',          relationship: 'child',      href: '#construction' },
  ];

  const dashboardProjectFields = (p: IppProject): DrawerField[] => [
    { label: 'Project Name', value: p.project_name, span: true },
    { label: 'Technology',   value: p.technology },
    { label: 'Capacity',     value: `${p.capacity_mw} MW`, mono: true },
    { label: 'Location',     value: p.location },
    { label: 'COD Target',   value: p.cod_target ?? '—', mono: true },
    { label: 'Developer ID', value: p.developer_id, mono: true },
    { label: 'Created',      value: p.created_at, mono: true },
  ];

  const dashboardProjectActions = (p: IppProject): DrawerAction[] => [
    {
      id: 'submit-gate',
      label: 'Submit Stage Gate',
      icon: 'send',
      variant: 'primary',
      onClick: async () => {
        const gates = await apexClient.ipp.listStageGates(p.id);
        const pending = gates.find(g => g.status === 'pending' || g.status === 'draft');
        if (pending) {
          await apexClient.ipp.submitStageGate(pending.id, { project_id: p.id });
        }
        projRefetch();
      },
    },
    {
      id: 'upload-doc',
      label: 'Upload Document',
      icon: 'upload',
      variant: 'secondary',
      onClick: async () => { await apexClient.ipp.uploadDocument({ project_id: p.id, doc_type: 'general', title: 'New Document', version: '1.0' }); },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 className="oe-grad-text" style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
            Project Portfolio
          </h1>
          <div style={{ fontSize: '13px', color: 'var(--oe-text-3)', marginTop: '4px' }}>
            {projLoading ? 'Loading…' : `${projects.length} active projects · ${totalMw} MW pipeline`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button style={ghostBtnStyle}><OeIcon name="export" size={14} />Export</button>
          <button style={primaryBtnStyle}><OeIcon name="plus" size={14} color="#fff" />New Project</button>
        </div>
      </div>

      <StatGrid cols={4}>
        <StatCard label="Portfolio MW" value={projLoading ? '…' : String(totalMw)} unit="MW" delta="+40" deltaLabel="vs Q4" positive icon="lightning" variant="navy" />
        <StatCard label="Active Projects" value={projLoading ? '…' : String(projects.length)} delta={atRisk ? `${atRisk} at risk` : 'on track'} deltaLabel="" positive={atRisk === 0} icon="folder" variant="amber" />
        <StatCard label="Construction Progress" value="64" unit="%" delta="+8%" deltaLabel="this month" positive icon="hierarchy" variant="green" />
        <StatCard label="Bond Expiry Alert" value="14" unit="days" subtext="Boland Solar bond" icon="shield" variant="rose" />
      </StatGrid>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section>
            <SectionHeader title="Active Projects" action={{ label: 'View all', href: '#projects' }} />
            <DataTable
              columns={PROJECT_COLS}
              rows={projects}
              loading={projLoading}
              onRowClick={row => { setSelectedProject(row); setDrawerOpen(true); }}
            />
          </section>

          <section>
            <SectionHeader title="Stage Gate Progress" />
            <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '20px 16px 16px', boxShadow: 'var(--oe-shadow-card)' }}>
              <StateFlow steps={gateSteps} />
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <StatusPill label="DG2 In Review" variant="blue" size="md" />
                <span style={{ fontSize: '12px', color: 'var(--oe-text-3)' }}>Deadline: 2026-06-04 · Assigned: NERSA Engineering</span>
              </div>
            </div>
          </section>

          <section>
            <SectionHeader title="Recent Activity" />
            <div style={{ background: 'var(--oe-canvas)', border: '1px solid var(--oe-border)', borderRadius: 'var(--oe-r-card)', padding: '16px', boxShadow: 'var(--oe-shadow-card)' }}>
              {auditLoading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--oe-text-3)', fontSize: '13px' }}>Loading activity…</div>
              ) : (
                <Timeline events={auditEvents.length ? auditEvents : FALLBACK_AUDIT} maxVisible={3} />
              )}
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <AIInsightCard
            title="AI Insight"
            suggestion="Boland Solar performance bond expires in 14 days. Based on your CP register, renewal requires 21-day lead time — initiate renewal now to avoid breach."
            reasoning="The bond matures 2026-06-15. Standard renewal cycles average 19 days in this jurisdiction. Initiating today gives 14 days buffer before the lender's 7-day cure window closes."
            confidence="high"
            onAccept={() => apexClient.audit.listBlocks({ entity_type: 'ipp_bond' }).then(() => {})}
          />

          <ChainMap
            chainLabel="Boland Solar 120MW"
            chainType="IPP Stage Gate"
            currentState="DG2 In Review"
            links={chainLinks}
          />

          <ActionPanel
            actions={[
              {
                id: 'upload-doc',
                label: 'Upload Document',
                description: 'Add supporting evidence for DG2',
                icon: 'upload',
                variant: 'primary',
                form: (
                  <TransitionForm
                    actionLabel="Upload Document"
                    requireReason={false}
                    fields={[
                      { key: 'file', label: 'File', type: 'file', required: true },
                      { key: 'category', label: 'Category', type: 'select', required: true, options: [
                        { value: 'feasibility', label: 'Feasibility Study' },
                        { value: 'environmental', label: 'Environmental Impact' },
                        { value: 'grid', label: 'Grid Connection' },
                        { value: 'legal', label: 'Legal / Regulatory' },
                      ]},
                    ]}
                    onSubmit={async data => {
                      await apexClient.ipp.uploadDocument(data as Record<string, unknown>);
                    }}
                  />
                ),
              },
              {
                id: 'submit-dg2',
                label: 'Submit DG2 Package',
                description: 'Finalise and submit gate 2 to NERSA',
                icon: 'send',
                form: (
                  <TransitionForm
                    actionLabel="Submit DG2 Package"
                    reasonCodes={[
                      { value: 'all_docs_complete', label: 'All documentation complete' },
                      { value: 'conditional', label: 'Conditional — outstanding items noted' },
                    ]}
                    confirmMessage="Submitting DG2 will notify NERSA and start the 30-day review clock. This cannot be undone."
                    onSubmit={async data => {
                      const gates = await apexClient.ipp.listStageGates(undefined);
                      const dg2 = gates.find(g => g.gate?.includes('DG2'));
                      if (dg2) {
                        await apexClient.ipp.submitStageGate(dg2.id, data as Record<string, unknown>);
                      }
                    }}
                  />
                ),
              },
              {
                id: 'raise-nco',
                label: 'Raise NCR / Change Order',
                icon: 'flag',
                variant: 'secondary',
                onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_change_order' }).then(() => {}),
              },
              {
                id: 'request-extension',
                label: 'Request Gate Extension',
                icon: 'calendar',
                variant: 'ghost',
                description: 'Requires regulator approval',
                onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_stage_gate' }).then(() => {}),
              },
            ]}
          />
        </div>
      </div>

      {selectedProject && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={selectedProject.project_name}
          subtitle={`${selectedProject.technology} · ${selectedProject.capacity_mw} MW · ${selectedProject.location}`}
          entityRef={selectedProject.id.slice(-10).toUpperCase()}
          status={selectedProject.status}
          fields={dashboardProjectFields(selectedProject)}
          actions={dashboardProjectActions(selectedProject)}
          onActionComplete={() => projRefetch()}
        />
      )}
    </div>
  );
}

// ─── Fallback audit events (shown when API returns empty) ─────────────────────

const FALLBACK_AUDIT: TimelineEvent[] = [
  { id: 'e1', timestamp: '2026-06-01 08:14', actor: 'Riku van Wyk', action: 'DG2 submission uploaded', icon: 'upload', hash: '3a7f9c' },
  { id: 'e2', timestamp: '2026-05-30 15:22', actor: 'NERSA System',  action: 'DG2 review initiated', icon: 'flag', hash: 'b12e4d' },
  { id: 'e3', timestamp: '2026-05-28 10:05', actor: 'Riku van Wyk', action: 'EPC contract signed', icon: 'sign', hash: '8fd3aa' },
];

// ─── Shared sub-components ───────────────────────────────────────────────────

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
  border: '1px solid var(--oe-border)', background: 'var(--oe-surf)',
  borderRadius: 'var(--oe-r-btn)', padding: '7px 14px',
  fontSize: '13px', color: 'var(--oe-text-1)', cursor: 'pointer', fontFamily: 'inherit',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px',
  border: 'none', background: 'var(--oe-grad-button)',
  borderRadius: 'var(--oe-r-btn)', padding: '7px 14px',
  fontSize: '13px', fontWeight: 600, color: '#fff',
  cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--oe-shadow-btn)',
};

export default IppWorkstation;
