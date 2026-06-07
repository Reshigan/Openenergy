// ═══════════════════════════════════════════════════════════════════════════
// Layer D — per-chain terminal-state registry.
//
// Maps a chain_key → that chain's AUTHORITATIVE isTerminal() (the single source
// of truth, defined alongside the chain's state machine in its *-spec.ts). This
// exists because the substring heuristic in chain-state.ts is context-blind:
// ~22% of status tokens (e.g. 'paid', 'issued', 'closed', 'settled') are
// terminal in some chains but live/intermediate in others, so a single global
// heuristic cannot classify them all correctly.
//
// Only chains that actually emit `chain_key` (+ `source_chain_status`) into
// oe_platform_events need an entry — those are the only chains whose open/
// terminal counts are computed by computeOpenTerminal. Today that is the five
// P6 chains auto-sequenced by src/cascade-rules/lifecycle-sequencing.ts:
//   drawdown · loan_default · reserve_account · levy_assessment · carbon_retirement
//
// ── CONTRACT FOR FUTURE WAVES ────────────────────────────────────────────────
// When a future wave makes another chain emit `chain_key` into
// oe_platform_events, that wave MUST add a one-line entry here delegating to its
// spec's isTerminal — otherwise its open/terminal counts fall back to the
// approximate substring heuristic in chain-state.ts.
// ═══════════════════════════════════════════════════════════════════════════
import { isTerminal as drawdownIsTerminal, type DrawdownStatus } from './drawdown-chain-spec';
import { isTerminal as loanDefaultIsTerminal, type LoanDefaultStatus } from './loan-default-spec';
import { isTerminal as reserveIsTerminal, type ReserveStatus } from './reserve-account-spec';
import { isTerminal as levyIsTerminal, type LevyStatus } from './levy-assessment-spec';
import { isTerminal as retirementIsTerminal, type RetirementStatus } from './retirement-chain-spec';

/** A classifier returns true when `status` names a terminal state for its chain. */
type TerminalClassifier = (status: string) => boolean;

// chain_key → authoritative classifier. The string arg is cast to the spec's
// status union; an unknown status simply falls outside the spec's TERMINAL set
// and is treated as open, which is the correct default.
const REGISTRY: Record<string, TerminalClassifier> = {
  drawdown:          (s) => drawdownIsTerminal(s as DrawdownStatus),
  loan_default:      (s) => loanDefaultIsTerminal(s as LoanDefaultStatus),
  reserve_account:   (s) => reserveIsTerminal(s as ReserveStatus),
  levy_assessment:   (s) => levyIsTerminal(s as LevyStatus),
  carbon_retirement: (s) => retirementIsTerminal(s as RetirementStatus),
};

/**
 * The authoritative terminal classifier for `chainKey`, or null when the chain
 * is not registered (caller should fall back to the substring heuristic).
 */
export function terminalClassifierFor(chainKey: string): TerminalClassifier | null {
  return REGISTRY[chainKey] ?? null;
}
