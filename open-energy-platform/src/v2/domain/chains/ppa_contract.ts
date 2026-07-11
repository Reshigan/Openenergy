// ppa_contract — PPA execution lifecycle as data. Transcribed from
// docs/architecture/conformance/ppa_contract.md (ground-truth extraction of
// the current route + spec + tests, 2026-07-11).
//
// Rebuild decisions vs the current implementation (conformance §Discrepancies):
//  - 10 states (not "9"): the header comments were stale.
//  - Registry-required fields ARE enforced here (execute needs board +
//    legal refs; terminate/cancel need a reason) — the old route left them
//    UI-only. The rebuild engine is authoritative.
//  - Strategic threshold is a single number (≥100 MW) everywhere; the old
//    retrospective path's ≥50 MW drift is dropped.
//  - settles:false — a PPA records a bilateral commitment; money never moves
//    through this chain, so export always carries the custody notice.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

/** UTC year-addition on an ISO instant string. Pure: deterministic given the
 *  string; not Date.now()/argless new Date(), so it respects the domain ban. */
function addYearsUtc(iso: string, years: number): string {
  const d = new Date(iso);
  const ms = Date.UTC(
    d.getUTCFullYear() + years,
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  );
  return new Date(ms).toISOString();
}

const strategicSla = { days: 90 };

