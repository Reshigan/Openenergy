// ipp_refi — IPP project refinancing & debt-restructuring lifecycle (W157: NERSA
// §35 licence-amendment clearance + SARB exchange control on incoming lender).
//
// A developer mandates a refinancing, signs the arranger term sheet, then
// (conditionally — sarb_approval_required gates whether SARB ExCon applies)
// applies for NERSA §35 clearance before closing the new facility. The v1
// status enum also carries credit_approval / conditions_precedent /
// legal_documentation / sarb_exchange_control — real statuses with no
// dedicated v1 action to enter them (never appear in the legacy actions[]
// array either), so they're modelled as valid `from` states only, for
// defensiveness against imported/legacy rows that may already sit in one of
// them, not as a fabricated v2 workflow step.
//
// No guard in the registry reads debt_quantum_zar (regulatorPresentIfStrategic
// reads capacity_mw, a different domain) — the legacy "crosses into the
// regulator inbox for every tier" behaviour is a cascade fan-out, not a
// pre-commit gate, so achieve_financial_close and declare_lender_default carry
// no regulator guard; the regulator can still ride the txn as an optional
// party from open.
//
// settles:false — this chain is the refinancing *approval/record* lifecycle;
// the drawdown/disbursement of the new facility settles elsewhere (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

const STRUCTURING_STATES = ['term_sheet_signed', 'nersa_clearance', 'credit_approval', 'conditions_precedent', 'legal_documentation', 'sarb_exchange_control'];

export const ippRefi: ChainDecl = {
  key: 'ipp_refi',
  noun: 'IPP refinancing',
  refPrefix: 'REFI',
  title: (f) => `IPP refinancing — ${(f.project_id as string) ?? 'project'} (R${typeof f.debt_quantum_zar === 'number' ? f.debt_quantum_zar : 0})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'IPP generation licence amendment (§35 clearance) on facility refinancing', effect: 'requires' },
    { instrument: 'REIPPPP', provision: 'Implementation/Project Agreement lender consent on refinancing', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'lender', 'regulator'],

  fields: {
    refi_ref: { type: 'string', label: 'Refinancing ref' },
    project_id: { type: 'string', required: true, label: 'Project' },
    debt_quantum_zar: { type: 'number', required: true, min: 0, label: 'Debt quantum (ZAR)' },
    refinancing_type: { type: 'string', label: 'Refinancing type' },
    sarb_approval_required: { type: 'boolean', label: 'SARB exchange control approval required' },
    description: { type: 'string', label: 'Description' },
    developer_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender / arranger' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA/SARB)' },
    // derive-stamped timestamps
    term_sheet_signed_at: { type: 'string', label: 'Term sheet signed at' },
    nersa_clearance_applied_at: { type: 'string', label: 'NERSA clearance applied at' },
    financial_close_at: { type: 'string', label: 'Financial close at' },
    lender_default_at: { type: 'string', label: 'Lender default declared at' },
    recovery_started_at: { type: 'string', label: 'Recovery started at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    abandoned_at: { type: 'string', label: 'Abandoned at' },
  },

  initial: 'refinancing_mandated',

  states: {
    refinancing_mandated: { label: 'Refinancing mandated', terminal: false, holder: 'ipp_developer', sla: { days: 60 } },
    term_sheet_signed: { label: 'Term sheet signed', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    // no v1 action enters these — carried only as valid `from` states below.
    credit_approval: { label: 'Credit approval', terminal: false, holder: 'ipp_developer' },
    conditions_precedent: { label: 'Conditions precedent', terminal: false, holder: 'ipp_developer' },
    legal_documentation: { label: 'Legal documentation', terminal: false, holder: 'ipp_developer' },
    sarb_exchange_control: { label: 'SARB exchange control', terminal: false, holder: 'ipp_developer' },
    nersa_clearance: { label: 'NERSA clearance', terminal: false, holder: 'ipp_developer', sla: { days: 45 } },
    lender_default: { label: 'Lender default', terminal: false, holder: 'ipp_developer' },
    financial_close: { label: 'Financial close', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    abandoned: { label: 'Abandoned', terminal: true, holder: 'none' },
    recovery_in_progress: { label: 'Recovery in progress', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'refinancing_mandated',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Mandate refinancing',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        debt_quantum_zar: { type: 'number', required: true, min: 0 },
        refinancing_type: { type: 'string' },
        sarb_approval_required: { type: 'boolean' },
        description: { type: 'string' },
        lender_party: { type: 'party', role: 'lender' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // no self-dealing: developer and lender must be distinct entities (no-op
      // if lender_party wasn't supplied yet).
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'sign_term_sheet',
      from: 'refinancing_mandated',
      to: 'term_sheet_signed',
      by: ['ipp_developer'],
      label: 'Sign term sheet',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ term_sheet_signed_at: isoUtc(at) }),
    },
    {
      id: 'apply_nersa_clearance',
      from: 'term_sheet_signed',
      to: 'nersa_clearance',
      by: ['ipp_developer'],
      label: 'Apply NERSA clearance',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ nersa_clearance_applied_at: isoUtc(at) }),
    },
    {
      // reachable straight from term_sheet_signed too — not every refinancing
      // needs the §35 clearance branch (small-quantum / no-lender-change deals).
      id: 'achieve_financial_close',
      from: STRUCTURING_STATES,
      to: 'financial_close',
      by: ['ipp_developer'],
      label: 'Achieve financial close',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ financial_close_at: isoUtc(at) }),
    },
    {
      id: 'declare_lender_default',
      from: STRUCTURING_STATES,
      to: 'lender_default',
      by: ['ipp_developer'],
      label: 'Declare lender default',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ lender_default_at: isoUtc(at) }),
    },
    {
      id: 'resolve_lender_default',
      from: 'lender_default',
      to: 'recovery_in_progress',
      by: ['ipp_developer'],
      label: 'Resolve lender default (recovery)',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ recovery_started_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_refinancing',
      from: ['refinancing_mandated', ...STRUCTURING_STATES],
      to: 'rejected',
      by: ['ipp_developer', 'regulator'],
      label: 'Reject refinancing',
      intent: 'destructive',
      requiresReason: ['nersa_clearance_refused', 'sarb_exchange_control_refused', 'credit_committee_declined', 'covenant_breach', 'documentation_deficient'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'abandon_refinancing',
      from: ['refinancing_mandated', ...STRUCTURING_STATES, 'lender_default'],
      to: 'abandoned',
      by: ['ipp_developer', 'system'],
      label: 'Abandon refinancing',
      intent: 'destructive',
      requiresReason: ['financing_withdrawn', 'market_conditions', 'sponsor_decision', 'superseded_facility', 'project_cancelled', 'sla_lapsed'],
      guards: [],
      derive: (_f, at: Instant) => ({ abandoned_at: isoUtc(at) }),
    },
  ],

  // structuring inertia time-bar: a mandate that never gets a signed term
  // sheet within 60 days auto-abandons (deadlineCol: sla_due_at in v1).
  timers: [{ onState: 'refinancing_mandated', after: { days: 60 }, fire: 'abandon_refinancing', kind: 'time_bar', reason: 'sla_lapsed' }],
};
