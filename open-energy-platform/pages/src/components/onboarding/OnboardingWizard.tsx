// ═══════════════════════════════════════════════════════════════════════════
// OnboardingWizard — full-page, multi-step wizard shown to new users before
// their first visit to the workspace.
//
// Visual shell is a split-panel continuous with LoginPage: the same deep-indigo
// brand panel (energy-mesh, copper accent) on the left carrying a live step
// rail, the form on the right. Login → onboarding reads as one brand moment,
// not two products. All wizard logic (state, endpoints, skip) is unchanged.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/useAuth';
import { api } from '../../lib/api';
import { LogoMark } from '../Logo';
import {
  WelcomeStep,
  EsumsSiteSetupStep,
  EsumsDeviceConfigStep,
  EsumsDataSourcesStep,
  EsumsAlertsStep,
  IppCompanyProfileStep,
  IppFirstProjectStep,
  IppComplianceStep,
  TraderEntityStep,
  TraderRiskLimitsStep,
  LenderFundSetupStep,
  LenderCoverageStep,
  OfftakerEntityStep,
  OfftakerPpaPrefsStep,
  CarbonRegistryStep,
  CarbonMethodologyStep,
  GridAuthorityStep,
  GridServicesStep,
  RegulatorBodyStep,
  RegulatorJurisdictionStep,
  SupportOrgStep,
  SupportSlaStep,
} from './steps';
import type { StepProps } from './steps';

// ─── Brand tokens — mirror LoginPage's Substation identity ───────────────────
const B = {
  brandBg:     'oklch(0.19 0.055 272)',
  brandText:   'oklch(0.98 0.004 255)',
  brandSubtle: 'oklch(0.74 0.030 262)',
  brandAccent: 'oklch(0.74 0.110 272)',
  brandAmber:  'oklch(0.70 0.110 55)',
};

// ─── Role accent colour ───────────────────────────────────────────────────────
// Unified to the Substation brand indigo (= meridian.css --petrol) so onboarding
// reads as the same product as the desk it leads into. Kept as a per-role map so
// a future controlled per-role tint can slot in without touching the call-sites.
const SUBSTATION_INDIGO = '#1f3bb3';
const ROLE_COLORS: Record<string, string> = {
  esums_owner:   SUBSTATION_INDIGO,
  ipp_developer: SUBSTATION_INDIGO,
  trader:        SUBSTATION_INDIGO,
  lender:        SUBSTATION_INDIGO,
  offtaker:      SUBSTATION_INDIGO,
  carbon_fund:   SUBSTATION_INDIGO,
  grid_operator: SUBSTATION_INDIGO,
  regulator:     SUBSTATION_INDIGO,
  support:       SUBSTATION_INDIGO,
  admin:         SUBSTATION_INDIGO,
};

// ─── Step sequences ──────────────────────────────────────────────────────────

const STEP_SEQUENCES: Record<string, string[]> = {
  esums_owner:   ['welcome', 'site_setup', 'device_config', 'data_sources', 'alerts', 'complete'],
  ipp_developer: ['welcome', 'company_profile', 'first_project', 'compliance', 'complete'],
  trader:        ['welcome', 'entity', 'risk_limits', 'complete'],
  lender:        ['welcome', 'fund_setup', 'coverage', 'complete'],
  offtaker:      ['welcome', 'entity', 'ppa_prefs', 'complete'],
  carbon_fund:   ['welcome', 'registry', 'methodology', 'complete'],
  grid_operator: ['welcome', 'authority', 'services', 'complete'],
  regulator:     ['welcome', 'body', 'jurisdiction', 'complete'],
  support:       ['welcome', 'org', 'sla', 'complete'],
  admin:         ['welcome', 'complete'],
  // Not signup-selectable (validation.ts role enum) and have no dedicated wizard
  // step components — mirror the backend STEP_SEQUENCES in onboarding.ts so the
  // SPA never falls through to a different shape than the server returns. esco
  // still seeds an om_sites row on completion; epc stays manifest-only.
  esco:           ['welcome', 'complete'],
  epc_contractor: ['welcome', 'complete'],
};

