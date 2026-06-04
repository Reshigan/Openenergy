// ─────────────────────────────────────────────────────────────────────────────
// Wave 143 — IPP Daily Construction Diary (Site Diary)
//
// PHASE E WAVE 13 — IPP-PM profile-completeness wave.
//
// Regulatory basis:
//   JBCC 6.2 clause 8.13 — site diary mandatory daily record
//   NEC4 clause 25 — programme notification + compensation-event evidence
//   CIDB Best Practice Guideline #A1 — record-keeping requirements
//   OHSA Construction Regulations 2014 Reg 5(1)(h) — health & safety records
//
// The site diary is the PRIMARY legal evidence record for:
//   - delay/disruption claims (time impact analysis under NEC4)
//   - force-majeure weather events (excludable delay under JBCC)
//   - safety incident documentation (OHSA mandatory record)
//   - formal instructions given on site (contract-administrative significance)
//   - workforce and plant deployed (basis for escalation claims)
//
// 12-state lifecycle:
//   open → submitted → employer_noted → ie_reviewed → countersigned → archived (HARD)
//
//   Branch states:
//   late_submission  (cron flags diary not submitted within 24h of diary_date)
//   disputed         (employer raises objection to entries)
//   resolution_pending (dispute in discussion)
//   correction_accepted (agreed correction, re-entering main flow)
//   missed           (not submitted within 72h — HARD terminal, SLA breach)
//   voided           (admin void, e.g. confirmed no-work day)
//
// URGENT SLA polarity (TIGHTER = faster required):
//   critical_delay:       12h (tightest — delay event day, time-sensitive for claims)
//   daily_operational:    24h (normal working day)
//   shutdown_partial:     48h (partial shutdown / standby day)
//   no_work:              96h (public holiday / confirmed no-work, loosest)
//
// W143 SIGNATURE crossings:
//   miss_diary EVERY tier (JBCC contractual breach — always notifiable)
//   dispute_diary when floor_has_delay_event AND tier=critical_delay (delay claims)
//   submit_diary when floor_has_safety_incident (OHSA 24h incident notification)
//
// Beats Procore / Viewpoint / Aconex daily-report forms with full P6 lifecycle,
// dispute-resolution machine, IE countersignature workflow, and missed-diary
// regulator notification.
//
// Write {admin, ipp_developer, support}.
// READ all 9 personas.
// AUDIT_PREFIX_MAP: ipp_diary → 'ipp' (joins existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────────

export type DiaryStatus =
  | 'open'
  | 'submitted'
  | 'late_submission'
  | 'employer_noted'
  | 'ie_reviewed'
  | 'disputed'
  | 'resolution_pending'
  | 'correction_accepted'
  | 'countersigned'
  | 'archived'
  | 'missed'
  | 'voided';

export type DiaryAction =
  | 'submit_diary'          // open/late_submission → submitted
  | 'note_receipt'          // submitted/late_submission → employer_noted
  | 'ie_review'             // employer_noted → ie_reviewed
  | 'countersign'           // ie_reviewed → countersigned
  | 'archive_diary'         // countersigned/correction_accepted → archived
  | 'dispute_diary'         // employer_noted/ie_reviewed/countersigned → disputed
  | 'open_resolution'       // disputed → resolution_pending
  | 'accept_correction'     // resolution_pending → correction_accepted
  | 'miss_diary'            // open/late_submission → missed (cron — SIGNATURE)
  | 'flag_late'             // open → late_submission (cron)
  | 'void_diary'            // open/late_submission → voided (admin — no-work day)
  | 'flag_sla_breach';      // cron — status unchanged

export type DiaryDayType =
  | 'critical_delay'
  | 'daily_operational'
  | 'shutdown_partial'
  | 'no_work';

// URGENT SLA (tighter day_type = faster required)
export const SLA_HOURS: Record<DiaryDayType, number> = {
  critical_delay:    12,   // delay day — time critical for claims
  daily_operational: 24,   // normal working day
  shutdown_partial:  48,   // partial shutdown / standby
  no_work:           96,   // holiday / confirmed no-work (loosest)
};

export const HARD_TERMINALS: DiaryStatus[] = ['archived', 'missed', 'voided'];

export function isHardTerminal(status: DiaryStatus): boolean {
  return HARD_TERMINALS.includes(status);
}

