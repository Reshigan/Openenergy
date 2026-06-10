import React, { useState, useEffect, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Sparkles, ShieldCheck, Zap, Leaf, Activity, ArrowRight } from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './lib/useAuth';
import { api } from './lib/api';
import { FioriShell } from './components/FioriShell';
import { LogoMark, LogoBanner } from './components/Logo';
import { OEIcon, type IconName } from './components/OEIcon';
import { LtmLogo } from './components/LtmLogo';
// Page components — all lazy so each route only pays for its chunk on first visit.
const DesignGallery         = React.lazy(() => import('./components/pages/DesignGallery').then(m => ({ default: m.DesignGallery })));
const NotFoundPage          = React.lazy(() => import('./components/pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const SearchPage            = React.lazy(() => import('./components/pages/SearchPage').then(m => ({ default: m.SearchPage })));
const NotificationsPage     = React.lazy(() => import('./components/pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const SchedulePage          = React.lazy(() => import('./components/pages/SchedulePage').then(m => ({ default: m.SchedulePage })));
const RoleLaunchBoard       = React.lazy(() => import('./components/launch/RoleLaunchBoard').then(m => ({ default: m.RoleLaunchBoard })));
const LenderWorkoutPage     = React.lazy(() => import('./components/pages/LenderWorkoutPage').then(m => ({ default: m.LenderWorkoutPage })));
const LenderAuditPage       = React.lazy(() => import('./components/pages/LenderAuditPage').then(m => ({ default: m.LenderAuditPage })));
const CarbonWorkstationPage = React.lazy(() => import('./components/pages/CarbonWorkstationPage').then(m => ({ default: m.CarbonWorkstationPage })));
const GridOpsWorkstationPage= React.lazy(() => import('./components/pages/GridOpsWorkstationPage').then(m => ({ default: m.GridOpsWorkstationPage })));
const RegulatorWorkstationPage = React.lazy(() => import('./components/pages/RegulatorWorkstationPage').then(m => ({ default: m.RegulatorWorkstationPage })));
const AdminWorkstationPage  = React.lazy(() => import('./components/pages/AdminWorkstationPage').then(m => ({ default: m.AdminWorkstationPage })));
const SupportWorkstationPage= React.lazy(() => import('./components/pages/SupportWorkstationPage').then(m => ({ default: m.SupportWorkstationPage })));
const TraderWorkstationPage = React.lazy(() => import('./components/pages/TraderWorkstationPage').then(m => ({ default: m.TraderWorkstationPage })));
const IppWorkstationPage    = React.lazy(() => import('./components/pages/IppWorkstationPage').then(m => ({ default: m.IppWorkstationPage })));
const OfftakerWorkstationPage = React.lazy(() => import('./components/pages/OfftakerWorkstationPage').then(m => ({ default: m.OfftakerWorkstationPage })));
const LenderWorkstationPage = React.lazy(() => import('./components/pages/LenderWorkstationPage').then(m => ({ default: m.LenderWorkstationPage })));
const EscoWorkstationPage   = React.lazy(() => import('./components/pages/EscoWorkstationPage').then(m => ({ default: m.EscoWorkstationPage })));
const EpcWorkstationPage    = React.lazy(() => import('./components/pages/EpcWorkstationPage').then(m => ({ default: m.EpcWorkstationPage })));
const OrderDetailPage       = React.lazy(() => import('./components/pages/OrderDetailPage').then(m => ({ default: m.OrderDetailPage })));
const InvoiceDetailPage     = React.lazy(() => import('./components/pages/InvoiceDetailPage').then(m => ({ default: m.InvoiceDetailPage })));
const ProjectOperationsPage = React.lazy(() => import('./components/pages/ProjectOperationsPage').then(m => ({ default: m.ProjectOperationsPage })));
const SettlementDlqPage     = React.lazy(() => import('./components/pages/SettlementDlqPage').then(m => ({ default: m.SettlementDlqPage })));
const SupportTicketDetailPage = React.lazy(() => import('./components/pages/SupportTicketDetailPage').then(m => ({ default: m.SupportTicketDetailPage })));
const TenantDetailPage      = React.lazy(() => import('./components/pages/TenantDetailPage').then(m => ({ default: m.TenantDetailPage })));
const VintageDetailPage     = React.lazy(() => import('./components/pages/VintageDetailPage').then(m => ({ default: m.VintageDetailPage })));
const LicenceActionDetailPage = React.lazy(() => import('./components/pages/LicenceActionDetailPage').then(m => ({ default: m.LicenceActionDetailPage })));
const GridOutageDetailPage  = React.lazy(() => import('./components/pages/GridOutageDetailPage').then(m => ({ default: m.GridOutageDetailPage })));
const BillingRunDetailPage  = React.lazy(() => import('./components/pages/BillingRunDetailPage').then(m => ({ default: m.BillingRunDetailPage })));
const SignaturePreview       = React.lazy(() => import('./components/signature/__preview__/SignaturePreview'));
const ActivityFeedShell     = React.lazy(() => import('./components/ActivityFeedShell').then(m => ({ default: m.ActivityFeedShell })));

// Core page components
const NationalDashboard     = React.lazy(() => import('./components/pages/NationalDashboard').then(m => ({ default: m.NationalDashboard })));
const Contracts             = React.lazy(() => import('./components/pages/Contracts').then(m => ({ default: m.Contracts })));
const ContractDetail        = React.lazy(() => import('./components/pages/ContractDetail').then(m => ({ default: m.ContractDetail })));
const Trading               = React.lazy(() => import('./components/pages/Trading').then(m => ({ default: m.Trading })));
const Carbon                = React.lazy(() => import('./components/pages/Carbon').then(m => ({ default: m.Carbon })));
const ProcurementHub        = React.lazy(() => import('./components/pages/ProcurementHub').then(m => ({ default: m.ProcurementHub })));
const Projects              = React.lazy(() => import('./components/pages/Projects').then(m => ({ default: m.Projects })));
const ProjectDetail         = React.lazy(() => import('./components/pages/ProjectDetail').then(m => ({ default: m.ProjectDetail })));
const ProjectLifecycle      = React.lazy(() => import('./components/pages/ProjectLifecycle').then(m => ({ default: m.ProjectLifecycle })));
const Grid                  = React.lazy(() => import('./components/pages/Grid').then(m => ({ default: m.Grid })));
const ESG                   = React.lazy(() => import('./components/pages/ESG').then(m => ({ default: m.ESG })));
const Funds                 = React.lazy(() => import('./components/pages/Funds').then(m => ({ default: m.Funds })));
const FundDetail            = React.lazy(() => import('./components/pages/FundDetail').then(m => ({ default: m.FundDetail })));
const Marketplace           = React.lazy(() => import('./components/pages/Marketplace').then(m => ({ default: m.Marketplace })));
const ModulesPage           = React.lazy(() => import('./components/pages/ModulesPage').then(m => ({ default: m.ModulesPage })));
const Admin                 = React.lazy(() => import('./components/pages/Admin').then(m => ({ default: m.Admin })));
const Support               = React.lazy(() => import('./components/pages/Support').then(m => ({ default: m.Support })));
const Pipeline              = React.lazy(() => import('./components/pages/Pipeline').then(m => ({ default: m.Pipeline })));
const Reports               = React.lazy(() => import('./components/pages/Reports').then(m => ({ default: m.Reports })));
const Lois                  = React.lazy(() => import('./components/pages/Lois').then(m => ({ default: m.Lois })));
const LoiDetail             = React.lazy(() => import('./components/pages/LoiDetail').then(m => ({ default: m.LoiDetail })));
const Intelligence          = React.lazy(() => import('./components/pages/Intelligence').then(m => ({ default: m.Intelligence })));
const Settlement            = React.lazy(() => import('./components/pages/Settlement').then(m => ({ default: m.Settlement })));
const Popia                 = React.lazy(() => import('./components/pages/Popia').then(m => ({ default: m.Popia })));
const Briefing              = React.lazy(() => import('./components/pages/Briefing').then(m => ({ default: m.Briefing })));
const Monitoring            = React.lazy(() => import('./components/pages/Monitoring').then(m => ({ default: m.Monitoring })));
const ForgotPassword        = React.lazy(() => import('./components/pages/ForgotPassword'));
const ResetPassword         = React.lazy(() => import('./components/pages/ResetPassword'));
const Security              = React.lazy(() => import('./components/pages/Security'));
const Settings              = React.lazy(() => import('./components/pages/Settings'));

// National-scale workbenches — code-split so the initial bundle stays small.
// Each suite page pulls in a significant amount of form-builder code; users
// only pay for the workbench relevant to their role.
const RegulatorSuitePage   = React.lazy(() => import('./components/pages/RegulatorSuitePage').then(m => ({ default: m.RegulatorSuitePage })));
const GridOperatorSuitePage = React.lazy(() => import('./components/pages/GridOperatorSuitePage').then(m => ({ default: m.GridOperatorSuitePage })));
const TraderRiskPage        = React.lazy(() => import('./components/pages/TraderRiskPage').then(m => ({ default: m.TraderRiskPage })));
const LenderSuitePage       = React.lazy(() => import('./components/pages/LenderSuitePage').then(m => ({ default: m.LenderSuitePage })));
const IppLifecyclePage      = React.lazy(() => import('./components/pages/IppLifecyclePage').then(m => ({ default: m.IppLifecyclePage })));
const OfftakerSuitePage     = React.lazy(() => import('./components/pages/OfftakerSuitePage').then(m => ({ default: m.OfftakerSuitePage })));
const CarbonRegistryPage    = React.lazy(() => import('./components/pages/CarbonRegistryPage').then(m => ({ default: m.CarbonRegistryPage })));
const AdminPlatformPage     = React.lazy(() => import('./components/pages/AdminPlatformPage').then(m => ({ default: m.AdminPlatformPage })));
const EsumsOmPage           = React.lazy(() => import('./components/pages/EsumsOmPage').then(m => ({ default: m.EsumsOmPage })));
const EsumsOmPortalView     = React.lazy(() => import('./components/pages/EsumsOmPortalView').then(m => ({ default: m.EsumsOmPortalView })));
const PlatformSettingsPage  = React.lazy(() => import('./components/pages/PlatformSettingsPage').then(m => ({ default: m.PlatformSettingsPage })));
const EsumsOmFieldWosPage   = React.lazy(() => import('./components/pages/EsumsOmFieldWosPage').then(m => ({ default: m.EsumsOmFieldWosPage })));
const ComplianceSettingsPage= React.lazy(() => import('./components/pages/ComplianceSettingsPage').then(m => ({ default: m.ComplianceSettingsPage })));
const PublicStatusPage      = React.lazy(() => import('./components/pages/PublicStatusPage').then(m => ({ default: m.PublicStatusPage })));
const ComplianceAdminPage   = React.lazy(() => import('./components/pages/ComplianceAdminPage').then(m => ({ default: m.ComplianceAdminPage })));
const DepthOpsPage          = React.lazy(() => import('./components/pages/DepthOpsPage').then(m => ({ default: m.DepthOpsPage })));
const OpsL5Page             = React.lazy(() => import('./components/pages/OpsL5Page').then(m => ({ default: m.OpsL5Page })));
const PublicLegalPage       = React.lazy(() => import('./components/pages/PublicLegalPage').then(m => ({ default: m.PublicLegalPage })));
const PublicAuditPage       = React.lazy(() => import('./components/pages/PublicAuditPage').then(m => ({ default: m.PublicAuditPage })));
const PlatformAdminConsolePage = React.lazy(() => import('./components/pages/PlatformAdminConsolePage').then(m => ({ default: m.PlatformAdminConsolePage })));
const DocumentsPage         = React.lazy(() => import('./components/pages/DocumentsPage').then(m => ({ default: m.DocumentsPage })));
const VariationOrdersPage   = React.lazy(() => import('./components/pages/VariationOrdersPage').then(m => ({ default: m.VariationOrdersPage })));
const SettlementOpsPage     = React.lazy(() => import('./components/pages/SettlementOpsPage').then(m => ({ default: m.SettlementOpsPage })));
const BulkOpsPage           = React.lazy(() => import('./components/pages/BulkOpsPage').then(m => ({ default: m.BulkOpsPage })));
const PaiaAdminPage         = React.lazy(() => import('./components/pages/PaiaAdminPage').then(m => ({ default: m.PaiaAdminPage })));
const PasskeysPage          = React.lazy(() => import('./components/pages/PasskeysPage').then(m => ({ default: m.PasskeysPage })));
const EsumsSiteDetailPage   = React.lazy(() => import('./components/pages/EsumsSiteDetailPage').then(m => ({ default: m.EsumsSiteDetailPage })));

// Apex redesign prototype — mounted at /apex (no auth gate, uses token from localStorage)
const ApexApp = React.lazy(() => import('./ux-alternatives/apex/ApexApp').then(m => ({ default: m.ApexApp })));
const ApexRegisterPage = React.lazy(() => import('./ux-alternatives/apex/pages/RegisterPage').then(m => ({ default: m.RegisterPage })));

// UX exploration prototypes (mounted at /ux-prototype/*) — frontend-only,
// no backend. Density toggle + Cmd+K palette shared across all four.
const UxAlternativesIndex = React.lazy(() => import('./ux-alternatives/index'));
const PulseLensPrototype  = React.lazy(() => import('./ux-alternatives/pulse-lens/PulseLens'));
const TimeAxisPrototype   = React.lazy(() => import('./ux-alternatives/time-axis/TimeAxis'));
const CommandLensPrototype= React.lazy(() => import('./ux-alternatives/command-lens/CommandLens'));
const CockpitGridPrototype= React.lazy(() => import('./ux-alternatives/cockpit-grid/CockpitGrid'));

const OnboardingWizard      = React.lazy(() => import('./components/onboarding/OnboardingWizard').then(m => ({ default: m.OnboardingWizard })));
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { AiAssistantDock } from './components/AiAssistantDock';
import { OnboardingTour } from './components/OnboardingTour';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { StepUpModal } from './components/StepUpModal';
import { PromptHost } from './components/PromptDialog';
import { startAutoFlush, flushQueue } from './lib/offlineQueue';
import { installRum } from './lib/rum';
import { Skeleton } from './components/Skeleton';
import { EmptyState } from './components/EmptyState';
import { ErrorBanner } from './components/ErrorBanner';
import { ExportBar } from './components/ExportBar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { BatchActionBar } from './components/BatchActionBar';
import { EntityLink } from './components/EntityLink';

// Export formatZAR utility
export const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

// LazyWorkbench — Suspense shell for the code-split national suite pages.
// Shows a skeleton while the chunk downloads; chunks are ~50-80 KB each so
// on a modern connection this is imperceptible but keeps first-paint fast.
// Also wraps the lazy-loaded page in a RouteErrorBoundary so a single page
// crash never takes out the whole app.
function LazyWorkbench({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <RouteErrorBoundary routeKey={location.pathname}>
      <React.Suspense
        fallback={
          <div className="p-6 w-full mx-auto space-y-4">
            <div className="skeleton h-8 w-64" />
            <div className="skeleton h-5 w-96" />
            <div className="rounded-xl border border-[#dde4ec] bg-white p-6 space-y-3">
              {[1,2,3,4].map((i) => <div key={i} className="skeleton h-5 w-full" />)}
            </div>
          </div>
        }
      >
        {children}
      </React.Suspense>
    </RouteErrorBoundary>
  );
}

// Protected Route Wrapper
function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ionex-canvas">
        <div className="text-center">
          <div className="spinner mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Outlet pattern: when used as <Route element={<ProtectedRoute />}>, children come from nested routes
  return <>{children ?? <Outlet />}</>;
}

// Layout — Fiori shell wrapper
function Layout({ children }: { children: ReactNode }) {
  return <FioriShell>{children}</FioriShell>;
}

// Navigation items by role — workstation-first; each role's primary nav goes to their L4 workstation
function getNavigationForRole(role: string) {
  const home = { path: '/', label: 'Home', icon: DashboardIcon };
  const marketplace = { path: '/marketplace', label: 'Marketplace', icon: ShopIcon };
  const trading = { path: '/trading', label: 'Order book', icon: ChartIcon };
  const settlement = { path: '/settlement', label: 'Settlement', icon: DollarIcon };
  const reports = { path: '/reports', label: 'Reports', icon: ChartIcon };
  const esums = { path: '/esums', label: 'Asset Ops', icon: WrenchIcon };
  const settings = { path: '/settings', label: 'Settings', icon: SettingsIcon };

  switch (role) {
    case 'admin':
      return [
        home,
        { path: '/admin-platform/workstation', label: 'Platform Admin', icon: SettingsIcon },
        { path: '/regulator-suite/workstation', label: 'Regulator', icon: ShieldIcon },
        { path: '/trader-risk/workstation', label: 'Trader Risk', icon: ChartIcon },
        { path: '/lender-suite/workstation', label: 'Lender', icon: DollarIcon },
        { path: '/ipp-lifecycle/workstation', label: 'IPP Projects', icon: BuildingIcon },
        { path: '/offtaker-suite/workstation', label: 'Offtaker', icon: LeafIcon },
        { path: '/carbon-registry/workstation', label: 'Carbon', icon: LeafIcon },
        { path: '/grid-operator/workstation', label: 'Grid Ops', icon: ZapIcon },
        esums,
        { path: '/admin', label: 'Admin', icon: SettingsIcon },
        reports,
      ];
    case 'ipp_developer':
      return [
        home,
        { path: '/ipp-lifecycle/workstation', label: 'Project workstation', icon: BuildingIcon },
        { path: '/ipp-lifecycle/workstation?tab=projects', label: 'Projects', icon: BuildingIcon },
        { path: '/ipp-lifecycle/workstation?tab=milestones', label: 'Milestones', icon: ChartIcon },
        { path: '/ipp-lifecycle/workstation?tab=document-control', label: 'Documents', icon: DocumentIcon },
        { path: '/ipp-lifecycle/workstation?tab=hse_chain', label: 'HSE', icon: ShieldIcon },
        esums,
        marketplace,
        reports,
        settings,
      ];
    case 'lender':
      return [
        home,
        { path: '/lender-suite/workstation', label: 'Lender workstation', icon: DollarIcon },
        { path: '/lender-suite/workstation?tab=credit_origination', label: 'Credit', icon: DollarIcon },
        { path: '/lender-suite/workstation?tab=facilities', label: 'Facilities', icon: DocumentIcon },
        { path: '/lender-suite/workstation?tab=covenant_cert', label: 'Covenants', icon: ShieldIcon },
        { path: '/lender-suite/workstation?tab=loan_default', label: 'Default & step-in', icon: ShieldIcon },
        esums,
        reports,
        settings,
      ];
    case 'trader':
      return [
        home,
        { path: '/trader-risk/workstation', label: 'Trader workstation', icon: ChartIcon },
        trading,
        settlement,
        { path: '/trader-risk/workstation?tab=risk', label: 'Risk', icon: ChartIcon },
        { path: '/trader-risk/workstation?tab=market-abuse', label: 'Surveillance', icon: ShieldIcon },
        { path: '/trader-risk/workstation?tab=algo-cert', label: 'Algo cert', icon: SettingsIcon },
        reports,
        settings,
      ];
    case 'carbon_fund':
      return [
        home,
        { path: '/carbon-registry/workstation', label: 'Carbon workstation', icon: LeafIcon },
        { path: '/carbon-registry/workstation?tab=vintages', label: 'Vintages', icon: LeafIcon },
        { path: '/carbon-registry/workstation?tab=mrv_chain', label: 'MRV', icon: DocumentIcon },
        { path: '/carbon-registry/workstation?tab=article6', label: 'Article 6', icon: ShieldIcon },
        { path: '/carbon-registry/workstation?tab=retirement_chain', label: 'Retirements', icon: ChartIcon },
        reports,
        settings,
      ];
    case 'grid_operator':
      return [
        home,
        { path: '/grid-operator/workstation', label: 'Grid workstation', icon: ZapIcon },
        { path: '/grid-operator/workstation?tab=dispatch_nomination', label: 'Dispatch', icon: ZapIcon },
        { path: '/grid-operator/workstation?tab=ancillary', label: 'Ancillary', icon: ChartIcon },
        { path: '/grid-operator/workstation?tab=eop_activations', label: 'EOP', icon: ShieldIcon },
        { path: '/grid-operator/workstation?tab=grid_code_compliance', label: 'Grid code', icon: ShieldIcon },
        reports,
        settings,
      ];
    case 'offtaker':
      return [
        home,
        { path: '/offtaker-suite/workstation', label: 'Offtaker workstation', icon: LeafIcon },
        { path: '/offtaker-suite/workstation?tab=ppa_contract', label: 'PPAs', icon: DocumentIcon },
        { path: '/offtaker-suite/workstation?tab=bills', label: 'Bills', icon: DollarIcon },
        { path: '/offtaker-suite/workstation?tab=recs', label: 'RECs', icon: LeafIcon },
        { path: '/offtaker-suite/workstation?tab=scope2', label: 'Scope 2', icon: ChartIcon },
        marketplace,
        reports,
        settings,
      ];
    case 'regulator':
      return [
        home,
        { path: '/regulator-suite/workstation', label: 'Regulator workstation', icon: ShieldIcon },
        { path: '/regulator-suite/workstation?tab=inbox', label: 'Inbox', icon: DocumentIcon },
        { path: '/regulator-suite/workstation?tab=licence_applications', label: 'Licences', icon: DocumentIcon },
        { path: '/regulator-suite/workstation?tab=compliance_inspections', label: 'Inspections', icon: ShieldIcon },
        { path: '/regulator-suite/workstation?tab=levy_assessments', label: 'Levies', icon: DollarIcon },
        reports,
        settings,
      ];
    case 'support':
      return [
        home,
        { path: '/support/workstation', label: 'Support workstation', icon: WrenchIcon },
        { path: '/support/workstation?tab=tickets', label: 'Tickets', icon: DocumentIcon },
        { path: '/support/workstation?tab=problem_chain', label: 'Problems', icon: ShieldIcon },
        { path: '/support/workstation?tab=change_chain', label: 'Changes', icon: SettingsIcon },
        reports,
        settings,
      ];
    case 'esums_owner':
      return [
        home,
        esums,
        settings,
      ];
    case 'esco':
      return [
        home,
        { path: '/esco/workstation', label: 'O&M workstation', icon: WrenchIcon },
        { path: '/esco/workstation?tab=work-orders', label: 'Work orders', icon: WrenchIcon },
        { path: '/esco/workstation?tab=pm-compliance', label: 'PM compliance', icon: DocumentIcon },
        { path: '/esco/workstation?tab=permit-to-work', label: 'Permit-to-work', icon: ShieldIcon },
        { path: '/esco/workstation?tab=prognostics', label: 'Asset health', icon: ChartIcon },
        { path: '/esco/workstation?tab=availability', label: 'Availability', icon: ChartIcon },
        { path: '/esco/workstation?tab=spare-parts', label: 'Spare parts', icon: WrenchIcon },
        { path: '/esco/workstation?tab=hse', label: 'HSE', icon: ShieldIcon },
        esums,
        settings,
      ];
    case 'epc_contractor':
      return [
        home,
        { path: '/epc/workstation', label: 'EPC workstation', icon: BuildingIcon },
        { path: '/epc/workstation?tab=submittals', label: 'Submittals', icon: DocumentIcon },
        { path: '/epc/workstation?tab=rfis', label: 'RFIs', icon: DocumentIcon },
        { path: '/epc/workstation?tab=change-orders', label: 'Change orders', icon: DocumentIcon },
        { path: '/epc/workstation?tab=itps', label: 'ITPs', icon: ShieldIcon },
        { path: '/epc/workstation?tab=ncrs', label: 'NCRs', icon: ShieldIcon },
        { path: '/epc/workstation?tab=hse', label: 'HSE', icon: ShieldIcon },
        settings,
      ];
    default:
      return [home, trading, settlement, marketplace, reports, settings];
  }
}

function ShieldIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M12 3l8 3v6a9 9 0 01-8 9 9 9 0 01-8-9V6l8-3z" />
    </svg>
  );
}

// Icons
function DashboardIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function DocumentIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ChartIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function DollarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function LeafIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function BuildingIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function ZapIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function FlowIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
  );
}

function ShoppingIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function ShopIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

function WrenchIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437" />
    </svg>
  );
}

function SettingsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// ─── PAGES ───

// Login Page
function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  useEffect(() => {
    api.get('/auth/sso/config').then((r) => {
      if (r.data?.success && r.data?.data?.enabled) setSsoEnabled(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ssoError = params.get('sso_error');
    if (ssoError) {
      const msgMap: Record<string, string> = {
        missing_code: 'Microsoft sign-in was cancelled.',
        expired_state: 'Microsoft sign-in session expired. Please try again.',
        token_exchange: 'Could not exchange Microsoft authorization code.',
        bad_issuer: 'Microsoft token failed issuer check.',
        bad_audience: 'Microsoft token was issued for a different application.',
        nonce_mismatch: 'Microsoft sign-in anti-replay check failed.',
        bad_signature: 'Microsoft token signature invalid.',
        expired_id_token: 'Microsoft token has expired.',
        no_email: 'Microsoft account did not return an email.',
        account_suspended: 'Your account is suspended. Contact support.',
        account_rejected: 'Your account has been rejected. Contact support.',
      };
      setError(msgMap[ssoError] || `Microsoft sign-in failed (${ssoError}).`);
    }
  }, [location.search]);

  const handleMicrosoftSso = async () => {
    setError('');
    setSsoLoading(true);
    try {
      const r = await api.post('/auth/sso/microsoft/start', { return_to: '/feed' });
      if (r.data?.success && r.data?.data?.redirect_url) {
        window.location.href = r.data.data.redirect_url;
        return;
      }
      setError('Could not start Microsoft sign-in.');
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { error?: string } }; message?: string };
      setError(anyErr?.response?.data?.error || anyErr?.message || 'Microsoft sign-in unavailable');
    } finally {
      setSsoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, mfaRequired ? mfaCode : undefined);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/feed';
      navigate(from, { replace: true });
    } catch (err: any) {
      if (err?.name === 'MfaRequiredError') {
        setMfaRequired(true);
        setError('Enter the 6-digit code from your authenticator app.');
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Demo@2024!');
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_0.9fr] relative" style={{ background: '#f5f8fb' }}>
      <LtmLogo />
      {/* Brand panel — Navy with Teal/Sky accents */}
      <div
        className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden text-white"
        style={{
          background:
            'radial-gradient(circle at 15% 15%, rgba(95,168,232,0.30) 0%, transparent 45%),' +
            'radial-gradient(circle at 85% 25%, rgba(31,155,149,0.32) 0%, transparent 50%),' +
            'radial-gradient(circle at 70% 90%, rgba(59,130,196,0.32) 0%, transparent 50%),' +
            'radial-gradient(circle at 95% 95%, rgba(95,168,232,0.25) 0%, transparent 45%),' +
            'linear-gradient(135deg, #061528 0%, #0a1c30 40%, #1a3a5c 100%)',
        }}
      >
        <div className="aurora" />
        <div className="relative z-10">
          <div
            className="inline-flex items-center gap-3 rounded-md px-3 py-2"
            style={{
              background: 'rgba(255,255,255,0.96)',
              boxShadow: '0 8px 24px rgba(15,28,46,0.40), 0 0 0 1px rgba(255,255,255,0.20)',
            }}
          >
            <LogoMark size={40} variant="colour" />
            <div className="leading-[0.95]">
              <div className="text-[20px] font-display font-extrabold" style={{ color: '#1a3a5c' }}>OPEN</div>
              <div className="text-[20px] font-display font-extrabold" style={{ color: '#3b82c4' }}>ENERGY</div>
            </div>
          </div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/65 font-mono mt-3">
            Exchange · Vanta X
          </div>
        </div>

        <div className="relative z-10 max-w-xl">
          <h1 className="text-[42px] lg:text-[52px] font-bold leading-[1.05] tracking-tight font-display">
            South Africa's{' '}
            <span style={{ color: '#7fd5cf' }}>
              unified energy exchange
            </span>
            .
          </h1>
          <p className="mt-5 text-white/85 text-[16px] max-w-lg leading-relaxed">
            Trade power, carbon and RECs, originate IPP projects, run procurement,
            and settle with confidence — all on one enterprise-grade platform.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 max-w-lg">
            <FeatureBadge icon={Activity} label="76 workflow chains" tint="#5fa8e8" />
            <FeatureBadge icon={Leaf} label="Carbon Article 6" tint="#7fd5cf" />
            <FeatureBadge icon={Zap} label="Real-time settlement" tint="#9bc8ee" />
            <FeatureBadge icon={ShieldCheck} label="ERA · NERSA · POPIA" tint="#b8eae6" />
          </div>

          {/* Mini feed preview */}
          <div className="mt-8 max-w-lg space-y-2">
            {[
              { label: 'COD gate — Karoo Wind 1', note: '2 sign-offs pending', tint: '#c0392b' },
              { label: 'DSCR covenant breach', note: 'Lender notification sent', tint: '#c97a14' },
              { label: 'W64 PTW live-electrical', note: '4h 20m remaining', tint: '#3b82c4' },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: item.tint }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-white/90 truncate">{item.label}</p>
                  <p className="text-[10px] font-mono text-white/50">{item.note}</p>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-white/35 font-mono pl-1">Activity feed · 11 roles · national scale</p>
          </div>
        </div>

        <div className="relative z-10 text-[12px] text-white/55">
          © {new Date().getFullYear()} Open Energy Platform · Vanta X Holdings
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          {/* Mobile brand */}
          <div className="flex lg:hidden items-center mb-8">
            <LogoBanner height={42} variant="colour" />
          </div>

          <h2 className="text-[28px] font-bold tracking-tight font-display" style={{ color: '#0f1c2e' }}>
            Sign in
          </h2>
          <p className="mt-1 text-[14px]" style={{ color: '#3d4756' }}>
            Welcome back to the Open Energy Platform.
          </p>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mt-5 rounded border px-3 py-2 text-[13px]"
              style={{
                background: '#fde0db',
                borderColor: '#c0392b',
                color: '#410e08',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(error)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@openenergy.co.za"
                required
                autoFocus
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label" htmlFor="login-password">Password</label>
                <Link
                  to="/forgot-password"
                  className="text-[12px] font-semibold inline-flex items-center px-2 py-1 -mr-2 rounded-sm hover:bg-slate-100"
                  style={{ color: '#1a3a5c', minHeight: 24 }}
                >
                  Forgot?
                </Link>
              </div>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(error)}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
              />
            </div>
            {mfaRequired && (
              <div>
                <label className="label" htmlFor="login-mfa">Authenticator code</label>
                <input
                  id="login-mfa"
                  name="mfa_code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, ''))}
                  className="input tracking-[0.4em] font-mono text-center"
                  placeholder="123456"
                  autoFocus
                  required
                />
              </div>
            )}
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" style={{ borderTopColor: '#ffffff' }} />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {ssoEnabled && (
            <>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: '#c5cdd6' }} />
                <span className="text-[11px] uppercase tracking-widest font-mono" style={{ color: '#525a66' }}>
                  or
                </span>
                <div className="flex-1 h-px" style={{ background: '#c5cdd6' }} />
              </div>
              <button
                type="button"
                onClick={handleMicrosoftSso}
                disabled={ssoLoading}
                className="mt-4 flex items-center justify-center gap-2.5 w-full h-11 rounded border text-[14px] font-semibold transition-all hover:-translate-y-0.5"
                style={{
                  background: '#ffffff',
                  borderColor: '#6b7685',
                  color: '#0f1c2e',
                  boxShadow: '0 1px 2px rgba(25,28,24,0.05)',
                }}
              >
                {/* Microsoft 4-colour logo */}
                <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
                  <rect x="1"  y="1"  width="9" height="9" fill="#c0392b" />
                  <rect x="11" y="1"  width="9" height="9" fill="#1a8a5b" />
                  <rect x="1"  y="11" width="9" height="9" fill="#3b82c4" />
                  <rect x="11" y="11" width="9" height="9" fill="#5fa8e8" />
                </svg>
                {ssoLoading ? 'Opening Microsoft…' : 'Sign in with Microsoft'}
              </button>
            </>
          )}

          <div className="mt-6 flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: '#c5cdd6' }} />
            <span className="text-[11px] uppercase tracking-widest font-mono" style={{ color: '#525a66' }}>
              or sign in as a demo persona
            </span>
            <div className="flex-1 h-px" style={{ background: '#c5cdd6' }} />
          </div>

          <DemoPersonaGrid onPick={fillDemo} />

          <p className="mt-4 text-center text-[11px]" style={{ color: '#525a66' }}>
            All demo accounts use the same password · <code className="font-mono text-[#1a3a5c]">Demo@2024!</code>
          </p>

          <p className="mt-6 text-center text-[13px]" style={{ color: '#3d4756' }}>
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold" style={{ color: '#1a3a5c' }}>
              Request access
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureBadge({
  icon: Icon,
  label,
  tint,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  tint: string;
}) {
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
      style={{
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
        style={{ background: 'rgba(255,255,255,0.12)', color: tint }}
      >
        <Icon size={16} />
      </div>
      <span className="text-[13px] font-semibold text-white/90">{label}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * DemoPersonaGrid — the row of one-click demo accounts on the login page
 *
 * Every seeded demo participant gets a tile here so reviewers can sign in
 * as any role without remembering the email. Tiles render with the custom
 * OE icon set; no stock library is used. The full set covers all 9 demo
 * personas from migration 003_seed.sql — including the two IPP variants
 * (solar generator + wind generator).
 * ═══════════════════════════════════════════════════════════════════════ */

interface Persona {
  email: string;
  label: string;
  subtitle: string;
  icon: IconName;
  accent: string;   // hex used for the icon background + border accent
  group: 'Producers' | 'Markets' | 'Capital' | 'Network' | 'Oversight';
}

const PERSONAS: Persona[] = [
  // Producers — solar + wind IPPs
  { email: 'ipp@openenergy.co.za',       label: 'Solar Generator', subtitle: 'RenewCo Solar (Pty) Ltd',          icon: 'sun',      accent: '#c97a14', group: 'Producers' },
  { email: 'wind@openenergy.co.za',      label: 'Wind Generator',  subtitle: 'WindCapital (Pty) Ltd',            icon: 'wind',     accent: '#1f9b95', group: 'Producers' },
  // Markets — trader, carbon fund
  { email: 'trader@openenergy.co.za',    label: 'Trader',          subtitle: 'Mkhize Energy Traders',            icon: 'trending-up', accent: '#3b82c4', group: 'Markets' },
  { email: 'carbon@openenergy.co.za',    label: 'Carbon Fund',     subtitle: 'GreenFunds Carbon Fund',           icon: 'leaf',     accent: '#1a8a5b', group: 'Markets' },
  { email: 'offtaker@openenergy.co.za',  label: 'Offtaker',        subtitle: 'City Energy Municipality',         icon: 'building', accent: '#5d3a7e', group: 'Markets' },
  // Capital
  { email: 'lender@openenergy.co.za',    label: 'Lender',          subtitle: 'Infrastructure Capital Partners',  icon: 'piggy-bank', accent: '#a8385c', group: 'Capital' },
  // Network
  { email: 'grid@openenergy.co.za',      label: 'Grid Operator',   subtitle: 'Eskom Holdings',                   icon: 'gridmap',  accent: '#1a3a5c', group: 'Network' },
  { email: 'esco@openenergy.co.za',      label: 'O&M Operator',    subtitle: 'SunServ O&M (Pty) Ltd',            icon: 'wrench',   accent: '#b45309', group: 'Network' },
  // Oversight
  { email: 'regulator@openenergy.co.za', label: 'Regulator',       subtitle: 'NERSA / Energy Research Institute', icon: 'shield',  accent: '#0e6d68', group: 'Oversight' },
  { email: 'admin@openenergy.co.za',     label: 'Platform Admin',  subtitle: 'Open Energy Platform',            icon: 'settings', accent: '#0f2540', group: 'Oversight' },
];

const GROUP_ORDER: Persona['group'][] = ['Producers', 'Markets', 'Capital', 'Network', 'Oversight'];

function DemoPersonaGrid({ onPick }: { onPick: (email: string) => void }) {
  const groups = GROUP_ORDER
    .map((g) => ({ name: g, items: PERSONAS.filter((p) => p.group === g) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mt-4 space-y-4">
      {groups.map((g) => (
        <div key={g.name}>
          <div className="text-[10px] uppercase tracking-[0.1em] font-bold mb-1.5" style={{ color: '#525a66' }}>
            {g.name}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {g.items.map((p) => (
              <button
                key={p.email}
                type="button"
                onClick={() => onPick(p.email)}
                aria-label={`Use ${p.label} demo account`}
                className="group flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-all hover:-translate-y-0.5"
                style={{
                  background: '#ffffff',
                  border: '1px solid #c5cdd6',
                  boxShadow: '0 1px 2px rgba(15,28,46,0.04)',
                }}
              >
                <span
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
                  style={{ background: `${p.accent}1a`, color: p.accent }}
                >
                  <OEIcon name={p.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[12px] font-semibold truncate" style={{ color: '#0f1c2e' }}>{p.label}</span>
                  <span className="block text-[10px] font-mono truncate" style={{ color: '#525a66' }}>{p.email.split('@')[0]}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// SSO Landing Page — invoked by backend callback redirect. Reads the token
// bundle from the URL fragment, stashes it via AuthContext, and navigates to
// the `return_to` path (default: /cockpit).
function SsoLanding() {
  const { acceptSsoTokens } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const frag = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(frag);
    const token = params.get('token');
    const refresh_token = params.get('refresh_token') || undefined;
    const returnTo = params.get('return_to') || '/feed';
    if (!token) {
      setError('Missing SSO token — please try signing in again.');
      const t = setTimeout(() => navigate('/login?sso_error=missing_token', { replace: true }), 2000);
      return () => clearTimeout(t);
    }
    acceptSsoTokens({ token, refresh_token });
    // Clear the fragment so tokens don't linger in browser history.
    window.history.replaceState(null, '', returnTo);
    navigate(returnTo, { replace: true });
    return undefined;
  }, [acceptSsoTokens, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f8fb' }}>
      <div className="text-center">
        {error ? (
          <p className="text-[14px]" style={{ color: '#c0392b' }}>{error}</p>
        ) : (
          <>
            <div className="spinner mx-auto mb-4" />
            <p className="text-[14px]" style={{ color: '#3d4756' }}>Completing Microsoft sign-in…</p>
          </>
        )}
      </div>
    </div>
  );
}

// Register Page
const ROLE_LABELS: Record<string, string> = {
  ipp_developer: 'IPP Developer',
  trader: 'Energy Trader',
  carbon_fund: 'Carbon Fund Manager',
  offtaker: 'Offtaker / Corporate Buyer',
  lender: 'Lender / Investor',
  esums_owner: 'Asset Owner (Esums O&M)',
  esco: 'O&M Operator (ESCO)',
  epc_contractor: 'EPC Contractor',
};

function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token');

  const [invite, setInvite] = useState<any>(null);
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    company_name: '',
    requested_role: 'ipp_developer',
    motivation: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Fetch invite context when token present
  useEffect(() => {
    if (!inviteToken) return;
    (async () => {
      try {
        const res = await api.get(`/rbac/invitations/${inviteToken}`);
        const inv = res.data.data;
        setInvite(inv);
        setFormData(prev => ({
          ...prev,
          email: inv.email || prev.email,
          requested_role: inv.role,
        }));
      } catch (err: any) {
        setInviteError(err?.response?.data?.error || 'Invitation link is invalid or expired.');
      } finally {
        setInviteLoading(false);
      }
    })();
  }, [inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        company_name: formData.company_name || undefined,
        requested_role: invite ? invite.role : formData.requested_role,
        motivation: formData.motivation || undefined,
      };
      if (inviteToken) payload.invitation_token = inviteToken;

      const res = await api.post('/rbac/registrations', payload);
      if (!res.data.success) throw new Error(res.data.error || 'Registration failed');

      if (inviteToken && res.data.data?.participant_id) {
        // Auto-login for invite-based registrations (account is immediately active)
        await login(formData.email, formData.password);
        // navigate is handled by login success (AuthContext sets user → ProtectedRoute redirects)
        navigate(`/launch/${invite?.role ?? formData.requested_role}`, { replace: true });
      } else {
        setSubmitted(true);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (inviteLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #061528 0%, #0f2540 50%, #1a3a5c 100%)' }}>
        <p className="text-white/60 text-sm">Verifying invitation…</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 20% 20%, rgba(95,168,232,0.32) 0%, transparent 45%),' +
          'radial-gradient(circle at 80% 80%, rgba(95,168,232,0.25) 0%, transparent 50%),' +
          'linear-gradient(135deg, #061528 0%, #0f2540 50%, #1a3a5c 100%)',
      }}
    >
      <div className="aurora" />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display font-bold text-white mb-2">Consolidated Energy Cockpit</h1>
          <p className="text-white/75 font-mono text-[12px] uppercase tracking-[0.2em]">Industrial Energy Exchange</p>
        </div>

        <div className="card p-8">
          {/* Invite context banner */}
          {invite && (
            <div className="mb-6 rounded-lg border border-[#1a3a5c]/30 bg-[#dbecfb]/60 p-4">
              <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-[#1a3a5c] mb-1">You've been invited</p>
              <p className="text-sm font-semibold text-[#0f2540]">
                {invite.invited_by_company || invite.invited_by_name} has invited you to join as{' '}
                <span className="text-[#1a3a5c]">{ROLE_LABELS[invite.role] ?? invite.role}</span>
              </p>
              {invite.project_name && (
                <p className="text-xs text-[#3d4756] mt-1">
                  Project: <span className="font-medium">{invite.project_name}</span>
                  {invite.capacity_mw ? ` · ${invite.capacity_mw} MW` : ''}
                  {invite.technology ? ` · ${invite.technology}` : ''}
                </p>
              )}
              {invite.note && (
                <p className="text-xs text-[#3d4756] mt-1 italic">"{invite.note}"</p>
              )}
            </div>
          )}

          {inviteError && (
            <div role="alert" className="alert-error mb-4">{inviteError}</div>
          )}

          {submitted ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✓</div>
              <h2 className="text-xl font-semibold text-[#0f2540] mb-2">Registration submitted</h2>
              <p className="text-sm text-[#3d4756]">
                Your account is under review. You will be notified once approved.
              </p>
              <Link to="/login" className="btn-primary mt-6 inline-block">Back to login</Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-center mb-6">
                {invite ? 'Accept invitation' : 'Create Account'}
              </h2>

              {error && (
                <div role="alert" aria-live="polite" className="alert-error mb-4">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label className="label" htmlFor="register-name">Full Name</label>
                  <input
                    id="register-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="input"
                    placeholder="John Smith"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="register-company">Company Name</label>
                  <input
                    id="register-company"
                    name="company_name"
                    type="text"
                    autoComplete="organization"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    className="input"
                    placeholder="Acme Energy (Pty) Ltd"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="register-email">Email</label>
                  <input
                    id="register-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={Boolean(error)}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input"
                    placeholder="you@company.co.za"
                    required
                    readOnly={!!(invite?.email)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="register-password">Password</label>
                  <input
                    id="register-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    aria-describedby="register-password-hint"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="input"
                    placeholder="••••••••"
                    required
                    minLength={8}
                  />
                  <p id="register-password-hint" className="text-[11px] text-[#3d4756] mt-1">
                    Minimum 8 characters, including uppercase, lowercase, and a number.
                  </p>
                </div>
                <div>
                  <label className="label">Role</label>
                  {invite ? (
                    <div className="input flex items-center gap-2 bg-[#f5f8fb] cursor-default">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-[#dbecfb] text-[#1a3a5c]">
                        {ROLE_LABELS[invite.role] ?? invite.role}
                      </span>
                      <span className="text-xs text-[#6b7685]">set by invitation</span>
                    </div>
                  ) : (
                    <select
                      id="register-role"
                      name="role"
                      value={formData.requested_role}
                      onChange={(e) => setFormData({ ...formData, requested_role: e.target.value })}
                      className="input"
                    >
                      <option value="ipp_developer">IPP Developer</option>
                      <option value="trader">Energy Trader</option>
                      <option value="carbon_fund">Carbon Fund Manager</option>
                      <option value="offtaker">Offtaker / Corporate Buyer</option>
                      <option value="lender">Lender / Investor</option>
                      <option value="esums_owner">Asset Owner (Esums O&amp;M)</option>
                      <option value="esco">O&amp;M Operator (ESCO)</option>
                      <option value="epc_contractor">EPC Contractor</option>
                    </select>
                  )}
                </div>
                {!invite && (
                  <div>
                    <label className="label" htmlFor="register-motivation">Why are you joining? <span className="text-[#6b7685] font-normal">(optional)</span></label>
                    <textarea
                      id="register-motivation"
                      name="motivation"
                      rows={2}
                      value={formData.motivation}
                      onChange={(e) => setFormData({ ...formData, motivation: e.target.value })}
                      className="input resize-none"
                      placeholder="Brief description of your organisation and use case…"
                    />
                  </div>
                )}
                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={loading || !!inviteError}
                >
                  {loading ? (invite ? 'Joining…' : 'Submitting…') : (invite ? 'Join platform' : 'Request access')}
                </button>
              </form>

              <p className="text-center text-sm mt-6" style={{ color: '#3d4756' }}>
                Already have an account?{' '}
                <Link to="/login" className="font-semibold hover:underline" style={{ color: '#1a3a5c' }}>
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// LaunchRedirect — when a signed-in user hits /launch (no role) or the legacy
// /cockpit URL, check onboarding state then route to either /onboard (first
// visit) or /launch/:role (returning user). Anonymous users were already
// kicked to /login by the wrapping ProtectedRoute.
function LaunchRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    api.get('/onboarding/state')
      .then((r: any) => {
        const completed = r?.data?.completed ?? r?.data?.data?.completed ?? true;
        if (!completed) {
          navigate('/onboard', { replace: true });
        } else {
          navigate(`/launch/${user.role}`, { replace: true });
        }
      })
      .catch(() => {
        // If the check fails, fall through to the launch board
        navigate(`/launch/${user.role}`, { replace: true });
      });
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center">
      <span className="text-[#6b7685] text-sm">Loading…</span>
    </div>
  );
}

// App Router
function AppRoutes() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-ionex-canvas">
          <div className="spinner" />
        </div>
      }
    >
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/sso-landing" element={<SsoLanding />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/onboard" element={<ProtectedRoute><OnboardingWizard /></ProtectedRoute>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* Public stakeholder portals — token-authenticated, no JWT */}
      <Route path="/portal/:audience/:token" element={<LazyWorkbench><EsumsOmPortalView /></LazyWorkbench>} />
      <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
      <Route path="/settings/security" element={<ProtectedRoute><Layout><Security /></Layout></ProtectedRoute>} />
      {/* /cockpit and /launch (no role) both resolve to the signed-in user's
          role-specific board. Cockpit kept as a soft redirect so existing
          bookmarks keep working — but the Launchpad nav now points to
          /launch. */}
      <Route path="/cockpit" element={<ProtectedRoute><LaunchRedirect /></ProtectedRoute>} />
      <Route path="/feed" element={<ProtectedRoute><ActivityFeedShell /></ProtectedRoute>} />
      <Route path="/launch" element={<ProtectedRoute><LaunchRedirect /></ProtectedRoute>} />
      <Route path="/launch/:role" element={<ProtectedRoute><Layout><RoleLaunchBoard /></Layout></ProtectedRoute>} />
      <Route path="/contracts" element={<ProtectedRoute><Layout><Contracts /></Layout></ProtectedRoute>} />
      <Route path="/contracts/:id" element={<ProtectedRoute><Layout><ContractDetail /></Layout></ProtectedRoute>} />
      <Route path="/trading" element={<ProtectedRoute><Layout><Trading /></Layout></ProtectedRoute>} />
      <Route path="/settlement" element={<ProtectedRoute><Layout><Settlement /></Layout></ProtectedRoute>} />
      <Route path="/carbon" element={<ProtectedRoute><Layout><Carbon /></Layout></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><Layout><Projects /></Layout></ProtectedRoute>} />
      <Route path="/projects/:id" element={<ProtectedRoute><Layout><ProjectDetail /></Layout></ProtectedRoute>} />
      <Route path="/projects/:id/lifecycle" element={<ProtectedRoute><Layout><ProjectLifecycle /></Layout></ProtectedRoute>} />
      <Route path="/esg" element={<ProtectedRoute><Layout><ESG /></Layout></ProtectedRoute>} />
      <Route path="/grid" element={<ProtectedRoute><Layout><Grid /></Layout></ProtectedRoute>} />
      <Route path="/funds" element={<ProtectedRoute><Layout><Funds /></Layout></ProtectedRoute>} />
      <Route path="/funds/:id" element={<ProtectedRoute><Layout><FundDetail /></Layout></ProtectedRoute>} />
      <Route path="/pipeline" element={<ProtectedRoute><Layout><Pipeline /></Layout></ProtectedRoute>} />
      <Route path="/procurement" element={<ProtectedRoute><Layout><ProcurementHub /></Layout></ProtectedRoute>} />
      <Route path="/marketplace" element={<ProtectedRoute><Layout><Marketplace /></Layout></ProtectedRoute>} />
      <Route path="/modules" element={<ProtectedRoute><Layout><ModulesPage /></Layout></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><Layout><Admin /></Layout></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Layout><NationalDashboard /></Layout></ProtectedRoute>} />
      <Route path="/support" element={<ProtectedRoute><Layout><Support /></Layout></ProtectedRoute>} />
      <Route path="/admin/monitoring" element={<ProtectedRoute><Layout><Monitoring /></Layout></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Layout><Reports /></Layout></ProtectedRoute>} />
      <Route path="/lois" element={<ProtectedRoute><Layout><Lois /></Layout></ProtectedRoute>} />
      <Route path="/lois/:id" element={<ProtectedRoute><Layout><LoiDetail /></Layout></ProtectedRoute>} />
      <Route path="/intelligence" element={<ProtectedRoute><Layout><Intelligence /></Layout></ProtectedRoute>} />
      <Route path="/popia" element={<ProtectedRoute><Layout><Popia /></Layout></ProtectedRoute>} />
      <Route path="/briefing" element={<ProtectedRoute><Layout><Briefing /></Layout></ProtectedRoute>} />
      {/* Design Gallery — Stitch references for the 047 role workbench tabs. */}
      <Route path="/design-gallery" element={<ProtectedRoute><Layout><DesignGallery /></Layout></ProtectedRoute>} />
      <Route path="/search" element={<ProtectedRoute><Layout><SearchPage /></Layout></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Layout><NotificationsPage /></Layout></ProtectedRoute>} />
      <Route path="/schedule" element={<ProtectedRoute><Layout><SchedulePage /></Layout></ProtectedRoute>} />
      {/* National-scale suite pages — code-split + role-guarded at the API layer. */}
      <Route path="/regulator-suite" element={<ProtectedRoute><Layout><LazyWorkbench><RegulatorSuitePage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/grid-operator" element={<ProtectedRoute><Layout><LazyWorkbench><GridOperatorSuitePage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/trader-risk" element={<ProtectedRoute><Layout><LazyWorkbench><TraderRiskPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/lender-suite" element={<ProtectedRoute><Layout><LazyWorkbench><LenderSuitePage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/lender-suite/workout" element={<ProtectedRoute><Layout><LenderWorkoutPage /></Layout></ProtectedRoute>} />
      <Route path="/lender-suite/audit" element={<ProtectedRoute><Layout><LenderAuditPage /></Layout></ProtectedRoute>} />
      <Route path="/carbon-registry/workstation" element={<ProtectedRoute><Layout><CarbonWorkstationPage /></Layout></ProtectedRoute>} />
      <Route path="/grid-operator/workstation" element={<ProtectedRoute><Layout><GridOpsWorkstationPage /></Layout></ProtectedRoute>} />
      <Route path="/esums" element={<ProtectedRoute><Layout><LazyWorkbench><EsumsOmPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/settings/platform" element={<ProtectedRoute><Layout><LazyWorkbench><PlatformSettingsPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      {/* Field-tech mobile WO flow — no app chrome by design (fullscreen PWA) */}
      <Route path="/esums/field/wos" element={<ProtectedRoute><LazyWorkbench><EsumsOmFieldWosPage /></LazyWorkbench></ProtectedRoute>} />
      <Route path="/settings/compliance" element={<ProtectedRoute><Layout><LazyWorkbench><ComplianceSettingsPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/settings/compliance-admin" element={<ProtectedRoute><Layout><LazyWorkbench><ComplianceAdminPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/ops/depth" element={<ProtectedRoute><Layout><LazyWorkbench><DepthOpsPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/ops/l5" element={<ProtectedRoute><Layout><LazyWorkbench><OpsL5Page /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/admin/platform-console" element={<ProtectedRoute><Layout><LazyWorkbench><PlatformAdminConsolePage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/documents" element={<ProtectedRoute><Layout><LazyWorkbench><DocumentsPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/ipp/variations" element={<ProtectedRoute><Layout><LazyWorkbench><VariationOrdersPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/settlement-ops" element={<ProtectedRoute><Layout><LazyWorkbench><SettlementOpsPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/admin/bulk-ops" element={<ProtectedRoute><Layout><LazyWorkbench><BulkOpsPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/admin/paia" element={<ProtectedRoute><Layout><LazyWorkbench><PaiaAdminPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/settings/passkeys" element={<ProtectedRoute><Layout><LazyWorkbench><PasskeysPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      {/* Public status page — no auth required */}
      <Route path="/status" element={<LazyWorkbench><PublicStatusPage /></LazyWorkbench>} />
      <Route path="/legal" element={<LazyWorkbench><PublicLegalPage /></LazyWorkbench>} />
      <Route path="/audit" element={<LazyWorkbench><PublicAuditPage /></LazyWorkbench>} />
      <Route path="/esums/faults" element={<ProtectedRoute><Layout><LazyWorkbench><EsumsOmPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/esums/faults/:id" element={<ProtectedRoute><Layout><LazyWorkbench><EsumsOmPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/esums/workorders" element={<ProtectedRoute><Layout><LazyWorkbench><EsumsOmPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/esums/workorders/:id" element={<ProtectedRoute><Layout><LazyWorkbench><EsumsOmPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/esums/predictions/:id" element={<ProtectedRoute><Layout><LazyWorkbench><EsumsOmPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/esums/sites/:id" element={<ProtectedRoute><Layout><LazyWorkbench><EsumsSiteDetailPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/regulator-suite/workstation" element={<ProtectedRoute><Layout><RegulatorWorkstationPage /></Layout></ProtectedRoute>} />
      <Route path="/admin-platform/workstation" element={<ProtectedRoute><Layout><AdminWorkstationPage /></Layout></ProtectedRoute>} />
      <Route path="/support/workstation" element={<ProtectedRoute><Layout><SupportWorkstationPage /></Layout></ProtectedRoute>} />
      <Route path="/trader-risk/workstation" element={<ProtectedRoute><Layout><TraderWorkstationPage /></Layout></ProtectedRoute>} />
      <Route path="/ipp-lifecycle/workstation" element={<ProtectedRoute><Layout><IppWorkstationPage /></Layout></ProtectedRoute>} />
      <Route path="/offtaker-suite/workstation" element={<ProtectedRoute><Layout><OfftakerWorkstationPage /></Layout></ProtectedRoute>} />
      <Route path="/lender-suite/workstation" element={<ProtectedRoute><Layout><LenderWorkstationPage /></Layout></ProtectedRoute>} />
      <Route path="/esco/workstation" element={<ProtectedRoute><Layout><LazyWorkbench><EscoWorkstationPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/epc/workstation" element={<ProtectedRoute><Layout><LazyWorkbench><EpcWorkstationPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/trading/orders/:id" element={<ProtectedRoute><Layout><OrderDetailPage /></Layout></ProtectedRoute>} />
      <Route path="/settlement/invoices/:id" element={<ProtectedRoute><Layout><InvoiceDetailPage /></Layout></ProtectedRoute>} />
      <Route path="/projects/:id/operations" element={<ProtectedRoute><Layout><ProjectOperationsPage /></Layout></ProtectedRoute>} />
      <Route path="/admin/monitoring/settlement-dlq" element={<ProtectedRoute><Layout><SettlementDlqPage /></Layout></ProtectedRoute>} />
      <Route path="/support/tickets/:id" element={<ProtectedRoute><Layout><SupportTicketDetailPage /></Layout></ProtectedRoute>} />
      <Route path="/admin-platform/tenants/:id" element={<ProtectedRoute><Layout><TenantDetailPage /></Layout></ProtectedRoute>} />
      <Route path="/carbon-registry/vintages/:id" element={<ProtectedRoute><Layout><VintageDetailPage /></Layout></ProtectedRoute>} />
      <Route path="/regulator/licence-actions/:id" element={<ProtectedRoute><Layout><LicenceActionDetailPage /></Layout></ProtectedRoute>} />
      <Route path="/grid-operator/outages/:id" element={<ProtectedRoute><Layout><GridOutageDetailPage /></Layout></ProtectedRoute>} />
      <Route path="/admin-platform/billing-runs/:id" element={<ProtectedRoute><Layout><BillingRunDetailPage /></Layout></ProtectedRoute>} />
      <Route path="/ipp-lifecycle" element={<ProtectedRoute><Layout><LazyWorkbench><IppLifecyclePage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/offtaker-suite" element={<ProtectedRoute><Layout><LazyWorkbench><OfftakerSuitePage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/carbon-registry" element={<ProtectedRoute><Layout><LazyWorkbench><CarbonRegistryPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/admin-platform" element={<ProtectedRoute><Layout><LazyWorkbench><AdminPlatformPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      {import.meta.env.DEV ? (
        <Route path="/dev/signature" element={<SignaturePreview />} />
      ) : null}
      {/* UX exploration prototypes — auth-gated so API calls carry valid credentials */}
      <Route element={<ProtectedRoute />}>
        <Route path="/apex/register"                element={<LazyWorkbench><ApexRegisterPage /></LazyWorkbench>} />
        <Route path="/apex"                         element={<LazyWorkbench><ApexApp /></LazyWorkbench>} />
        <Route path="/apex/*"                       element={<LazyWorkbench><ApexApp /></LazyWorkbench>} />
        <Route path="/ux-prototype"               element={<LazyWorkbench><UxAlternativesIndex /></LazyWorkbench>} />
        <Route path="/ux-prototype/pulse-lens"    element={<LazyWorkbench><PulseLensPrototype /></LazyWorkbench>} />
        <Route path="/ux-prototype/time-axis"     element={<LazyWorkbench><TimeAxisPrototype /></LazyWorkbench>} />
        <Route path="/ux-prototype/command-lens"  element={<LazyWorkbench><CommandLensPrototype /></LazyWorkbench>} />
        <Route path="/ux-prototype/cockpit-grid"  element={<LazyWorkbench><CockpitGridPrototype /></LazyWorkbench>} />
      </Route>
      <Route path="/" element={<Navigate to="/feed" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </React.Suspense>
  );
}

// Main App
export default function App() {
  // Auto-flush IndexedDB mutation queue on visibility + connectivity.
  // Also handle SW background-sync postMessage requesting drain.
  React.useEffect(() => {
    const stop = startAutoFlush(30_000);
    installRum();
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === 'oe:flush-mutations') void flushQueue();
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => { stop(); navigator.serviceWorker?.removeEventListener('message', onMsg); };
  }, []);
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <CookieConsentBanner />
        <AiAssistantDock />
        <StepUpModal />
        <PromptHost />
        <GlobalOnboardingTourWrapper />
      </AuthProvider>
    </BrowserRouter>
  );
}

function GlobalOnboardingTourWrapper() {
  const { user } = useAuth();
  if (!user) return null;
  const baseSteps = [
    { key: 'welcome', title: `Welcome, ${user.email.split('@')[0]}.`, body: 'A couple of things to try first: your setup checklist on the home board, and the "What can I do?" search in any workstation.' },
    { key: 'ai-dock', title: 'Ask the assistant anything', body: 'The blue dock in the corner answers questions about any surface and can propose one-click actions you confirm before they run.' },
    { key: 'workstation', title: 'Workstations are role-specific', body: `Your default workstation lives at /${user.role}/workstation — listings, KPIs and one-click actions are tailored to your role.` },
  ];
  return <OnboardingTour scope={`platform.${user.role}`} steps={baseSteps}/>;
}