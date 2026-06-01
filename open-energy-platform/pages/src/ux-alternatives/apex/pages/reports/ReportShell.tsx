/**
 * ReportShell — Apex Reports
 *
 * Full-page report viewer:
 *   - Left sidebar (240px): categorised report tree with icons
 *   - Top toolbar: ExportToolbar with PDF/XLSX/CSV/Schedule/Print
 *   - Main area: renders the selected report component
 *   - Print media: hides sidebar + toolbar, shows report content only
 *
 * Props: { role, userName }
 * No Tailwind. No hardcoded colors. Strict TypeScript.
 */

import React, { useState, useMemo } from 'react';
import { OeIcon, IconName } from '../../components/icons/Icons';
import { RoleKey } from '../../components/shell/AppShell';
import { ExportToolbar } from './ExportToolbar';
import {
  SoxAuditTrailReport,
  SodMatrixReport,
  ThreeWayMatchReport,
  TcfdAlignmentReport,
  Scope123Report,
  TradeRevenueReport,
  CarbonCreditReport,
  LicenceRenewalStatusReport,
  RiskExposureReport,
  ProjectFinanceReport,
  MlModelPerformanceReport,
  SllKpiComplianceReport,
  DscrPortfolioReport,
  PreTradeCreditUtilisationReport,
  ImbalanceSettlementReport,
  ChangeInLawTrackerReport,
} from './ReportTemplates';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReportItem {
  id: string;
  label: string;
  description: string;
  roles?: RoleKey[];
  tier?: string;
  component: React.ComponentType;
}

export interface ReportCategory {
  id: string;
  label: string;
  icon: IconName;
  reports: ReportItem[];
}

// ─── Report catalogue ─────────────────────────────────────────────────────────

