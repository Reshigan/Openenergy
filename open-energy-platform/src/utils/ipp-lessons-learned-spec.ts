// ─────────────────────────────────────────────────────────────────────────
// Wave 135 - IPP Lessons Learned Register.
//
// PHASE E WAVE 5 OF N — IPP-PM profile-completeness wave.
//
// PMBOK 7 / ISO 21502:2022 §12.6 dissemination tracking.
//
// Beats: Oracle Primavera Unifier (unstructured document storage) and
// MS Project (no learning registry at all) by giving lessons a formal P6
// state machine with RCA methods, impact tiers, and PMBOK 7 /
// ISO 21502:2022 §12.6 dissemination tracking.
//
// 13-state lessons lifecycle:
//   captured → categorized → root_cause_analyzed → impact_assessed →
//   recommendation_drafted → peer_reviewed → approved →
//   disseminated → applied → archived (HARD terminal)
//   peer_reviewed → rejected (HARD terminal)
//   any non-terminal → deferred
//   deferred → captured (restore)
//   any early non-terminal → duplicate (HARD terminal)
//
// INVERTED SLA polarity (HOURS) — more-impact lessons get MORE time
// for thorough RCA and dissemination:
//   critical_impact: 720h  (30d — most time)
//   high_impact:     480h  (20d)
//   medium_impact:   336h  (14d)
//   low_impact:      168h  (7d — least time, INVERTED)
//
// W135 SIGNATURE regulator crossings:
//   disseminate_finding EVERY tier when lesson_type='safety' OR prevents_fatality=1
//   (PMBOK 7: safety lessons must be disseminated immediately —
//    failure to apply a known safety lesson creates OHSA liability)
//   SLA breach crosses when floor_safety_critical AND (critical_impact|high_impact)
//   SLA breach crosses when lesson_type='safety'
//
// Write {admin, ipp_developer}. READ all 9 personas.
// AUDIT_PREFIX_MAP: ipp_lessons_learned → 'ipp' (JOINS existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────

export type LessonStatus =
  | 'captured'
  | 'categorized'
  | 'root_cause_analyzed'
  | 'impact_assessed'
  | 'recommendation_drafted'
  | 'peer_reviewed'
  | 'approved'
  | 'disseminated'
  | 'applied'
  | 'archived'
  | 'rejected'
  | 'deferred'
  | 'duplicate';

export type LessonAction =
  | 'categorize_lesson'      // captured → categorized
  | 'analyze_root_cause'     // categorized → root_cause_analyzed
  | 'assess_impact'          // root_cause_analyzed → impact_assessed
  | 'draft_recommendation'   // impact_assessed → recommendation_drafted
  | 'submit_for_review'      // recommendation_drafted → peer_reviewed
  | 'approve_lesson'         // peer_reviewed → approved
  | 'disseminate_finding'    // approved → disseminated (SIGNATURE when safety/prevents_fatality)
  | 'confirm_applied'        // disseminated → applied
  | 'archive_lesson'         // applied → archived
  | 'reject_lesson'          // peer_reviewed → rejected (hard terminal)
  | 'defer_lesson'           // any non-terminal → deferred
  | 'mark_duplicate'         // any non-terminal (early states) → duplicate (hard terminal)
  | 'restore_lesson';        // deferred → captured

export type ImpactTier = 'critical_impact' | 'high_impact' | 'medium_impact' | 'low_impact';

// INVERTED SLA — more-impact lessons get MORE time for thorough RCA
export const SLA_HOURS: Record<ImpactTier, number> = {
  critical_impact: 720,  // 30d — most time (INVERTED)
  high_impact:     480,  // 20d
  medium_impact:   336,  // 14d
  low_impact:      168,  // 7d — least time (INVERTED)
};

export const HARD_TERMINALS: LessonStatus[] = ['archived', 'rejected', 'duplicate'];

export function isHardTerminal(status: LessonStatus): boolean {
  return HARD_TERMINALS.includes(status);
}

