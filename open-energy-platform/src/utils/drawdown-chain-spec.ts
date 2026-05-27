// ═══════════════════════════════════════════════════════════════════════════
// Wave 21 — Lender drawdown / disbursement certification chain spec.
//
// Pure functions. 9-state P6 machine for the IPP↔Lender drawdown lifecycle.
// IPP submits a drawdown request (typically post-milestone or post-COD per
// Wave 20); lender + Independent Engineer review CP checklist + evidence;
// lender approves; treasury funds; post-funding compliance closes the loop.
//
//   requested → documents_submitted → ie_review → cp_checklist
//     → approved → funded → closed
//   reject (any pre-approved) → rejected
//   query (ie_review / cp_checklist) → on_hold → cp_checklist (resume)
//   cancel (any pre-funded non-terminal) → cancelled
//
// Tranche tier (drives SLAs + regulator crossings):
//   • senior (≥R500m)  — utility-scale construction loan, SARB-watchable
//   • mezz   (R100–500m) — mezzanine / subordinated debt
//   • equity (<R100m)  — equity injection / small embedded gen
//
// Per-tier SLAs reflect REAL lender practice — bigger tranches need MORE
// diligence time (senior 30d for IE review vs equity 5d). Same inversion
// pattern as Wave 19 procurement and Wave 20 COD.
//
// Regulator inbox crossings (SARB exposure + REIPPPP transparency):
//   • approved   for senior — SARB exposure-concentration disclosure
//   • rejected   for senior — IPP financing failure visible to DMRE
//   • sla_breached for senior — delivery risk to grid-planning
//
// Imported by:
//   - tests/drawdown-chain-spec.test.ts
//   - src/routes/drawdown-chain.ts
// ═══════════════════════════════════════════════════════════════════════════

export type DrawdownStatus =
  | 'requested'
  | 'documents_submitted'
  | 'ie_review'
  | 'cp_checklist'
  | 'on_hold'
  | 'approved'
  | 'funded'
  | 'closed'
  | 'rejected'
  | 'cancelled';

export type DrawdownAction =
  | 'submit_documents'    // requested → documents_submitted
  | 'begin_ie_review'     // documents_submitted → ie_review
  | 'pass_to_cp'          // ie_review → cp_checklist
  | 'query'               // ie_review | cp_checklist → on_hold
  | 'resume'              // on_hold → cp_checklist
  | 'approve'             // cp_checklist → approved
  | 'fund'                // approved → funded
  | 'close'               // funded → closed (post-funding compliance done)
  | 'reject'              // any pre-approved → rejected
  | 'cancel';             // any pre-funded non-terminal → cancelled

export type DrawdownTier = 'senior' | 'mezz' | 'equity';

export const ALL_STATES: readonly DrawdownStatus[] = [
  'requested', 'documents_submitted', 'ie_review', 'cp_checklist',
  'on_hold', 'approved', 'funded', 'closed', 'rejected', 'cancelled',
];

export const TERMINAL_STATES: readonly DrawdownStatus[] = ['closed', 'rejected', 'cancelled'];

export function isTerminal(s: DrawdownStatus): boolean {
  return TERMINAL_STATES.includes(s);
}

export const TRANSITIONS: Record<DrawdownStatus, Partial<Record<DrawdownAction, DrawdownStatus>>> = {
  requested:           { submit_documents: 'documents_submitted', reject: 'rejected', cancel: 'cancelled' },
  documents_submitted: { begin_ie_review:  'ie_review',           reject: 'rejected', cancel: 'cancelled' },
  ie_review:           { pass_to_cp:       'cp_checklist',        query:  'on_hold', reject: 'rejected', cancel: 'cancelled' },
  cp_checklist:        { approve:          'approved',            query:  'on_hold', reject: 'rejected', cancel: 'cancelled' },
  on_hold:             { resume:           'cp_checklist',        reject: 'rejected', cancel: 'cancelled' },
  approved:            { fund:             'funded',              cancel: 'cancelled' },
  funded:              { close:            'closed' },
  closed:              {},
  rejected:            {},
  cancelled:           {},
};