const REPORT_CATALOGUE: ReportCategory[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: 'home',
    reports: [
      {
        id: 'risk-exposure',
        label: 'Risk Exposure',
        description: 'Counterparty credit exposure vs approved limits',
        component: RiskExposureReport,
      },
      {
        id: 'project-finance',
        label: 'Project Finance EVM',
        description: 'Earned Value metrics per project',
        component: ProjectFinanceReport,
      },
    ],
  },
  {
    id: 'sox',
    label: 'SOX Compliance',
    icon: 'shield',
    reports: [
      {
        id: 'sox-audit-trail',
        label: 'Immutable Audit Trail',
        description: 'SOX 302/404 tamper-evident event log with SHA-256 chain',
        tier: 'L5',
        component: SoxAuditTrailReport,
      },
      {
        id: 'sox-sod-matrix',
        label: 'Segregation of Duties',
        description: 'Role × capability access control matrix',
        component: SodMatrixReport,
      },
      {
        id: 'sox-three-way-match',
        label: 'Three-Way Match',
        description: 'Drawdown / IE Cert / Disbursement reconciliation',
        roles: ['lender', 'admin'],
        component: ThreeWayMatchReport,
      },
    ],
  },
  {
    id: 'esg',
    label: 'ESG / TCFD',
    icon: 'leaf',
    reports: [
      {
        id: 'tcfd-alignment',
        label: 'TCFD Alignment',
        description: 'Four-pillar TCFD disclosure status',
        component: TcfdAlignmentReport,
      },
      {
        id: 'scope-123',
        label: 'Scope 1/2/3 Emissions',
        description: 'GHG emissions by project, YoY delta and intensity',
        component: Scope123Report,
      },
    ],
  },
  {
    id: 'trading',
    label: 'Trading & Revenue',
    icon: 'chart-line',
    reports: [
      {
        id: 'trade-revenue',
        label: 'Monthly P&L',
        description: '12-month trading revenue, COGS, margins and VaR',
        roles: ['trader', 'admin'],
        component: TradeRevenueReport,
      },
      {
        id: 'pretrade-credit-utilisation',
        label: 'Pre-Trade Credit Utilisation',
        description: 'Real-time pre-trade credit limit utilisation by counterparty',
        roles: ['trader', 'admin'],
        component: PreTradeCreditUtilisationReport,
      },
    ],
  },
  {
    id: 'carbon',
    label: 'Carbon Credits',
    icon: 'leaf',
    reports: [
      {
        id: 'carbon-portfolio',
        label: 'Credit Portfolio',
        description: 'Issued, retired, buffer and available credits',
        roles: ['carbon_fund', 'regulator', 'admin'],
        component: CarbonCreditReport,
      },
    ],
  },
  {
    id: 'grid',
    label: 'Grid & Dispatch',
    icon: 'tower',
    reports: [
      {
        id: 'risk-exposure-grid',
        label: 'Grid Exposure',
        description: 'Counterparty exposure and transmission risk',
        roles: ['grid_operator', 'admin'],
        component: RiskExposureReport,
      },
      {
        id: 'imbalance-settlement',
        label: 'Imbalance Settlement',
        description: 'MTU imbalance settlement summary and disputed interval register',
        roles: ['grid_operator', 'admin'],
        component: ImbalanceSettlementReport,
      },
    ],
  },
  {
    id: 'regulatory',
    label: 'Regulatory Filings',
    icon: 'stamp',
    reports: [
      {
        id: 'licence-renewal',
        label: 'Licence Renewal Status',
        description: 'Per-licence expiry countdown and renewal state',
        roles: ['regulator', 'ipp_developer', 'admin'],
        component: LicenceRenewalStatusReport,
      },
      {
        id: 'change-in-law-tracker',
        label: 'Change-in-Law Tracker',
        description: 'Open change-in-law relief claims across all PPA portfolios',
        roles: ['offtaker', 'regulator', 'admin'],
        component: ChangeInLawTrackerReport,
      },
    ],
  },
  {
    id: 'risk',
    label: 'Risk & Exposure',
    icon: 'alert-triangle',
    reports: [
      {
        id: 'risk-counterparty',
        label: 'Counterparty Exposure',
        description: 'Mark-to-market exposure vs approved limits',
        component: RiskExposureReport,
      },
    ],
  },
  {
    id: 'project-finance',
    label: 'Project Finance',
    icon: 'dollar',
    reports: [
      {
        id: 'pf-evm',
        label: 'Earned Value Metrics',
        description: 'BAC, EV, AC, SPI, CPI, EAC, VAC per project',
        roles: ['lender', 'ipp_developer', 'admin'],
        component: ProjectFinanceReport,
      },
      {
        id: 'pf-three-way',
        label: 'Three-Way Match',
        description: 'Drawdown / IE Cert / Disbursement match status',
        roles: ['lender', 'admin'],
        component: ThreeWayMatchReport,
      },
      {
        id: 'sll-kpi-compliance',
        label: 'SLL KPI Compliance',
        description: 'Sustainability-linked loan KPI compliance status and margin ratchet tracking',
        roles: ['lender', 'admin'],
        component: SllKpiComplianceReport,
      },
      {
        id: 'dscr-portfolio',
        label: 'DSCR Portfolio',
        description: 'Portfolio DSCR monitoring across all project finance facilities',
        roles: ['lender', 'admin'],
        component: DscrPortfolioReport,
      },
    ],
  },
  {
    id: 'ml-models',
    label: 'ML & Predictive',
    icon: 'chart-line',
    reports: [
      {
        id: 'ml-model-performance',
        label: 'ML Model Performance',
        description: 'ML model accuracy and inference metrics for W127-W130 predictive chains',
        roles: ['admin', 'support'],
        component: MlModelPerformanceReport,
      },
    ],
  },
  {
    id: 'audit',
    label: 'Audit Trail',
    icon: 'checklist',
    reports: [
      {
        id: 'audit-trail',
        label: 'Full Audit Trail',
        description: 'All platform mutations — tamper-evident SHA-256 chain',
        roles: ['admin', 'regulator'],
        component: SoxAuditTrailReport,
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isVisible(item: ReportItem, role: RoleKey): boolean {
  if (!item.roles || item.roles.length === 0) return true;
  return item.roles.includes(role);
}

function firstVisibleReport(catalogue: ReportCategory[], role: RoleKey): string {
  for (const cat of catalogue) {
    for (const item of cat.reports) {
      if (isVisible(item, role)) return item.id;
    }
  }
  return '';
}

function findReport(catalogue: ReportCategory[], id: string): ReportItem | undefined {
  for (const cat of catalogue) {
    const found = cat.reports.find(r => r.id === id);
    if (found) return found;
  }
  return undefined;
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────

function SidebarItem({
  item,
  active,
  onClick,
}: {
  item: ReportItem;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '6px 10px 6px 28px',
        background: active
          ? 'var(--oe-blue-bg)'
          : hovered
          ? 'var(--oe-surf-2)'
          : 'transparent',
        border: 'none',
        borderRadius: 'var(--oe-r-input)',
        cursor: 'pointer',
        transition: 'background var(--oe-t-fast) var(--oe-ease)',
        outline: 'none',
        marginBottom: '1px',
      }}
    >
      <span
        style={{
          display: 'block',
          fontSize: '12px',
          fontWeight: active ? 600 : 400,
          color: active ? 'var(--oe-blue)' : 'var(--oe-text-2)',
          lineHeight: '1.4',
          fontFamily: 'DM Sans, sans-serif',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {item.label}
      </span>
      {item.tier && (
        <span
          style={{
            fontSize: '9px',
            fontWeight: 700,
            color: 'var(--oe-text-4)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {item.tier}
        </span>
      )}
    </button>
  );
}

// ─── Sidebar category ─────────────────────────────────────────────────────────

function SidebarCategory({
  category,
  selectedId,
  role,
  onSelect,
}: {
  category: ReportCategory;
  selectedId: string;
  role: RoleKey;
  onSelect: (id: string) => void;
}) {
  const visibleReports = category.reports.filter(r => isVisible(r, role));
  if (visibleReports.length === 0) return null;

  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{ marginBottom: '4px' }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          padding: '5px 10px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <OeIcon
          name={category.icon}
          size={13}
          color="var(--oe-text-3)"
        />
        <span
          style={{
            flex: 1,
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--oe-text-3)',
            textAlign: 'left',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          {category.label}
        </span>
        <OeIcon
          name={expanded ? 'chevron-down' : 'chevron-right'}
          size={11}
          color="var(--oe-text-4)"
        />
      </button>

      {expanded && (
        <div style={{ paddingBottom: '2px' }}>
          {visibleReports.map(item => (
            <SidebarItem
              key={item.id}
              item={item}
              active={item.id === selectedId}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ReportShellProps {
  role: RoleKey;
  userName: string;
}

export function ReportShell({ role, userName }: ReportShellProps) {
  const [selectedReportId, setSelectedReportId] = useState<string>(() =>
    firstVisibleReport(REPORT_CATALOGUE, role)
  );

  const selectedReport = useMemo(
    () => findReport(REPORT_CATALOGUE, selectedReportId),
    [selectedReportId]
  );

  const ReportComponent = selectedReport?.component ?? null;

  return (
    <>
      {/* Print-only: inject CSS to hide sidebar/toolbar */}
      <style>{`
        @media print {
          [data-report-sidebar] { display: none !important; }
          [data-report-toolbar] { display: none !important; }
          [data-report-main] { margin-left: 0 !important; padding: 24px !important; }
          [data-report-topbar] { display: none !important; }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          height: '100%',
          minHeight: '100vh',
          background: 'var(--oe-surf)',
          fontFamily: 'DM Sans, system-ui, sans-serif',
        }}
      >
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside
          data-report-sidebar=""
          style={{
            width: '240px',
            flexShrink: 0,
            background: 'var(--oe-grad-sidebar)',
            borderRight: '1px solid var(--oe-border)',
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            position: 'sticky',
            top: 0,
            overflowY: 'auto',
            zIndex: 'var(--oe-z-sidebar)' as unknown as number,
          }}
        >
          {/* Sidebar header */}
          <div
            style={{
              padding: '16px 14px 12px',
              borderBottom: '1px solid var(--oe-border-2)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--oe-r-icon)',
                  background: 'var(--oe-grad-button)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <OeIcon name="report" size={14} color="var(--oe-canvas)" />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--oe-text-1)', lineHeight: 1.3 }}>
                  Reports
                </div>
                <div style={{ fontSize: '10px', color: 'var(--oe-text-3)', lineHeight: 1.3 }}>
                  {userName}
                </div>
              </div>
            </div>
          </div>

          {/* Category tree */}
          <nav
            style={{ flex: 1, padding: '10px 6px', overflowY: 'auto' }}
            aria-label="Report navigation"
          >
            {REPORT_CATALOGUE.map(cat => (
              <SidebarCategory
                key={cat.id}
                category={cat}
                selectedId={selectedReportId}
                role={role}
                onSelect={setSelectedReportId}
              />
            ))}
          </nav>
        </aside>

        {/* ── Right column ────────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          {/* Top bar */}
          <header
            data-report-topbar=""
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 'var(--oe-z-topbar)' as unknown as number,
              background: 'var(--oe-grad-topbar)',
              borderBottom: '1px solid var(--oe-border)',
              padding: '0 24px',
              height: '52px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexShrink: 0,
            }}
          >
            {/* Report title */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {selectedReport ? (
                <>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'var(--oe-text-1)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {selectedReport.label}
                  </h1>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '11px',
                      color: 'var(--oe-text-3)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {selectedReport.description}
                  </p>
                </>
              ) : (
                <h1 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--oe-text-1)' }}>
                  Select a report
                </h1>
              )}
            </div>

            {/* Export toolbar */}
            <div data-report-toolbar="">
              <ExportToolbar
                reportId={selectedReport?.id}
                reportLabel={selectedReport?.label}
              />
            </div>
          </header>

          {/* Report content */}
          <main
            data-report-main=""
            style={{
              flex: 1,
              padding: '24px',
              overflowY: 'auto',
            }}
          >
            {ReportComponent ? (
              <ReportComponent />
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '300px',
                  gap: '12px',
                  color: 'var(--oe-text-3)',
                }}
              >
                <OeIcon name="report" size={32} color="var(--oe-text-4)" />
                <span style={{ fontSize: '14px' }}>Select a report from the sidebar</span>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}

export default ReportShell;