// ─── Step metadata ────────────────────────────────────────────────────────────

interface StepMeta {
  title: string;
  subtitle: string;
  component: React.ComponentType<StepProps>;
}

const STEP_META: Record<string, StepMeta> = {
  welcome:         { title: 'Welcome',                     subtitle: '',                                          component: WelcomeStep },
  site_setup:      { title: 'Set up your first site',      subtitle: 'Tell us about the site you want to monitor.', component: EsumsSiteSetupStep },
  device_config:   { title: 'Configure monitoring devices', subtitle: 'How are your inverters and meters connected?', component: EsumsDeviceConfigStep },
  data_sources:    { title: 'Data source connections',     subtitle: 'Add sensors, inverters or APIs to read from.',  component: EsumsDataSourcesStep },
  alerts:          { title: 'Alert preferences',           subtitle: 'Choose how and when you want to be notified.', component: EsumsAlertsStep },
  company_profile: { title: 'Your company profile',        subtitle: 'Basic details for compliance and reporting.',  component: IppCompanyProfileStep },
  first_project:   { title: 'Register your first project', subtitle: 'We\'ll set up your project lifecycle workspace.', component: IppFirstProjectStep },
  compliance:      { title: 'Compliance references',       subtitle: 'Add NERSA and IE details if you have them.',  component: IppComplianceStep },
  entity:          { title: 'Trading entity details',      subtitle: 'We need your FSCA and LEI identifiers.',      component: TraderEntityStep },
  risk_limits:     { title: 'Initial risk preferences',    subtitle: 'Set your starting position and VaR limits.',  component: TraderRiskLimitsStep },
  fund_setup:      { title: 'Fund details',                subtitle: 'Tell us about your fund structure.',          component: LenderFundSetupStep },
  coverage:        { title: 'Coverage preferences',        subtitle: 'Which technologies and provinces do you cover?', component: LenderCoverageStep },
  ppa_prefs:       { title: 'PPA preferences',             subtitle: 'What does your ideal offtake agreement look like?', component: OfftakerPpaPrefsStep },
  registry:        { title: 'Registry memberships',        subtitle: 'Which carbon registries are you accredited under?', component: CarbonRegistryStep },
  methodology:     { title: 'Methodology focus',           subtitle: 'Technology types and vintage preferences.',   component: CarbonMethodologyStep },
  authority:       { title: 'Grid authority details',      subtitle: 'Your grid zone and managed capacity.',        component: GridAuthorityStep },
  services:        { title: 'Ancillary services managed',  subtitle: 'Which services do you procure?',              component: GridServicesStep },
  body:            { title: 'Regulatory body',             subtitle: 'Your jurisdiction and licence classes.',       component: RegulatorBodyStep },
  jurisdiction:    { title: 'Operational preferences',     subtitle: 'Case volumes and escalation contacts.',        component: RegulatorJurisdictionStep },
  org:             { title: 'Support organisation',        subtitle: 'Your OEM brands and coverage footprint.',     component: SupportOrgStep },
  sla:             { title: 'SLA configuration',           subtitle: 'Resolution targets for each priority tier.',  component: SupportSlaStep },
  // offtaker entity reuses TraderEntityStep but for the offtaker role it uses OfftakerEntityStep
};

