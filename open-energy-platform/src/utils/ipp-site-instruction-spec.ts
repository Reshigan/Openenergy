// W144 — IPP Site/Engineer's Instruction Register
// JBCC 6.2 cl.18 (Architect's/Engineer's Instructions) + NEC4 PMI (Project Manager's Instruction)
// + CIDB BPG#A1 + OHSA Const.Regs s.8 (safety directives)

export type SiteInstructionStatus =
  | 'draft'
  | 'issued'
  | 'acknowledged'
  | 'in_execution'
  | 'completed'
  | 'ie_verified'
  | 'closed'
  | 'disputed'
  | 'dispute_resolved'
  | 'superseded'
  | 'voided';

export type SiteInstructionAction =
  | 'issue_instruction'
  | 'acknowledge_receipt'
  | 'commence_work'
  | 'request_extension'
  | 'grant_extension'
  | 'complete_work'
  | 'ie_verify'
  | 'close_instruction'
  | 'dispute_instruction'
  | 'resolve_dispute'
  | 'supersede_instruction'
  | 'void_instruction'
  | 'flag_sla_breach';

export type InstructionType =
  | 'safety_directive'       // OHSA s.8 — tightest SLA
  | 'variation_instruction'  // NEC4 PMI / JBCC cl.18 scope change
  | 'defect_rectification'  // post-NCR or post-inspection defect fix
  | 'design_clarification'   // drawing/spec clarification
  | 'testing_instruction'    // ITP witness/test directive
  | 'administrative';        // admin/housekeeping — loosest SLA

// URGENT polarity: safety_directive tightest, administrative loosest
export const SLA_HOURS: Record<InstructionType, number> = {
  safety_directive: 4,
  variation_instruction: 24,
  defect_rectification: 48,
  design_clarification: 48,
  testing_instruction: 72,
  administrative: 168,
};

export const HARD_TERMINALS: SiteInstructionStatus[] = ['closed', 'superseded', 'voided'];

interface Transition { from: SiteInstructionStatus[]; to: SiteInstructionStatus }
export const TRANSITIONS: Record<SiteInstructionAction, Transition> = {
  issue_instruction:    { from: ['draft'],            to: 'issued' },
  acknowledge_receipt:  { from: ['issued'],           to: 'acknowledged' },
  commence_work:        { from: ['acknowledged', 'dispute_resolved'], to: 'in_execution' },
  request_extension:    { from: ['in_execution'],     to: 'in_execution' },
  grant_extension:      { from: ['in_execution'],     to: 'in_execution' },
  complete_work:        { from: ['in_execution'],     to: 'completed' },
  ie_verify:            { from: ['completed'],        to: 'ie_verified' },
  close_instruction:    { from: ['ie_verified'],      to: 'closed' },
  dispute_instruction:  { from: ['issued', 'acknowledged', 'in_execution'], to: 'disputed' },
  resolve_dispute:      { from: ['disputed'],         to: 'dispute_resolved' },
  supersede_instruction:{ from: ['draft', 'issued'],  to: 'superseded' },
  void_instruction:     { from: ['draft'],            to: 'voided' },
  flag_sla_breach:      { from: ['issued', 'acknowledged', 'in_execution'], to: 'issued' }, // no-move; updates sla flags
};

export function nextStatus(current: SiteInstructionStatus, action: SiteInstructionAction): SiteInstructionStatus | null {
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  if (action === 'request_extension' || action === 'grant_extension' || action === 'flag_sla_breach') return current;
  return t.to;
}

export interface SiCrossArgs {
  instruction_type: InstructionType;
  is_safety_directive: boolean;
  is_contract_variation: boolean;
  value_zar?: number | null;
}

const VALUE_THRESHOLD = 250_000; // R250k — crosses on major+ for variations

// SIGNATURE crossings
export function crossesIntoRegulator(action: SiteInstructionAction, args: SiCrossArgs): boolean {
  if (action === 'issue_instruction' && args.is_safety_directive) return true; // OHSA s.8 — EVERY tier
  if (action === 'dispute_instruction' && args.is_contract_variation && (args.value_zar ?? 0) > VALUE_THRESHOLD) return true;
  return false;
}

export function slaBreachCrossesIntoRegulator(args: SiCrossArgs): boolean {
  return args.instruction_type === 'safety_directive'; // safety SLA breach always reportable
}

export function slaDeadlineFor(instruction_type: InstructionType, issued_at: string): string {
  const h = SLA_HOURS[instruction_type] ?? 48;
  const d = new Date(issued_at);
  d.setHours(d.getHours() + h);
  return d.toISOString();
}

export function slaHoursRemaining(instruction_type: InstructionType, issued_at: string): number {
  const deadline = new Date(slaDeadlineFor(instruction_type, issued_at));
  return Math.round((deadline.getTime() - Date.now()) / 3_600_000);
}

export function eventTypeFor(action: SiteInstructionAction): string {
  return `si_evt_${action}`;
}

export function statusTsCol(status: SiteInstructionStatus): string {
  return `${status}_at`;
}

export function isReportable(status: SiteInstructionStatus, args: SiCrossArgs): boolean {
  if (status === 'disputed' && args.is_contract_variation && (args.value_zar ?? 0) > VALUE_THRESHOLD) return true;
  if (args.is_safety_directive) return true;
  return false;
}
