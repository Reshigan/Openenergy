// ═══════════════════════════════════════════════════════════════════════════
// OnboardingWizard — full-page, multi-step wizard shown to new users before
// their first visit to the launch board.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/useAuth';
import { api } from '../../lib/api';
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

// ─── Role accent colors ──────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  esums_owner:   '#16a34a',
  ipp_developer: 'oklch(0.46 0.16 55)',
  trader:        '#7c3aed',
  lender:        '#b45309',
  offtaker:      '#0369a1',
  carbon_fund:   '#065f46',
  grid_operator: '#9f1239',
  regulator:     '#374151',
  support:       '#1d4ed8',
  admin:         '#111827',
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

// ─── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ steps, currentStep, accentColor }: { steps: string[]; currentStep: string; accentColor: string }) {
  // Exclude 'complete' from dots — it's not a real form step
  const displaySteps = steps.filter((s) => s !== 'complete');
  const currentIdx = displaySteps.indexOf(currentStep);

  return (
    <div className="flex gap-2 mb-8" role="progressbar"
         aria-valuenow={currentIdx + 1} aria-valuemin={1} aria-valuemax={displaySteps.length}
         aria-valuetext={`Step ${currentIdx + 1} of ${displaySteps.length}`}>
      {displaySteps.map((s, i) => {
        const active = i === currentIdx;
        const done = i < currentIdx;
        return (
          <div
            key={s}
            className="rounded-full transition-all duration-200"
            style={{
              width: active ? 24 : 8,
              height: 8,
              backgroundColor: active || done ? accentColor : '#dde4ec',
              opacity: done ? 0.5 : 1,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Role chip ────────────────────────────────────────────────────────────────

function RoleChip({ role, accentColor }: { role: string; accentColor: string }) {
  const label = ROLE_LABELS[role] || role;
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium mb-6"
      style={{ backgroundColor: `${accentColor}14`, color: accentColor }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: accentColor }}
      />
      {label}
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
      <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center">
        <div className="text-[#6b7685] text-sm">Loading…</div>
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
    <div className="min-h-screen bg-[#f5f7fa] flex flex-col">
      {/* Top bar — subtle */}
      <div className="h-1 w-full" style={{ backgroundColor: accentColor, opacity: 0.15 }} />

      <div className="flex-1 flex flex-col items-center px-4 pt-12 pb-8">
        <div className="w-full max-w-lg">
          {/* Role chip */}
          <RoleChip role={role} accentColor={accentColor} />

          {/* Progress */}
          <ProgressDots steps={steps} currentStep={step} accentColor={accentColor} />

          {/* Card */}
          <div className="bg-white rounded-xl border border-[#dde4ec] shadow-sm overflow-hidden relative">
            {/* Accent top border */}
            <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

            <div className="p-8">
              {/* Step header */}
              {!isWelcome && (
                <div className="mb-6">
                  <div className="text-[11px] font-medium text-[#6b7685] uppercase tracking-wider mb-1">
                    Step {currentContentIdx + 1} of {contentSteps.length}
                  </div>
                  <h2 className="text-[20px] font-semibold text-[#0f1c2e] leading-snug">
                    {stepMeta?.title || step}
                  </h2>
                  {stepMeta?.subtitle && (
                    <p className="mt-1 text-[13px] text-[#6b7685]">{stepMeta.subtitle}</p>
                  )}
                </div>
              )}

              {/* Step content */}
              <div className={isWelcome ? '' : ''}>
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
                <div className="mt-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-[12px] text-red-700">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Bottom actions */}
          <div className="mt-6 flex items-center justify-between">
            {/* Left — skip */}
            <button
              type="button"
              className="text-[12px] text-[#6b7685] hover:text-[#3a4658] underline underline-offset-2 transition-colors"
              onClick={() => setConfirmSkip(true)}
              disabled={loading}
            >
              Skip setup
            </button>

            {/* Right — back + continue */}
            <div className="flex items-center gap-3">
              {!isFirst && (
                <button
                  type="button"
                  className="h-9 px-4 rounded border border-[#dde4ec] text-[13px] text-[#3a4658] bg-white hover:bg-[#f5f7fa] transition-colors"
                  onClick={handleBack}
                  disabled={loading}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                className="h-9 px-5 rounded text-[13px] font-medium text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: accentColor }}
                onClick={handleNext}
                disabled={loading}
              >
                {loading ? 'Saving…' : isWelcome ? 'Get started' : isLastContent ? 'Finish setup' : 'Continue'}
              </button>
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
            <h3 className="text-[16px] font-semibold text-[#0f1c2e]">Skip setup?</h3>
            <p className="mt-2 text-[13px] text-[#6b7685]">
              You can finish it later from Horizon, but anything entered here will not be saved.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                className="h-9 px-4 rounded border border-[#dde4ec] text-[13px] text-[#3a4658] bg-white hover:bg-[#f5f7fa] transition-colors"
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
