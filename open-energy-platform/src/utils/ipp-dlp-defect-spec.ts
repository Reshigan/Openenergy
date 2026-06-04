// W145 — IPP DLP Defects Register
// JBCC 6.2 Cl.19 (Defects) + Cl.32 (Defects Liability Period)
// NEC4 Cl.43 (Defects) + NHBRC + REIPPPP QMP requirements

export type DlpDefectStatus =
  | 'identified'
  | 'notified'
  | 'acknowledged'
  | 'in_rectification'
  | 'rectified_pending_inspection'
  | 'ie_accepted'
  | 'closed'
  | 'disputed'
  | 'escalated_to_ncr'
  | 'waived'
  | 'cancelled';

export type DlpDefectAction =
  | 'notify_defect'
  | 'acknowledge_receipt'
  | 'start_rectification'
  | 'request_extension'
  | 'grant_extension'
  | 'submit_rectified'
  | 'ie_accept'
  | 'ie_reject'
  | 'close_defect'
  | 'dispute_rectification'
  | 'resolve_dispute'
  | 'waive_defect'
  | 'cancel_defect'
  | 'flag_sla_breach';

export type SeverityClass =
  | 'critical'   // structural / safety-affecting — 24h URGENT
  | 'major'      // significant functional defect — 72h
  | 'minor'      // minor functional or aesthetic — 168h (7d)
  | 'cosmetic';  // cosmetic only — 720h (30d) loosest

// URGENT SLA polarity — critical tightest, cosmetic loosest
export const SLA_HOURS: Record<SeverityClass, number> = {
  critical: 24,
  major: 72,
  minor: 168,
  cosmetic: 720,
};

export const HARD_TERMINALS: DlpDefectStatus[] = [
  'closed', 'escalated_to_ncr', 'waived', 'cancelled',
];

interface Transition { from: DlpDefectStatus[]; to: DlpDefectStatus }
export const TRANSITIONS: Record<DlpDefectAction, Transition> = {
  notify_defect:           { from: ['identified'],                              to: 'notified' },
  acknowledge_receipt:     { from: ['notified'],                               to: 'acknowledged' },
  start_rectification:     { from: ['acknowledged', 'disputed'],               to: 'in_rectification' },
  request_extension:       { from: ['in_rectification'],                       to: 'in_rectification' },
  grant_extension:         { from: ['in_rectification'],                       to: 'in_rectification' },
  submit_rectified:        { from: ['in_rectification'],                       to: 'rectified_pending_inspection' },
  ie_accept:               { from: ['rectified_pending_inspection'],           to: 'ie_accepted' },
  ie_reject:               { from: ['rectified_pending_inspection'],           to: 'escalated_to_ncr' },
  close_defect:            { from: ['ie_accepted'],                            to: 'closed' },
  dispute_rectification:   { from: ['in_rectification', 'rectified_pending_inspection'], to: 'disputed' },
  resolve_dispute:         { from: ['disputed'],                               to: 'acknowledged' },
  waive_defect:            { from: ['identified', 'notified', 'acknowledged'], to: 'waived' },
  cancel_defect:           { from: ['identified', 'notified'],                 to: 'cancelled' },
  flag_sla_breach:         { from: ['notified', 'acknowledged', 'in_rectification', 'rectified_pending_inspection'], to: 'notified' },
};

export function nextStatus(current: DlpDefectStatus, action: DlpDefectAction): DlpDefectStatus | null {
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  if (action === 'request_extension' || action === 'grant_extension' || action === 'flag_sla_breach') return current;
  return t.to;
}

export interface DlpCrossArgs {
  severity_class: SeverityClass;
  is_safety_related: boolean;
  is_structural: boolean;
  is_hold_point: boolean;
}

// W145 SIGNATURE: ie_reject → escalated_to_ncr EVERY tier (formal quality failure always reportable)
export function crossesIntoRegulator(action: DlpDefectAction, args: DlpCrossArgs): boolean {
  if (action === 'ie_reject') return true;
  if (action === 'notify_defect' && (args.is_safety_related || args.is_structural)) return true;
  return false;
}

export function slaBreachCrossesIntoRegulator(args: DlpCrossArgs): boolean {
  return args.severity_class === 'critical' || args.is_safety_related || args.is_structural;
}

export function slaDeadlineFor(severity_class: SeverityClass, notified_at: string): string {
  const h = SLA_HOURS[severity_class] ?? 168;
  const d = new Date(notified_at);
  d.setHours(d.getHours() + h);
  return d.toISOString();
}

export function statusTsCol(status: DlpDefectStatus): string {
  const col_map: Partial<Record<DlpDefectStatus, string>> = {
    identified: 'identified_at',
    notified: 'notified_at',
    acknowledged: 'acknowledged_at',
    in_rectification: 'rectification_started_at',
    rectified_pending_inspection: 'submitted_at',
    ie_accepted: 'ie_accepted_at',
    closed: 'closed_at',
    disputed: 'disputed_at',
    escalated_to_ncr: 'escalated_at',
    waived: 'waived_at',
    cancelled: 'cancelled_at',
  };
  return col_map[status] ?? 'updated_at';
}

export function isReportable(status: DlpDefectStatus, args: DlpCrossArgs): boolean {
  if (status === 'escalated_to_ncr') return true;
  if (args.is_safety_related || args.is_structural) return true;
  if (args.severity_class === 'critical') return true;
  return false;
}
