import React, { useState, useEffect, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './lib/useAuth';
import { api } from './lib/api';
import { MeridianFrame } from './meridian/MeridianFrame';

// Page components — all lazy so each route only pays for its chunk on first visit.
const DesignGallery         = React.lazy(() => import('./components/pages/DesignGallery').then(m => ({ default: m.DesignGallery })));
const NotFoundPage          = React.lazy(() => import('./components/pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const SearchPage            = React.lazy(() => import('./components/pages/SearchPage').then(m => ({ default: m.SearchPage })));
const NotificationsPage     = React.lazy(() => import('./components/pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const SchedulePage          = React.lazy(() => import('./components/pages/SchedulePage').then(m => ({ default: m.SchedulePage })));
const LaunchpadHomePage     = React.lazy(() => import('./components/launch/LaunchpadHomePage'));
const SubCockpitPage        = React.lazy(() => import('./components/launch/SubCockpitPage'));
const LoginPageNew          = React.lazy(() => import('./components/pages/LoginPage'));
const LenderWorkoutPage     = React.lazy(() => import('./components/pages/LenderWorkoutPage').then(m => ({ default: m.LenderWorkoutPage })));
const LenderAuditPage       = React.lazy(() => import('./components/pages/LenderAuditPage').then(m => ({ default: m.LenderAuditPage })));
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

// Meridian redesign — full-canvas pages with their own chrome (no Layout wrapper).
const HorizonPage           = React.lazy(() => import('./meridian/HorizonPage'));
const ThreadPage            = React.lazy(() => import('./meridian/ThreadPage'));
const AtlasPage             = React.lazy(() => import('./meridian/AtlasPage'));
const NewPage               = React.lazy(() => import('./meridian/NewPage'));
const LedgerPage            = React.lazy(() => import('./meridian/LedgerPage'));
const DealDeskPage          = React.lazy(() => import('./meridian/DealDeskPage'));
const MeridianSurfacePage   = React.lazy(() => import('./meridian/MeridianSurfacePage'));
const CommandPalette        = React.lazy(() => import('./meridian/CommandPalette'));

// Core page components
const NationalDashboard     = React.lazy(() => import('./components/pages/NationalDashboard').then(m => ({ default: m.NationalDashboard })));
const ContractDetail        = React.lazy(() => import('./components/pages/ContractDetail').then(m => ({ default: m.ContractDetail })));
const ProcurementHub        = React.lazy(() => import('./components/pages/ProcurementHub').then(m => ({ default: m.ProcurementHub })));
const ProjectDetail         = React.lazy(() => import('./components/pages/ProjectDetail').then(m => ({ default: m.ProjectDetail })));
const ProjectLifecycle      = React.lazy(() => import('./components/pages/ProjectLifecycle').then(m => ({ default: m.ProjectLifecycle })));
const ESG                   = React.lazy(() => import('./components/pages/ESG').then(m => ({ default: m.ESG })));
const Funds                 = React.lazy(() => import('./components/pages/Funds').then(m => ({ default: m.Funds })));
const FundDetail            = React.lazy(() => import('./components/pages/FundDetail').then(m => ({ default: m.FundDetail })));
const Marketplace           = React.lazy(() => import('./components/pages/Marketplace').then(m => ({ default: m.Marketplace })));
const ModulesPage           = React.lazy(() => import('./components/pages/ModulesPage').then(m => ({ default: m.ModulesPage })));
const Support               = React.lazy(() => import('./components/pages/Support').then(m => ({ default: m.Support })));
const Pipeline              = React.lazy(() => import('./components/pages/Pipeline').then(m => ({ default: m.Pipeline })));
const Reports               = React.lazy(() => import('./components/pages/Reports').then(m => ({ default: m.Reports })));
const Lois                  = React.lazy(() => import('./components/pages/Lois').then(m => ({ default: m.Lois })));
const LoiDetail             = React.lazy(() => import('./components/pages/LoiDetail').then(m => ({ default: m.LoiDetail })));
const Intelligence          = React.lazy(() => import('./components/pages/Intelligence').then(m => ({ default: m.Intelligence })));
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
const AdminRevenuePage      = React.lazy(() => import('./components/pages/AdminRevenuePage').then(m => ({ default: m.AdminRevenuePage })));
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
const LaunchpadNavPrototype = React.lazy(() => import('./ux-alternatives/launchpad-nav/LaunchpadNav'));

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
            <div className="rounded-xl p-6 space-y-3" style={{ border: '1px solid oklch(0.87 0.006 250)', background: 'oklch(0.99 0.002 80)' }}>
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

// PrototypeGate — ux-alternatives explorations are team-only surfaces.
// Reachable for admins, or anyone who sets localStorage['oe_prototypes']='1'.
// Everyone else lands on their launchpad.
function PrototypeGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const optedIn = typeof localStorage !== 'undefined' && localStorage.getItem('oe_prototypes') === '1';
  if (!optedIn && user?.role !== 'admin') {
    return <Navigate to="/launch" replace />;
  }
  return <>{children}</>;
}

// Layout — all authenticated pages wear the single CEC (Meridian) chrome via MeridianFrame.
// AppShell retired and deleted; MeridianFrame is the single authed-page chrome.
function Layout({ children }: { children: ReactNode }) {
  return <MeridianFrame>{children}</MeridianFrame>;
}

// AppShellLayout — alias kept so workstation routes compile without touching each line
function AppShellLayout({ children }: { children: ReactNode }) {
  return <Layout>{children}</Layout>;
}

// ─── PAGES ───


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
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'oklch(0.96 0.003 250)' }}>
      <div className="text-center">
        {error ? (
          <p className="text-[14px]" style={{ color: 'oklch(0.48 0.20 20)' }}>{error}</p>
        ) : (
          <>
            <div className="spinner mx-auto mb-4" />
            <p className="text-[14px]" style={{ color: 'oklch(0.40 0.009 250)' }}>Completing Microsoft sign-in…</p>
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, oklch(0.12 0.010 250) 0%, oklch(0.18 0.012 250) 50%, oklch(0.22 0.013 250) 100%)' }}>
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
          'linear-gradient(135deg, oklch(0.12 0.010 250) 0%, oklch(0.18 0.012 250) 50%, oklch(0.22 0.013 250) 100%)',
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
            <div className="mb-6 rounded-lg p-4" style={{ border: '1px solid oklch(0.46 0.16 55 / 0.30)', background: 'oklch(0.94 0.02 250 / 0.60)' }}>
              <p className="text-[11px] font-mono uppercase tracking-[0.15em] mb-1" style={{ color: 'oklch(0.46 0.16 55)' }}>You've been invited</p>
              <p className="text-sm font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>
                {invite.invited_by_company || invite.invited_by_name} has invited you to join as{' '}
                <span style={{ color: 'oklch(0.46 0.16 55)' }}>{ROLE_LABELS[invite.role] ?? invite.role}</span>
              </p>
              {invite.project_name && (
                <p className="text-xs mt-1" style={{ color: 'oklch(0.40 0.009 250)' }}>
                  Project: <span className="font-medium">{invite.project_name}</span>
                  {invite.capacity_mw ? ` · ${invite.capacity_mw} MW` : ''}
                  {invite.technology ? ` · ${invite.technology}` : ''}
                </p>
              )}
              {invite.note && (
                <p className="text-xs mt-1 italic" style={{ color: 'oklch(0.40 0.009 250)' }}>"{invite.note}"</p>
              )}
            </div>
          )}

          {inviteError && (
            <div role="alert" className="alert-error mb-4">{inviteError}</div>
          )}

          {submitted ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✓</div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'oklch(0.17 0.010 250)' }}>Registration submitted</h2>
              <p className="text-sm" style={{ color: 'oklch(0.40 0.009 250)' }}>
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
                  <p id="register-password-hint" className="text-[11px] mt-1" style={{ color: 'oklch(0.40 0.009 250)' }}>
                    Minimum 8 characters, including uppercase, lowercase, and a number.
                  </p>
                </div>
                <div>
                  <label className="label">Role</label>
                  {invite ? (
                    <div className="input flex items-center gap-2 cursor-default" style={{ background: 'oklch(0.96 0.003 250)' }}>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase" style={{ background: 'oklch(0.94 0.02 250)', color: 'oklch(0.46 0.16 55)' }}>
                        {ROLE_LABELS[invite.role] ?? invite.role}
                      </span>
                      <span className="text-xs" style={{ color: 'oklch(0.40 0.009 250)' }}>set by invitation</span>
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
                    <label className="label" htmlFor="register-motivation">Why are you joining? <span className="font-normal" style={{ color: 'oklch(0.40 0.009 250)' }}>(optional)</span></label>
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

              <p className="text-center text-sm mt-6" style={{ color: 'oklch(0.40 0.009 250)' }}>
                Already have an account?{' '}
                <Link to="/login" className="font-semibold hover:underline" style={{ color: 'oklch(0.46 0.16 55)' }}>
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
// visit) or /horizon (returning user — Meridian cutover). Anonymous users were
// already kicked to /login by the wrapping ProtectedRoute.
const VALID_LAUNCH_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'ipp', 'grid_operator', 'grid',
  'offtaker', 'lender', 'carbon_fund', 'carbon', 'regulator', 'support',
  'esco', 'epc_contractor',
]);

