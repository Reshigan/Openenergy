// sseg_registration — Small-Scale Embedded Generation grid-registration lifecycle
// as data (NRS 097-2-1 / municipal SSEG process).
//
// A generator owner (applicant) applies to a distributor (municipality/utility)
// to connect a small embedded generator — rooftop PV, small wind — to the
// distribution network. The distributor runs completeness review → technical
// (grid-impact) review → approval-to-install; the applicant then installs and
// submits a Certificate of Compliance; an inspector commissions the installed
// system before it is registered and allowed to energise.
//
// Grid-safety spine is STRUCTURAL, not a guard: the ONLY edge into `registered`
// is `commission`, which leaves ONLY `commissioning`, and the ONLY path into
// `commissioning` is `submit_coc` from `approved`. So an embedded generator can
// NEVER be registered (grid-connected/energised) before it is physically
// inspected — approval-to-install alone cannot energise plant. No guard needed;
// the state graph forbids it.
//
// The completeness sign-off is guarded: complete_review needs a named
// completeness-evidence ref (completenessEvidencePresent) — a distributor cannot
// advance an incomplete application into technical review.
//
// settles:false — a registration is a connection authorisation, never a payment
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure SSEG capacity bucketing off installed kVA. No clock, no env.
const capacityTier = (kva: Json | undefined): string => {
  if (typeof kva !== 'number') return 'unrated';
  if (kva >= 1000) return 'large';
  if (kva >= 100) return 'medium';
  return 'small';
};

