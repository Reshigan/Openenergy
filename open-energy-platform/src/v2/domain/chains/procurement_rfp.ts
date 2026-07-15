// procurement_rfp — REIPPPP-programme procurement RFP lifecycle, as data.
//
// An IPP developer opens an RFP, publishes it, runs the competitive-bid
// window (open_bids → close_bids), evaluates and shortlists, then either
// awards to a bidder (→ contract signature → delivery) or rejects the whole
// round. A signed contract can be disputed and resolved back to `contracted`
// without losing the award.
//
// Structural honesty (no invented guards):
//  - `award` is the ONLY edge into `awarded`, and it is only reachable from
//    `shortlisted` — so an RFP can NEVER be awarded without having gone
//    through the competitive-bid + evaluation spine (structural, no guard).
//  - `award` carries counterpartyDistinct: the procuring developer and the
//    awarded bidder must be different legal entities (no self-award).
//  - v1 permitted only {admin, support, ipp, ipp_developer, wind} to drive
//    every action on this chain (developer-side procurement desk); the
//    bidder is a named/evidenced party for guard purposes, never an actor,
//    so `by` stays ['ipp_developer'] throughout (cod_chain.ts precedent).
//
// settles:false — an RFP record is a procurement-governance decision.
// capex_estimate_zar is an informational estimate; actual EPC/vendor
// payments settle on their own rails (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const procurementRfp: ChainDecl = {
  key: 'procurement_rfp',
  noun: 'Procurement RFP',
  refPrefix: 'RFP',
  title: (f) =>
    `RFP — ${(f.rfp_title as string) ?? 'untitled'}${f.award_name ? ` → ${f.award_name as string}` : ''}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Procurement Guidelines', provision: 'competitive-bid transparency & capex-tier disclosure', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'bidder'],

  fields: {
    rfp_number: { type: 'string', label: 'RFP number' },
    rfp_title: { type: 'string', required: true, label: 'RFP title' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    bidder_party: { type: 'party', role: 'bidder', label: 'Awarded bidder entity' },
    capex_estimate_zar: { type: 'number', min: 0, label: 'Capex estimate (ZAR)' },
    award_name: { type: 'string', label: 'Awarded bidder' },
    award_to: { type: 'string', label: 'Bidder reference' },
    award_amount_zar: { type: 'number', min: 0, label: 'Award amount (ZAR)' },
    dispute_notes: { type: 'string', label: 'Dispute notes' },
    resolution_notes: { type: 'string', label: 'Resolution notes' },
    // written by derive, never by the client
    published_at: { type: 'string', label: 'Published at' },
    bidding_opened_at: { type: 'string', label: 'Bidding opened at' },
    bid_closed_at: { type: 'string', label: 'Bid closed at' },
    evaluation_started_at: { type: 'string', label: 'Evaluation started at' },
    shortlisted_at: { type: 'string', label: 'Shortlisted at' },
    awarded_at: { type: 'string', label: 'Awarded at' },
    contracted_at: { type: 'string', label: 'Contract signed at' },
    delivered_at: { type: 'string', label: 'Delivered at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    resolved_at: { type: 'string', label: 'Dispute resolved at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    cancelled_at: { type: 'string', label: 'Cancelled at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    published: { label: 'Published', terminal: false, holder: 'ipp_developer', sla: { days: 21 } },
    bidding: { label: 'Bidding open', terminal: false, holder: 'ipp_developer', sla: { days: 21 } },
    bid_closed: { label: 'Bid closed', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    evaluation: { label: 'Evaluation', terminal: false, holder: 'ipp_developer', sla: { days: 21 } },
    shortlisted: { label: 'Shortlisted', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    awarded: { label: 'Awarded', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    contracted: { label: 'Contracted', terminal: false, holder: 'ipp_developer', sla: { days: 60 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    delivered: { label: 'Delivered', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Open RFP',
      intent: 'primary',
      input: {
        rfp_title: { type: 'string', required: true },
        rfp_number: { type: 'string' },
        capex_estimate_zar: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'publish',
      from: 'draft',
      to: 'published',
      by: ['ipp_developer'],
      label: 'Publish',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ published_at: isoUtc(at) }),
    },
    {
      id: 'open_bids',
      from: 'published',
      to: 'bidding',
      by: ['ipp_developer'],
      label: 'Open bids',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ bidding_opened_at: isoUtc(at) }),
    },
    {
      id: 'close_bids',
      from: 'bidding',
      to: 'bid_closed',
      by: ['ipp_developer'],
      label: 'Close bids',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ bid_closed_at: isoUtc(at) }),
    },
    {
      id: 'begin_evaluation',
      from: 'bid_closed',
      to: 'evaluation',
      by: ['ipp_developer'],
      label: 'Begin evaluation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ evaluation_started_at: isoUtc(at) }),
    },
    {
      id: 'shortlist',
      from: 'evaluation',
      to: 'shortlisted',
      by: ['ipp_developer'],
      label: 'Shortlist',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ shortlisted_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into awarded, and only reachable from shortlisted — an
      // RFP can NEVER be awarded without the competitive-bid + evaluation
      // spine (structural). counterpartyDistinct blocks self-award.
      id: 'award',
      from: 'shortlisted',
      to: 'awarded',
      by: ['ipp_developer'],
      label: 'Award RFP',
      intent: 'primary',
      input: {
        award_name: { type: 'string', required: true },
        bidder_party: { type: 'party', role: 'bidder' },
        award_to: { type: 'string' },
        award_amount_zar: { type: 'number', min: 0 },
      },
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ awarded_at: isoUtc(at) }),
    },
    {
      id: 'sign_contract',
      from: 'awarded',
      to: 'contracted',
      by: ['ipp_developer'],
      label: 'Sign contract',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ contracted_at: isoUtc(at) }),
    },
    {
      id: 'mark_delivered',
      from: 'contracted',
      to: 'delivered',
      by: ['ipp_developer'],
      label: 'Mark delivered',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ delivered_at: isoUtc(at) }),
    },

    // --- contract-execution dispute loop (never loses the award) -----------
    {
      id: 'dispute',
      from: 'contracted',
      to: 'disputed',
      by: ['ipp_developer'],
      label: 'Dispute',
      intent: 'destructive',
      input: { dispute_notes: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      id: 'resolve',
      from: 'disputed',
      to: 'contracted',
      by: ['ipp_developer'],
      label: 'Resolve',
      intent: 'primary',
      input: { resolution_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },

    // --- adverse exits -------------------------------------------------------
    {
      id: 'reject_all',
      from: ['evaluation', 'shortlisted'],
      to: 'rejected',
      by: ['ipp_developer'],
      label: 'Reject all',
      intent: 'destructive',
      requiresReason: ['no_compliant_bids', 'all_bids_non_responsive', 'budget_withdrawn', 'scope_changed'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'cancel',
      from: ['draft', 'published', 'bidding', 'bid_closed', 'evaluation', 'shortlisted', 'awarded', 'contracted', 'disputed'],
      to: 'cancelled',
      by: ['ipp_developer'],
      label: 'Cancel RFP',
      intent: 'destructive',
      requiresReason: ['budget_withdrawn', 'programme_deferred', 'scope_changed', 'commercially_unviable', 'no_longer_required'],
      guards: [],
      derive: (_f, at: Instant) => ({ cancelled_at: isoUtc(at) }),
    },
  ],
};
