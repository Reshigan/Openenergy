// dscr_report — periodic DSCR (debt-service coverage ratio) reporting cycle
// from an IPP borrower to its lender/DFI, as data.
//
// The IPP developer gathers the period's cash-flow data and computes the DSCR
// figure, an Independent Engineer certifies it, and the developer submits the
// certified figure to the DFI. The DFI may raise queries (looping until
// responded), then either accepts the report or flags a covenant breach.
//
// Structural gate: submit_to_dfi leaves ONLY ie_certified, and the ONLY path
// into ie_certified is ie_certify — a DSCR figure can NEVER reach the DFI
// without independent-engineer certification, no guard needed.
//
// settles:false — a DSCR report is a covenant-compliance record; the debt
// service it measures settles on its own facility rail (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const dscrReport: ChainDecl = {
  key: 'dscr_report',
  noun: 'DSCR report',
  refPrefix: 'DSCRR',
  title: (f) => `DSCR report ${(f.reporting_period as string) ?? '—'} — ${(f.dfi_name as string) ?? 'unnamed DFI'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Common Terms Agreement', provision: 'periodic DSCR certification and DFI reporting covenant', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'lender', 'operator'],

  fields: {
    reporting_period: { type: 'string', required: true, label: 'Reporting period' },
    dfi_name: { type: 'string', label: 'DFI' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender / DFI' },
    dscr_value: { type: 'number', label: 'DSCR value' },
    dfi_query_details: { type: 'string', label: 'DFI query details' },
    breach_type: { type: 'string', label: 'Breach type (historical/projected/both)' },
    // written by derive, never by the client
    opened_at: { type: 'string', label: 'Opened at' },
    ie_certified_at: { type: 'string', label: 'IE certified at' },
    dfi_submitted_at: { type: 'string', label: 'DFI submitted at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    breach_flagged_at: { type: 'string', label: 'Breach flagged at' },
  },

  initial: 'data_gathering',

  states: {
    data_gathering: { label: 'Data gathering', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    calculation: { label: 'Calculation', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    ie_review: { label: 'IE review', terminal: false, holder: 'lender', sla: { days: 10 } },
    ie_certified: { label: 'IE certified', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    dfi_submitted: { label: 'Submitted to DFI', terminal: false, holder: 'lender', sla: { days: 10 } },
    dfi_queries: { label: 'DFI queries raised', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    queries_responded: { label: 'Queries responded', terminal: false, holder: 'lender', sla: { days: 7 } },
    accepted: { label: 'Accepted', terminal: true, holder: 'none' },
    covenant_breach: { label: 'Covenant breach', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'data_gathering',
      by: ['ipp_developer', 'lender', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Open DSCR report',
      intent: 'primary',
      input: {
        reporting_period: { type: 'string', required: true },
        dfi_name: { type: 'string' },
        dscr_value: { type: 'number' },
        lender_party: { type: 'party', role: 'lender' },
      },
      // borrower ≠ lender on its own DSCR certification (no self-reporting).
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ opened_at: isoUtc(at) }),
    },
    {
      id: 'start_calculation',
      from: 'data_gathering',
      to: 'calculation',
      by: ['ipp_developer', 'lender', 'operator'],
      label: 'Start calculation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_to_ie',
      from: 'calculation',
      to: 'ie_review',
      by: ['ipp_developer', 'lender', 'operator'],
      label: 'Submit to IE',
      intent: 'primary',
      guards: [],
    },
    {
      // structural gate: the ONLY edge into ie_certified.
      id: 'ie_certify',
      from: 'ie_review',
      to: 'ie_certified',
      by: ['ipp_developer', 'lender', 'operator'],
      label: 'IE certify',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ ie_certified_at: isoUtc(at) }),
    },
    {
      // structural safety gate: leaves ONLY ie_certified — a DSCR figure
      // cannot reach the DFI without independent-engineer certification.
      id: 'submit_to_dfi',
      from: 'ie_certified',
      to: 'dfi_submitted',
      by: ['ipp_developer', 'lender', 'operator'],
      label: 'Submit to DFI',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ dfi_submitted_at: isoUtc(at) }),
    },
    {
      id: 'raise_dfi_query',
      from: ['dfi_submitted', 'queries_responded'],
      to: 'dfi_queries',
      by: ['ipp_developer', 'lender', 'operator'],
      label: 'Raise DFI query',
      intent: 'secondary',
      input: { dfi_query_details: { type: 'string' } },
      requiresReason: ['clarification_needed', 'assumptions_challenged', 'methodology_disputed', 'evidence_requested'],
      guards: [],
    },
    {
      id: 'respond_to_queries',
      from: 'dfi_queries',
      to: 'queries_responded',
      by: ['ipp_developer', 'lender', 'operator'],
      label: 'Respond to DFI queries',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'accept',
      from: ['dfi_submitted', 'queries_responded'],
      to: 'accepted',
      by: ['ipp_developer', 'lender', 'operator'],
      label: 'Accept',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },

    // --- exits ------------------------------------------------------------
    {
      id: 'flag_breach',
      from: ['calculation', 'ie_review', 'ie_certified', 'dfi_submitted', 'dfi_queries', 'queries_responded'],
      to: 'covenant_breach',
      by: ['ipp_developer', 'lender', 'operator'],
      label: 'Flag breach',
      intent: 'destructive',
      input: { breach_type: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ breach_flagged_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['data_gathering', 'calculation', 'ie_review', 'ie_certified', 'dfi_submitted', 'dfi_queries', 'queries_responded'],
      to: 'withdrawn',
      by: ['ipp_developer', 'lender', 'operator'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['facility_refinanced', 'reporting_cycle_changed', 'duplicate_report', 'no_longer_required'],
      guards: [],
    },
  ],
};
