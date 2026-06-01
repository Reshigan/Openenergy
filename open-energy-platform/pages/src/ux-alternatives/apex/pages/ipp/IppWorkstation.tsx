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
  useIppRisks, useIppIssues, useIppEvm, useCurrentUser,
} from '../../lib/hooks';
import { apexClient, IppProject, IppStageGate, IppBond, IppProcurement, IppDrawdown, IppDocument, AuditBlock, IppRisk, IppIssue, IppEvm, GridCurtailment } from '../../lib/client';
import { api } from '../../../../lib/api';

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
        { id: 'ipp-procurement',  label: 'Procurement',         href: '#procurement',  icon: 'blueprint' },
        { id: 'ipp-construction', label: 'Construction',        href: '#construction', icon: 'hierarchy' },
        { id: 'ipp-dfr',          label: 'Field Reports W97',   href: '#dfr',          icon: 'report' },
        { id: 'ipp-bonds',        label: 'Bonds',               href: '#bonds',        icon: 'shield',    badge: 1, badgeVariant: 'rose' },
        { id: 'ipp-insurance',    label: 'Insurance',           href: '#insurance',    icon: 'checklist' },
        { id: 'ipp-handover',     label: 'Handover Dossier W100', href: '#handover',   icon: 'checklist' },
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
        { id: 'ipp-gca',          label: 'Grid Connection',      href: '#gca',          icon: 'tower' },
        { id: 'ipp-drawdown',     label: 'Drawdowns',            href: '#drawdown',     icon: 'dollar' },
        { id: 'ipp-outage',       label: 'Planned Outages',      href: '#outage',       icon: 'clock' },
        { id: 'ipp-energization', label: 'Energization',         href: '#energization', icon: 'lightning' },
        { id: 'ipp-documents',    label: 'Documents',            href: '#documents',    icon: 'folder' },
        { id: 'ipp-revenue',      label: 'Revenue Assurance',    href: '#revenue',      icon: 'chart-bar' },
        { id: 'ipp-grid-code',    label: 'Grid Code Status',     href: '#gridcode',     icon: 'bolt' },
        { id: 'ipp-disposition',  label: 'Regulator Dispositions', href: '#disposition', icon: 'gavel' },
        { id: 'ipp-cap-alloc',    label: 'Capacity Allocation',  href: '#cap-alloc',    icon: 'layers' },
      ],
    },
    {
      id: 'carbon',
      label: 'Carbon',
      items: [
        { id: 'ipp-carbon-reg',   label: 'Carbon Credits',       href: '#carbon-reg',   icon: 'leaf' },
      ],
    },
    {
      id: 'controls',
      label: 'Project Controls',
      items: [
        { id: 'ipp-evm',      label: 'Cost EVM',        href: '#evm',      icon: 'bar-chart' },
        { id: 'ipp-risks',    label: 'Risk Register',   href: '#risks',    icon: 'alert-triangle' },
        { id: 'ipp-issues',   label: 'Issues',          href: '#issues',   icon: 'checklist' },
        { id: 'ipp-progress',  label: 'Progress Claims',    href: '#progress',  icon: 'dollar' },
        { id: 'ipp-tq',        label: 'TQ Log',             href: '#tq',        icon: 'send' },
        { id: 'ipp-proj-risk', label: 'Project Risk W92',   href: '#proj-risk', icon: 'alert-triangle' },
        { id: 'ipp-submittal',     label: 'Submittals/RFI W96',   href: '#submittal',     icon: 'report' },
        { id: 'ipp-rfi',           label: 'RFI Management W116',  href: '#rfi',           icon: 'report' },
        { id: 'ipp-change-orders', label: 'Change Orders W117',   href: '#change-orders', icon: 'gear' },
        { id: 'ipp-punch',         label: 'Punch List W98',       href: '#punch',         icon: 'checklist' },
        { id: 'ipp-itp',           label: 'Inspection & Test W99', href: '#itp',          icon: 'shield' },
        { id: 'ipp-wbs',           label: 'WBS/Gantt W112',       href: '#wbs',           icon: 'hierarchy' },
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
  | 'ed' | 'hse' | 'cyber' | 'licence' | 'gca' | 'drawdown' | 'documents'
  | 'outage' | 'energization' | 'risks' | 'issues' | 'evm' | 'progress' | 'tq'
  | 'revenue' | 'gridcode' | 'disposition' | 'carbon-reg' | 'cap-alloc'
  | 'proj-risk' | 'submittal' | 'punch' | 'itp'
  | 'dfr' | 'handover' | 'wbs'
  | 'rfi' | 'change-orders';

// ─── Main component ──────────────────────────────────────────────────────────

export function IppWorkstation() {
  const { data: me } = useCurrentUser();
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard');

  const SCREEN_LABELS: Record<Screen, string> = {
    dashboard: 'Dashboard', projects: 'Projects', gates: 'Stage Gates', analytics: 'Analytics & Reports',
    procurement: 'Procurement', construction: 'Construction', bonds: 'Bonds', insurance: 'Insurance',
    ed: 'ED Commitments', hse: 'HSE / SHEQ', cyber: 'Cyber Incident', licence: 'Licences',
    gca: 'Grid Connection', drawdown: 'Drawdowns', documents: 'Documents',
    outage: 'Planned Outages', energization: 'Connection Energization',
    risks: 'Risk Register', issues: 'Issue Log', evm: 'Cost EVM',
    progress: 'Progress Claims', tq: 'TQ Log',
    revenue: 'Revenue Assurance', gridcode: 'Grid Code Status', disposition: 'Regulator Dispositions',
    'carbon-reg': 'Carbon Credits', 'cap-alloc': 'Capacity Allocation',
    'proj-risk': 'Project Risk W92', submittal: 'Submittals / RFI W96',
    punch: 'Punch List W98', itp: 'Inspection & Test W99',
    dfr: 'Field Reports W97', handover: 'Handover Dossier W100', wbs: 'WBS/Gantt W112',
    rfi: 'RFI Management W116', 'change-orders': 'Change Orders W117',
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
    'ipp-documents':     () => setActiveScreen('documents'),
    'ipp-outage':        () => setActiveScreen('outage'),
    'ipp-energization':  () => setActiveScreen('energization'),
    'ipp-evm':           () => setActiveScreen('evm'),
    'ipp-risks':         () => setActiveScreen('risks'),
    'ipp-issues':        () => setActiveScreen('issues'),
    'ipp-progress':      () => setActiveScreen('progress'),
    'ipp-tq':            () => setActiveScreen('tq'),
    'ipp-reports':       () => setActiveScreen('analytics'),
    'ipp-revenue':       () => setActiveScreen('revenue'),
    'ipp-grid-code':     () => setActiveScreen('gridcode'),
    'ipp-disposition':   () => setActiveScreen('disposition'),
    'ipp-carbon-reg':    () => setActiveScreen('carbon-reg'),
    'ipp-cap-alloc':     () => setActiveScreen('cap-alloc'),
    'ipp-proj-risk':     () => setActiveScreen('proj-risk'),
    'ipp-submittal':      () => setActiveScreen('submittal'),
    'ipp-rfi':            () => setActiveScreen('rfi'),
    'ipp-change-orders':  () => setActiveScreen('change-orders'),
    'ipp-punch':          () => setActiveScreen('punch'),
    'ipp-itp':           () => setActiveScreen('itp'),
    'ipp-dfr':           () => setActiveScreen('dfr'),
    'ipp-handover':      () => setActiveScreen('handover'),
    'ipp-wbs':           () => setActiveScreen('wbs'),
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
      userName={me?.name ?? 'User'}
      userEmail={me?.email ?? ''}
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
       : activeScreen === 'documents'    ? <DocumentsScreen />
       : activeScreen === 'outage'       ? <OutageScreen />
       : activeScreen === 'energization' ? <EnergizationScreen />
       : activeScreen === 'risks'        ? <RisksScreen />
       : activeScreen === 'issues'       ? <IssuesScreen />
       : activeScreen === 'evm'          ? <EvmScreen />
       : activeScreen === 'progress'     ? <ProgressScreen />
       : activeScreen === 'tq'           ? <TqScreen />
       : activeScreen === 'revenue'      ? <RevenueScreen />
       : activeScreen === 'gridcode'     ? <GridCodeScreen />
       : activeScreen === 'disposition'  ? <DispositionScreen />
       : activeScreen === 'carbon-reg'   ? <CarbonRegScreen />
       : activeScreen === 'cap-alloc'    ? <CapAllocScreen />
       : activeScreen === 'proj-risk'   ? <ProjRiskScreen />
       : activeScreen === 'submittal'   ? <SubmittalScreen />
       : activeScreen === 'punch'       ? <PunchScreen />
       : activeScreen === 'itp'         ? <ItpScreen />
       : activeScreen === 'dfr'         ? <DfrScreen />
       : activeScreen === 'handover'    ? <HandoverScreen />
       : activeScreen === 'wbs'          ? <WbsScreen />
       : activeScreen === 'rfi'          ? <RfiScreen />
       : activeScreen === 'change-orders'? <ChangeOrdersScreen />
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
      <AIInsightCard
        title="Portfolio Health: 2 Projects Behind Critical Path"
        suggestion="Kalahari Solar 500MW is 18 days behind on the grid connection agreement (W28) — the GCA must be signed before the COD milestone on 30 Sep 2026. Perdekraal Wind 200MW has a delayed IE certificate for drawdown 3 (W21). Both require escalation this week to protect the portfolio's contracted COD dates."
        reasoning="REIPPPP Implementation Agreement §4.1: COD delays beyond 90 days of the contracted date trigger a penalty of 0.5% of the equity contribution per day. For Kalahari Solar at R850M equity, that's R4.25M/day after the grace period. The GCA bottleneck is the longest-lead item — NTCSA approval takes 45-60 days once the formal application is submitted."
        confidence="high"
        onAccept={() => {}}
      />
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
      <AIInsightCard
        title="Stage Gate DG2 — 3 Open Conditions Blocking Approval"
        suggestion="Kalahari Solar 500MW DG2 (Financial Close readiness) has 3 open conditions: (1) lender credit committee approval pending (W53), (2) DSCR sensitivity model not IE-certified, (3) EPC contract final negotiation incomplete. DG2 is on the critical path — Financial Close cannot proceed until it's approved. Target DG2 closure by 15 Jun 2026."
        reasoning="The stage gate acts as an internal assurance checkpoint before committing to full Financial Close costs (legal, financial advisory, registration fees ~R18M). Each condition has an owner and a clear deliverable. The lender credit committee is the longest lead — Nedbank's project finance committee sits on the third Thursday of each month."
        confidence="high"
        onAccept={() => {}}
      />
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
      <AIInsightCard
        title="RFP-2026-001 — Bid Evaluation Deadline in 8 Days"
        suggestion="RFP-2026-001 (EPC contractor for Kalahari Solar Phase 2, R1.4B) received 3 bids by the closing date. The bid evaluation committee has 8 days remaining to complete technical and commercial scoring before the preferred bidder recommendation must go to the board. Bid B (Aveng-Strabag JV) has a 12% price premium but the only performance bond above the REIPPPP threshold."
        reasoning="REIPPPP Procurement Rules §8.4: the bid evaluation report must be submitted to the Bid Evaluation Committee and approved before a preferred bidder can be notified. Notifying a bidder without the BEC approval constitutes a procurement irregularity. The 8-day window includes 3 days for the legal team's commercial review — scoring must be complete by day 5."
        confidence="medium"
        onAccept={() => {}}
      />
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
      <AIInsightCard
        title="Milestone 4 (60% Physical Completion) — IE Site Visit Overdue"
        suggestion="COD-2026-KALA-004 (60% physical completion milestone) is 11 days overdue for the IE certification site visit. The Independent Engineer has requested rescheduling to 10 Jun — but that pushes the milestone drawdown notice (R185M) past the 30 Jun long-stop date in the facility agreement. Request an emergency IE visit this week to protect the drawdown timeline."
        reasoning="The facility agreement §7.3 requires IE certification within 5 business days of the milestone being achieved. A milestone that cannot be certified before the long-stop date is treated as a missed milestone, which gives the lenders the right to freeze the drawdown facility. The R185M drawdown funds the next 2 months of construction payments — a freeze creates an immediate liquidity crisis."
        confidence="high"
        onAccept={() => {}}
      />
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
      <AIInsightCard
        suggestion="Kalahari Solar 500MW performance bond (R42M, Hannover Re) expires 14 Aug 2026 — 74 days away. REIPPPP requires continuous bond coverage through COD+12 months. Renewal process with ABSA requires 30-45 business days minimum. Initiate now to avoid a coverage gap."
        reasoning="REIPPPP Schedule 3 §4.2: a lapse in performance bond coverage constitutes a material breach of the Implementation Agreement. NERSA can suspend the generation licence pending remediation. ABSA's Sovereign Risk desk requires an updated construction progress report (>60% physical completion) before renewing — commissioning timeline is the bottleneck."
        title="Performance Bond Expiry Warning"
        onAccept={() => {}}
      />
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
      <AIInsightCard
        suggestion="INS-2026-0004 (transformer failure, R8.2M claim) qualifies for the 'natural causes' CAR sub-limit which carries a 0.5% deductible vs the standard 2% for mechanical failure. Reclassifying the root cause from 'mechanical failure' to 'lightning overvoltage' (supported by the SAGIT weather data in the IE report) would reduce the deductible from R164K to R41K."
        reasoning="FSCA Claim File §3.1.1: cause classification determines the applicable sub-limit and deductible schedule. The IE report references 'surge protection failure following a lightning event at 14:32 on 12 Feb' — this supports overvoltage classification. The insurer cannot reclassify unilaterally once a claim type is registered; the IPP must formally request reclassification within 21 days of claim submission."
        title="CAR Policy Deductible Optimisation Opportunity"
        onAccept={() => {}}
      />
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

      <AIInsightCard
        suggestion="Kalahari Solar 500MW is tracking R4.2M below the Q1 2026 ED disbursement target (R18.4M committed, R14.2M disbursed). The top shortfall is the skills development sub-category (STEM bursaries: 14 vs 20 committed). IPPO cure window closes in 11 days — submit a revised disbursement plan with evidence before that to avoid DMRE penalty assessment."
        reasoning="REIPPPP BBBEE Schedule §6.4: quarterly ED shortfalls trigger a cure notice from IPPO. Failure to remediate within the 30-day cure window converts the shortfall into a contractual penalty calculated at 1.5× the deficit amount. The STEM bursary gap is recoverable within the window — 6 additional bursaries × R280K each = R1.68M; the remaining R2.52M gap requires a top-up to the local enterprise development fund."
        title="ED Commitment Q1 2026 — R4.2M Shortfall Risk"
        onAccept={() => {}}
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

      <AIInsightCard
        suggestion="HSE-2026-0002 (fall from height, Lost Time Injury, Kalahari site) was lodged 5 days ago. OHSA §24 requires submission of a preliminary investigation report to the DoEL within 7 days of the incident. Assign the Site Safety Manager as investigating officer today to meet the deadline — draft report template pre-populated from incident log is ready."
        reasoning="OHSA §24(1): any incident resulting in a Lost Time Injury must be formally investigated, with a preliminary report to the Department of Employment and Labour within 7 days. Late submission carries a ZAR50,000 fine per day and can trigger a site suspension order during the investigation period. The safety manager's investigation cadence (typically 2 days for draft) leaves no margin."
        title="OHSA §24 Preliminary Investigation — 7-Day Deadline Approaching"
        onAccept={() => {}}
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

      <AIInsightCard
        suggestion="CYBER-2026-0001 (SCADA HMI unauthorised access, 12:00 yesterday) has reached the POPIA notification assessment gate. Personal data of 6 grid operators may have been exposed (name, operator ID, access credentials). POPIA §22 requires notification to the Information Regulator within 72 hours of becoming aware. Clock started 12:00 yesterday — 24 hours remaining."
        reasoning="POPIA §22(1): responsible parties must notify the Information Regulator 'as soon as reasonably possible' after becoming aware of a personal information breach. The '72 hours' standard is derived from the Regulator's Guidance Note (March 2023) aligning SA practice with GDPR Art. 33. Late notification carries administrative penalties up to R10M or imprisonment, and creates personal liability for the Information Officer."
        title="POPIA §22 Notification — 72-Hour Deadline Active"
        onAccept={() => {}}
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

      <AIInsightCard
        suggestion="Licence LIC-2024-G-0011 (Kalahari Solar 500MW, Generation) is 127 days from expiry. The NERSA renewal evidence pack requires 7 categories of documentation; 2 remain outstanding: the updated financial model (IE-certified) and the 5-year OPEX forecast. Both documents are typically prepared by independent engineers — initiate the IE mandate immediately to allow 45 days for preparation and 14 days for Council review."
        reasoning="ERA §14: licence renewal applications must be submitted at least 90 days before expiry with the full evidence pack. A submission with missing documentation is returned as 'incomplete' — NERSA's current processing backlog means an incomplete submission returned at day 60 before expiry leaves insufficient time for resubmission. An unlicensed facility cannot sell electricity under REIPPPP — it constitutes an automatic PPA termination event under most contract forms."
        title="Section 14 Renewal — Evidence Pack Completeness Check"
        onAccept={() => {}}
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
      <AIInsightCard
        title="GCA Technical Schedule — NTCSA Earthing Study Pending"
        suggestion="GCA-2026-KALA (Kalahari 500MW grid connection agreement) is stalled at the 'Technical Assessment' stage. NTCSA requires a site-specific earthing study (IEC 60364) before approving the connection schedule. The study has not been commissioned — initiate the appointment of an accredited earthing engineer this week. NTCSA's review takes 30 days once the study is received."
        reasoning="NERSA Grid Code §C-1.3.4: all grid connection agreements above 50MW require an approved earthing study as a precondition for the connection schedule. The earthing study itself takes 3-4 weeks. With a 30-day NTCSA review and a 14-day GCA drafting period, the total remaining GCA timeline is 7-8 weeks — critically impacting the COD schedule if not started immediately."
        confidence="high"
        onAccept={() => {}}
      />
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
      <AIInsightCard
        suggestion="DD-2026-0004 (R185M, 35% physical completion milestone) is currently at the IE certification gate. The Independent Engineer's last site visit was 19 days ago — the IE has requested a fresh site visit before issuing the certificate. Scheduling the visit before end of this week ensures the drawdown stays within the 45-day drawdown notice window. Delaying beyond 14 Jun triggers an extension fee under the facility agreement."
        reasoning="The facility agreement §7.4: if the drawdown notice expires before the IE certification is received, a new drawdown notice must be issued — carrying a R45,000 reissuance fee and resetting the 15-business-day notice period. The construction cash-flow model assumes drawdown 4 funds land by 20 Jun; a 2-week delay creates a R45M construction payment gap that cannot be covered by the equity bridge."
        title="Drawdown 4 — IE Certificate Gate At Risk"
        onAccept={() => {}}
      />
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

// ─── New screens: Grid & Finance ─────────────────────────────────────────────

type IppOutageRow = { id: string; ref: string; plant_name: string; outage_type: string; requested_start: string; approved_start: string | null; duration_hours: number | null; chain_status: string; reason: string };
type IppEnergRow  = { id: string; ref: string; project_name: string; tier: string; chain_status: string; connection_ready_at: string | null; commercial_operation_at: string | null };

const OUTAGE_COLS: Column<IppOutageRow>[] = [
  { key: 'ref',             header: 'Reference',    width: '150px', mono: true },
  { key: 'plant_name',      header: 'Plant',        width: '200px' },
  { key: 'outage_type',     header: 'Type',         width: '110px' },
  { key: 'requested_start', header: 'Requested',    width: '150px', mono: true },
  { key: 'approved_start',  header: 'Approved',     width: '150px', mono: true, render: r => <span>{r.approved_start ?? '—'}</span> },
  { key: 'chain_status',    header: 'Status',       width: '130px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
];

function OutageScreen() {
  const [rows, setRows] = React.useState<IppOutageRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<IppOutageRow | null>(null);
  React.useEffect(() => {
    apexClient.grid.listPlannedOutages().then(d => { setRows(d as IppOutageRow[]); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <AIInsightCard
        title="Planned Outage PON-2026-004 — Resubmission Required"
        suggestion="PON-2026-004 (transformer maintenance, Kalahari Solar, 15 Jun) was returned by NTCSA with a 'technical concerns' status. NTCSA requires an updated outage impact assessment addressing N-1 security during the maintenance window. The resubmission deadline is 5 Jun — 4 days away. Engage the grid engineer to prepare the N-1 analysis and resubmit."
        reasoning="NERSA Grid Code §8.6: planned outage notifications must include an N-1 security assessment demonstrating that the transmission system remains secure during the outage window. NTCSA will not approve outage slots without it. A missed resubmission deadline means the outage is automatically rejected — rescheduling to Q3 2026 would miss the preferred pre-summer maintenance window."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<IppOutageRow> rows={rows} columns={OUTAGE_COLS} loading={loading} onRowClick={r => setSel(r)} />
      {sel && (
        <DetailDrawer open onClose={() => setSel(null)}
          title={sel.ref} subtitle={sel.plant_name}
          entityRef={sel.ref} status={sel.chain_status}
          fields={[
            { label: 'Plant',           value: sel.plant_name },
            { label: 'Type',            value: sel.outage_type },
            { label: 'Requested Start', value: sel.requested_start, mono: true },
            { label: 'Approved Start',  value: sel.approved_start ?? '—', mono: true },
            { label: 'Duration (h)',    value: sel.duration_hours != null ? String(sel.duration_hours) : '—', mono: true },
            { label: 'Reason',          value: sel.reason, span: true },
          ]}
          actions={[
            { id: 'cancel', label: 'Cancel Outage', icon: 'reject', variant: 'danger',
              onClick: () => apexClient.grid.cancelOutage(sel.id, {}).then(() => setSel(null)) },
          ]}
        />
      )}
    </div>
  );
}

const ENERGIZATION_COLS: Column<IppEnergRow>[] = [
  { key: 'ref',                     header: 'Reference',   width: '150px', mono: true },
  { key: 'project_name',            header: 'Project',     width: '220px' },
  { key: 'tier',                    header: 'Tier',        width: '90px' },
  { key: 'chain_status',            header: 'Status',      width: '140px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
  { key: 'connection_ready_at',     header: 'Ready',       width: '130px', mono: true, render: r => <span>{r.connection_ready_at ?? '—'}</span> },
  { key: 'commercial_operation_at', header: 'COD',         width: '130px', mono: true, render: r => <span>{r.commercial_operation_at ?? '—'}</span> },
];

function EnergizationScreen() {
  const [rows, setRows] = React.useState<IppEnergRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<IppEnergRow | null>(null);
  React.useEffect(() => {
    apexClient.grid.listCapacityAllocations().then(d => { setRows(d as IppEnergRow[]); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <AIInsightCard
        title="Commercial Operation Declaration — Outstanding NERSA Sign-Off"
        suggestion="COD commissioning test sequence is complete (all 6 hold points passed). The Commercial Operation Declaration requires NERSA's Section 34 generation licence endorsement before it can be issued. The endorsement application was submitted 19 days ago — NERSA's statutory turnaround is 20 business days. Follow up with NERSA today to confirm the endorsement is in the final approval queue."
        reasoning="ERA §34: electricity generation above 1MW requires a licence endorsement before commercial operation can be declared. Without the endorsement, the offtaker cannot accept the COD declaration, the PPA payment mechanism does not activate, and the construction lenders' conversion to term loan is blocked. A 1-day delay in COD at R1.28/kWh costs R15.36M/day in lost PPA revenue."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<IppEnergRow> rows={rows} columns={ENERGIZATION_COLS} loading={loading} onRowClick={r => setSel(r)} />
      {sel && (
        <DetailDrawer open onClose={() => setSel(null)}
          title={sel.ref} subtitle={sel.project_name}
          entityRef={sel.ref} status={sel.chain_status}
          fields={[
            { label: 'Project',              value: sel.project_name, span: true },
            { label: 'Tier',                 value: sel.tier },
            { label: 'Connection Ready',     value: sel.connection_ready_at ?? '—', mono: true },
            { label: 'Commercial Operation', value: sel.commercial_operation_at ?? '—', mono: true },
          ]}
          actions={[
            { id: 'submit-program', label: 'Submit Energization Program', icon: 'send', variant: 'primary',
              onClick: () => apexClient.audit.listBlocks({ entity_type: 'connection_energization', entity_id: sel.id }).then(() => setSel(null)) },
          ]}
        />
      )}
    </div>
  );
}

// ─── New screens: Project Controls ─────────────────────────────────────────────

const RISK_COLS: Column<IppRisk>[] = [
  { key: 'id',           header: 'ID',          width: '100px', mono: true, render: row => <span>{row.id.slice(-8).toUpperCase()}</span> },
  { key: 'title',        header: 'Risk',         width: '260px' },
  { key: 'severity',     header: 'Severity',    width: '100px', render: row => <StatusPill label={row.severity} variant={stateVariant(row.severity)} /> },
  { key: 'probability',  header: 'Prob.',        width: '70px',  align: 'right', mono: true },
  { key: 'impact',       header: 'Impact',       width: '70px',  align: 'right', mono: true },
  { key: 'status',       header: 'Status',       width: '120px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
];

function RisksScreen() {
  const { data, loading, refetch } = useIppRisks();
  const [sel, setSel] = React.useState<IppRisk | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <AIInsightCard
        title="Grid Curtailment Risk Elevated — 3 Active Risk Items"
        suggestion="ProjRisk-KALA-0014 (grid curtailment >20% in Q3 2026): the probability score has increased from Medium to High following NTCSA's load-flow study update. The mitigation action (BESS co-location to absorb curtailment) is still in design phase with a 60-day lead time. Update the risk register and escalate to the project steering committee."
        reasoning="REIPPPP Implementation Agreement §11.2: curtailment risk sits with the IPP unless a 'grid constraint curtailment' certificate is issued by NTCSA. Without the BESS mitigation in place, the revenue model assumption of <5% curtailment is at risk — a 20% curtailment rate reduces annual generation revenue by R28M (500MW × 20% × 2,100h × R1.28/kWh)."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<IppRisk> rows={data} columns={RISK_COLS} loading={loading} onRowClick={r => { setSel(r); setDrawerOpen(true); }} />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.title ?? sel.id}
          entityRef={sel.id.slice(-8).toUpperCase()}
          status={sel.status}
          fields={[
            { label: 'Severity',     value: sel.severity },
            { label: 'Probability',  value: String(sel.probability), mono: true },
            { label: 'Impact',       value: String(sel.impact), mono: true },
            { label: 'Owner',        value: sel.owner_id ?? '—', mono: true },
            { label: 'Project',      value: sel.project_id, mono: true },
            { label: 'Mitigation',   value: sel.mitigation_plan ?? '—', span: true },
            { label: 'Description',  value: sel.description ?? '—', span: true },
          ]}
          actions={[
            { id: 'audit', label: 'View Audit Trail', icon: 'checklist', variant: 'secondary',
              onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_risk', entity_id: sel.id }).then(() => { refetch(); setDrawerOpen(false); }) },
          ]}
        />
      )}
    </div>
  );
}

const ISSUE_COLS: Column<IppIssue>[] = [
  { key: 'id',          header: 'ID',        width: '100px', mono: true, render: row => <span>{row.id.slice(-8).toUpperCase()}</span> },
  { key: 'title',       header: 'Issue',     width: '260px' },
  { key: 'priority',    header: 'Priority',  width: '90px' },
  { key: 'assigned_to', header: 'Owner',     width: '140px', render: row => <span>{row.assigned_to ?? '—'}</span> },
  { key: 'status',      header: 'Status',    width: '120px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
];

function IssuesScreen() {
  const { data, loading, refetch } = useIppIssues();
  const [sel, setSel] = React.useState<IppIssue | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <AIInsightCard
        title="Open Issue ISS-2026-041 — Escalation Overdue by 4 Days"
        suggestion="ISS-2026-041 (EPC contractor milestone delay, Kalahari Phase 2) was created 18 days ago with a 14-day resolution target. The assigned owner has not updated the issue log since day 7. Per the project governance framework, issues overdue beyond 4 days must be escalated to the Project Director. Send an escalation notice today."
        reasoning="The project governance matrix requires issues affecting critical path activities to be resolved within 14 calendar days. ISS-2026-041 is on the critical path (EPC milestone delay feeds directly into the IE certification schedule). An unresolved critical path issue is a red flag for the next lender's technical advisor review and may trigger a formal query in the drawdown certification."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<IppIssue> rows={data} columns={ISSUE_COLS} loading={loading} onRowClick={r => { setSel(r); setDrawerOpen(true); }} />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.title ?? sel.id}
          entityRef={sel.id.slice(-8).toUpperCase()}
          status={sel.status}
          fields={[
            { label: 'Priority',   value: sel.priority ?? '—' },
            { label: 'Assigned',   value: sel.assigned_to ?? '—' },
            { label: 'Project',    value: sel.project_id, mono: true },
            { label: 'Created',    value: sel.created_at, mono: true },
          ]}
          actions={[
            { id: 'audit', label: 'View Audit Trail', icon: 'checklist', variant: 'secondary',
              onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_issue', entity_id: sel.id }).then(() => { refetch(); setDrawerOpen(false); }) },
          ]}
        />
      )}
    </div>
  );
}

const EVM_COLS: Column<IppEvm>[] = [
  { key: 'id',           header: 'ID',        width: '100px', mono: true, render: row => <span>{row.id.slice(-8).toUpperCase()}</span> },
  { key: 'project_name', header: 'Project',   width: '200px' },
  { key: 'data_date',    header: 'Data Date', width: '120px', mono: true },
  { key: 'bac_zar',      header: 'BAC',       width: '100px', align: 'right', mono: true, render: row => <span>R{(row.bac_zar / 1e6).toFixed(1)}M</span> },
  { key: 'ev_zar',       header: 'EV',        width: '100px', align: 'right', mono: true, render: row => <span>R{(row.ev_zar / 1e6).toFixed(1)}M</span> },
  { key: 'ac_zar',       header: 'AC',        width: '100px', align: 'right', mono: true, render: row => <span>R{(row.ac_zar / 1e6).toFixed(1)}M</span> },
  { key: 'spi',          header: 'SPI',       width: '70px',  align: 'right', mono: true, render: row => {
    const v = row.spi ?? 1; return <span style={{ color: v < 0.9 ? 'var(--oe-rose)' : v < 1 ? 'var(--oe-amber)' : 'var(--oe-green)' }}>{v.toFixed(2)}</span>;
  }},
  { key: 'cpi',          header: 'CPI',       width: '70px',  align: 'right', mono: true, render: row => {
    const v = row.cpi ?? 1; return <span style={{ color: v < 0.9 ? 'var(--oe-rose)' : v < 1 ? 'var(--oe-amber)' : 'var(--oe-green)' }}>{v.toFixed(2)}</span>;
  }},
];

function EvmScreen() {
  const { data, loading } = useIppEvm();
  const [sel, setSel] = React.useState<IppEvm | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <DataTable<IppEvm> rows={data} columns={EVM_COLS} loading={loading} onRowClick={r => { setSel(r); setDrawerOpen(true); }} />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={`EVM — ${sel.project_name}`}
          subtitle={`Data date: ${sel.data_date}`}
          entityRef={sel.id.slice(-8).toUpperCase()}
          status="active"
          fields={[
            { label: 'Project',  value: sel.project_name },
            { label: 'Data Date',value: sel.data_date, mono: true },
            { label: 'BAC',      value: `R${(sel.bac_zar / 1e6).toFixed(2)}M`, mono: true },
            { label: 'EV',       value: `R${(sel.ev_zar / 1e6).toFixed(2)}M`, mono: true },
            { label: 'AC',       value: `R${(sel.ac_zar / 1e6).toFixed(2)}M`, mono: true },
            { label: 'EAC',      value: `R${(sel.eac_zar / 1e6).toFixed(2)}M`, mono: true },
            { label: 'VAC',      value: `R${(sel.vac_zar / 1e6).toFixed(2)}M`, mono: true },
            { label: 'SPI',      value: sel.spi.toFixed(3), mono: true },
            { label: 'CPI',      value: sel.cpi.toFixed(3), mono: true },
          ]}
          actions={[]}
        />
      )}
    </div>
  );
}

// ─── Progress Claims screen ──────────────────────────────────────────────────

type ProgressRow = { id: string; ref?: string; project_id: string; claim_number?: number; period_end?: string; claimed_amount_zar?: number; certified_amount_zar?: number | null; status: string };

const PROGRESS_COLS: Column<ProgressRow>[] = [
  { key: 'ref',                 header: 'Reference',  width: '150px', mono: true, render: row => <span>{row.ref ?? row.id.slice(-10).toUpperCase()}</span> },
  { key: 'project_id',          header: 'Project',    width: '200px', mono: true },
  { key: 'claim_number',        header: 'Claim #',    width: '80px',  align: 'right', mono: true, render: row => <span>{row.claim_number ?? '—'}</span> },
  { key: 'period_end',          header: 'Period End', width: '120px', mono: true, render: row => <span>{row.period_end ?? '—'}</span> },
  { key: 'claimed_amount_zar',  header: 'Claimed',    width: '110px', align: 'right', mono: true, render: row => <span>{row.claimed_amount_zar != null ? `R${(row.claimed_amount_zar / 1e6).toFixed(1)}M` : '—'}</span> },
  { key: 'certified_amount_zar',header: 'Certified',  width: '110px', align: 'right', mono: true, render: row => <span>{row.certified_amount_zar != null ? `R${(row.certified_amount_zar / 1e6).toFixed(1)}M` : '—'}</span> },
  { key: 'status',              header: 'Status',     width: '130px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
];

function ProgressScreen() {
  const [rows, setRows] = React.useState<ProgressRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<ProgressRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  React.useEffect(() => {
    apexClient.ipp.listChangeOrders().then(d => { setRows(d as unknown as ProgressRow[]); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <AIInsightCard
        title="S-Curve: Kalahari Phase 2 is 8% Behind Planned Progress"
        suggestion="Physical progress at week 22: actual 47% vs planned 55%. The 8% deviation exceeds the 5% tolerance in the Project Controls Plan. Primary driver: concrete works delayed by 12 days due to supplier non-delivery. The EPC contractor's recovery plan (submitted day 19) claims catch-up by week 28 — review the recovery schedule before the next progress meeting."
        reasoning="The Project Controls Plan §4.2: deviations above 5% trigger a mandatory recovery plan requirement and a revised cash-flow forecast. The lenders' technical advisor monitors S-curve deviation at each drawdown certification — an 8% lag without an approved recovery plan can result in a certification being withheld. The recovery plan must be formally approved by the IE before it can be presented to lenders."
        confidence="medium"
        onAccept={() => {}}
      />
      <DataTable<ProgressRow> rows={rows} columns={PROGRESS_COLS} loading={loading} onRowClick={r => { setSel(r); setDrawerOpen(true); }} />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.ref ?? sel.id.slice(-10).toUpperCase()}
          subtitle={`Claim #${sel.claim_number ?? '—'}`}
          entityRef={sel.id.slice(-10).toUpperCase()}
          status={sel.status}
          fields={[
            { label: 'Project',          value: sel.project_id, mono: true },
            { label: 'Claim Number',     value: String(sel.claim_number ?? '—'), mono: true },
            { label: 'Period End',       value: sel.period_end ?? '—', mono: true },
            { label: 'Claimed Amount',   value: sel.claimed_amount_zar != null ? `R${(sel.claimed_amount_zar / 1e6).toFixed(2)}M` : '—', mono: true },
            { label: 'Certified Amount', value: sel.certified_amount_zar != null ? `R${(sel.certified_amount_zar / 1e6).toFixed(2)}M` : '—', mono: true },
          ]}
          actions={[
            { id: 'audit', label: 'View Audit Trail', icon: 'checklist', variant: 'secondary',
              onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_progress_claim', entity_id: sel.id }).then(() => setDrawerOpen(false)) },
          ]}
        />
      )}
    </div>
  );
}

// ─── TQ Log screen ───────────────────────────────────────────────────────────

type TqRow = { id: string; ref?: string; project_id: string; subject?: string; discipline?: string; urgency?: string; status: string; created_at: string };

const TQ_COLS: Column<TqRow>[] = [
  { key: 'ref',         header: 'TQ Ref',     width: '140px', mono: true, render: row => <span>{row.ref ?? row.id.slice(-10).toUpperCase()}</span> },
  { key: 'project_id',  header: 'Project',    width: '180px', mono: true },
  { key: 'subject',     header: 'Subject',    width: '260px', render: row => <span>{row.subject ?? '—'}</span> },
  { key: 'discipline',  header: 'Discipline', width: '110px', render: row => <span>{row.discipline ?? '—'}</span> },
  { key: 'urgency',     header: 'Urgency',    width: '90px',  render: row => <span>{row.urgency ?? '—'}</span> },
  { key: 'status',      header: 'Status',     width: '120px', render: row => <StatusPill label={row.status} variant={stateVariant(row.status)} /> },
  { key: 'created_at',  header: 'Raised',     width: '130px', mono: true },
];

function TqScreen() {
  const [rows, setRows] = React.useState<TqRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<TqRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  React.useEffect(() => {
    apexClient.ipp.listDocuments().then(d => { setRows(d as unknown as TqRow[]); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <AIInsightCard
        title="Subcontractor TQ-2026-011 Overdue — 11 Days Without Response"
        suggestion="Technical Query TQ-2026-011 (foundation design clarification, Block C, Kalahari Phase 2) was submitted to the design engineer 11 days ago with a 7-day response target. No response received. The concrete works in Block C are on hold pending the TQ response — 4 workers are on standby. Escalate to the EPC Project Manager and Design Engineer simultaneously."
        reasoning="The EPC contract §18.4: TQ response times exceeding 10 business days entitle the contractor to claim time extension and prolongation costs if the delay falls on the critical path. Block C foundation works are on the critical path — each day of standby costs approximately R180,000 in prolongation (labour, equipment, prelims) that the EPC can claim as a variation. Escalating now limits that exposure."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<TqRow> rows={rows} columns={TQ_COLS} loading={loading} onRowClick={r => { setSel(r); setDrawerOpen(true); }} />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.ref ?? sel.id.slice(-10).toUpperCase()}
          subtitle={sel.subject ?? '—'}
          entityRef={sel.id.slice(-10).toUpperCase()}
          status={sel.status}
          fields={[
            { label: 'Project',    value: sel.project_id, mono: true },
            { label: 'Subject',    value: sel.subject ?? '—', span: true },
            { label: 'Discipline', value: sel.discipline ?? '—' },
            { label: 'Urgency',    value: sel.urgency ?? '—' },
            { label: 'Raised',     value: sel.created_at, mono: true },
          ]}
          actions={[
            { id: 'audit', label: 'View Audit Trail', icon: 'checklist', variant: 'secondary',
              onClick: () => apexClient.audit.listBlocks({ entity_type: 'ipp_tq', entity_id: sel.id }).then(() => setDrawerOpen(false)) },
          ]}
        />
      )}
    </div>
  );
}

// ─── W79 Revenue Assurance screen ────────────────────────────────────────────

type RevenueRow = {
  id: string;
  ref: string;
  period: string;
  expected_mwh: number;
  metered_mwh: number;
  variance_pct: number;
  chain_status: string;
  leakage_class: string | null;
};

const REVENUE_COLS: Column<RevenueRow>[] = [
  { key: 'ref',          header: 'Reference',  width: '160px', mono: true },
  { key: 'period',       header: 'Period',     width: '120px', mono: true },
  { key: 'expected_mwh', header: 'Expected MWh', width: '120px', align: 'right', mono: true },
  { key: 'metered_mwh',  header: 'Metered MWh',  width: '120px', align: 'right', mono: true },
  { key: 'variance_pct', header: 'Variance',   width: '90px',  align: 'right', mono: true, render: r => <span>{r.variance_pct.toFixed(1)}%</span> },
  { key: 'chain_status', header: 'Status',     width: '140px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
];

function RevenueScreen() {
  const [rows, setRows] = React.useState<RevenueRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<RevenueRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    api.get<{ success: boolean; data: RevenueRow[] }>('/generation-revenue-assurance/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Revenue Assurance</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' records'}</div>
      </div>
      <AIInsightCard
        suggestion="Perdekraal East shows 2.3% settlement variance (R1.8M/month) classified as 'comms_gap' — SCADA telemetry dropout between 02:00-04:00 is causing systematic under-reading in settlement meter. Actual generation is 2.3% higher than settled volumes."
        reasoning="NERSA metering code §5.2: comms-gap losses must be formally quantified and a recovery claim submitted within 60 days of the affected period. The March 2026 gap is 71 days old — claim window expires in 19 days."
        title="Submit Recovery Claim"
        onAccept={() => {}}
      />
      <DataTable<RevenueRow>
        columns={REVENUE_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.ref}
          subtitle={`Period: ${sel.period} · Leakage: ${sel.leakage_class ?? 'unclassified'}`}
          entityRef={sel.id.slice(-10).toUpperCase()}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',    value: sel.ref, mono: true },
            { label: 'Period',       value: sel.period, mono: true },
            { label: 'Expected MWh', value: String(sel.expected_mwh), mono: true },
            { label: 'Metered MWh',  value: String(sel.metered_mwh), mono: true },
            { label: 'Variance',     value: `${sel.variance_pct.toFixed(2)}%`, mono: true },
            { label: 'Leakage Class', value: sel.leakage_class ?? '—' },
            { label: 'Status',       value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Record ID',    value: sel.id.slice(-12), mono: true },
          ]}
          actions={[
            {
              id: 'classify',
              label: 'Classify Leakage',
              icon: 'flag',
              variant: 'primary',
              onClick: () => api.post(`/generation-revenue-assurance/chain/${sel.id}/classify-leakage`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'recover',
              label: 'Issue Recovery Claim',
              icon: 'dollar',
              variant: 'secondary',
              onClick: () => api.post(`/generation-revenue-assurance/chain/${sel.id}/issue-recovery-claim`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'dispute',
              label: 'Raise Dispute',
              icon: 'send',
              variant: 'secondary',
              onClick: () => api.post(`/generation-revenue-assurance/chain/${sel.id}/raise-dispute`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
          ]}
          onActionComplete={() => {
            api.get<{ success: boolean; data: RevenueRow[] }>('/generation-revenue-assurance/chain')
              .then(r => setRows(r.data.data ?? [])).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// ─── W67 Grid Code Compliance screen (IPP read-view) ─────────────────────────

type GridCodeRow = {
  id: string;
  ref: string;
  non_conformance_type: string;
  chain_status: string;
  detected_at: string;
  tier: string;
};

const GRIDCODE_COLS: Column<GridCodeRow>[] = [
  { key: 'ref',                 header: 'Reference',         width: '160px', mono: true },
  { key: 'non_conformance_type', header: 'Non-Conformance',  width: '220px' },
  { key: 'chain_status',        header: 'Status',            width: '150px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
  { key: 'detected_at',         header: 'Detected',          width: '140px', mono: true },
  { key: 'tier',                header: 'Tier',              width: '100px' },
];

function GridCodeScreen() {
  const [rows, setRows] = React.useState<GridCodeRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<GridCodeRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    api.get<{ success: boolean; data: GridCodeRow[] }>('/grid-code-compliance/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Grid Code Status</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' records'}</div>
      </div>
      <AIInsightCard
        suggestion="Non-conformance NCF-2026-0019 (power factor <0.95 at point of common coupling, Jeffreys Bay 2) has been open for 34 days. Grid Code §C-8.3 disconnection escalation triggers at day 42. Reactive power compensation upgrade can resolve within 14 days at ~R380k."
        reasoning="Disconnection under Grid Code §C-8.3 triggers a NERSA public register entry and breach of the GCA. Lenders hold step-in rights that activate on GCA breach — proactive upgrade is significantly cheaper."
        title="Order Reactive Compensation"
        onAccept={() => {}}
      />
      <DataTable<GridCodeRow>
        columns={GRIDCODE_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.ref}
          subtitle={`Non-conformance · ${sel.non_conformance_type}`}
          entityRef={sel.id.slice(-10).toUpperCase()}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',         value: sel.ref, mono: true },
            { label: 'Non-Conformance',   value: sel.non_conformance_type, span: true },
            { label: 'Status',            value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Detected',          value: sel.detected_at, mono: true },
            { label: 'Tier',              value: sel.tier },
            { label: 'Record ID',         value: sel.id.slice(-12), mono: true },
          ]}
          actions={[
            {
              id: 'submit-cap',
              label: 'Submit Corrective Action Plan',
              icon: 'send',
              variant: 'primary',
              onClick: () => api.post(`/grid-code-compliance/chain/${sel.id}/submit-cap`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
          ]}
          onActionComplete={() => {
            api.get<{ success: boolean; data: GridCodeRow[] }>('/grid-code-compliance/chain')
              .then(r => setRows(r.data.data ?? [])).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// ─── W31 Regulator Dispositions screen (IPP read-view) ───────────────────────

type DispositionRow = {
  id: string;
  ref: string;
  matter_type: string;
  chain_status: string;
  lodged_at: string;
  tier: string;
};

const DISPOSITION_COLS: Column<DispositionRow>[] = [
  { key: 'ref',          header: 'Reference',   width: '160px', mono: true },
  { key: 'matter_type',  header: 'Matter',      width: '220px' },
  { key: 'chain_status', header: 'Status',      width: '150px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
  { key: 'lodged_at',    header: 'Lodged',      width: '140px', mono: true },
  { key: 'tier',         header: 'Tier',        width: '100px' },
];

function DispositionScreen() {
  const [rows, setRows] = React.useState<DispositionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<DispositionRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    api.get<{ success: boolean; data: DispositionRow[] }>('/disposition/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Regulator Dispositions</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' records'}</div>
      </div>
      <AIInsightCard
        title="NERSA Disposition — Section 11 Hearing Scheduled in 12 Days"
        suggestion="DISP-2026-003 (grid code compliance notice, Kalahari Solar 500MW) has progressed to the NERSA Section 11 adjudication hearing on 13 Jun 2026. Submissions are due 3 business days before the hearing (10 Jun). The legal team's draft submissions are 60% complete. Confirm the submissions will be ready by 9 Jun (1-day buffer) and that the technical expert witness is confirmed."
        reasoning="ERA §11: the Section 11 adjudication hearing is a formal regulatory proceeding. A missed submission deadline results in the regulator proceeding without the IPP's input — the disposition outcome becomes binding without the IPP's position on the record. The legal team needs to finalise the engineering expert's affidavit and submit it with the technical submissions."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<DispositionRow>
        columns={DISPOSITION_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.ref}
          subtitle={`Disposition · ${sel.matter_type}`}
          entityRef={sel.id.slice(-10).toUpperCase()}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',   value: sel.ref, mono: true },
            { label: 'Matter Type', value: sel.matter_type, span: true },
            { label: 'Status',      value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Lodged',      value: sel.lodged_at, mono: true },
            { label: 'Tier',        value: sel.tier },
            { label: 'Record ID',   value: sel.id.slice(-12), mono: true },
          ]}
          actions={[]}
        />
      )}
    </div>
  );
}

// ─── W37 Carbon Registration screen (IPP perspective) ────────────────────────

type CarbonRegRow = {
  id: string;
  ref: string;
  project_name: string;
  methodology: string;
  chain_status: string;
  submitted_at: string | null;
  tier: string;
};

const CARBON_REG_COLS: Column<CarbonRegRow>[] = [
  { key: 'ref',          header: 'Reference',   width: '160px', mono: true },
  { key: 'project_name', header: 'Project',     width: '220px' },
  { key: 'methodology',  header: 'Methodology', width: '160px' },
  { key: 'chain_status', header: 'Status',      width: '150px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
  { key: 'submitted_at', header: 'Submitted',   width: '130px', mono: true, render: r => <span>{r.submitted_at ?? '—'}</span> },
];

function CarbonRegScreen() {
  const [rows, setRows] = React.useState<CarbonRegRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<CarbonRegRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    apexClient.carbon.listProjects()
      .then(d => { setRows(d as unknown as CarbonRegRow[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Carbon Credits</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' registrations'}</div>
      </div>
      <AIInsightCard
        title="CDM Registration — CER Issuance Window Closing"
        suggestion="Kalahari Solar CDM project (Ref: SA-2024-CDM-0041) has completed the validation report but the registration application to the CDM Executive Board has not been submitted. The crediting period started 1 Jan 2024 — every month of delay costs approximately 1,250 tCO2e in CERs that cannot be claimed retroactively beyond a 2-year backstop."
        reasoning="CDM Modalities §10.1: CER issuance can only be claimed for periods after the date of registration, with a maximum retroactive claim of 2 years prior to registration. With the crediting period already running, each month of registration delay permanently forfeits ~1,250 tCO2e × EUR8.50 = EUR10,625 in CER value. Registration requires a completed validation report (done) and a Project Design Document (PDD) — both are ready."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<CarbonRegRow>
        columns={CARBON_REG_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.project_name}
          subtitle={`${sel.methodology} · ${sel.ref}`}
          entityRef={sel.id.slice(-10).toUpperCase()}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',   value: sel.ref, mono: true },
            { label: 'Project',     value: sel.project_name, span: true },
            { label: 'Methodology', value: sel.methodology },
            { label: 'Tier',        value: sel.tier },
            { label: 'Submitted',   value: sel.submitted_at ?? '—', mono: true },
            { label: 'Status',      value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Record ID',   value: sel.id.slice(-12), mono: true },
          ]}
          actions={[]}
        />
      )}
    </div>
  );
}

// ─── W92 Project Risk Chain screen ───────────────────────────────────────────

type ProjRiskRow = {
  id: string;
  ref: string;
  project_name: string;
  risk_title: string;
  risk_category: string;
  probability: string;
  impact_zar: number;
  chain_status: string;
  tier: string;
};

const PROJ_RISK_COLS: Column<ProjRiskRow>[] = [
  { key: 'ref',           header: 'Ref',          width: '140px', mono: true },
  { key: 'project_name',  header: 'Project',       width: '200px' },
  { key: 'risk_title',    header: 'Risk',          width: '240px' },
  { key: 'risk_category', header: 'Category',      width: '130px' },
  { key: 'probability',   header: 'Probability',   width: '110px' },
  { key: 'impact_zar',    header: 'Impact',        width: '110px', align: 'right', mono: true,
    render: r => <span>R{(r.impact_zar / 1e6).toFixed(1)}M</span> },
  { key: 'chain_status',  header: 'Status',        width: '140px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
];

function ProjRiskScreen() {
  const [rows, setRows] = React.useState<ProjRiskRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<ProjRiskRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    api.get<{ success: boolean; data: ProjRiskRow[] }>('/ipp/project-risk/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Project Risk W92</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' records'}</div>
      </div>
      <AIInsightCard
        title="High-Probability Risk Requires Lender Notification"
        suggestion="Risk R-014 (grid connection delay) has escalated from Medium to High in the last 30 days — probability increased from 25% to 55% based on recent NTCSA processing times. Adjusted expected impact is R185M (schedule delay + LD exposure)."
        reasoning="REIPPPP PA §22 requires High-probability risks affecting milestone dates to be notified to the Project Lender Group within 5 business days of reclassification."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<ProjRiskRow>
        columns={PROJ_RISK_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.risk_title}
          subtitle={`${sel.project_name} · ${sel.risk_category}`}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',     value: sel.ref, mono: true },
            { label: 'Project',       value: sel.project_name, span: true },
            { label: 'Risk Title',    value: sel.risk_title, span: true },
            { label: 'Category',      value: sel.risk_category },
            { label: 'Probability',   value: sel.probability },
            { label: 'Impact (ZAR)',  value: `R${(sel.impact_zar / 1e6).toFixed(2)}M`, mono: true },
            { label: 'Tier',          value: sel.tier },
            { label: 'Status',        value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Record ID',     value: sel.id.slice(-12), mono: true },
          ]}
          actions={[
            {
              id: 'escalate',
              label: 'Escalate Risk',
              icon: 'alert-triangle',
              variant: 'danger',
              onClick: () => api.post(`/ipp/project-risk/chain/${sel.id}/escalate`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'mitigate',
              label: 'Record Mitigation',
              icon: 'shield',
              variant: 'primary',
              onClick: () => api.post(`/ipp/project-risk/chain/${sel.id}/mitigate`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'close',
              label: 'Close Risk',
              icon: 'check-circle',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/project-risk/chain/${sel.id}/close`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
          ]}
          onActionComplete={() => {
            api.get<{ success: boolean; data: ProjRiskRow[] }>('/ipp/project-risk/chain')
              .then(r => setRows(r.data.data ?? [])).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// ─── W96 Submittal / RFI Chain screen ────────────────────────────────────────

type SubmittalRow = {
  id: string;
  ref: string;
  project_name: string;
  title: string;
  submittal_type: string;
  chain_status: string;
  submitted_at: string | null;
  review_due: string | null;
  tier: string;
};

const SUBMITTAL_COLS: Column<SubmittalRow>[] = [
  { key: 'ref',            header: 'Ref',           width: '140px', mono: true },
  { key: 'project_name',   header: 'Project',        width: '200px' },
  { key: 'title',          header: 'Title',          width: '260px' },
  { key: 'submittal_type', header: 'Type',           width: '130px' },
  { key: 'chain_status',   header: 'Status',         width: '140px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
  { key: 'review_due',     header: 'Review Due',     width: '130px', mono: true, render: r => <span>{r.review_due ?? '—'}</span> },
];

function SubmittalScreen() {
  const [rows, setRows] = React.useState<SubmittalRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<SubmittalRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    api.get<{ success: boolean; data: SubmittalRow[] }>('/ipp/submittal-rfi/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Submittals / RFI W96</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' records'}</div>
      </div>
      <AIInsightCard
        title="Deemed Approval Window Closing in 7 Days"
        suggestion="Drawing package SD-2026-047 (civil as-builts, 94 sheets) was submitted 21 days ago without a review response. Contract §8.4 allows a deemed-approval notice after 28 days of non-response — 7 days remaining to issue the notice and lock in approval."
        reasoning="Deemed approval prevents retrospective design rejection during commissioning. Failing to issue the notice within the contractual window waives the deemed-approval right for this package."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<SubmittalRow>
        columns={SUBMITTAL_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.title}
          subtitle={`${sel.project_name} · ${sel.submittal_type}`}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',      value: sel.ref, mono: true },
            { label: 'Project',        value: sel.project_name, span: true },
            { label: 'Title',          value: sel.title, span: true },
            { label: 'Type',           value: sel.submittal_type },
            { label: 'Tier',           value: sel.tier },
            { label: 'Submitted',      value: sel.submitted_at ?? '—', mono: true },
            { label: 'Review Due',     value: sel.review_due ?? '—', mono: true },
            { label: 'Status',         value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Record ID',      value: sel.id.slice(-12), mono: true },
          ]}
          actions={[
            {
              id: 'submit',
              label: 'Submit for Review',
              icon: 'send',
              variant: 'primary',
              onClick: () => api.post(`/ipp/submittal-rfi/chain/${sel.id}/submit`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'approve',
              label: 'Approve',
              icon: 'check-circle',
              variant: 'primary',
              onClick: () => api.post(`/ipp/submittal-rfi/chain/${sel.id}/approve`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'reject',
              label: 'Reject / Return',
              icon: 'x-circle',
              variant: 'danger',
              onClick: () => api.post(`/ipp/submittal-rfi/chain/${sel.id}/reject`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'resubmit',
              label: 'Resubmit',
              icon: 'dots-h',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/submittal-rfi/chain/${sel.id}/resubmit`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
          ]}
          onActionComplete={() => {
            api.get<{ success: boolean; data: SubmittalRow[] }>('/ipp/submittal-rfi/chain')
              .then(r => setRows(r.data.data ?? [])).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// ─── W98 Punch List Chain screen ──────────────────────────────────────────────

type PunchRow = {
  id: string;
  ref: string;
  project_name: string;
  description: string;
  discipline: string;
  severity: string;
  chain_status: string;
  due_date: string | null;
};

const PUNCH_COLS: Column<PunchRow>[] = [
  { key: 'ref',          header: 'Ref',         width: '140px', mono: true },
  { key: 'project_name', header: 'Project',      width: '200px' },
  { key: 'description',  header: 'Description',  width: '260px' },
  { key: 'discipline',   header: 'Discipline',   width: '120px' },
  { key: 'severity',     header: 'Severity',     width: '110px', render: r => <StatusPill label={r.severity} variant={stateVariant(r.severity)} /> },
  { key: 'chain_status', header: 'Status',       width: '130px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
  { key: 'due_date',     header: 'Due',          width: '120px', mono: true, render: r => <span>{r.due_date ?? '—'}</span> },
];

function PunchScreen() {
  const [rows, setRows] = React.useState<PunchRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<PunchRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    api.get<{ success: boolean; data: PunchRow[] }>('/ipp/punch-list/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Punch List W98</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' items'}</div>
      </div>
      <DataTable<PunchRow>
        columns={PUNCH_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.ref}
          subtitle={`${sel.project_name} · ${sel.discipline}`}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',    value: sel.ref, mono: true },
            { label: 'Project',      value: sel.project_name, span: true },
            { label: 'Description',  value: sel.description, span: true },
            { label: 'Discipline',   value: sel.discipline },
            { label: 'Severity',     value: <StatusPill label={sel.severity} variant={stateVariant(sel.severity)} /> },
            { label: 'Due Date',     value: sel.due_date ?? '—', mono: true },
            { label: 'Status',       value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Record ID',    value: sel.id.slice(-12), mono: true },
          ]}
          actions={[
            {
              id: 'resolve',
              label: 'Resolve Item',
              icon: 'check-circle',
              variant: 'primary',
              onClick: () => api.post(`/ipp/punch-list/chain/${sel.id}/resolve`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'reject',
              label: 'Reject Resolution',
              icon: 'x-circle',
              variant: 'danger',
              onClick: () => api.post(`/ipp/punch-list/chain/${sel.id}/reject`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'waive',
              label: 'Waive Item',
              icon: 'dots-h',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/punch-list/chain/${sel.id}/waive`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
          ]}
          onActionComplete={() => {
            api.get<{ success: boolean; data: PunchRow[] }>('/ipp/punch-list/chain')
              .then(r => setRows(r.data.data ?? [])).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// ─── W99 Inspection & Test Plan Chain screen ──────────────────────────────────

type ItpRow = {
  id: string;
  ref: string;
  project_name: string;
  test_description: string;
  discipline: string;
  chain_status: string;
  scheduled_date: string | null;
  safety_critical: boolean;
  tier: string;
};

const ITP_COLS: Column<ItpRow>[] = [
  { key: 'ref',              header: 'Ref',             width: '140px', mono: true },
  { key: 'project_name',     header: 'Project',          width: '200px' },
  { key: 'test_description', header: 'Test',             width: '240px' },
  { key: 'discipline',       header: 'Discipline',       width: '120px' },
  { key: 'chain_status',     header: 'Status',           width: '140px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
  { key: 'scheduled_date',   header: 'Scheduled',        width: '130px', mono: true, render: r => <span>{r.scheduled_date ?? '—'}</span> },
  { key: 'safety_critical',  header: 'Safety Critical',  width: '130px', render: r => <StatusPill label={r.safety_critical ? 'Yes' : 'No'} variant={r.safety_critical ? 'rose' : 'default'} /> },
];

function ItpScreen() {
  const [rows, setRows] = React.useState<ItpRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<ItpRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    api.get<{ success: boolean; data: ItpRow[] }>('/ipp/itp/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Inspection & Test W99</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' records'}</div>
      </div>
      <AIInsightCard
        title="ITP Hold Point HP-14 — Sign-Off Sequence Incomplete"
        suggestion="Inspection and Test Plan hold point HP-14 (medium-voltage switchgear FAT, SMA factory, Germany) requires sign-off from: (1) IPP QA representative, (2) Lender's Technical Advisor, (3) IE. Only (1) has signed off — (2) and (3) are outstanding. The switchgear ships in 8 days. If the FAT hold point is not released before shipment, the equipment must be held in a bonded warehouse at R45,000/week."
        reasoning="The ITP is a contractual quality control document — shipping equipment past a hold point without all required sign-offs is an IA breach and voids the equipment warranty. The LTA and IE need to review the FAT test report (submitted 4 days ago). Both have a 5-business-day review period — follow up today to confirm they are within their review window."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<ItpRow>
        columns={ITP_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.ref}
          subtitle={`${sel.project_name} · ${sel.discipline}`}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',        value: sel.ref, mono: true },
            { label: 'Project',          value: sel.project_name, span: true },
            { label: 'Test Description', value: sel.test_description, span: true },
            { label: 'Discipline',       value: sel.discipline },
            { label: 'Tier',             value: sel.tier },
            { label: 'Safety Critical',  value: sel.safety_critical ? 'Yes' : 'No' },
            { label: 'Scheduled Date',   value: sel.scheduled_date ?? '—', mono: true },
            { label: 'Status',           value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Record ID',        value: sel.id.slice(-12), mono: true },
          ]}
          actions={[
            {
              id: 'submit',
              label: 'Submit for Approval',
              icon: 'send',
              variant: 'primary',
              onClick: () => api.post(`/ipp/itp/chain/${sel.id}/submit`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'approve',
              label: 'Approve ITP',
              icon: 'check-circle',
              variant: 'primary',
              onClick: () => api.post(`/ipp/itp/chain/${sel.id}/approve`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'record-result',
              label: 'Record Test Result',
              icon: 'checklist',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/itp/chain/${sel.id}/record-result`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'void',
              label: 'Void ITP',
              icon: 'x-circle',
              variant: 'danger',
              onClick: () => api.post(`/ipp/itp/chain/${sel.id}/void`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
          ]}
          onActionComplete={() => {
            api.get<{ success: boolean; data: ItpRow[] }>('/ipp/itp/chain')
              .then(r => setRows(r.data.data ?? [])).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// ─── W58 Capacity Allocation screen (IPP read-view) ──────────────────────────

const CAP_ALLOC_COLS: Column<Record<string, unknown>>[] = [
  { key: 'ref',          header: 'Reference',  width: '160px', mono: true, render: r => <span>{String(r.ref ?? r.id ?? '').slice(-14) || '—'}</span> },
  { key: 'project_name', header: 'Project',    width: '220px', render: r => <span>{String(r.project_name ?? '—')}</span> },
  { key: 'tier',         header: 'Tier',       width: '100px', render: r => <span>{String(r.tier ?? '—')}</span> },
  { key: 'chain_status', header: 'Status',     width: '150px', render: r => <StatusPill label={String(r.chain_status ?? '—')} variant={stateVariant(String(r.chain_status ?? ''))} /> },
];

function CapAllocScreen() {
  const [rows, setRows] = React.useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<Record<string, unknown> | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    apexClient.grid.listCapacityAllocations()
      .then(d => { setRows(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Capacity Allocation</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' allocations'}</div>
      </div>
      <AIInsightCard
        title="Queue Position Leapfrog Opportunity"
        suggestion="Jeffreys Bay 2 (200 MW wind) is position #3 in the Northern Cape allocation queue behind 2 projects that have not activated GCA processes in 180+ days. Queue rules allow leapfrogging inactive applicants — accelerating the GCA application could move to position #1."
        reasoning="NTCSA 2024 Capacity Rules §7.4: queue positions lapse after 180 days of inactivity. Applicants may formally request queue position review if upstream holders are non-responsive."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<Record<string, unknown>>
        columns={CAP_ALLOC_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={String(sel.ref ?? sel.id ?? '—')}
          subtitle={`${String(sel.project_name ?? '—')} · Tier: ${String(sel.tier ?? '—')}`}
          entityRef={String(sel.id ?? '').slice(-10).toUpperCase() || '—'}
          status={String(sel.chain_status ?? '—')}
          fields={[
            { label: 'Reference',    value: String(sel.ref ?? '—'), mono: true },
            { label: 'Project',      value: String(sel.project_name ?? '—'), span: true },
            { label: 'Tier',         value: String(sel.tier ?? '—') },
            { label: 'Status',       value: <StatusPill label={String(sel.chain_status ?? '—')} variant={stateVariant(String(sel.chain_status ?? ''))} /> },
            { label: 'Applied At',   value: String(sel.applied_at ?? '—'), mono: true },
            { label: 'Allocated At', value: String(sel.capacity_allocated_at ?? '—'), mono: true },
            { label: 'Record ID',    value: String(sel.id ?? '').slice(-12), mono: true },
          ]}
          actions={[]}
        />
      )}
    </div>
  );
}

// ─── W97 Daily Field Report / Progress Diary screen ──────────────────────────

type DfrRow = {
  id: string;
  ref: string;
  report_date: string;
  site_name: string;
  weather_code: string;
  workers_on_site: number;
  activities_completed: number;
  chain_status: string;
  tier: string;
};

const DFR_COLS: Column<DfrRow>[] = [
  { key: 'ref',                  header: 'Ref',                width: '140px', mono: true },
  { key: 'report_date',          header: 'Report Date',        width: '130px', mono: true },
  { key: 'site_name',            header: 'Site',               width: '200px' },
  { key: 'weather_code',         header: 'Weather',            width: '100px' },
  { key: 'workers_on_site',      header: 'Workers',            width: '90px',  align: 'right', mono: true },
  { key: 'activities_completed', header: 'Activities',         width: '90px',  align: 'right', mono: true },
  { key: 'chain_status',         header: 'Status',             width: '140px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
];

function DfrScreen() {
  const [rows, setRows] = React.useState<DfrRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<DfrRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    api.get<{ success: boolean; data: DfrRow[] }>('/ipp/dfr/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Field Reports W97</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' reports'}</div>
      </div>
      <AIInsightCard
        title="AI Insight"
        suggestion="Yesterday's site report logged 0 workers on site for Kouga Phase 2 due to adverse weather (wind >15m/s). 3 consecutive weather stoppages this week — consider triggering the force majeure clause to protect the programme baseline."
        reasoning="REIPPPP PA §17.2 requires force majeure notification within 5 business days of the triggering event to preserve extension entitlement."
        confidence="medium"
        onAccept={() => {}}
      />
      <DataTable<DfrRow>
        columns={DFR_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.ref}
          subtitle={`${sel.site_name} · ${sel.report_date}`}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',           value: sel.ref, mono: true },
            { label: 'Report Date',         value: sel.report_date, mono: true },
            { label: 'Site',                value: sel.site_name, span: true },
            { label: 'Weather Code',        value: sel.weather_code },
            { label: 'Workers on Site',     value: String(sel.workers_on_site), mono: true },
            { label: 'Activities Completed', value: String(sel.activities_completed), mono: true },
            { label: 'Tier',                value: sel.tier },
            { label: 'Status',              value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Record ID',           value: sel.id.slice(-12), mono: true },
          ]}
          actions={[
            {
              id: 'submit-report',
              label: 'Submit Report',
              icon: 'send',
              variant: 'primary',
              onClick: () => api.post(`/ipp/dfr/chain/${sel.id}/submit-report`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'review',
              label: 'Review',
              icon: 'checklist',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/dfr/chain/${sel.id}/review`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'approve',
              label: 'Approve',
              icon: 'check-circle',
              variant: 'primary',
              onClick: () => api.post(`/ipp/dfr/chain/${sel.id}/approve`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'archive',
              label: 'Archive',
              icon: 'folder',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/dfr/chain/${sel.id}/archive`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
          ]}
          onActionComplete={() => {
            api.get<{ success: boolean; data: DfrRow[] }>('/ipp/dfr/chain')
              .then(r => setRows(r.data.data ?? [])).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// ─── W100 Mechanical/Electrical Handover Dossier screen ───────────────────────

type HandoverRow = {
  id: string;
  ref: string;
  system_name: string;
  handover_type: string;
  disciplines: string;
  punch_count: number;
  chain_status: string;
  cod_target: string | null;
  tier: string;
};

const HANDOVER_COLS: Column<HandoverRow>[] = [
  { key: 'ref',           header: 'Ref',           width: '140px', mono: true },
  { key: 'system_name',   header: 'System',        width: '220px' },
  { key: 'handover_type', header: 'Type',          width: '130px' },
  { key: 'disciplines',   header: 'Disciplines',   width: '160px' },
  { key: 'punch_count',   header: 'Punches',       width: '90px',  align: 'right', mono: true,
    render: r => <span style={{ color: r.punch_count > 0 ? 'var(--oe-rose)' : 'var(--oe-text-1)' }}>{r.punch_count}</span> },
  { key: 'chain_status',  header: 'Status',        width: '140px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
  { key: 'cod_target',    header: 'COD Target',    width: '130px', mono: true, render: r => <span>{r.cod_target ?? '—'}</span> },
];

function HandoverScreen() {
  const [rows, setRows] = React.useState<HandoverRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<HandoverRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    api.get<{ success: boolean; data: HandoverRow[] }>('/ipp/handover-dossier/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Handover Dossier W100</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' dossiers'}</div>
      </div>
      <AIInsightCard
        suggestion="Mechanical handover for Unit 3 transformer bay has 14 outstanding punch items — 3 classified as Category A (safety-critical). NERSA §C-5 COD milestone requires zero Category A punches before synchronisation. Current clear date estimate is 12 Jun, 8 days before COD target."
        reasoning="IEC 62271 §4.5 prohibits energisation of HV equipment with open Category A defects. Synchronisation with open punches voids the transformer warranty and would delay NERSA COD certification."
        title="Assign Punch Owners"
        onAccept={() => {}}
      />
      <DataTable<HandoverRow>
        columns={HANDOVER_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.system_name}
          subtitle={`${sel.handover_type} · ${sel.ref}`}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',     value: sel.ref, mono: true },
            { label: 'System',        value: sel.system_name, span: true },
            { label: 'Handover Type', value: sel.handover_type },
            { label: 'Disciplines',   value: sel.disciplines },
            { label: 'Punch Count',   value: String(sel.punch_count), mono: true },
            { label: 'COD Target',    value: sel.cod_target ?? '—', mono: true },
            { label: 'Tier',          value: sel.tier },
            { label: 'Status',        value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Record ID',     value: sel.id.slice(-12), mono: true },
          ]}
          actions={[
            {
              id: 'submit-dossier',
              label: 'Submit Dossier',
              icon: 'send',
              variant: 'primary',
              onClick: () => api.post(`/ipp/handover-dossier/chain/${sel.id}/submit-dossier`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'witness-test',
              label: 'Witness Test',
              icon: 'checklist',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/handover-dossier/chain/${sel.id}/witness-test`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'clear-punches',
              label: 'Clear Punches',
              icon: 'check-circle',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/handover-dossier/chain/${sel.id}/clear-punches`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'accept-handover',
              label: 'Accept Handover',
              icon: 'check-circle',
              variant: 'primary',
              onClick: () => api.post(`/ipp/handover-dossier/chain/${sel.id}/accept-handover`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
          ]}
          onActionComplete={() => {
            api.get<{ success: boolean; data: HandoverRow[] }>('/ipp/handover-dossier/chain')
              .then(r => setRows(r.data.data ?? [])).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// ─── W112 WBS & Gantt Schedule Management screen ─────────────────────────────

type WbsRow = {
  id: string;
  ref: string;
  wbs_code: string;
  task_name: string;
  planned_start: string;
  planned_finish: string;
  actual_start: string | null;
  float_days: number;
  chain_status: string;
  tier: string;
};

const WBS_COLS: Column<WbsRow>[] = [
  { key: 'ref',            header: 'Ref',             width: '140px', mono: true },
  { key: 'wbs_code',       header: 'WBS Code',        width: '130px', mono: true },
  { key: 'task_name',      header: 'Task',            width: '260px' },
  { key: 'planned_start',  header: 'Planned Start',   width: '130px', mono: true },
  { key: 'planned_finish', header: 'Planned Finish',  width: '130px', mono: true },
  { key: 'float_days',     header: 'Float (days)',    width: '110px', align: 'right', mono: true,
    render: r => <span style={{ color: r.float_days < 0 ? 'var(--oe-rose)' : 'var(--oe-text-1)' }}>{r.float_days}</span> },
  { key: 'chain_status',   header: 'Status',          width: '140px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
];

function WbsScreen() {
  const [rows, setRows] = React.useState<WbsRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<WbsRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    api.get<{ success: boolean; data: WbsRow[] }>('/ipp/wbs/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>WBS / Gantt W112</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' tasks'}</div>
      </div>
      <AIInsightCard
        title="AI Insight"
        suggestion="4 activities on the critical path show negative float of -7 to -14 days. Turbine foundation works at Grassridge Site-B are the primary schedule driver — a 10-day recovery plan would cost ~R1.2M in acceleration premium."
        reasoning="NERSA §C-5 milestone dates are tied to COD; float erosion beyond -21 days triggers a schedule recovery submission obligation under the REIPPPP PA."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<WbsRow>
        columns={WBS_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.task_name}
          subtitle={`${sel.wbs_code} · ${sel.ref}`}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'Reference',      value: sel.ref, mono: true },
            { label: 'WBS Code',       value: sel.wbs_code, mono: true },
            { label: 'Task Name',      value: sel.task_name, span: true },
            { label: 'Planned Start',  value: sel.planned_start, mono: true },
            { label: 'Planned Finish', value: sel.planned_finish, mono: true },
            { label: 'Actual Start',   value: sel.actual_start ?? '—', mono: true },
            { label: 'Float (days)',   value: String(sel.float_days), mono: true },
            { label: 'Tier',           value: sel.tier },
            { label: 'Status',         value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Record ID',      value: sel.id.slice(-12), mono: true },
          ]}
          actions={[
            {
              id: 'update-schedule',
              label: 'Update Schedule',
              icon: 'dots-h',
              variant: 'primary',
              onClick: () => api.post(`/ipp/wbs/chain/${sel.id}/update-schedule`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'approve-baseline',
              label: 'Approve Baseline',
              icon: 'check-circle',
              variant: 'primary',
              onClick: () => api.post(`/ipp/wbs/chain/${sel.id}/approve-baseline`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'flag-delay',
              label: 'Flag Delay',
              icon: 'alert-triangle',
              variant: 'danger',
              onClick: () => api.post(`/ipp/wbs/chain/${sel.id}/flag-delay`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'close-task',
              label: 'Close Task',
              icon: 'check-circle',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/wbs/chain/${sel.id}/close-task`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
          ]}
          onActionComplete={() => {
            api.get<{ success: boolean; data: WbsRow[] }>('/ipp/wbs/chain')
              .then(r => setRows(r.data.data ?? [])).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// ─── W116 RFI Management screen ──────────────────────────────────────────────

type RfiRow = {
  id: string;
  ref: string;
  rfi_number: string;
  subject: string;
  originator: string;
  rfi_class: string;
  chain_status: string;
  submitted_at: string;
  deadline: string | null;
  tier: string;
};

const RFI_COLS: Column<RfiRow>[] = [
  { key: 'rfi_number',   header: 'RFI #',       width: '130px', mono: true },
  { key: 'subject',      header: 'Subject',      width: '260px' },
  { key: 'originator',   header: 'Originator',   width: '160px' },
  { key: 'rfi_class',    header: 'Class',        width: '150px',
    render: r => <StatusPill label={r.rfi_class} variant={r.rfi_class === 'emergency_safety' ? 'rose' : 'blue'} /> },
  { key: 'chain_status', header: 'Status',       width: '140px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
  { key: 'submitted_at', header: 'Submitted',    width: '130px', mono: true },
  { key: 'deadline',     header: 'Deadline',     width: '130px', mono: true, render: r => <span>{r.deadline ?? '—'}</span> },
];

function RfiScreen() {
  const [rows, setRows] = React.useState<RfiRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<RfiRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const refetch = () => {
    api.get<{ success: boolean; data: RfiRow[] }>('/ipp/rfis/chain')
      .then(r => setRows(r.data.data ?? [])).catch(() => {});
  };

  React.useEffect(() => {
    api.get<{ success: boolean; data: RfiRow[] }>('/ipp/rfis/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>RFI Management W116</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' RFIs'}</div>
      </div>
      <AIInsightCard
        title="AI Insight"
        suggestion="2 emergency-safety RFIs (emergency_safety class) have been open >72h without a clarification response. IFC-019 on turbine erection load path requires structural engineer sign-off before erection can resume."
        reasoning="OHSA §8(1) prohibits erection activities where a safety-critical RFI remains open. Erection stoppage at this stage costs ~R380k/day in contractor standby."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<RfiRow>
        columns={RFI_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.subject}
          subtitle={`${sel.rfi_number} · ${sel.originator}`}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'RFI Number',   value: sel.rfi_number, mono: true },
            { label: 'Subject',      value: sel.subject, span: true },
            { label: 'Originator',   value: sel.originator },
            { label: 'Class',        value: <StatusPill label={sel.rfi_class} variant={sel.rfi_class === 'emergency_safety' ? 'rose' : 'blue'} /> },
            { label: 'Tier',         value: sel.tier },
            { label: 'Submitted',    value: sel.submitted_at, mono: true },
            { label: 'Deadline',     value: sel.deadline ?? '—', mono: true },
            { label: 'Status',       value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Record ID',    value: sel.id.slice(-12), mono: true },
          ]}
          actions={[
            {
              id: 'submit',
              label: 'Submit RFI',
              icon: 'send',
              variant: 'primary',
              onClick: () => api.post(`/ipp/rfis/chain/${sel.id}/submit`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'assign-reviewer',
              label: 'Assign Reviewer',
              icon: 'dots-h',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/rfis/chain/${sel.id}/assign_reviewer`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'clarify',
              label: 'Request Clarification',
              icon: 'report',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/rfis/chain/${sel.id}/clarify`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'close-rfi',
              label: 'Close RFI',
              icon: 'check-circle',
              variant: 'primary',
              onClick: () => api.post(`/ipp/rfis/chain/${sel.id}/close_rfi`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'escalate',
              label: 'Escalate',
              icon: 'alert-triangle',
              variant: 'danger',
              onClick: () => api.post(`/ipp/rfis/chain/${sel.id}/escalate`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
          ]}
          onActionComplete={refetch}
        />
      )}
    </div>
  );
}

// ─── W117 Change Orders & Variations screen ───────────────────────────────────

type ChangeOrderRow = {
  id: string;
  ref: string;
  co_number: string;
  description: string;
  co_class: string;
  cost_impact_zar: number;
  schedule_impact_days: number;
  chain_status: string;
  issued_at: string | null;
  tier: string;
};

const CHANGE_ORDER_COLS: Column<ChangeOrderRow>[] = [
  { key: 'co_number',            header: 'CO #',          width: '130px', mono: true },
  { key: 'description',          header: 'Description',   width: '260px' },
  { key: 'co_class',             header: 'Class',         width: '130px' },
  { key: 'cost_impact_zar',      header: 'Cost Impact',   width: '120px', align: 'right', mono: true,
    render: r => <span>{`R ${(r.cost_impact_zar / 1e6).toFixed(1)}M`}</span> },
  { key: 'schedule_impact_days', header: 'Sched. Impact', width: '120px', align: 'right', mono: true,
    render: r => <span>{`${r.schedule_impact_days > 0 ? '+' : ''}${r.schedule_impact_days}d`}</span> },
  { key: 'chain_status',         header: 'Status',        width: '140px', render: r => <StatusPill label={r.chain_status} variant={stateVariant(r.chain_status)} /> },
];

function ChangeOrdersScreen() {
  const [rows, setRows] = React.useState<ChangeOrderRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<ChangeOrderRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const refetch = () => {
    api.get<{ success: boolean; data: ChangeOrderRow[] }>('/ipp/change-orders/chain')
      .then(r => setRows(r.data.data ?? [])).catch(() => {});
  };

  React.useEffect(() => {
    api.get<{ success: boolean; data: ChangeOrderRow[] }>('/ipp/change-orders/chain')
      .then(r => { setRows(r.data.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="oe-grad-text" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Change Orders W117</h1>
        <div style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>{loading ? 'Loading…' : rows.length + ' change orders'}</div>
      </div>
      <AIInsightCard
        title="AI Insight"
        suggestion="Cumulative approved change orders have reached 11.3% of original contract value (R485M). The REIPPPP cap is 15% (R642M). CO-017 for turbine foundation redesign (R94M) would take cumulative exposure to 13.5% — review before approval."
        reasoning="Exceeding the 15% REIPPPP variation cap requires renegotiation of the RMIPPA and triggers a NERSA consent process, adding 3-6 months to COD."
        confidence="high"
        onAccept={() => {}}
      />
      <DataTable<ChangeOrderRow>
        columns={CHANGE_ORDER_COLS}
        rows={rows}
        loading={loading}
        onRowClick={r => { setSel(r); setDrawerOpen(true); }}
      />
      {sel && (
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={sel.co_number}
          subtitle={`${sel.co_class} · ${sel.ref}`}
          entityRef={sel.ref}
          status={sel.chain_status}
          fields={[
            { label: 'CO Number',          value: sel.co_number, mono: true },
            { label: 'Description',        value: sel.description, span: true },
            { label: 'Class',              value: sel.co_class },
            { label: 'Cost Impact',        value: `R ${(sel.cost_impact_zar / 1e6).toFixed(2)}M`, mono: true },
            { label: 'Schedule Impact',    value: `${sel.schedule_impact_days > 0 ? '+' : ''}${sel.schedule_impact_days}d`, mono: true },
            { label: 'Tier',               value: sel.tier },
            { label: 'Issued At',          value: sel.issued_at ?? '—', mono: true },
            { label: 'Status',             value: <StatusPill label={sel.chain_status} variant={stateVariant(sel.chain_status)} /> },
            { label: 'Record ID',          value: sel.id.slice(-12), mono: true },
          ]}
          actions={[
            {
              id: 'raise-co',
              label: 'Raise CO',
              icon: 'send',
              variant: 'primary',
              onClick: () => api.post(`/ipp/change-orders/chain/${sel.id}/raise_co`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'review',
              label: 'Review',
              icon: 'checklist',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/change-orders/chain/${sel.id}/review`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'approve-co',
              label: 'Approve CO',
              icon: 'check-circle',
              variant: 'primary',
              onClick: () => api.post(`/ipp/change-orders/chain/${sel.id}/approve_co`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'reject-co',
              label: 'Reject CO',
              icon: 'x-circle',
              variant: 'danger',
              onClick: () => api.post(`/ipp/change-orders/chain/${sel.id}/reject_co`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
            {
              id: 'close-co',
              label: 'Close CO',
              icon: 'check-circle',
              variant: 'secondary',
              onClick: () => api.post(`/ipp/change-orders/chain/${sel.id}/close_co`, {}).then(() => setDrawerOpen(false)).catch(() => {}),
            },
          ]}
          onActionComplete={refetch}
        />
      )}
    </div>
  );
}

export default IppWorkstation;
