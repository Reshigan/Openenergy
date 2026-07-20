// cod — Commercial Operation Date certification lifecycle as data.
//
// An IPP (producer) declares COD readiness against a project; an independent
// certifier runs commissioning review → reliability run → certification. The
// terminal cod_certified event is what downstream drawdown + PPA activation key
// off (REBUILD_FUNCTIONAL_FLOOR: "Its terminal event drives drawdown + PPA
// activation") — so the integrity spine matters.
//
// Structural gate: certify_cod leaves ONLY reliability_complete, and the ONLY
// path into reliability_complete is complete_reliability_run (from
// reliability_run, reached only via start_reliability_run after commissioning
// review). A COD therefore can NEVER be certified before a reliability run has
// actually completed — no guard needed, the state graph enforces it. The one
// business guard is on the certification itself: completenessEvidencePresent
// makes the certifier attach a completeness evidence ref (all commissioning
// docs closed) before COD — and thus drawdown/PPA — can fire.
//
// settles:false — a COD certificate is a lifecycle milestone, not a payment
// (R-S5-1). The drawdown it unlocks is a separate settling chain.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const cod: ChainDecl = {
  key: 'cod',
  noun: 'Commercial operation date',
  refPrefix: 'COD',
  title: (f) => `COD — ${(f.project_name as string) ?? 'unnamed project'} (${(f.facility_capacity_mw as number) ?? '?'} MW)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Implementation Agreement', provision: 'Commercial Operation & COD certificate', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'commissioning & compliance certification', effect: 'requires' },
  ],
  roles: ['producer', 'certifier', 'offtaker', 'regulator', 'operator'],

  fields: {
    cod_ref: { type: 'string', label: 'COD reference' },
    producer_party: { type: 'party', role: 'producer', label: 'IPP / producer' },
    certifier_party: { type: 'party', role: 'certifier', label: 'Independent certifier' },
    offtaker_party: { type: 'party', role: 'offtaker', label: 'Offtaker' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    project_name: { type: 'string', required: true, label: 'Project' },
    ppa_ref: { type: 'string', label: 'PPA reference' },
    facility_capacity_mw: { type: 'number', min: 0, label: 'Facility capacity (MW)' },
    technology: { type: 'string', label: 'Technology (solar/wind/bess)' },
    declared_cod_date: { type: 'string', label: 'Declared target COD date' },
    reliability_run_days: { type: 'number', min: 0, label: 'Reliability run window (days)' },
    // certifier attaches at certification; the completeness guard reads it
    completeness_ref: { type: 'string', label: 'Commissioning completeness evidence ref' },
    remediation_count: { type: 'number', label: 'Times sent back for remediation' },
    // written by derive, never by the client
    run_completed_at: { type: 'string', label: 'Reliability run completed at' },
    certified_at: { type: 'string', label: 'Certified at' },
    effective_cod: { type: 'string', label: 'Effective commercial operation date' },
  },

  initial: 'cod_declared',

  states: {
    cod_declared: { label: 'COD readiness declared', terminal: false, holder: 'certifier', sla: { days: 5 } },
    commissioning_review: { label: 'Commissioning review', terminal: false, holder: 'certifier', sla: { days: 10 } },
    reliability_run: { label: 'Reliability run in progress', terminal: false, holder: 'producer', sla: { days: 14 } },
    reliability_complete: { label: 'Reliability run complete', terminal: false, holder: 'certifier', sla: { days: 5 } },
    cod_certified: { label: 'COD certified', terminal: true, holder: 'none' },
    cod_rejected: { label: 'COD rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'cod_declared',
      by: ['producer', 'operator'],
      actorBecomes: 'producer',
      label: 'Declare COD readiness',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        ppa_ref: { type: 'string' },
        facility_capacity_mw: { type: 'number', min: 0 },
        technology: { type: 'string' },
        declared_cod_date: { type: 'string' },
        reliability_run_days: { type: 'number', min: 0 },
        certifier_party: { type: 'party', role: 'certifier' },
        offtaker_party: { type: 'party', role: 'offtaker' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_commissioning_review',
      from: 'cod_declared',
      to: 'commissioning_review',
      by: ['certifier'],
      label: 'Begin commissioning review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'start_reliability_run',
      from: 'commissioning_review',
      to: 'reliability_run',
      by: ['certifier'],
      label: 'Start reliability run',
      intent: 'primary',
      input: { reliability_run_days: { type: 'number', min: 0 } },
      guards: [],
    },
    {
      id: 'complete_reliability_run',
      from: 'reliability_run',
      to: 'reliability_complete',
      by: ['certifier'],
      label: 'Complete reliability run',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ run_completed_at: isoUtc(at) }),
    },
    {
      // structural integrity gate: the ONLY edge into cod_certified, and it can
      // only fire from reliability_complete — which only complete_reliability_run
      // reaches. COD (and the drawdown + PPA activation it triggers) therefore
      // cannot certify before a reliability run has actually completed. The one
      // business guard forces a commissioning-completeness evidence ref.
      id: 'certify_cod',
      from: 'reliability_complete',
      to: 'cod_certified',
      by: ['certifier'],
      label: 'Certify COD',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ certified_at: isoUtc(at), effective_cod: isoUtc(at) }),
    },
    {
      // re-work loop: a deficiency found at final review sends the run back for
      // remediation (record-only counter). Not destructive — the COD survives.
      id: 'remediate',
      from: 'reliability_complete',
      to: 'commissioning_review',
      by: ['certifier'],
      label: 'Return for remediation',
      intent: 'secondary',
      requiresReason: ['performance_shortfall', 'commissioning_gap', 'grid_compliance_gap', 'documentation_incomplete'],
      guards: [],
      derive: (f, _at: Instant) => ({ remediation_count: (typeof f.remediation_count === 'number' ? f.remediation_count : 0) + 1 }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_cod',
      from: ['cod_declared', 'commissioning_review', 'reliability_run', 'reliability_complete'],
      to: 'cod_rejected',
      by: ['certifier', 'regulator', 'system'],
      label: 'Reject COD',
      intent: 'destructive',
      requiresReason: ['reliability_run_failed', 'grid_code_non_compliance', 'cp_unmet', 'capacity_shortfall', 'safety_defect'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['cod_declared', 'commissioning_review'],
      to: 'withdrawn',
      by: ['producer'],
      label: 'Withdraw declaration',
      intent: 'destructive',
      requiresReason: ['schedule_slip', 'scope_change', 'no_longer_ready'],
      guards: [],
    },
  ],

  // reliability-run time-bar: a run that overruns its declared window without a
  // completion is a failed run. 30 days covers the standard 14-day run plus
  // certifier margin; a shorter declared reliability_run_days tightens it.
  timers: [{ onState: 'reliability_run', after: { days: 30 }, fire: 'reject_cod', kind: 'time_bar', reason: 'reliability_run_failed' }],
};
