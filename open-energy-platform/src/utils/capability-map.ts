// Role-keyed capability index — powers the CapabilityPalette "What can I do?" overlay.
// Each entry must deep-link to a surface that actually exists.

export interface Capability {
  id: string;
  label: string;
  description: string;
  href: string;
  group: string;
  depth: 'core' | 'advanced';
}

const COMMON: Capability[] = [
  { id: 'settings', label: 'Account & security settings', description: 'Manage your profile, password, and 2FA.', href: '/settings', group: 'Account', depth: 'core' },
];

export const CAPABILITY_MAP: Record<string, Capability[]> = {
  esums_owner: [
    { id: 'commission_site', label: 'Commission a site', description: 'Take a site from planned to in-O&M through the commissioning chain.', href: '/esums?tab=commissioning', group: 'Onboarding', depth: 'core' },
    { id: 'add_meter', label: 'Add a smart meter', description: 'Register and commission a smart meter on one of your sites.', href: '/esums?tab=smart_meter', group: 'Onboarding', depth: 'core' },
    { id: 'predictive_health', label: 'Predictive asset health', description: 'Review anomaly, RUL, and fault-fingerprint predictions for your fleet.', href: '/esums?tab=prognostics', group: 'Operations', depth: 'advanced' },
    { id: 'opportunities', label: 'Monetisable opportunities', description: 'Rule-based scan of the fleet for performance upside, each quantified in ZAR.', href: '/esums?tab=opportunities', group: 'Operations', depth: 'advanced' },
    ...COMMON,
  ],
  ipp_developer: [
    { id: 'create_project', label: 'Start a project', description: 'Create an IPP project and run it through the development lifecycle.', href: '/projects', group: 'Onboarding', depth: 'core' },
    { id: 'procurement', label: 'REIPPPP procurement', description: '12-state procurement and RFP lifecycle for utility-scale projects.', href: '/ipp/workstation?tab=procurement', group: 'Core', depth: 'core' },
    { id: 'milestones', label: 'Milestone & schedule variance', description: 'Track construction milestones and flag critical delays.', href: '/ipp/workstation?tab=milestone_variance', group: 'Core', depth: 'core' },
    ...COMMON,
  ],
  trader: [
    { id: 'trading', label: 'Place and manage orders', description: 'Submit bids/offers and monitor the order book.', href: '/trader/workstation', group: 'Trading', depth: 'core' },
    { id: 'rfq', label: 'Best-execution RFQ', description: 'Run a request-for-quote workflow for OTC block trades.', href: '/trader/workstation?tab=rfq', group: 'Trading', depth: 'advanced' },
    ...COMMON,
  ],
  offtaker: [
    { id: 'ppa', label: 'PPA portfolio', description: 'Manage your power purchase agreements.', href: '/offtaker/workstation?tab=ppa', group: 'Contracts', depth: 'core' },
    { id: 'rec', label: 'RECs & GoOs', description: 'Track renewable energy certificate lifecycle.', href: '/offtaker/workstation?tab=rec', group: 'Compliance', depth: 'advanced' },
    ...COMMON,
  ],
  lender: [
    { id: 'pipeline', label: 'Credit pipeline', description: 'Originate and approve credit facility applications.', href: '/lender/workstation?tab=credit_origination', group: 'Core', depth: 'core' },
    { id: 'covenants', label: 'Covenant monitoring', description: 'Track covenant certificates and breach workflows.', href: '/lender/workstation?tab=covenant', group: 'Core', depth: 'core' },
    ...COMMON,
  ],
  regulator: [
    { id: 'licences', label: 'Licence applications', description: 'Adjudicate ERA licence applications.', href: '/regulator/workstation?tab=licence_applications', group: 'Regulatory', depth: 'core' },
    { id: 'inspections', label: 'Compliance inspections', description: 'Schedule and run market conduct examinations.', href: '/regulator/workstation?tab=market_conduct', group: 'Regulatory', depth: 'core' },
    ...COMMON,
  ],
  carbon_fund: [
    { id: 'carbon_credits', label: 'Carbon credit registry', description: 'Manage credit issuance, transfers, and retirements.', href: '/carbon/workstation', group: 'Core', depth: 'core' },
    { id: 'mrv', label: 'MRV verification chain', description: '14-state UNFCCC verification from validation through issuance.', href: '/carbon/workstation?tab=mrv', group: 'Core', depth: 'advanced' },
    ...COMMON,
  ],
  grid_operator: [
    { id: 'dispatch', label: 'Dispatch nominations', description: '10-state BRP to SO dispatch and settlement lifecycle.', href: '/grid/workstation?tab=dispatch', group: 'Operations', depth: 'core' },
    { id: 'eop', label: 'Emergency operating procedures', description: '11-state EOP activation and post-event review.', href: '/grid/workstation?tab=eop', group: 'Operations', depth: 'advanced' },
    ...COMMON,
  ],
  support: [
    { id: 'tickets', label: 'Support tickets', description: 'Manage and resolve customer support requests.', href: '/support/workstation', group: 'Core', depth: 'core' },
    { id: 'csat', label: 'SLA & CSAT monitoring', description: 'Track SLA adherence and customer satisfaction scores.', href: '/support/workstation?tab=csat', group: 'Core', depth: 'core' },
    ...COMMON,
  ],
};

export function capabilitiesForRole(role: string): Capability[] {
  return CAPABILITY_MAP[role] ?? COMMON;
}