export const ppaContract: ChainDecl = {
  key: 'ppa_contract',
  noun: 'PPA contract',
  refPrefix: 'PPA',
  title: (f) => `PPA — ${(f.offtaker_name as string) ?? 'unnamed'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's34', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'PPA registration', effect: 'requires' },
  ],
  roles: ['offtaker', 'ipp', 'regulator', 'lender', 'operator'],

  fields: {
    offtaker_name: { type: 'string', required: true, label: 'Offtaker' },
    capacity_mw: { type: 'number', required: true, min: 0, label: 'Capacity (MW)' },
    contract_term_years: { type: 'number', required: true, min: 1, max: 40, label: 'Term (years)' },
    supplier: { type: 'party', role: 'ipp', label: 'IPP / supplier' },
    tariff_zar_mwh: { type: 'number', min: 0, label: 'Tariff (ZAR/MWh)' },
    // written by derive, never by the client
    executed_at: { type: 'string', label: 'Executed at' },
    expiry_date: { type: 'string', label: 'Expiry' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'offtaker', sla: strategicSla },
    in_negotiation: { label: 'In negotiation', terminal: false, holder: 'offtaker', sla: { days: 180 } },
    terms_locked: { label: 'Terms locked', terminal: false, holder: 'offtaker', sla: { days: 60 } },
    legal_signed: { label: 'Legal signed', terminal: false, holder: 'offtaker', sla: { days: 30 } },
    executed: { label: 'Executed', terminal: false, holder: 'ipp', sla: { days: 540 } },
    in_force: { label: 'In force', terminal: false, holder: 'none' },
    in_dispute: { label: 'In dispute', terminal: false, holder: 'operator', sla: { days: 30 } },
    terminated: { label: 'Terminated', terminal: true, holder: 'none' },
    expired: { label: 'Expired', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    // --- creation paths -----------------------------------------------------
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['offtaker', 'operator'],
      actorBecomes: 'offtaker',
      label: 'Open PPA',
      intent: 'primary',
      input: {
        offtaker_name: { type: 'string', required: true },
        capacity_mw: { type: 'number', required: true, min: 0 },
        contract_term_years: { type: 'number', required: true, min: 1, max: 40 },
        supplier: { type: 'party', role: 'ipp' },
      },
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
    },
    {
      id: 'seed_historic',
      from: '@new',
      to: 'in_force',
      by: ['operator', 'system'],
      actorBecomes: 'offtaker',
      label: 'Seed historic PPA',
      intent: 'secondary',
      input: {
        offtaker_name: { type: 'string', required: true },
        capacity_mw: { type: 'number', required: true, min: 0 },
        contract_term_years: { type: 'number', required: true, min: 1, max: 40 },
        executed_at: { type: 'string', required: true },
      },
      derive: (f): Record<string, Json> =>
        typeof f.executed_at === 'string' && typeof f.contract_term_years === 'number'
          ? { expiry_date: addYearsUtc(f.executed_at, f.contract_term_years) }
          : {},
      guards: [],
    },

    // --- happy path ---------------------------------------------------------
    { id: 'begin_negotiation', from: 'draft', to: 'in_negotiation', by: ['offtaker', 'operator'], label: 'Begin negotiation', intent: 'primary', guards: ['complianceHaltClear'] },
    { id: 'lock_terms', from: 'in_negotiation', to: 'terms_locked', by: ['offtaker', 'operator'], label: 'Lock terms', intent: 'primary', guards: [] },
    { id: 'legal_sign', from: 'terms_locked', to: 'legal_signed', by: ['offtaker', 'operator'], label: 'Legal sign', intent: 'primary', guards: [] },
    {
      id: 'execute',
      from: 'legal_signed',
      to: 'executed',
      by: ['offtaker', 'operator'],
      label: 'Execute',
      intent: 'primary',
      input: {
        board_approval_ref: { type: 'string', required: true },
        legal_counterparty_ref: { type: 'string', required: true },
        nersa_section34_ref: { type: 'string' },
      },
      guards: ['executionEvidencePresent', 'regulatorPresentIfStrategic', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ executed_at: isoUtc(at) }),
    },
    {
      id: 'commence',
      from: 'executed',
      to: 'in_force',
      by: ['offtaker', 'operator'],
      label: 'Commence supply',
      intent: 'primary',
      guards: [],
      derive: (f): Record<string, Json> =>
        typeof f.executed_at === 'string' && typeof f.contract_term_years === 'number'
          ? { expiry_date: addYearsUtc(f.executed_at, f.contract_term_years) }
          : {},
    },
    // COD certification on the sibling chain auto-activates an executed PPA.
    {
      id: 'cod_certify',
      from: 'executed',
      to: 'in_force',
      by: ['system'],
      label: 'COD certified',
      intent: 'primary',
      guards: [],
      derive: (f): Record<string, Json> =>
        typeof f.executed_at === 'string' && typeof f.contract_term_years === 'number'
          ? { expiry_date: addYearsUtc(f.executed_at, f.contract_term_years) }
          : {},
    },

    // --- dispute loop -------------------------------------------------------
    { id: 'dispute', from: 'in_force', to: 'in_dispute', by: ['offtaker', 'operator'], label: 'Raise dispute', intent: 'destructive', guards: [] },
    { id: 'resolve', from: 'in_dispute', to: 'in_force', by: ['offtaker', 'operator'], label: 'Resolve dispute', intent: 'primary', guards: [] },

    // --- exits --------------------------------------------------------------
    {
      id: 'terminate',
      from: ['executed', 'in_force', 'in_dispute'],
      to: 'terminated',
      by: ['offtaker', 'operator'],
      label: 'Terminate',
      intent: 'destructive',
      requiresReason: ['breach', 'mutual_agreement', 'force_majeure', 'regulatory_direction'],
      guards: ['regulatorPresentIfStrategic'],
    },
    { id: 'expire', from: 'in_force', to: 'expired', by: ['offtaker', 'operator'], label: 'Expire', intent: 'secondary', guards: [] },
    { id: 'auto_expire', from: 'in_force', to: 'expired', by: ['system'], label: 'Auto-expire', intent: 'secondary', guards: [] },
    {
      id: 'cancel',
      from: ['draft', 'in_negotiation', 'terms_locked', 'legal_signed'],
      to: 'cancelled',
      by: ['offtaker', 'operator'],
      label: 'Cancel',
      intent: 'destructive',
      requiresReason: ['withdrawn', 'terms_failed', 'counterparty_default'],
      guards: [],
    },
  ],

  timers: [
    { onState: 'in_force', after: { days: 0 }, fire: 'auto_expire', kind: 'time_bar' },
  ],
};
