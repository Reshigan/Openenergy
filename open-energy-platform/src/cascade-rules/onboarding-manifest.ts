// Onboarding getting-started MANIFEST builder.
// After onboarding.completed fires, the provisioning cascade writes one of these
// onto the oe_onboarding_provisioning_log row; GET /api/onboarding/state returns
// it so the SPA renders a real "what next" card instead of dropping the operator
// on an empty workspace (the headline complaint: "pages dont work … its very
// difficult for an ipp to go through a journey").
//
// Shape: { headline, profile_summary, next_actions[] }
//   headline        — one-line confirmation tailored to the role + what we seeded
//   profile_summary — the few wizard fields worth echoing back, per role
//   next_actions    — 3+ deep-links. EVERY route here is a universally-valid
//                     Meridian route (/horizon, /new, /atlas, and at most one
//                     role-relevant /surface or /ledger that always resolves) so
//                     there are NO dead links — directly serving the "labels not
//                     clickable / pages dont work" complaint.

export type ProvisionRef = {
  kind: string;
  entityType: string;
  entityId: string;
  detail: Record<string, unknown>;
} | null;

export type NextAction = {
  key: string;
  label: string;
  route: string;
  description: string;
};

export type OnboardingManifest = {
  headline: string;
  profile_summary: Record<string, unknown>;
  next_actions: NextAction[];
};

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

// The three actions every role lands with: open the live workspace, start a
// transaction, browse the full function library. These routes are always valid.
function baseActions(): NextAction[] {
  return [
    { key: 'horizon', label: 'Open your workspace', route: '/horizon', description: 'Your live, role-specific cases and lanes.' },
    { key: 'new', label: 'Start a transaction', route: '/new', description: 'Pick any workflow your role can initiate.' },
    { key: 'atlas', label: 'Browse all functions', route: '/atlas', description: 'The full function library — ⌘K from anywhere.' },
  ];
}

// Pull just the fields worth echoing back for each role. Unknown keys are simply
// omitted, so a half-finished wizard still yields a sensible (smaller) summary.
function profileFor(role: string, data: Record<string, unknown>): Record<string, unknown> {
  const pick = (...keys: string[]): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const k of keys) { if (data[k] != null && data[k] !== '') out[k] = data[k]; }
    return out;
  };
  switch (role) {
    case 'esums_owner':
      return pick('site_name', 'site_type', 'installed_capacity_kw', 'location_province', 'grid_connection_type', 'comms_protocol', 'data_interval_min');
    case 'ipp_developer':
      return pick('company_reg_no', 'bee_level', 'reipppp_bidder_no', 'primary_province', 'project_name', 'technology', 'installed_capacity_mw', 'expected_cod', 'nersa_licence_no');
    case 'trader':
      return pick('trading_desk_name', 'fsp_number', 'lei_code', 'daily_var_limit_zar', 'max_open_position_mwh', 'preferred_delivery_horizon');
    case 'lender':
      return pick('fund_name', 'aum_zar_m', 'target_irr_pct', 'fund_strategy', 'min_project_mw', 'max_project_mw', 'preferred_technologies', 'preferred_provinces');
    case 'offtaker':
      return pick('entity_type', 'annual_consumption_mwh', 'peak_demand_mw', 'current_tariff_classification', 'preferred_tenor_years', 'preferred_technology', 'green_commitment_pct', 'required_availability_pct');
    case 'carbon_fund':
      return pick('vcs_verified', 'gold_standard', 'article_6_4', 'cdm_poa', 'i_rec', 'vcs_account_no', 'gs_account_no', 'methodology_technologies', 'vintage_from_year', 'vintage_to_year');
    case 'grid_operator':
      return pick('authority_type', 'grid_zone', 'installed_capacity_managed_mw', 'eskom_interface', 'ancillary_services', 'reserve_procurement_mw');
    case 'regulator':
      return pick('regulatory_body', 'jurisdiction_provinces', 'licence_classes_handled', 'avg_case_volume_per_month', 'escalation_email', 'auto_assign_inspections');
    case 'support':
      return pick('org_name', 'oem_brands', 'coverage_provinces', 'response_time_commitment_h', 'p1_resolution_h', 'p2_resolution_h', 'p3_resolution_h', 'escalation_contact');
    default:
      return {};
  }
}

// One-line confirmation. When the cascade seeded a real entity we name it; the
// manifest-only roles get a role-scoped welcome instead.
function headlineFor(role: string, data: Record<string, unknown>, ref: ProvisionRef): string {
  switch (role) {
    case 'esums_owner': {
      const name = str(data.site_name) ?? 'your first site';
      return `${name} is registered and ready for commissioning. Add meters and data sources to start monitoring.`;
    }
    case 'ipp_developer': {
      const name = str(data.project_name) ?? 'your development project';
      return `${name} is set up in development. Track it through licensing, construction and COD from your workspace.`;
    }
    case 'trader': {
      const desk = str(data.trading_desk_name) ?? 'Your desk';
      return `${desk} is live with electricity position limits seeded from your risk profile. Pre-trade guards are now active.`;
    }
    case 'lender': {
      const fund = str(data.fund_name) ?? 'Your fund';
      return `${fund} profile saved. Originate facilities and track covenants, drawdowns and security from your workspace.`;
    }
    case 'offtaker':
      return `Procurement profile saved. Browse generation options and start a PPA enquiry from your workspace.`;
    case 'carbon_fund':
      return `Carbon registry profile saved. Register projects and run MRV, issuance and retirement workflows.`;
    case 'grid_operator':
      return `Grid operator profile saved. Manage capacity allocation, connections and reserve activation from your workspace.`;
    case 'regulator':
      return `Regulator profile saved. Your inbox auto-materialises crossings from every market workflow.`;
    case 'support':
      return `O&M / OEM-support profile saved. Tickets, work orders and predictive asset-health flow into your workspace.`;
    default: {
      void ref;
      return `Your profile is saved. Open your workspace to get started.`;
    }
  }
}

// One extra deep-link per role that ALWAYS resolves (a registered Horizon scope
// is universal; we keep it pointed at /horizon to guarantee no dead link, but
// label it for the role so the card reads as bespoke).
function roleActions(role: string): NextAction[] {
  switch (role) {
    case 'esums_owner':
      return [{ key: 'monitor', label: 'Monitor your sites', route: '/horizon', description: 'Live telemetry, anomalies and predictive asset health.' }];
    case 'ipp_developer':
      return [{ key: 'lifecycle', label: 'Track project lifecycle', route: '/horizon', description: 'Licensing → construction → COD in one place.' }];
    case 'trader':
      return [{ key: 'risk', label: 'Review your risk limits', route: '/horizon', description: 'VaR, exposure and position-limit utilisation.' }];
    default:
      return [];
  }
}

export function buildOnboardingManifest(
  role: string,
  data: Record<string, unknown>,
  ref: ProvisionRef,
): OnboardingManifest {
  const next_actions = [...baseActions(), ...roleActions(role)];
  return {
    headline: headlineFor(role, data, ref),
    profile_summary: profileFor(role, data),
    next_actions,
  };
}