export const TRANSITIONS: Record<LessonAction, { from: LessonStatus[]; to: LessonStatus }> = {
  categorize_lesson:    { from: ['captured'], to: 'categorized' },
  analyze_root_cause:   { from: ['categorized'], to: 'root_cause_analyzed' },
  assess_impact:        { from: ['root_cause_analyzed'], to: 'impact_assessed' },
  draft_recommendation: { from: ['impact_assessed'], to: 'recommendation_drafted' },
  submit_for_review:    { from: ['recommendation_drafted'], to: 'peer_reviewed' },
  approve_lesson:       { from: ['peer_reviewed'], to: 'approved' },
  disseminate_finding:  { from: ['approved'], to: 'disseminated' },
  confirm_applied:      { from: ['disseminated'], to: 'applied' },
  archive_lesson:       { from: ['applied'], to: 'archived' },
  reject_lesson:        { from: ['peer_reviewed'], to: 'rejected' },
  defer_lesson: {
    from: [
      'captured', 'categorized', 'root_cause_analyzed', 'impact_assessed',
      'recommendation_drafted', 'peer_reviewed', 'approved', 'disseminated', 'applied',
    ],
    to: 'deferred',
  },
  mark_duplicate: {
    from: [
      'captured', 'categorized', 'root_cause_analyzed', 'impact_assessed',
      'recommendation_drafted',
    ],
    to: 'duplicate',
  },
  restore_lesson: { from: ['deferred'], to: 'captured' },
};

export function nextStatus(current: LessonStatus, action: LessonAction): LessonStatus | null {
  if (isHardTerminal(current)) return null;
  const t = TRANSITIONS[action];
  if (!t || !t.from.includes(current)) return null;
  return t.to;
}

// W135 SIGNATURE: disseminate_finding EVERY tier when lesson_type='safety' OR prevents_fatality=1
export function crossesIntoRegulator(
  action: LessonAction,
  args: { lesson_type?: string; prevents_fatality?: boolean | number },
): boolean {
  if (action === 'disseminate_finding' &&
      (args.lesson_type === 'safety' || args.prevents_fatality)) return true;
  return false;
}

export function slaBreachCrossesIntoRegulator(
  tier: ImpactTier,
  args: { floor_safety_critical?: boolean | number; lesson_type?: string },
): boolean {
  if (args.floor_safety_critical && (tier === 'critical_impact' || tier === 'high_impact')) return true;
  if (args.lesson_type === 'safety') return true;
  return false;
}

// ─── Status timestamp column mapping ────────────────────────────────────────

export function statusTsCol(status: LessonStatus): string {
  const map: Record<LessonStatus, string> = {
    captured:              'captured_at',
    categorized:           'categorized_at',
    root_cause_analyzed:   'root_cause_analyzed_at',
    impact_assessed:       'impact_assessed_at',
    recommendation_drafted:'recommendation_drafted_at',
    peer_reviewed:         'peer_reviewed_at',
    approved:              'approved_at',
    disseminated:          'disseminated_at',
    applied:               'applied_at',
    archived:              'archived_at',
    rejected:              'rejected_at',
    deferred:              'deferred_at',
    duplicate:             'duplicate_at',
  };
  return map[status] ?? 'updated_at';
}

// ─── Event type mapping ────────────────────────────────────────────────────

export function eventTypeFor(action: LessonAction): string {
  return `ipp_lessons_learned.${action}`;
}

// ─── SLA helpers ──────────────────────────────────────────────────────────

export function slaDeadlineFor(tier: ImpactTier, from: Date): Date {
  const d = new Date(from);
  d.setTime(d.getTime() + SLA_HOURS[tier] * 3600 * 1000);
  return d;
}

export function slaHoursRemaining(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  return Math.round(ms / 3600000);
}

// ─── Label maps ───────────────────────────────────────────────────────────

export const IMPACT_TIER_LABELS: Record<ImpactTier, string> = {
  critical_impact: 'Critical impact',
  high_impact:     'High impact',
  medium_impact:   'Medium impact',
  low_impact:      'Low impact',
};

export const LESSON_TYPE_LABELS: Record<string, string> = {
  positive: 'Positive',
  negative: 'Negative',
  safety:   'Safety observation',
};

export const LESSON_CATEGORY_LABELS: Record<string, string> = {
  technical:    'Technical',
  schedule:     'Schedule',
  cost:         'Cost',
  safety:       'Safety',
  procurement:  'Procurement',
  stakeholder:  'Stakeholder',
  regulatory:   'Regulatory',
  environmental:'Environmental',
  quality:      'Quality',
  risk:         'Risk',
  financial:    'Financial',
  contractual:  'Contractual',
};

export const LESSON_PHASE_LABELS: Record<string, string> = {
  development:    'Development',
  permitting:     'Permitting',
  procurement:    'Procurement',
  construction:   'Construction',
  commissioning:  'Commissioning',
  operations:     'Operations',
  decommissioning:'Decommissioning',
};

export const RCA_METHOD_LABELS: Record<string, string> = {
  five_whys:       '5 Whys',
  fishbone:        'Fishbone diagram',
  fmea:            'FMEA',
  fault_tree:      'Fault tree analysis',
  timeline_analysis: 'Timeline analysis',
  none:            'Not yet performed',
};
