// ═══════════════════════════════════════════════════════════════════════════
// Wave 193 — Licence Obligation Monitor (Generation Licence Conditions)
//
// Every NERSA generation licence issued under ERA 4/2006 §8–11 carries a set
// of conditions (obligations) that the licensee must comply with on a periodic
// basis.  Conditions span five obligation classes:
//
//   administrative      — reporting cadence, record-keeping, change
//                         notifications (e.g. change of ownership, key
//                         personnel, registered address).  ERA §8(2)(a)
//                         and §33 require these filings on NERSA's schedule.
//
//   technical           — plant performance standards, protective relay
//                         settings, fault-ride-through, connection agreement
//                         compliance (NRS 097, Grid Code §D, §E, §F).
//                         Technical conditions are typically audited annually
//                         and following any modification to the station.
//
//   financial           — audited accounts, regulatory asset base submissions,
//                         insurance maintenance, performance bond or bank
//                         guarantee renewals (ERA §8(2)(c)).  Financial
//                         obligations are NERSA's primary lever for detecting
//                         licensee distress before it becomes a supply
//                         security issue.
//
//   environmental       — EMP compliance, waste water management, noise
//                         monitoring, biodiversity offset commitments
//                         (NEMA §28, NEMA §30, DEA EMP conditions, GN R982).
//                         Environmental non-compliance triggers parallel
//                         obligations to DFFE and local municipalities and
//                         is escalated to W31 Regulator Disposition.
//
//   security_of_supply  — fuel supply, dispatch availability, spinning
//                         reserve obligations, emergency operating procedures
//                         (Grid Code §C-2 §CSC-1).  These are the fastest-
//                         moving conditions because supply shortfalls directly
//                         affect NERSA and NTCSA grid stability mandates.
//
// Regulatory and commercial rationale
// ────────────────────────────────────
// ERA §34 empowers NERSA to revoke, suspend, or amend a licence where
// conditions are not met.  The chain below models the formal NERSA compliance
// cycle per obligation per period:
//
//   1. Each period opens a fresh record in monitoring_active.
//   2. The system (cron) or NERSA triggers the assessment.
//   3. The licensee gathers and submits evidence.
//   4. NERSA (regulator role) reviews.  If a query arises the sub-loop
//      runs: query_raised → query_resolved, then back into under_review.
//   5. NERSA determines compliant or non-compliant.
//      - Compliant → assessed_compliant (REST STATE — period done; next
//        period creates a new record).
//      - Non-compliant → assessed_non_compliant → notice_issued → cure_active
//        → cured (remediated) or → breached (enforcement).
//   6. declare_breach may be taken from assessed_non_compliant, notice_issued,
//      or cure_active, allowing NERSA to short-circuit where non-compliance
//      is serious or wilful.
//
// assessed_compliant is a REST STATE (not a hard terminal) because licence
// obligations recur each period.  A new record is created at the start of each
// compliance period; the previous period record rests at assessed_compliant.
//
// SLA polarity — URGENT (most critical class = tightest deadline):
//   security_of_supply  7 days  — supply security; NTCSA notified immediately
//   environmental      14 days  — DFFE/NERSA parallel; risks licence suspension
//   financial          21 days  — SARB and NERSA review; distress indicator
//   technical          30 days  — audited annually; planned inspection cycle
//   administrative     45 days  — routine filing; longest window acceptable
//
// 12 states (see state diagram above):
//   monitoring_active → assessment_due → evidence_gathered → evidence_submitted
//   → under_review → query_raised → query_resolved
//   → assessed_compliant     (REST STATE — period closed cleanly)
//   → assessed_non_compliant → notice_issued → cure_active
//   → cured                  (TERMINAL + — non-compliance remediated)
//   → breached               (TERMINAL − − enforcement action; NERSA sanction)
//
// Hard terminals: cured, breached
// (assessed_compliant is a REST STATE, not a hard terminal)
//
// Regulator crossing rules:
//   issue_notice         → ALL classes (NERSA licence non-compliance notice
//                          is always reportable; feeds W31 Disposition)
//   declare_breach       → ALL classes (enforcement action is always public)
//   find_non_compliant   → environmental + security_of_supply + financial
//                          (these three classes have parallel competent
//                          authorities: DFFE, NTCSA/Grid Code, SARB)
//   sla_breached         → environmental + security_of_supply only
//                          (fastest-moving classes where silent overrun
//                          itself signals non-compliance)
//
// Entity prefix: licence_obligation   Event prefix: lo_evt_
// Table: oe_licence_obligations
// WRITE: {admin, ipp, ipp_developer, wind, regulator}
// AUDIT_PREFIX_MAP: licence_obligation → 'ipp', lo_evt → 'ipp'
//
// Mounted at /api/ipp-licence-obligations.
// ═══════════════════════════════════════════════════════════════════════════

