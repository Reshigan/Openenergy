// ═══════════════════════════════════════════════════════════════════════════
// Wave 8 — Grid wheeling charge spec.
//
// Pure helpers. No DB, no env, no I/O. The route handler and daily cron
// call into these to compute:
//   • What's the gross / loss / total wheeling charge for a given period?
//   • When does a charge's dispute window close?
//   • Has the dispute window expired for a still-open dispute?
//   • What's the next status transition after a payment / dispute / resolution?
// ═══════════════════════════════════════════════════════════════════════════

export type WheelingChargeStatus =
  | 'open'
  | 'disputed'
  | 'reconciled'
  | 'paid'
  | 'escalated';

export type WheelingDisputeStatus = 'open' | 'resolved' | 'escalated';

export const DEFAULT_DISPUTE_WINDOW_DAYS = 14;

export interface WheelingChargeInputs {
  transmission_mwh: number;
  tariff_zar_per_mwh: number;
  loss_factor_pct: number;
  ancillaries_zar?: number;
}

export interface WheelingChargeBreakdown {
  transmission_mwh: number;
  tariff_zar_per_mwh: number;
  loss_factor_pct: number;
  loss_mwh: number;
  gross_zar: number;
  loss_zar: number;
  ancillaries_zar: number;
  total_zar: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeWheelingCharge(
  input: WheelingChargeInputs,
): WheelingChargeBreakdown {
  const transmission = Math.max(0, Number(input.transmission_mwh || 0));
  const tariff = Math.max(0, Number(input.tariff_zar_per_mwh || 0));
  const lossPct = Math.max(0, Number(input.loss_factor_pct || 0));
  const ancillaries = Math.max(0, Number(input.ancillaries_zar || 0));

  const lossMwh = round2((transmission * lossPct) / 100);
  const grossZar = round2(transmission * tariff);
  const lossZar = round2(lossMwh * tariff);
  const totalZar = round2(grossZar + lossZar + ancillaries);

  return {
    transmission_mwh: round2(transmission),
    tariff_zar_per_mwh: round2(tariff),
    loss_factor_pct: round2(lossPct),
    loss_mwh: lossMwh,
    gross_zar: grossZar,
    loss_zar: lossZar,
    ancillaries_zar: round2(ancillaries),
    total_zar: totalZar,
  };
}

export function disputeDeadlineFrom(
  issuedAt: Date,
  windowDays: number = DEFAULT_DISPUTE_WINDOW_DAYS,
): Date {
  if (!(issuedAt instanceof Date) || isNaN(issuedAt.getTime())) {
    throw new Error('disputeDeadlineFrom: issuedAt must be a valid Date');
  }
  const days = Number.isFinite(windowDays) && windowDays > 0
    ? windowDays
    : DEFAULT_DISPUTE_WINDOW_DAYS;
  const out = new Date(issuedAt.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export function isDisputeWindowExpired(
  deadline: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!deadline) return false;
  const d = deadline instanceof Date ? deadline : new Date(deadline);
  if (isNaN(d.getTime())) return false;
  return now.getTime() >= d.getTime();
}

export interface ChargeTransitionInputs {
  currentStatus: WheelingChargeStatus;
  hasOpenDispute: boolean;
  paymentRecorded: boolean;
  disputeResolved: boolean;
  disputeEscalated: boolean;
}

// Maps a status + signal set to the next status. Returns the same status when
// no transition applies, so the caller can no-op write safely.
export function nextChargeStatus(input: ChargeTransitionInputs): WheelingChargeStatus {
  const { currentStatus, hasOpenDispute, paymentRecorded, disputeResolved, disputeEscalated } = input;
  if (disputeEscalated) return 'escalated';
  if (paymentRecorded) return 'paid';
  if (disputeResolved && currentStatus === 'disputed') return 'reconciled';
  if (hasOpenDispute && currentStatus === 'open') return 'disputed';
  return currentStatus;
}

// Highlights the charges that should sweep into 'escalated' on the daily cron.
// A charge is sweep-eligible if:
//   • it has at least one open dispute, AND
//   • the dispute deadline has passed.
// 'open' charges with no dispute and a passed deadline are NOT swept — they're
// simply overdue payments, surfaced in UI but not auto-escalated.
export function isChargeEscalationReady(input: {
  status: WheelingChargeStatus;
  dispute_deadline_at: string | Date | null | undefined;
  has_open_dispute: boolean;
  now?: Date;
}): boolean {
  if (input.status !== 'disputed') return false;
  if (!input.has_open_dispute) return false;
  return isDisputeWindowExpired(input.dispute_deadline_at, input.now ?? new Date());
}