export const ssegRegistration: ChainDecl = {
  key: 'sseg_registration',
  noun: 'SSEG registration',
  refPrefix: 'SSEG',
  title: (f) =>
    `SSEG — ${(f.generator_type as string) ?? 'generator'} ${(f.installed_capacity_kva as number) ?? '?'}kVA @ ${(f.premises_address as string) ?? 'unknown premises'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's7 registration of generation', effect: 'requires' },
    { instrument: 'NRS 097-2-1', provision: 'embedded generation grid-connection compliance', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'distribution network connection & metering', effect: 'requires' },
  ],
  roles: ['applicant', 'distributor', 'inspector'],

  fields: {
    registration_number: { type: 'string', label: 'Registration number' },
    applicant_party: { type: 'party', role: 'applicant', label: 'Generator owner' },
    distributor_party: { type: 'party', role: 'distributor', label: 'Distributor / municipality' },
    inspector_party: { type: 'party', role: 'inspector', label: 'Commissioning inspector' },
    premises_address: { type: 'string', required: true, label: 'Premises address' },
    pou_reference: { type: 'string', label: 'Point-of-utilisation / metering point' },
    generator_type: { type: 'string', required: true, label: 'Generator type (solar_pv/wind/other)' },
    installed_capacity_kva: { type: 'number', min: 0, required: true, label: 'Installed capacity (kVA)' },
    installed_capacity_kw: { type: 'number', min: 0, label: 'Installed capacity (kW)' },
    inverter_make: { type: 'string', label: 'Inverter make/model' },
    inverter_certificate_ref: { type: 'string', label: 'NRS 097-2-1 inverter certificate ref' },
    export_allowed: { type: 'boolean', label: 'Grid export permitted (vs own-use only)' },
    nrs_compliant: { type: 'boolean', label: 'NRS 097 compliant' },
    meter_type: { type: 'string', label: 'Bidirectional meter type' },
    coc_reference: { type: 'string', label: 'Certificate of Compliance ref' },
    completeness_ref: { type: 'string', label: 'Completeness-evidence ref' },
    capacity_tier: { type: 'string', label: 'Capacity tier' },
    // written by derive, never by the client
    reviewed_at: { type: 'string', label: 'Approved-to-install at' },
    commissioned_at: { type: 'string', label: 'Commissioned at' },
    registered_at: { type: 'string', label: 'Registered at' },
  },

  initial: 'submitted',

  states: {
    submitted: { label: 'Application submitted', terminal: false, holder: 'distributor', sla: { days: 5 } },
    under_review: { label: 'Under review', terminal: false, holder: 'distributor', sla: { days: 10 } },
    technical_review: { label: 'Technical (grid-impact) review', terminal: false, holder: 'distributor', sla: { days: 15 } },
    approved: { label: 'Approved to install', terminal: false, holder: 'applicant', sla: { days: 90 } },
    commissioning: { label: 'Commissioning / inspection', terminal: false, holder: 'inspector', sla: { days: 10 } },
    registered: { label: 'Registered', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'submitted',
      by: ['applicant'],
      actorBecomes: 'applicant',
      label: 'Submit SSEG application',
      intent: 'primary',
      input: {
        premises_address: { type: 'string', required: true },
        pou_reference: { type: 'string' },
        generator_type: { type: 'string', required: true },
        installed_capacity_kva: { type: 'number', min: 0, required: true },
        installed_capacity_kw: { type: 'number', min: 0 },
        inverter_make: { type: 'string' },
        inverter_certificate_ref: { type: 'string' },
        export_allowed: { type: 'boolean' },
        distributor_party: { type: 'party', role: 'distributor' },
        inspector_party: { type: 'party', role: 'inspector' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ capacity_tier: capacityTier(f.installed_capacity_kva) }),
    },
    {
      id: 'begin_review',
      from: 'submitted',
      to: 'under_review',
      by: ['distributor'],
      label: 'Begin review',
      intent: 'primary',
      guards: [],
    },
    {
      // completeness sign-off: cannot advance an incomplete application.
      id: 'complete_review',
      from: 'under_review',
      to: 'technical_review',
      by: ['distributor'],
      label: 'Confirm completeness',
      intent: 'primary',
      // present-but-not-required: absent ref surfaces the guard code, not BAD_INPUT (Pattern A).
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
    },
    {
      id: 'approve_install',
      from: 'technical_review',
      to: 'approved',
      by: ['distributor'],
      label: 'Approve to install',
      intent: 'primary',
      input: { nrs_compliant: { type: 'boolean' } },
      guards: [],
      derive: (_f, at: Instant) => ({ reviewed_at: isoUtc(at) }),
    },
    {
      // applicant installs, then lodges the Certificate of Compliance for
      // inspection. This is the ONLY path into commissioning.
      id: 'submit_coc',
      from: 'approved',
      to: 'commissioning',
      by: ['applicant'],
      label: 'Submit Certificate of Compliance',
      intent: 'primary',
      input: {
        coc_reference: { type: 'string', required: true },
        meter_type: { type: 'string' },
      },
      guards: [],
    },
    {
      // structural grid-safety gate: the ONLY edge into `registered`, and it can
      // only fire from `commissioning` — reached only via submit_coc. An embedded
      // generator therefore cannot be registered/energised before it is
      // physically inspected. No guard.
      id: 'commission',
      from: 'commissioning',
      to: 'registered',
      by: ['inspector'],
      label: 'Commission & register',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ commissioned_at: isoUtc(at), registered_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: ['submitted', 'under_review', 'technical_review', 'approved'],
      to: 'rejected',
      by: ['distributor'],
      label: 'Reject application',
      intent: 'destructive',
      requiresReason: ['incomplete_application', 'grid_capacity_unavailable', 'non_compliant_equipment', 'approval_lapsed'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['submitted', 'under_review', 'technical_review', 'approved'],
      to: 'withdrawn',
      by: ['applicant'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'installer_changed', 'rescoped'],
      guards: [],
    },
  ],

  // approval-to-install validity lapse: an approval left un-commissioned stales
  // out (NRS approvals lapse). record-only stub; the sweep computes the real bar
  // off the state sla days (ppa_contract pattern).
  timers: [{ onState: 'approved', after: { days: 0 }, fire: 'reject', kind: 'time_bar' }],
};