export type LicenceObligationMonitorStatus =
  | 'monitoring_active'
  | 'assessment_due'
  | 'evidence_gathered'
  | 'evidence_submitted'
  | 'under_review'
  | 'query_raised'
  | 'query_resolved'
  | 'assessed_compliant'     // REST STATE — period closed cleanly; next period creates new record
  | 'assessed_non_compliant'
  | 'notice_issued'
  | 'cure_active'
  | 'cured'                  // TERMINAL +
  | 'breached';              // TERMINAL −

export type LicenceObligationMonitorAction =
  | 'trigger_assessment'
  | 'gather_evidence'
  | 'submit_evidence'
  | 'commence_review'
  | 'raise_query'
  | 'resolve_query'
  | 'find_compliant'
  | 'find_non_compliant'
  | 'issue_notice'
  | 'commence_cure'
  | 'confirm_cured'
  | 'declare_breach';

// URGENT SLA — most critical obligation class gets LEAST time
export type ObligationClass = 'security_of_supply' | 'environmental' | 'financial' | 'technical' | 'administrative';

// ─── SLA derivation (keyed on obligation_class; URGENT polarity) ─────────────

export const SLA_DAYS: Record<ObligationClass, number> = {
  security_of_supply: 7,
  environmental:      14,
  financial:          21,
  technical:          30,
  administrative:     45,
};

export function deriveSla(obligationClass: ObligationClass): number {
  return SLA_DAYS[obligationClass];
}

// ─── Hard terminals ──────────────────────────────────────────────────────────
// assessed_compliant is a REST STATE, not a hard terminal.
// It cycles for next compliance period — a new record is opened then.

export const HARD_TERMINALS = new Set<LicenceObligationMonitorStatus>([
  'cured',
  'breached',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<LicenceObligationMonitorAction, { from: LicenceObligationMonitorStatus[] }> = {
  trigger_assessment: { from: ['monitoring_active'] },
  gather_evidence:    { from: ['assessment_due'] },
  submit_evidence:    { from: ['evidence_gathered'] },
  commence_review:    { from: ['evidence_submitted'] },
  raise_query:        { from: ['under_review'] },
  resolve_query:      { from: ['query_raised'] },
  find_compliant:     { from: ['under_review', 'query_resolved'] },
  find_non_compliant: { from: ['under_review', 'query_resolved'] },
  issue_notice:       { from: ['assessed_non_compliant'] },
  commence_cure:      { from: ['notice_issued'] },
  confirm_cured:      { from: ['cure_active'] },
  declare_breach:     { from: ['assessed_non_compliant', 'notice_issued', 'cure_active'] },
};

// ─── State machine ────────────────────────────────────────────────────────────

export const STATE_TRANSITIONS: Record<LicenceObligationMonitorAction, LicenceObligationMonitorStatus> = {
  trigger_assessment: 'assessment_due',
  gather_evidence:    'evidence_gathered',
  submit_evidence:    'evidence_submitted',
  commence_review:    'under_review',
  raise_query:        'query_raised',
  resolve_query:      'query_resolved',
  find_compliant:     'assessed_compliant',
  find_non_compliant: 'assessed_non_compliant',
  issue_notice:       'notice_issued',
  commence_cure:      'cure_active',
  confirm_cured:      'cured',
  declare_breach:     'breached',
};

// ─── Regulator crossing rules ─────────────────────────────────────────────────

const ALL_CLASSES: ObligationClass[] = [
  'security_of_supply', 'environmental', 'financial', 'technical', 'administrative',
];
const NON_COMPLIANT_CROSSES: ObligationClass[] = ['environmental', 'security_of_supply', 'financial'];
const SLA_BREACH_CROSSES: ObligationClass[]    = ['environmental', 'security_of_supply'];

export function crossesIntoRegulator(
  action: LicenceObligationMonitorAction,
  obligationClass: ObligationClass,
): boolean {
  switch (action) {
    case 'issue_notice':        return ALL_CLASSES.includes(obligationClass);
    case 'declare_breach':      return ALL_CLASSES.includes(obligationClass);
    case 'find_non_compliant':  return NON_COMPLIANT_CROSSES.includes(obligationClass);
    default:                    return false;
  }
}

// SLA breach crosses into regulator for environmental and security_of_supply only.
// For these classes, a silent SLA overrun itself constitutes a reportable event
// because parallel competent authorities (DFFE, NTCSA) must be notified promptly.
export function slaBreachCrossesIntoRegulator(obligationClass: ObligationClass): boolean {
  return SLA_BREACH_CROSSES.includes(obligationClass);
}