function LaunchRedirect() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    if (!VALID_LAUNCH_ROLES.has(user.role)) {
      logout();
      navigate('/login', { replace: true });
      return;
    }
    api.get('/onboarding/state')
      .then((r: any) => {
        const completed = r?.data?.completed ?? r?.data?.data?.completed ?? true;
        if (!completed) {
          navigate('/onboard', { replace: true });
        } else {
          navigate('/horizon', { replace: true });
        }
      })
      .catch(() => {
        navigate('/horizon', { replace: true });
      });
  }, [user, navigate, logout]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'oklch(0.96 0.003 250)' }}>
      <span className="text-sm" style={{ color: 'oklch(0.40 0.009 250)' }}>Loading…</span>
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
      <Route path="/login" element={<LoginPageNew />} />
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
      <Route path="/feed" element={<ProtectedRoute><AppShellLayout><ActivityFeedShell /></AppShellLayout></ProtectedRoute>} />
      <Route path="/launch" element={<ProtectedRoute><LaunchRedirect /></ProtectedRoute>} />
      {/* Meridian Horizon board — supplies its own chrome, so no Layout/AppShell wrapper. */}
      <Route path="/horizon" element={<ProtectedRoute><HorizonPage /></ProtectedRoute>} />
      <Route path="/thread/:chainKey/:id" element={<ProtectedRoute><ThreadPage /></ProtectedRoute>} />
      <Route path="/atlas" element={<ProtectedRoute><AtlasPage /></ProtectedRoute>} />
      <Route path="/new" element={<ProtectedRoute><NewPage /></ProtectedRoute>} />
      <Route path="/ledger/:chainKey" element={<ProtectedRoute><LedgerPage /></ProtectedRoute>} />
      {/* One parametric route for every non-chain Meridian surface (master-data CRUD,
          settings, analytics/ML panels, connectors). Resolves SURFACE_REGISTRY by
          `${role}:${key}`; full-canvas, no Layout/AppShell wrapper. */}
      <Route path="/surface/:key" element={<ProtectedRoute><MeridianSurfacePage /></ProtectedRoute>} />
      <Route path="/deals" element={<ProtectedRoute><DealDeskPage /></ProtectedRoute>} />
      {/* Meridian cutover — legacy role launchpads redirect to Horizon. The
          launchpad components stay routable at /launch-legacy/:role for
          reference, but their internal nav still targets /launch/* and so
          exits to Horizon on first click; workstation routes are untouched. */}
      <Route path="/launch/:role" element={<Navigate to="/horizon" replace />} />
      <Route path="/launch/:role/:domain" element={<Navigate to="/horizon" replace />} />
      <Route path="/launch-legacy/:role" element={<ProtectedRoute><AppShellLayout><LaunchpadHomePage /></AppShellLayout></ProtectedRoute>} />
      <Route path="/launch-legacy/:role/:domain" element={<ProtectedRoute><AppShellLayout><SubCockpitPage /></AppShellLayout></ProtectedRoute>} />
      {/* TODO: DELETE legacy listing pages — redirected to workstation equivalents */}
      <Route path="/contracts" element={<Navigate to="/horizon" replace />} />
      <Route path="/contracts/:id" element={<ProtectedRoute><Layout><ContractDetail /></Layout></ProtectedRoute>} />
      <Route path="/trading" element={<Navigate to="/horizon" replace />} />
      <Route path="/settlement" element={<Navigate to="/horizon" replace />} />
      <Route path="/carbon" element={<Navigate to="/horizon" replace />} />
      <Route path="/projects" element={<Navigate to="/horizon" replace />} />
      <Route path="/projects/:id" element={<ProtectedRoute><Layout><ProjectDetail /></Layout></ProtectedRoute>} />
      <Route path="/projects/:id/lifecycle" element={<ProtectedRoute><Layout><ProjectLifecycle /></Layout></ProtectedRoute>} />
      <Route path="/esg" element={<ProtectedRoute><Layout><ESG /></Layout></ProtectedRoute>} />
      <Route path="/grid" element={<Navigate to="/horizon" replace />} />
      <Route path="/funds" element={<ProtectedRoute><Layout><Funds /></Layout></ProtectedRoute>} />
      <Route path="/funds/:id" element={<ProtectedRoute><Layout><FundDetail /></Layout></ProtectedRoute>} />
      <Route path="/pipeline" element={<ProtectedRoute><Layout><Pipeline /></Layout></ProtectedRoute>} />
      <Route path="/procurement" element={<ProtectedRoute><Layout><ProcurementHub /></Layout></ProtectedRoute>} />
      <Route path="/marketplace" element={<ProtectedRoute><Layout><Marketplace /></Layout></ProtectedRoute>} />
      <Route path="/modules" element={<ProtectedRoute><Layout><ModulesPage /></Layout></ProtectedRoute>} />
      <Route path="/admin" element={<Navigate to="/horizon" replace />} />
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
      <Route path="/carbon-registry/workstation" element={<Navigate to="/horizon" replace />} />
      <Route path="/grid-operator/workstation" element={<Navigate to="/horizon" replace />} />
      <Route path="/esums" element={<Navigate to="/horizon" replace />} />
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
      <Route path="/admin/revenue" element={<ProtectedRoute><Layout><LazyWorkbench><AdminRevenuePage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/settings/passkeys" element={<ProtectedRoute><Layout><LazyWorkbench><PasskeysPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      {/* Public status page — no auth required */}
      <Route path="/status" element={<LazyWorkbench><PublicStatusPage /></LazyWorkbench>} />
      <Route path="/legal" element={<LazyWorkbench><PublicLegalPage /></LazyWorkbench>} />
      <Route path="/audit" element={<LazyWorkbench><PublicAuditPage /></LazyWorkbench>} />
      <Route path="/esums/faults" element={<Navigate to="/horizon" replace />} />
      <Route path="/esums/faults/:id" element={<Navigate to="/horizon" replace />} />
      <Route path="/esums/workorders" element={<Navigate to="/horizon" replace />} />
      <Route path="/esums/workorders/:id" element={<Navigate to="/horizon" replace />} />
      <Route path="/esums/predictions/:id" element={<Navigate to="/horizon" replace />} />
      <Route path="/esums/sites/:id" element={<ProtectedRoute><Layout><LazyWorkbench><EsumsSiteDetailPage /></LazyWorkbench></Layout></ProtectedRoute>} />
      <Route path="/regulator-suite/workstation" element={<Navigate to="/horizon" replace />} />
      <Route path="/admin-platform/workstation" element={<Navigate to="/horizon" replace />} />
      <Route path="/support/workstation" element={<Navigate to="/horizon" replace />} />
      <Route path="/trader-risk/workstation" element={<Navigate to="/horizon" replace />} />
      <Route path="/ipp-lifecycle/workstation" element={<Navigate to="/horizon" replace />} />
      <Route path="/offtaker-suite/workstation" element={<Navigate to="/horizon" replace />} />
      <Route path="/lender-suite/workstation" element={<Navigate to="/horizon" replace />} />
      <Route path="/esco/workstation" element={<Navigate to="/horizon" replace />} />
      <Route path="/epc/workstation" element={<Navigate to="/horizon" replace />} />
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
      {/* UX exploration prototypes — auth-gated so API calls carry valid
          credentials, and PrototypeGate keeps them team-only in prod */}
      <Route element={<ProtectedRoute><PrototypeGate><Outlet /></PrototypeGate></ProtectedRoute>}>
        <Route path="/apex/register"                element={<LazyWorkbench><ApexRegisterPage /></LazyWorkbench>} />
        <Route path="/apex"                         element={<LazyWorkbench><ApexApp /></LazyWorkbench>} />
        <Route path="/apex/*"                       element={<LazyWorkbench><ApexApp /></LazyWorkbench>} />
        <Route path="/ux-prototype"               element={<LazyWorkbench><UxAlternativesIndex /></LazyWorkbench>} />
        <Route path="/ux-prototype/pulse-lens"    element={<LazyWorkbench><PulseLensPrototype /></LazyWorkbench>} />
        <Route path="/ux-prototype/time-axis"     element={<LazyWorkbench><TimeAxisPrototype /></LazyWorkbench>} />
        <Route path="/ux-prototype/command-lens"  element={<LazyWorkbench><CommandLensPrototype /></LazyWorkbench>} />
        <Route path="/ux-prototype/cockpit-grid"  element={<LazyWorkbench><CockpitGridPrototype /></LazyWorkbench>} />
        <Route path="/ux-prototype/launchpad-nav" element={<LazyWorkbench><LaunchpadNavPrototype /></LazyWorkbench>} />
      </Route>
      <Route path="/" element={<Navigate to="/feed" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    {/* Meridian ⌘K palette — global on every authed page; renders null when
        there's no signed-in role config. */}
    <CommandPalette />
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
    { key: 'welcome', title: `Welcome, ${user.email.split('@')[0]}.`, body: 'Your Horizon board is home — live cases laid out by time to consequence, ranked by money at risk. The most urgent work is already in front of you.' },
    { key: 'atlas', title: 'Find any function with ⌘K', body: 'Atlas is the full index of everything your role can do. Press ⌘K anywhere to search functions and open one straight to the right tab.' },
    { key: 'ai-dock', title: 'Ask the assistant anything', body: 'The blue dock in the corner answers questions about any surface and can propose one-click actions you confirm before they run.' },
  ];
  return <OnboardingTour scope={`platform.${user.role}`} steps={baseSteps}/>;
}