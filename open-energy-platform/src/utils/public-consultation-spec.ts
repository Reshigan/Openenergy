// ═══════════════════════════════════════════════════════════════════════════════
// W209 — Regulator Public Consultation & Stakeholder Engagement
// ERA 2006 §10 + NERSA Public Participation Framework + Promotion of Administrative
// Justice Act (PAJA) §3-4
// ═══════════════════════════════════════════════════════════════════════════════

export type PcStatus =
  | 'draft'                  // consultation document being prepared
  | 'published'              // consultation document published; public window open
  | 'objection_period'       // formal objection window (post-comment)
  | 'submissions_closed'     // window elapsed; reviewing submissions
  | 'analysis'               // submissions being analysed
  | 'determination_draft'    // draft determination prepared
  | 'determination_notice'   // final determination issued
  | 'appealed'               // determination under appeal (PAJA §6)
  | 'appeal_resolved'        // appeal concluded
  | 'closed'                 // consultation fully complete; terminal +
  | 'withdrawn';             // consultation withdrawn without determination; terminal

export type PcAction =
  | 'publish_notice'
  | 'open_objection_period'
  | 'close_submissions'
  | 'start_analysis'
  | 'draft_determination'
  | 'issue_determination'
  | 'lodge_appeal'
  | 'resolve_appeal'
  | 'close_consultation'
  | 'withdraw'
  | 'sla_breach';

export type ConsultationTier =
  | 'routine'        // standard licence amendments, minor tariff adjustments
  | 'significant'    // major tariff determinations, new licence classes
  | 'national'       // national energy policy; highest public interest
  | 'emergency';     // emergency determinations (shortened window)

// INVERTED SLA: national/significant consultations get MORE time (deeper scrutiny)
// emergency gets SHORTEST time
export function derivePcSla(tier: ConsultationTier): number {
  const DAYS: Record<ConsultationTier, number> = {
    emergency:   7,
    routine:     30,
    significant: 60,
    national:    90,
  };
  return DAYS[tier] ?? 30;
}

export const PC_HARD_TERMINALS = new Set<PcStatus>(['closed', 'withdrawn']);

export const PC_VALID_TRANSITIONS: Record<PcStatus, PcAction[]> = {
  draft:                 ['publish_notice', 'withdraw', 'sla_breach'],
  published:             ['open_objection_period', 'close_submissions', 'sla_breach'],
  objection_period:      ['close_submissions', 'sla_breach'],
  submissions_closed:    ['start_analysis', 'sla_breach'],
  analysis:              ['draft_determination', 'sla_breach'],
  determination_draft:   ['issue_determination', 'withdraw', 'sla_breach'],
  determination_notice:  ['lodge_appeal', 'close_consultation', 'sla_breach'],
  appealed:              ['resolve_appeal', 'sla_breach'],
  appeal_resolved:       ['close_consultation', 'sla_breach'],
  closed:                [],
  withdrawn:             [],
};

export const PC_STATE_TRANSITIONS: Record<PcAction, PcStatus> = {
  publish_notice:         'published',
  open_objection_period:  'objection_period',
  close_submissions:      'submissions_closed',
  start_analysis:         'analysis',
  draft_determination:    'determination_draft',
  issue_determination:    'determination_notice',
  lodge_appeal:           'appealed',
  resolve_appeal:         'appeal_resolved',
  close_consultation:     'closed',
  withdraw:               'withdrawn',
  sla_breach:             'draft',
};

// Regulator crossings (ERO filing + public record)
export function pcCrossesIntoRegulator(action: PcAction, tier: ConsultationTier): boolean {
  // issue_determination always crosses — it IS the regulatory act
  if (action === 'issue_determination') return true;
  // lodge_appeal always crosses — PAJA appeal is a regulatory event
  if (action === 'lodge_appeal') return true;
  // publish_notice for national/significant → public record
  if (action === 'publish_notice') return tier === 'national' || tier === 'significant';
  return false;
}

export function pcSlaBreachCrossesIntoRegulator(tier: ConsultationTier): boolean {
  // SLA breach on national/significant/emergency consultations always escalates
  return tier !== 'routine';
}
