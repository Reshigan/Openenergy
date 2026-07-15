// ipp_bfs — IPP Bankability Feasibility Study (BFS) as data.
//
// A BFS is the linear engineering/finance study spine that has to run its full
// course before a project's yield numbers are bankable: scope → data
// collection → analysis → draft → peer review → IPP comments → independent
// engineer (IE) review → optional query/response loop → certify or reject.
// Every step is its own transition (mirrors src/routes/ipp-bfs.ts's
// VALID_TRANSITIONS exactly) because a lender relies on each stage having
// left its own audit event, not just a final verdict.
//
// certify_bfs/reject_bfs are the ONLY edges into the two terminal states, and
// both are reachable ONLY from ie_review or responses_submitted — a BFS can
// never be certified or rejected before the IE has actually seen it.
//
// Strategic crossing: certifying a large project needs the regulator on the
// txn (regulatorPresentIfStrategic reads capacity_mw; the legacy utility/
// strategic capacity tiers start higher than the guard's 100 MW line, so this
// is a deliberately earlier/stricter crossing than v1's, not a re-derivation
// of its 5-tier band).
//
// settles:false — a feasibility study is a record, not a payment (R-S5-1;
// legacy quantumCol is null).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

type Tier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

// pure capacity-tier bucketing off capacity_mw, matching the legacy
// deriveBfsCapacityTier thresholds. No clock, no env.
const capacityTier = (mw: Json | undefined): Tier => {
  const v = typeof mw === 'number' ? mw : 0;
  if (v < 10) return 'small';
  if (v < 50) return 'medium';
  if (v < 200) return 'large';
  if (v < 500) return 'utility';
  return 'strategic';
};

export const ippBfs: ChainDecl = {
  key: 'ipp_bfs',
  noun: 'IPP bankability feasibility study',
  refPrefix: 'BFS',
  title: (f) => `BFS ${(f.bfs_reference as string) ?? (f.project_id as string) ?? 'study'} — ${(f.bfs_capacity_tier as string) ?? 'tier n/a'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Independent Engineer bankability certification', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator'],

  fields: {
    bfs_reference: { type: 'string', label: 'BFS reference' },
    developer_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    project_id: { type: 'string', required: true, label: 'Project' },
    trigger_category: { type: 'string', required: true, label: 'Trigger category' },
    capacity_mw: { type: 'number', required: true, min: 0, label: 'Capacity (MW)' },
    // written by derive, never the client
    bfs_capacity_tier: { type: 'string', label: 'Capacity tier' },
    ie_firm_name: { type: 'string', label: 'Independent engineer firm' },
    p50_yield_gwh: { type: 'number', min: 0, label: 'P50 yield (GWh)' },
    p90_yield_gwh: { type: 'number', min: 0, label: 'P90 yield (GWh)' },
    // derive-stamped timestamps
    submitted_to_ie_at: { type: 'string', label: 'Submitted to IE at' },
    bfs_certified_at: { type: 'string', label: 'Certified at' },
    bfs_rejected_at: { type: 'string', label: 'Rejected at' },
  },

  initial: 'bfs_triggered',

  states: {
    bfs_triggered: { label: 'BFS triggered', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    scope_definition: { label: 'Scope definition', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    data_collection: { label: 'Data collection', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    analysis_in_progress: { label: 'Analysis in progress', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    draft_bfs_issued: { label: 'Draft BFS issued', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    peer_review: { label: 'Peer review', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    ipp_comments_submitted: { label: 'IPP comments submitted', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    ie_review: { label: 'IE review', terminal: false, holder: 'ipp_developer', sla: { days: 21 } },
    queries_raised: { label: 'Queries raised', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    responses_submitted: { label: 'Responses submitted', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    bfs_certified: { label: 'BFS certified', terminal: true, holder: 'none' },
    bfs_rejected: { label: 'BFS rejected', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'bfs_triggered',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Trigger BFS',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        trigger_category: { type: 'string', required: true },
        capacity_mw: { type: 'number', required: true, min: 0 },
        ie_firm_name: { type: 'string' },
        bfs_reference: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f) => ({ bfs_capacity_tier: capacityTier(f.capacity_mw) }),
    },
    {
      id: 'define_scope',
      from: 'bfs_triggered',
      to: 'scope_definition',
      by: ['ipp_developer'],
      label: 'Define scope',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'commence_data_collection',
      from: 'scope_definition',
      to: 'data_collection',
      by: ['ipp_developer'],
      label: 'Commence data collection',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'commence_analysis',
      from: 'data_collection',
      to: 'analysis_in_progress',
      by: ['ipp_developer'],
      label: 'Commence analysis',
      intent: 'primary',
      input: {
        p50_yield_gwh: { type: 'number', min: 0 },
        p90_yield_gwh: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'issue_draft_bfs',
      from: 'analysis_in_progress',
      to: 'draft_bfs_issued',
      by: ['ipp_developer'],
      label: 'Issue draft BFS',
      intent: 'primary',
      input: { bfs_reference: { type: 'string' } },
      guards: [],
    },
    {
      id: 'commence_peer_review',
      from: 'draft_bfs_issued',
      to: 'peer_review',
      by: ['ipp_developer'],
      label: 'Commence peer review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_ipp_comments',
      from: ['peer_review', 'draft_bfs_issued'],
      to: 'ipp_comments_submitted',
      by: ['ipp_developer'],
      label: 'Submit IPP comments',
      intent: 'secondary',
      guards: [],
    },
    {
      id: 'submit_to_ie',
      from: ['ipp_comments_submitted', 'peer_review'],
      to: 'ie_review',
      by: ['ipp_developer'],
      label: 'Submit to IE',
      intent: 'primary',
      input: { ie_firm_name: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_to_ie_at: isoUtc(at) }),
    },
    {
      // the IE's queries land against the study via the IPP developer's login
      // (the IE has no platform account — ie_firm_name is descriptive only).
      id: 'raise_queries',
      from: 'ie_review',
      to: 'queries_raised',
      by: ['ipp_developer'],
      label: 'Raise IE queries',
      intent: 'secondary',
      guards: [],
    },
    {
      id: 'submit_responses',
      from: 'queries_raised',
      to: 'responses_submitted',
      by: ['ipp_developer'],
      label: 'Submit responses to IE',
      intent: 'secondary',
      guards: [],
    },
    {
      // the ONLY path to bfs_certified — only from a live IE review, direct or
      // post-query. ≥100 MW crosses to the regulator.
      id: 'certify_bfs',
      from: ['ie_review', 'responses_submitted'],
      to: 'bfs_certified',
      by: ['ipp_developer'],
      label: 'Certify BFS',
      intent: 'primary',
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ bfs_certified_at: isoUtc(at) }),
    },

    // --- exit -------------------------------------------------------------
    {
      id: 'reject_bfs',
      from: ['ie_review', 'responses_submitted'],
      to: 'bfs_rejected',
      by: ['ipp_developer'],
      label: 'Reject BFS',
      intent: 'destructive',
      requiresReason: ['resource_data_insufficient', 'yield_uncertainty_excessive', 'technical_infeasibility', 'ie_non_certification', 'financial_model_unsupportable'],
      guards: [],
      derive: (_f, at: Instant) => ({ bfs_rejected_at: isoUtc(at) }),
    },
  ],
};