// Short rail labels — the left-panel step rail needs terser names than STEP_META titles.
const RAIL_LABELS: Record<string, string> = {
  welcome:         'Welcome',
  site_setup:      'First site',
  device_config:   'Devices',
  data_sources:    'Data sources',
  alerts:          'Alerts',
  company_profile: 'Company',
  first_project:   'First project',
  compliance:      'Compliance',
  entity:          'Entity',
  risk_limits:     'Risk limits',
  fund_setup:      'Fund',
  coverage:        'Coverage',
  ppa_prefs:       'PPA preferences',
  registry:        'Registries',
  methodology:     'Methodology',
  authority:       'Authority',
  services:        'Services',
  body:            'Regulatory body',
  jurisdiction:    'Jurisdiction',
  org:             'Organisation',
  sla:             'SLAs',
};

// Override entity step for offtaker role
const STEP_COMPONENT_OVERRIDES: Record<string, Record<string, React.ComponentType<StepProps>>> = {
  offtaker: {
    entity: OfftakerEntityStep,
  },
};

// ─── Role labels ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  esums_owner:   'Asset Owner',
  ipp_developer: 'IPP Developer',
  trader:        'Trader',
  lender:        'Lender',
  offtaker:      'Offtaker',
  carbon_fund:   'Carbon Fund',
  grid_operator: 'Grid Operator',
  regulator:     'Regulator',
  support:       'OEM Support',
  admin:         'Administrator',
};

// What the workspace will hold once setup lands — one line per role, shown under
// the step rail so the wizard sells the destination, not just the form.
const ROLE_PROMISE: Record<string, string> = {
  esums_owner:   'Fleet health, faults, work orders and revenue — live from your first site.',
  ipp_developer: 'Your project lifecycle from procurement to COD, with lender and NERSA reporting built in.',
  trader:        'Order book, positions, margin and settlement — one desk.',
  lender:        'Facilities, covenants, disbursements and DSCR watch across your book.',
  offtaker:      'Procurement, PPAs, metering and settlement in one thread.',
  carbon_fund:   'Credits, retirements, funds and registry transfers, audit-ready.',
  grid_operator: 'Connections, dispatch, curtailment and ancillary services.',
  regulator:     'Licences, tariffs, surveillance and enforcement in one docket.',
  support:       'Faults, SLAs, parts and warranty across every site you cover.',
  admin:         'Every role, every chain, one cockpit.',
};

// ─── Brand rail (left panel) ─────────────────────────────────────────────────

