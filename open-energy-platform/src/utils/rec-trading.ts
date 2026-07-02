// ═══════════════════════════════════════════════════════════════════════════
// REC exchange trading — pure core (instrument model, holdings guard, settlement).
//
// RECs (oe_rec_lifecycle: holder_id owns, mwh_represented is the tradeable size,
// status issued→transferred→retired) trade on the SAME instrument-generic order
// book as power: the instrument is the `energy_type` string, volume is in MWh
// (1 REC ≈ 1 MWh). A REC instrument is encoded `rec:<standard>:<source>:<vintage>`
// so the book shards RECs of the same standard/source/vintage together and never
// mixes them with power or with a different vintage.
//
// Everything here is PURE (no D1, no DO) so it unit-tests without infrastructure —
// same discipline as pre-trade-guards.ts. The trading route composes these with a
// D1-loaded snapshot; matching/settlement stays in the route/DO.
// ═══════════════════════════════════════════════════════════════════════════

export const REC_INSTRUMENT_PREFIX = 'rec:';

export interface RecInstrument {
  standard: string;   // e.g. 'i-rec', 'verra', 'gold_standard'
  source: string;     // energy_source, e.g. 'solar', 'wind'
  vintage: string;    // vintage year as string, or 'any'
}

/** Encode a REC instrument as an order-book `energy_type` code. */
export function recInstrument(i: RecInstrument): string {
  const part = (s: string) => (s || 'any').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${REC_INSTRUMENT_PREFIX}${part(i.standard)}:${part(i.source)}:${part(i.vintage)}`;
}

/** True if an order-book `energy_type` is a REC instrument (vs a power energy type). */
export function isRecInstrument(energyType: string | null | undefined): boolean {
  return typeof energyType === 'string' && energyType.startsWith(REC_INSTRUMENT_PREFIX);
}

/** Parse a REC instrument code back to its parts, or null if not a REC instrument. */
export function parseRecInstrument(energyType: string): RecInstrument | null {
  if (!isRecInstrument(energyType)) return null;
  const [, standard = 'any', source = 'any', vintage = 'any'] = energyType.split(':');
  return { standard, source, vintage };
}

// ─── Holdings-based sell guard ──────────────────────────────────────────────
// A REC SELL must be backed by certificates the seller actually holds and hasn't
// already offered — power credit/exposure/delivery/mark guards don't apply to a
// spot certificate transfer, so REC orders take THIS guard instead.

export interface RecSellCheck {
  volumeMwh: number;        // order size requested
  heldMwh: number;          // seller's transferable holdings for this instrument (status 'issued')
  alreadyListedMwh: number; // seller's open REC sell orders for this instrument
}

export type RecGuardResult = { ok: true } | { ok: false; code: RecRejectionCode; message: string };

export const REC_REJECTION_CODES = [
  'REC_INSUFFICIENT_HOLDINGS',
  'REC_INVALID_VOLUME',
] as const;
export type RecRejectionCode = typeof REC_REJECTION_CODES[number];

/** Guard a REC sell order against the seller's free (unlisted, issued) holdings. */
export function recSellGuard(chk: RecSellCheck): RecGuardResult {
  if (!(chk.volumeMwh > 0)) {
    return { ok: false, code: 'REC_INVALID_VOLUME', message: 'REC order volume must be greater than zero.' };
  }
  const free = chk.heldMwh - chk.alreadyListedMwh;
  if (chk.volumeMwh > free + 1e-9) {
    return {
      ok: false, code: 'REC_INSUFFICIENT_HOLDINGS',
      message: `Not enough free certificates: ${free.toLocaleString('en-ZA')} MWh available, ${chk.volumeMwh.toLocaleString('en-ZA')} MWh requested.`,
    };
  }
  return { ok: true };
}

// ─── Settlement transition ──────────────────────────────────────────────────
// On a matched REC trade, each covered certificate transfers to the buyer:
// holder → buyer, status → 'transferred'. This is the pure intent the route/DO
// applies to oe_rec_lifecycle; it also emits the fireCascade event name.

export interface RecFill {
  sellerId: string;
  buyerId: string;
  volumeMwh: number;
  priceZarPerMwh: number;
}

export interface RecSettlement {
  toStatus: 'transferred';
  newHolderId: string;
  mwh: number;
  valueZar: number;
  cascadeEvent: 'rec.transferred';
}

// Certificates are DISCRETE — a fill volume is covered by transferring whole
// certificates, never by splitting one. FIFO (oldest first) whole certificates are
// taken while they still fit under the fill volume. Any remainder that can't be
// covered by a whole certificate is a `shortfallMwh` the caller must settle
// out-of-band (a pending row) rather than mis-split — fail-closed by construction.
export interface CertHolding { id: string; mwh: number }
export interface CertTransferPlan { transferIds: string[]; transferredMwh: number; shortfallMwh: number }

export function planCertTransfer(certs: CertHolding[], volumeMwh: number): CertTransferPlan {
  const transferIds: string[] = [];
  let acc = 0;
  // FIFO order as given (caller passes oldest-first). Take whole certs that keep
  // the running total ≤ the fill volume.
  for (const cert of certs) {
    if (!(cert.mwh > 0)) continue;
    if (acc + cert.mwh <= volumeMwh + 1e-9) {
      transferIds.push(cert.id);
      acc += cert.mwh;
    }
  }
  return {
    transferIds,
    transferredMwh: acc,
    shortfallMwh: Math.max(0, volumeMwh - acc),
  };
}

/** Compute the settlement intent for a REC fill. Throws on a nonsensical fill so
 *  the caller never silently transfers zero/negative certificates. */
export function settleRecFill(fill: RecFill): RecSettlement {
  if (!(fill.volumeMwh > 0)) throw new Error('REC fill volume must be > 0');
  if (!fill.buyerId || !fill.sellerId) throw new Error('REC fill needs both parties');
  if (fill.buyerId === fill.sellerId) throw new Error('REC fill buyer and seller must differ');
  return {
    toStatus: 'transferred',
    newHolderId: fill.buyerId,
    mwh: fill.volumeMwh,
    valueZar: fill.volumeMwh * fill.priceZarPerMwh,
    cascadeEvent: 'rec.transferred',
  };
}