export const TRANSITIONS: Record<DiaryAction, { from: DiaryStatus[]; to: DiaryStatus }> = {
  submit_diary:     { from: ['open', 'late_submission'], to: 'submitted' },
  note_receipt:     { from: ['submitted', 'late_submission'], to: 'employer_noted' },
  ie_review:        { from: ['employer_noted'], to: 'ie_reviewed' },
  countersign:      { from: ['ie_reviewed', 'correction_accepted'], to: 'countersigned' },
  archive_diary:    { from: ['countersigned', 'correction_accepted'], to: 'archived' },
  dispute_diary:    { from: ['employer_noted', 'ie_reviewed', 'countersigned'], to: 'disputed' },
  open_resolution:  { from: ['disputed'], to: 'resolution_pending' },
  accept_correction:{ from: ['resolution_pending'], to: 'correction_accepted' },
  miss_diary:       { from: ['open', 'late_submission'], to: 'missed' },
  flag_late:        { from: ['open'], to: 'late_submission' },
  void_diary:       { from: ['open', 'late_submission'], to: 'voided' },
  flag_sla_breach: {
    from: [
      'open', 'submitted', 'late_submission', 'employer_noted',
      'ie_reviewed', 'disputed', 'resolution_pending', 'correction_accepted',
    ],
    to: 'open', // placeholder — nextStatus returns current for cron flag
  },
};

export function nextStatus(current: DiaryStatus, action: DiaryAction): DiaryStatus | null {
  if (isHardTerminal(current)) return null;
  if (action === 'flag_sla_breach') return current; // cron-only: status unchanged
  const t = TRANSITIONS[action];
  if (!t || !t.from.includes(current)) return null;
  return t.to;
}

// ─── W143 SIGNATURE crossings ─────────────────────────────────────────────────

export interface DiaryCrossArgs {
  day_type: DiaryDayType;
  has_delay_event: boolean;
  has_safety_incident: boolean;
}

export function crossesIntoRegulator(action: DiaryAction, args: DiaryCrossArgs): boolean {
  const { day_type, has_delay_event, has_safety_incident } = args;
  switch (action) {
    case 'miss_diary':
      return true; // SIGNATURE: EVERY tier — JBCC contractual breach
    case 'dispute_diary':
      return has_delay_event && day_type === 'critical_delay'; // delay-day dispute
    case 'submit_diary':
      return has_safety_incident; // OHSA 24h notification obligation
    default:
      return false;
  }
}

export function slaBreachCrossesIntoRegulator(_day_type: DiaryDayType): boolean {
  return true; // missed submission always crosses — JBCC breach
}

export function isReportable(action: DiaryAction, args: DiaryCrossArgs): boolean {
  return crossesIntoRegulator(action, args);
}

// ─── SLA helpers ─────────────────────────────────────────────────────────────

export function slaHoursFor(day_type: DiaryDayType): number {
  return SLA_HOURS[day_type] ?? 24;
}

export function slaDeadlineFor(diary_date: string, day_type: DiaryDayType): string {
  const ms = new Date(diary_date).getTime() + slaHoursFor(day_type) * 3_600_000;
  return new Date(ms).toISOString();
}

export function slaHoursRemaining(deadline: string): number {
  return (new Date(deadline).getTime() - Date.now()) / 3_600_000;
}

// ─── Event type helpers ───────────────────────────────────────────────────────

export type DiaryEventType =
  | 'ipp_diary.submit_diary'
  | 'ipp_diary.note_receipt'
  | 'ipp_diary.ie_review'
  | 'ipp_diary.countersign'
  | 'ipp_diary.archive_diary'
  | 'ipp_diary.dispute_diary'
  | 'ipp_diary.open_resolution'
  | 'ipp_diary.accept_correction'
  | 'ipp_diary.miss_diary'
  | 'ipp_diary.flag_late'
  | 'ipp_diary.void_diary'
  | 'ipp_diary.flag_sla_breach';

export function eventTypeFor(action: DiaryAction): DiaryEventType {
  return `ipp_diary.${action}` as DiaryEventType;
}

// Map chain_status to its timestamp column
export function statusTsCol(status: DiaryStatus): string | null {
  const MAP: Partial<Record<DiaryStatus, string>> = {
    submitted:           'submitted_at',
    late_submission:     'late_submission_at',
    employer_noted:      'employer_noted_at',
    ie_reviewed:         'ie_reviewed_at',
    disputed:            'disputed_at',
    resolution_pending:  'resolution_pending_at',
    correction_accepted: 'correction_accepted_at',
    countersigned:       'countersigned_at',
    archived:            'archived_at',
    missed:              'missed_at',
    voided:              'voided_at',
  };
  return MAP[status] ?? null;
}