function BrandRail({ steps, currentStep, role }: { steps: string[]; currentStep: string; role: string }) {
  const contentSteps = steps.filter((s) => s !== 'complete');
  const currentIdx = contentSteps.indexOf(currentStep);
  return (
    <div
      className="relative hidden lg:flex flex-col justify-between overflow-hidden"
      style={{
        background: `radial-gradient(ellipse at 20% 15%, oklch(0.26 0.055 205) 0%, transparent 50%), radial-gradient(ellipse at 85% 85%, oklch(0.24 0.05 70) 0%, transparent 50%), ${B.brandBg}`,
        color: B.brandText,
        padding: '40px 44px',
      }}
    >
      {/* Energy mesh — same family as the login panel */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" preserveAspectRatio="xMidYMid slice" viewBox="0 0 600 800">
        <style>{`
          @keyframes oe-ob-pulse { 0%, 100% { opacity: 0.05; } 50% { opacity: 0.18; } }
          @media (prefers-reduced-motion: reduce) { .oe-ob-node { animation: none !important; } }
        `}</style>
        {[
          { cx: 110, cy: 160, r: 55, d: 0,   c: B.brandAccent },
          { cx: 470, cy: 110, r: 40, d: 1.1, c: B.brandAmber },
          { cx: 300, cy: 430, r: 75, d: 0.5, c: B.brandAccent },
          { cx: 90,  cy: 640, r: 38, d: 2.0, c: B.brandAmber },
          { cx: 520, cy: 680, r: 50, d: 1.6, c: B.brandAccent },
        ].map((n, i) => (
          <circle key={i} className="oe-ob-node" cx={n.cx} cy={n.cy} r={n.r} fill={n.c}
            style={{ opacity: 0.06, animation: `oe-ob-pulse 6s ease-in-out ${n.d}s infinite` }} />
        ))}
        <line x1="110" y1="160" x2="470" y2="110" stroke={B.brandAccent} strokeWidth="0.5" opacity="0.14" />
        <line x1="470" y1="110" x2="300" y2="430" stroke={B.brandAccent} strokeWidth="0.5" opacity="0.10" />
        <line x1="110" y1="160" x2="300" y2="430" stroke={B.brandAmber} strokeWidth="0.5" opacity="0.10" />
        <line x1="300" y1="430" x2="90" y2="640" stroke={B.brandAccent} strokeWidth="0.5" opacity="0.10" />
        <line x1="300" y1="430" x2="520" y2="680" stroke={B.brandAmber} strokeWidth="0.5" opacity="0.08" />
      </svg>

      {/* Logo + wordmark — identical treatment to LoginPage */}
      <div className="relative z-[1]">
        <div className="inline-flex items-center gap-3">
          <div className="flex items-center justify-center rounded-[10px] p-2" style={{ background: 'rgba(255,255,255,0.95)', boxShadow: '0 4px 16px rgba(0,0,0,0.30)' }}>
            <LogoMark size={32} variant="colour" />
          </div>
          <div>
            <div className="inline-block text-[20px] font-extrabold leading-[1.1] pb-[3px]" style={{ color: B.brandText, letterSpacing: '0.14em', borderBottom: `3px solid ${B.brandAccent}` }}>
              CEC
            </div>
            <div className="mt-1.5 text-[10px] uppercase" style={{ letterSpacing: '0.18em', color: B.brandSubtle, fontFamily: 'ui-monospace, monospace' }}>
              Consolidated Energy Cockpit
            </div>
          </div>
        </div>
      </div>

      {/* Step rail — the sequence is real, so numbered markers carry information */}
      <div className="relative z-[1]">
        <div className="text-[11px] uppercase font-semibold mb-5" style={{ letterSpacing: '0.16em', color: B.brandSubtle }}>
          Workspace setup · {ROLE_LABELS[role] || role}
        </div>
        <ol className="m-0 p-0 list-none space-y-1">
          {contentSteps.map((s, i) => {
            const active = i === currentIdx;
            const done = i < currentIdx;
            return (
              <li key={s} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-200"
                style={{ background: active ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                aria-current={active ? 'step' : undefined}>
                <span
                  className="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0 transition-colors duration-200"
                  style={done
                    ? { background: B.brandAmber, color: '#1a1205' }
                    : active
                      ? { background: B.brandText, color: '#111c4e' }
                      : { background: 'rgba(255,255,255,0.10)', color: B.brandSubtle }}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className="text-[13.5px] font-medium transition-colors duration-200"
                  style={{ color: active ? B.brandText : done ? B.brandSubtle : 'oklch(0.58 0.03 262)' }}>
                  {RAIL_LABELS[s] || STEP_META[s]?.title || s}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 text-[13px] leading-relaxed max-w-[300px]" style={{ color: B.brandSubtle }}>
          {ROLE_PROMISE[role] || ROLE_PROMISE.admin}
        </p>
      </div>

      <div className="relative z-[1] text-[11px]" style={{ color: 'oklch(0.50 0.03 262)' }}>
        About 2 minutes · you can skip and finish later from your cockpit
      </div>
    </div>
  );
}

// ─── Mobile progress (dots survive only below lg, where the rail is hidden) ──

function ProgressDots({ steps, currentStep, accentColor }: { steps: string[]; currentStep: string; accentColor: string }) {
  const displaySteps = steps.filter((s) => s !== 'complete');
  const currentIdx = displaySteps.indexOf(currentStep);
  return (
    <div className="flex gap-2 lg:hidden" role="progressbar"
         aria-valuenow={currentIdx + 1} aria-valuemin={1} aria-valuemax={displaySteps.length}
         aria-valuetext={`Step ${currentIdx + 1} of ${displaySteps.length}`}>
      {displaySteps.map((s, i) => {
        const active = i === currentIdx;
        const done = i < currentIdx;
        return (
          <div key={s} className="rounded-full transition-all duration-200"
            style={{ width: active ? 24 : 8, height: 8, backgroundColor: active || done ? accentColor : '#dde3ee', opacity: done ? 0.5 : 1 }} />
        );
      })}
    </div>
  );
}

// ─── OnboardingWizard ────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<string>('welcome');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string>('');
  const [confirmSkip, setConfirmSkip] = useState(false);

  const role = user?.role || 'admin';
  const accentColor = ROLE_COLORS[role] || ROLE_COLORS['admin'];
  const steps = STEP_SEQUENCES[role] || STEP_SEQUENCES['admin'];
  const userName = (user as any)?.name || (user as any)?.email || '';

  // ── On mount: fetch onboarding state ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    api.get('/onboarding/state')
      .then((res: any) => {
        const { completed, step: serverStep, data: serverData } = res.data || {};
        if (completed) {
          // /launch/:role was retired in Phase E (now redirects to Horizon).
          // Send returning, already-onboarded users straight to their workspace.
          navigate('/horizon', { replace: true });
          return;
        }
        if (serverStep && serverStep !== 'welcome') {
          setStep(serverStep);
        }
        if (serverData && typeof serverData === 'object') {
          setFormData(serverData as Record<string, unknown>);
        }
      })
      .catch(() => {
        // If onboarding state fetch fails, start from welcome
      })
      .finally(() => {
        setInitializing(false);
      });
  }, [user, role, navigate]);

  // Escape closes the skip-confirm modal (Meridian veil idiom).
  useEffect(() => {
    if (!confirmSkip) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmSkip(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmSkip]);

  // ── Form data helpers ──────────────────────────────────────────────────────
  const handleChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleNext = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/onboarding/step', { step, data: formData });
      const { next_step } = (res.data || {}) as { next_step: string | null };

      if (!next_step || next_step === null) {
        // All done — fire complete, then land on Horizon with the welcome flag so
        // the Getting-Started card shows (the provisioning cascade writes the
        // manifest async via the queue; the card tolerates it settling).
        await api.post('/onboarding/complete', {});
        navigate('/horizon?welcome=1', { replace: true });
      } else {
        setStep(next_step);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    const idx = steps.indexOf(step);
    if (idx > 0) {
      setStep(steps[idx - 1]);
    }
  };

  // Skipping discards anything entered so far; confirm in-page (brand-consistent,
  // not a native window.confirm) before throwing it away.
  const doSkip = async () => {
    setConfirmSkip(false);
    setLoading(true);
    try {
      await api.post('/onboarding/skip', {});
    } catch {
      // Best-effort
    } finally {
      setLoading(false);
      navigate('/horizon', { replace: true });
    }
  };

  // ── Render guards ──────────────────────────────────────────────────────────
  if (initializing) {
    return (
      <div className="min-h-[100dvh] bg-[#f4f6fa] flex items-center justify-center">
        <div className="text-[#5b6b85] text-sm">Loading…</div>
      </div>
    );
  }

  // Resolve the component for the current step
  const stepMeta = STEP_META[step];
  const roleOverrides = STEP_COMPONENT_OVERRIDES[role] || {};
  const StepComponent = roleOverrides[step]
    ? roleOverrides[step]
    : stepMeta?.component || WelcomeStep;

  const stepIdx = steps.indexOf(step);
  const isFirst = stepIdx === 0;
  const isLastContent = step === steps[steps.length - 2]; // step before 'complete'
  const isWelcome = step === 'welcome';

  // Visible steps (exclude 'complete') for progress
  const contentSteps = steps.filter((s) => s !== 'complete');
  const currentContentIdx = contentSteps.indexOf(step);

  return (
    <div className="min-h-[100dvh] bg-white grid lg:grid-cols-[420px_1fr]">
      <BrandRail steps={steps} currentStep={step} role={role} />

      {/* Right — form panel */}
      <div className="flex flex-col min-h-[100dvh] lg:min-h-0">
        {/* Mobile-only compact brand bar */}
        <div className="lg:hidden flex items-center justify-between px-5 py-3 border-b border-[#e6eaf2]" style={{ background: B.brandBg }}>
          <div className="flex items-center gap-2">
            <div className="rounded-md p-1" style={{ background: 'rgba(255,255,255,0.95)' }}>
              <LogoMark size={20} variant="colour" />
            </div>
            <span className="text-[13px] font-extrabold" style={{ color: B.brandText, letterSpacing: '0.12em' }}>CEC</span>
          </div>
          <ProgressDots steps={steps} currentStep={step} accentColor="#ffffff" />
        </div>

        <div className="flex-1 flex flex-col justify-center px-5 sm:px-12 xl:px-20 py-10">
          <div className="w-full max-w-[560px] mx-auto lg:mx-0">
            {/* Step header */}
            {!isWelcome && (
              <div className="mb-7">
                <div className="text-[11px] font-semibold text-[#5b6b85] uppercase tracking-[0.14em] mb-1.5">
                  Step {currentContentIdx + 1} of {contentSteps.length}
                </div>
                <h2 className="text-[24px] font-bold text-[#0e1726] leading-snug tracking-tight">
                  {stepMeta?.title || step}
                </h2>
                {stepMeta?.subtitle && (
                  <p className="mt-1.5 text-[14px] text-[#5b6b85]">{stepMeta.subtitle}</p>
                )}
              </div>
            )}

            {/* Step content — relative for WelcomeStep's decorative layer */}
            <div className="relative">
              <StepComponent
                data={formData}
                onChange={handleChange}
                role={role}
                userName={userName}
                accentColor={accentColor}
              />
            </div>

            {/* Error */}
            {error && (
              <div role="alert" className="mt-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-[12px] text-red-700">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="mt-9 flex items-center justify-between">
              <button
                type="button"
                className="text-[12px] text-[#5b6b85] hover:text-[#3a4760] underline underline-offset-2 transition-colors"
                onClick={() => setConfirmSkip(true)}
                disabled={loading}
              >
                Skip setup
              </button>

              <div className="flex items-center gap-3">
                {!isFirst && (
                  <button
                    type="button"
                    className="h-10 px-4 rounded-md border border-[#dde3ee] text-[13px] text-[#3a4760] bg-white hover:bg-[#f4f6fa] transition-colors"
                    onClick={handleBack}
                    disabled={loading}
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  className="h-10 px-6 rounded-md text-[13.5px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60 shadow-sm"
                  style={{ backgroundColor: accentColor }}
                  onClick={handleNext}
                  disabled={loading}
                >
                  {loading ? 'Saving…' : isWelcome ? 'Get started →' : isLastContent ? 'Finish setup' : 'Continue →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Skip-confirm modal — replaces native window.confirm for brand consistency. */}
      {confirmSkip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setConfirmSkip(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Skip setup"
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-semibold text-[#0e1726]">Skip setup?</h3>
            <p className="mt-2 text-[13px] text-[#5b6b85]">
              You can finish it later from your cockpit, but anything entered here will not be saved.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                className="h-9 px-4 rounded border border-[#dde3ee] text-[13px] text-[#3a4760] bg-white hover:bg-[#f4f6fa] transition-colors"
                onClick={() => setConfirmSkip(false)}
                autoFocus
              >
                Keep setting up
              </button>
              <button
                type="button"
                className="h-9 px-5 rounded text-[13px] font-medium text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: accentColor }}
                onClick={doSkip}
                disabled={loading}
              >
                {loading ? 'Skipping…' : 'Skip for now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
