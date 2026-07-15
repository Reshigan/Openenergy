// ipp_cep — an IPP project's annual REIPPPP Community Equity Participation
// (CEP) compliance cycle as data.
//
// The developer opens the cycle when the CEP obligation triggers, walks the
// community-benefit funnel (identify stakeholders → calculate the annual
// distribution → trustee approval → prepare payment), confirms the cash
// actually moved, verifies community-development spend, compiles the
// documentation pack, and files it with the DMRE IPP Office. Certification
// is a structural gate: confirm_compliant leaves ONLY dmre_submission, and
// dmre_submission is reachable ONLY via submit_to_dmre off a compiled
// documentation pack — you cannot certify a year that was never filed.
//
// The engagement is bilateral (the IPP's SPV vs. the community trust that
// receives the distribution): counterpartyDistinct on open stops a developer
// naming itself as its own community trustee.
//
// A year can go bad two ways: declare_non_compliant (developer/admin decide
// the obligation was missed — cash not paid, trustee unresponsive, DMRE
// default notice) or declare_lapsed (the SLA clock ran out before the year
// closed either way). Both are terminal exits, mirroring the ipp_aud
// lapsed-exit pattern; no timer is wired (would need one onState per funnel
// stage to be honest, and this cycle's real deadline computation is
// capacity-inverted per the legacy route, not a flat duration) — the SLA
// sweep that owns sla_due_date stays outside the domain layer for now.
//
// settles:false — a CEP compliance record is a REIPPPP governance record; the
// distribution cash itself settles through the disbursement chain it names,
// not here (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippCep: ChainDecl = {
  key: 'ipp_cep',
  noun: 'IPP community equity participation compliance year',
  refPrefix: 'CEP',
  title: (f) => `CEP ${(f.compliance_year as number) ?? ''} — ${(f.project_ref as string) ?? 'project'}`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement community equity participation obligation', effect: 'requires' },
    { instrument: 'REIPPPP', provision: 'DMRE IPP Office annual CEP compliance reporting', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'trustee', 'admin'],

  fields: {
    project_ref: { type: 'string', required: true, label: 'Project reference' },
    ipp_developer_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer (SPV)' },
    trustee_party: { type: 'party', role: 'trustee', label: 'Community trust trustee' },
    trustee_name: { type: 'string', label: 'Trustee name' },
    compliance_year: { type: 'number', required: true, label: 'Compliance year' },
    project_mw: { type: 'number', required: true, min: 0, label: 'Project capacity (MW)' },
    cep_equity_pct: { type: 'number', min: 0, max: 100, label: 'Community equity stake (%)' },
    structure_type: { type: 'string', label: 'Community structure type' },
    distribution_amount_zar: { type: 'number', min: 0, label: 'Annual distribution amount (ZAR)' },
    community_dev_spend_zar: { type: 'number', min: 0, label: 'Community development spend (ZAR)' },
    non_compliance_notes: { type: 'string', label: 'Non-compliance basis' },
    notes: { type: 'string', label: 'Notes' },
    // derive-stamped timestamps
    distributions_paid_at: { type: 'string', label: 'Distributions paid at' },
    documentation_compiled_at: { type: 'string', label: 'Documentation compiled at' },
    dmre_submitted_at: { type: 'string', label: 'Submitted to DMRE at' },
    compliant_confirmed_at: { type: 'string', label: 'Certified compliant at' },
    non_compliant_at: { type: 'string', label: 'Declared non-compliant at' },
  },

  initial: 'cep_triggered',

  states: {
    cep_triggered: { label: 'CEP obligation triggered', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    stakeholder_identification: { label: 'Stakeholder identification', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    distribution_calculation: { label: 'Distribution calculation', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    trustee_approval: { label: 'Trustee approval', terminal: false, holder: 'trustee', sla: { days: 14 } },
    payment_preparation: { label: 'Payment preparation', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    distributions_paid: { label: 'Distributions paid', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    community_dev_verification: { label: 'Community development verification', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    documentation_compiled: { label: 'Documentation compiled', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    dmre_submission: { label: 'DMRE submission', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    cep_compliant: { label: 'CEP compliant', terminal: true, holder: 'none' },
    cep_non_compliant: { label: 'CEP non-compliant', terminal: true, holder: 'none' },
    cep_lapsed: { label: 'CEP lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'cep_triggered',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Trigger CEP obligation',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        compliance_year: { type: 'number', required: true },
        project_mw: { type: 'number', required: true, min: 0 },
        cep_equity_pct: { type: 'number', min: 0, max: 100 },
        structure_type: { type: 'string' },
        trustee_name: { type: 'string' },
        trustee_party: { type: 'party', role: 'trustee' },
        notes: { type: 'string' },
      },
      // the community trust must be a distinct entity from the developer's SPV.
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'identify_stakeholders',
      from: 'cep_triggered',
      to: 'stakeholder_identification',
      by: ['ipp_developer', 'admin'],
      label: 'Identify community stakeholders',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'calculate_distribution',
      from: 'stakeholder_identification',
      to: 'distribution_calculation',
      by: ['ipp_developer', 'admin'],
      label: 'Calculate annual distribution',
      intent: 'primary',
      input: { distribution_amount_zar: { type: 'number', required: true, min: 0 } },
      guards: [],
    },
    {
      id: 'record_trustee_approval',
      from: 'distribution_calculation',
      to: 'trustee_approval',
      by: ['ipp_developer', 'admin', 'trustee'],
      label: 'Record trustee approval',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'prepare_payment',
      from: 'trustee_approval',
      to: 'payment_preparation',
      by: ['ipp_developer', 'admin'],
      label: 'Prepare distribution payment',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'confirm_distributions_paid',
      from: 'payment_preparation',
      to: 'distributions_paid',
      by: ['ipp_developer', 'admin'],
      label: 'Distributions paid',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ distributions_paid_at: isoUtc(at) }),
    },
    {
      id: 'verify_community_dev_spend',
      from: 'distributions_paid',
      to: 'community_dev_verification',
      by: ['ipp_developer', 'admin'],
      label: 'Verify community development spend',
      intent: 'primary',
      input: { community_dev_spend_zar: { type: 'number', min: 0 } },
      guards: [],
    },
    {
      id: 'compile_documentation',
      from: 'community_dev_verification',
      to: 'documentation_compiled',
      by: ['ipp_developer', 'admin'],
      label: 'Compile compliance documentation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ documentation_compiled_at: isoUtc(at) }),
    },
    {
      id: 'submit_to_dmre',
      from: 'documentation_compiled',
      to: 'dmre_submission',
      by: ['ipp_developer', 'admin'],
      label: 'Submit to DMRE',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ dmre_submitted_at: isoUtc(at) }),
    },
    {
      // structural certification gate: the ONLY edge into cep_compliant,
      // reachable ONLY from dmre_submission — a year can never be certified
      // compliant without having been filed.
      id: 'confirm_compliant',
      from: 'dmre_submission',
      to: 'cep_compliant',
      by: ['ipp_developer', 'admin'],
      label: 'Certify compliant',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ compliant_confirmed_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'declare_non_compliant',
      from: [
        'stakeholder_identification',
        'distribution_calculation',
        'trustee_approval',
        'payment_preparation',
        'distributions_paid',
        'community_dev_verification',
        'documentation_compiled',
        'dmre_submission',
      ],
      to: 'cep_non_compliant',
      by: ['ipp_developer', 'admin'],
      label: 'Flag non-compliant',
      intent: 'destructive',
      input: { non_compliance_notes: { type: 'string', required: true } },
      requiresReason: ['distributions_not_paid', 'trustee_non_response', 'equity_stake_lapsed', 'dmre_notice_received'],
      guards: [],
      derive: (_f, at: Instant) => ({ non_compliant_at: isoUtc(at) }),
    },
    {
      id: 'declare_lapsed',
      from: [
        'cep_triggered',
        'stakeholder_identification',
        'distribution_calculation',
        'trustee_approval',
        'payment_preparation',
        'distributions_paid',
        'community_dev_verification',
        'documentation_compiled',
        'dmre_submission',
      ],
      to: 'cep_lapsed',
      by: ['ipp_developer', 'admin'],
      label: 'Declare lapsed',
      intent: 'destructive',
      requiresReason: ['sla_deadline_missed', 'trustee_unresponsive', 'project_decommissioned', 'structure_dissolved'],
      guards: [],
    },
  ],
};
