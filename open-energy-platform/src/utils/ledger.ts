// ════════════════════════════════════════════════════════════════════════
// Universal transaction ledger writer
//
// Every cross-module event that wants to be visible in the Reports tab or
// in a regulator's audit pull goes through writeLedger(). The shape mirrors
// migration 039 (ledger_transactions).
//
// The helper is intentionally tolerant: it accepts a subset of fields and
// silently best-efforts the write (so callers don't need a try/catch). The
// audit trail is additive — a write failure can never block the source
// transaction.
// ════════════════════════════════════════════════════════════════════════

import type { HonoEnv } from './types';

export type LedgerModule =
  | 'trading' | 'settlement' | 'carbon' | 'carbon_registry'
  | 'procurement' | 'funder' | 'grid' | 'grid_operator'
  | 'ipp' | 'ona' | 'esg' | 'offtaker' | 'admin';

export type LedgerStatus =
  | 'draft' | 'recorded' | 'settled' | 'reversed' | 'disputed' | 'void';

export interface LedgerWrite {
  module: LedgerModule;
  event_type: string;
  business_date: string;
  effective_date?: string;
  actor_id: string;
  actor_role: string;
  party_a_id?: string | null;
  party_a_role?: string | null;
  party_b_id?: string | null;
  party_b_role?: string | null;
  amount_zar?: number | null;
  amount_currency?: string;
  fx_rate?: number | null;
  amount_zar_equiv?: number | null;
  quantity?: number | null;
  quantity_unit?: string | null;
  price?: number | null;
  price_unit?: string | null;
  source_table: string;
  source_id: string;
  contract_id?: string | null;
  project_id?: string | null;
  rfp_id?: string | null;
  loi_id?: string | null;
  invoice_id?: string | null;
  facility_id?: string | null;
  certificate_id?: string | null;
  status?: LedgerStatus;
  reverses_id?: string | null;
  external_reference?: string | null;
  evidence_r2_keys?: string[] | null;
  ip_address?: string | null;
  user_agent?: string | null;
  tags?: string[];
  notes?: string | null;
  tenant_id?: string;
}

function uid(): string {
  return `ldg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Best-effort fire-and-forget audit write. Never throws to the caller. */
export async function writeLedger(env: HonoEnv['Bindings'], row: LedgerWrite): Promise<string | null> {
  try {
    const id = uid();
    await env.DB.prepare(`
      INSERT INTO ledger_transactions (
        id, tenant_id,
        module, event_type, business_date, effective_date,
        actor_id, actor_role, party_a_id, party_a_role, party_b_id, party_b_role,
        amount_zar, amount_currency, fx_rate, amount_zar_equiv,
        quantity, quantity_unit, price, price_unit,
        source_table, source_id,
        contract_id, project_id, rfp_id, loi_id, invoice_id, facility_id, certificate_id,
        status, reverses_id,
        external_reference, evidence_r2_keys, ip_address, user_agent,
        tags, notes
      ) VALUES (
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `).bind(
      id, row.tenant_id ?? 'default',
      row.module, row.event_type, row.business_date, row.effective_date ?? null,
      row.actor_id, row.actor_role,
      row.party_a_id ?? null, row.party_a_role ?? null,
      row.party_b_id ?? null, row.party_b_role ?? null,
      row.amount_zar ?? null, row.amount_currency ?? 'ZAR',
      row.fx_rate ?? null, row.amount_zar_equiv ?? null,
      row.quantity ?? null, row.quantity_unit ?? null,
      row.price ?? null, row.price_unit ?? null,
      row.source_table, row.source_id,
      row.contract_id ?? null, row.project_id ?? null, row.rfp_id ?? null,
      row.loi_id ?? null, row.invoice_id ?? null, row.facility_id ?? null,
      row.certificate_id ?? null,
      row.status ?? 'recorded', row.reverses_id ?? null,
      row.external_reference ?? null,
      row.evidence_r2_keys ? JSON.stringify(row.evidence_r2_keys) : null,
      row.ip_address ?? null, row.user_agent ?? null,
      row.tags ? JSON.stringify(row.tags) : null,
      row.notes ?? null,
    ).run();
    return id;
  } catch {
    // Audit is best-effort: if the table isn't migrated on this environment
    // or a column is missing, swallow and keep the source transaction safe.
    return null;
  }
}