/**
 * SLA windows (minutes) by state × tranche tier. Time-in-state deadlines
 * tuned to real lender turnaround windows.
 *
 *   senior ≥R500m — full IE diligence, syndicated lender committee
 *   mezz   R100–500m — single-lender review
 *   equity <R100m — fast track, board sign-off only
 */
export const SLA_MINUTES: Record<DrawdownStatus, Record<DrawdownTier, number>> = {
  requested:           { senior: 4320,  mezz: 2880,  equity: 1440  },   // 3d / 2d / 1d  to submit docs
  documents_submitted: { senior: 2880,  mezz: 1440,  equity: 720   },   // 2d / 1d / 12h to start IE review
  ie_review:           { senior: 43200, mezz: 14400, equity: 7200  },   // 30d / 10d / 5d IE diligence
  cp_checklist:        { senior: 14400, mezz: 7200,  equity: 2880  },   // 10d / 5d / 2d CP completion
  on_hold:             { senior: 20160, mezz: 10080, equity: 4320  },   // 14d / 7d / 3d to resolve query
  approved:            { senior: 2880,  mezz: 1440,  equity: 720   },   // 2d / 1d / 12h to fund
  funded:              { senior: 7200,  mezz: 4320,  equity: 1440  },   // 5d / 3d / 1d post-funding compliance
  closed:              { senior: 0, mezz: 0, equity: 0 },
  rejected:            { senior: 0, mezz: 0, equity: 0 },
  cancelled:           { senior: 0, mezz: 0, equity: 0 },
};

export function nextState(curr: DrawdownStatus, action: DrawdownAction): DrawdownStatus | null {
  return TRANSITIONS[curr]?.[action] ?? null;
}

export function advance(curr: DrawdownStatus, action: DrawdownAction): DrawdownStatus {
  const next = nextState(curr, action);
  if (!next) throw new Error(`Invalid transition: ${curr} --${action}--> ?`);
  return next;
}

export function slaDueAt(
  state: DrawdownStatus,
  tier: DrawdownTier,
  now: Date = new Date(),
): string {
  const mins = SLA_MINUTES[state]?.[tier] ?? 0;
  if (mins === 0) return '';
  return new Date(now.getTime() + mins * 60 * 1000).toISOString();
}

/**
 * Tranche tier from ZAR amount. R500m senior cutoff mirrors the SARB
 * large-exposure disclosure threshold for syndicated project finance;
 * R100m mezz cutoff matches typical mezzanine deal sizing.
 */
export function tierFromZar(zar: number): DrawdownTier {
  if (zar >= 500_000_000) return 'senior';
  if (zar >= 100_000_000) return 'mezz';
  return 'equity';
}

/**
 * Regulator inbox crossings for state changes.
 *
 *   approve  (cp_checklist → approved) crosses for senior — SARB exposure
 *   reject   crosses for senior — IPP financing-failure visibility to DMRE
 *   (other intermediate actions never cross)
 */
export function crossesIntoRegulator(action: DrawdownAction, tier: DrawdownTier): boolean {
  if (action === 'approve') return tier === 'senior';
  if (action === 'reject')  return tier === 'senior';
  return false;
}

/**
 * Senior-tier SLA breaches cross into regulator inbox. Mezz/equity are
 * operational only — the lender's deal team owns those.
 */
export function slaBreachCrossesIntoRegulator(tier: DrawdownTier): boolean {
  return tier === 'senior';
}

export function isTier(s: string): s is DrawdownTier {
  return s === 'senior' || s === 'mezz' || s === 'equity';
}

export function isStatus(s: string): s is DrawdownStatus {
  return ALL_STATES.includes(s as DrawdownStatus);
}
