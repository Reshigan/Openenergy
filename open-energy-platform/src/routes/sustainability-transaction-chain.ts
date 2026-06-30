// ═══════════════════════════════════════════════════════════════════════════════
// W227 — Sustainability Marketplace: Transaction Lifecycle
// Unified cross-role marketplace: RECs, VCM credits, brokered CoA retirements
//
// Legal framework:
//  RECs:         I-REC Standard / GCC — secondary trading permitted
//  VCM credits:  Verra VCS v4.5 / GS4GG — free secondary market
//  Brokered CoA: Carbon Tax Act §13 — retirement on buyer's behalf, not resale
//  FSCA:         FMA 2012 — spot carbon credit transactions exempt from FSP
//
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import { resolveNextStatus } from '../utils/chain-sla';
import {
  TransactionStatus,
  TransactionAction,
  TransactionUrgencyTier,
  deriveTransactionSla,
  deriveTransactionTier,
  TRANSACTION_HARD_TERMINALS,
  TRANSACTION_VALID_TRANSITIONS,
  TRANSACTION_STATE_TRANSITIONS,
  transactionCrossesIntoRegulator,
  transactionSlaBreachCrossesIntoRegulator,
  computePlatformFee,
} from '../utils/sustainability-marketplace-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer', 'carbon_fund', 'offtaker', 'lender', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function transactionSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_sustainability_transactions
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('settled','failed','refunded','cancelled')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_sustainability_transactions SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (transactionSlaBreachCrossesIntoRegulator(row.urgency_tier as TransactionUrgencyTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'sustainability_transaction', row.id,
          'transaction_sla_breach',
          `Sustainability transaction SLA breached — ${row.urgency_tier} — ${(row.listing_type as string) ?? '?'} — transaction ${(row.id as string).slice(0, 8).toUpperCase()}`,
          row.buyer_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'transaction_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'sustainability_transaction', entity_id: row.id as string,
      data: { urgency_tier: row.urgency_tier, listing_type: row.listing_type, disposition: row.disposition },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'support'].includes(user.role);

  const chainStatus = c.req.query('chain_status');
  const listingType  = c.req.query('listing_type');
  const disposition  = c.req.query('disposition');

  let query: string;
  let bindings: (string | null)[];

  if (isAdmin) {
    // Admin/support: see all transactions, with optional filters
    const conditions: string[] = [];
    const params: (string | null)[] = [];
    if (chainStatus) { conditions.push('chain_status = ?'); params.push(chainStatus); }
    if (listingType)  { conditions.push('listing_type = ?');  params.push(listingType); }
    if (disposition)  { conditions.push('disposition = ?');   params.push(disposition); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    query = `SELECT * FROM oe_sustainability_transactions ${where} ORDER BY created_at DESC`;
    bindings = params;
  } else {
    // Regular users: tenant-isolated to buyer or seller
    const conditions: string[] = ['(buyer_id = ? OR seller_id = ?)'];
    const params: (string | null)[] = [user.id, user.id];
    if (chainStatus) { conditions.push('chain_status = ?'); params.push(chainStatus); }
    if (listingType)  { conditions.push('listing_type = ?');  params.push(listingType); }
    if (disposition)  { conditions.push('disposition = ?');   params.push(disposition); }
    query = `SELECT * FROM oe_sustainability_transactions WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
    bindings = params;
  }

  const rows = await c.env.DB
    .prepare(query)
    .bind(...bindings)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total:             all.length,
    pending:           all.filter(r => r.chain_status === 'pending').length,
    payment_confirmed: all.filter(r => r.chain_status === 'payment_confirmed').length,
    settled:           all.filter(r => r.chain_status === 'settled').length,
    failed:            all.filter(r => r.chain_status === 'failed').length,
    sla_breached:      all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_sustainability_transactions WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.buyer_id !== user.id && row.seller_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'sustainability_transaction' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / — Buy Now ─────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    listing_id: string;
    quantity_purchased: number;
    disposition: 'portfolio_hold' | 'brokered_retirement';
    payment_method?: string;
    retirement_beneficiary?: string;
    retirement_purpose?: string;
    reason?: string;
  }>();

  // ── Required field validation ──────────────────────────────────────────────
  if (!body.listing_id) {
    return c.json({ success: false, error: 'listing_id is required' }, 422);
  }
  if (!body.quantity_purchased || body.quantity_purchased <= 0) {
    return c.json({ success: false, error: 'quantity_purchased must be a positive number' }, 422);
  }
  if (!body.disposition || !['portfolio_hold', 'brokered_retirement'].includes(body.disposition)) {
    return c.json({ success: false, error: 'disposition must be portfolio_hold or brokered_retirement' }, 422);
  }
  if (body.disposition === 'brokered_retirement') {
    if (!body.retirement_beneficiary) {
      return c.json({ success: false, error: 'retirement_beneficiary is required for brokered_retirement' }, 422);
    }
    if (!body.retirement_purpose) {
      return c.json({ success: false, error: 'retirement_purpose is required for brokered_retirement' }, 422);
    }
  }

  // ── a. Fetch listing ───────────────────────────────────────────────────────
  const listing = await c.env.DB
    .prepare(`SELECT * FROM oe_sustainability_listings WHERE id = ? AND chain_status IN ('active','partially_sold')`)
    .bind(body.listing_id).first<Record<string, unknown>>();
  if (!listing) {
    return c.json({ success: false, error: 'Listing not available' }, 422);
  }

  // ── b. Check quantity available ────────────────────────────────────────────
  const quantityListed   = (listing.quantity_listed   as number) ?? 0;
  const quantityReserved = (listing.quantity_reserved as number) ?? 0;
  const quantitySold     = (listing.quantity_sold     as number) ?? 0;
  const quantityAvailable = quantityListed - quantityReserved - quantitySold;
  if (quantityAvailable < body.quantity_purchased) {
    return c.json({ success: false, error: 'Insufficient quantity available' }, 422);
  }

  // ── c. Cannot buy own listing ──────────────────────────────────────────────
  if (listing.participant_id === user.id) {
    return c.json({ success: false, error: 'Cannot purchase your own listing' }, 422);
  }

  // ── d. Brokered retirement eligibility ────────────────────────────────────
  if (body.disposition === 'brokered_retirement' && !listing.allows_brokered_retirement) {
    return c.json({ success: false, error: 'Seller does not allow brokered retirement for this listing' }, 422);
  }

  // ── e. Portfolio hold eligibility ─────────────────────────────────────────
  if (body.disposition === 'portfolio_hold' && !listing.allows_portfolio_hold) {
    return c.json({ success: false, error: 'Seller does not allow portfolio hold for this listing' }, 422);
  }

  // ── f. Compute financials ─────────────────────────────────────────────────
  const pricePerUnit    = (listing.price_zar_per_unit as number) ?? 0;
  const totalZar        = body.quantity_purchased * pricePerUnit;
  const platformFeeZar  = computePlatformFee(totalZar);
  const netSellerZar    = totalZar - platformFeeZar;

  // ── g. Tier ───────────────────────────────────────────────────────────────
  const tier = deriveTransactionTier(totalZar, body.disposition);

  // ── h. SLA deadline ───────────────────────────────────────────────────────
  const slaHours   = deriveTransactionSla(tier);
  const now        = new Date().toISOString();
  const slaDeadline = new Date(Date.now() + slaHours * 3600000).toISOString();
  const id          = crypto.randomUUID();

  // ── i. Reserve quantity on listing ────────────────────────────────────────
  await c.env.DB
    .prepare(`UPDATE oe_sustainability_listings SET quantity_reserved = quantity_reserved + ?, updated_at = ? WHERE id = ?`)
    .bind(body.quantity_purchased, now, body.listing_id)
    .run();

  // ── j. Insert transaction ─────────────────────────────────────────────────
  await c.env.DB
    .prepare(`INSERT INTO oe_sustainability_transactions
      (id, listing_id, listing_type,
       buyer_id, seller_id,
       quantity_purchased, price_zar_per_unit, total_zar, platform_fee_zar, net_seller_zar,
       disposition, payment_method,
       retirement_beneficiary, retirement_purpose,
       urgency_tier, chain_status,
       sla_deadline, sla_breached, regulator_notified,
       actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,0,0,?,?,?,?)`)
    .bind(
      id,
      body.listing_id,
      listing.listing_type ?? null,
      user.id,
      listing.participant_id ?? null,
      body.quantity_purchased,
      pricePerUnit,
      totalZar,
      platformFeeZar,
      netSellerZar,
      body.disposition,
      body.payment_method ?? null,
      body.retirement_beneficiary ?? null,
      body.retirement_purpose ?? null,
      tier,
      slaDeadline,
      user.id,
      body.reason ?? null,
      now, now,
    ).run();

  // ── k. Fire cascade ───────────────────────────────────────────────────────
  await fireCascade({
    event: 'marketplace_transaction_created' as EventType,
    actor_id: user.id, entity_type: 'sustainability_transaction', entity_id: id,
    data: {
      listing_id: body.listing_id,
      listing_type: listing.listing_type,
      disposition: body.disposition,
      urgency_tier: tier,
      total_zar: totalZar,
      quantity_purchased: body.quantity_purchased,
    },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_sustainability_transactions WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();

  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: TransactionAction;
    reason?: string;
    payment_ref?: string;
    settlement_ref?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_sustainability_transactions WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.buyer_id !== user.id && row.seller_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  // Per-action ACL: payment + custody transitions are off-platform operations
  // (payment gateway callback / admin settlement) — buyers/sellers must not
  // self-approve payment confirmation or self-complete asset transfers.
  const ACTION_ALLOWED_ACTORS: Record<TransactionAction, ('admin_support' | 'buyer' | 'seller')[]> = {
    initiate_payment:    ['admin_support', 'buyer'],
    cancel:              ['admin_support', 'buyer'],
    confirm_payment:     ['admin_support'],          // payment-gateway callback only
    begin_settlement:    ['admin_support'],          // custody operation
    complete_settlement: ['admin_support'],          // holding transfer / retirement
    fail_settlement:     ['admin_support'],
    refund:              ['admin_support'],
    sla_breach:          ['admin_support'],
  };
  const actorKind = isAdmin ? 'admin_support'
    : row.buyer_id === user.id ? 'buyer'
    : 'seller';
  if (!ACTION_ALLOWED_ACTORS[action]?.includes(actorKind)) {
    return c.json({ success: false, error: `Action '${action}' requires admin or support` }, 403);
  }

  const currentStatus = row.chain_status as TransactionStatus;
  if (TRANSACTION_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Transaction in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = TRANSACTION_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, TRANSACTION_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  // ── Late SLA flag ─────────────────────────────────────────────────────────
  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_sustainability_transactions SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  // ── Extra timestamp columns ───────────────────────────────────────────────
  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'initiate_payment') {
    extra.push('payment_initiated_at = ?');
    eb.push(now);
    if (body.payment_ref) { extra.push('payment_ref = ?'); eb.push(body.payment_ref); }
  }
  if (action === 'confirm_payment') {
    extra.push('payment_confirmed_at = ?');
    eb.push(now);
    if (body.payment_ref) { extra.push('payment_ref = ?'); eb.push(body.payment_ref); }
  }
  if (action === 'begin_settlement') {
    extra.push('settlement_started_at = ?');
    eb.push(now);
  }

  // ── Special settlement logic ──────────────────────────────────────────────
  let settlementRef: string | null = null;
  let retirementRef: string | null = null;
  let settlementError: string | null = null;

  if (action === 'complete_settlement') {
    try {
      const listingId    = row.listing_id as string;
      const disposition  = row.disposition as string;
      const listingType  = row.listing_type as string;
      const quantityPurchased = row.quantity_purchased as number;

      // Fetch listing record for holding references
      const listing = await c.env.DB
        .prepare(`SELECT * FROM oe_sustainability_listings WHERE id = ?`)
        .bind(listingId).first<Record<string, unknown>>();

      if (listing) {
        // ── Transfer / Retire holdings ────────────────────────────────────
        if (disposition === 'portfolio_hold') {
          if (listingType === 'rec' && listing.rec_holding_id) {
            // Transfer REC holding to buyer
            const holding = await c.env.DB
              .prepare(`SELECT * FROM oe_rec_holdings WHERE id = ?`)
              .bind(listing.rec_holding_id).first<Record<string, unknown>>();

            await c.env.DB
              .prepare(`UPDATE oe_rec_holdings SET status = 'transferred', transfer_ref = ?, updated_at = ? WHERE id = ?`)
              .bind(id, now, listing.rec_holding_id).run();

            if (holding) {
              await c.env.DB
                .prepare(`INSERT INTO oe_rec_holdings
                  (id, participant_id, registry_standard, certificate_number, vintage_year,
                   mwh_quantity, generation_technology, generation_facility_id,
                   issued_date, expiry_date, status, acquisition_type, transfer_ref,
                   created_at, updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                .bind(
                  crypto.randomUUID(),
                  row.buyer_id,
                  holding.registry_standard ?? null,
                  holding.certificate_number ?? null,
                  holding.vintage_year ?? null,
                  quantityPurchased,
                  holding.generation_technology ?? null,
                  holding.generation_facility_id ?? null,
                  holding.issued_date ?? null,
                  holding.expiry_date ?? null,
                  'active',
                  'purchased',
                  id,
                  now, now,
                ).run();
            }
          } else if (listingType === 'vcm' || listingType === 'brokered_coa') {
            if (listing.vcm_holding_id) {
              const vcmHolding = await c.env.DB
                .prepare(`SELECT * FROM oe_vcm_holdings WHERE id = ?`)
                .bind(listing.vcm_holding_id).first<Record<string, unknown>>();

              await c.env.DB
                .prepare(`UPDATE oe_vcm_holdings SET status = 'transferred', updated_at = ? WHERE id = ?`)
                .bind(now, listing.vcm_holding_id).run();

              if (vcmHolding) {
                await c.env.DB
                  .prepare(`INSERT INTO oe_vcm_holdings
                    (id, participant_id, registry_standard, serial_number, vintage_year,
                     quantity_tco2, methodology, project_id, project_name,
                     status, acquisition_type, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                  .bind(
                    crypto.randomUUID(),
                    row.buyer_id,
                    vcmHolding.registry_standard ?? null,
                    vcmHolding.serial_number ?? null,
                    vcmHolding.vintage_year ?? null,
                    quantityPurchased,
                    vcmHolding.methodology ?? null,
                    vcmHolding.project_id ?? null,
                    vcmHolding.project_name ?? null,
                    'active',
                    'purchased',
                    now, now,
                  ).run();
              }
            }
          }
        } else if (disposition === 'brokered_retirement') {
          if (listingType === 'rec' && listing.rec_holding_id) {
            const holding = await c.env.DB
              .prepare(`SELECT * FROM oe_rec_holdings WHERE id = ?`)
              .bind(listing.rec_holding_id).first<Record<string, unknown>>();

            await c.env.DB
              .prepare(`UPDATE oe_rec_holdings SET status = 'retired', retirement_ref = ?, updated_at = ? WHERE id = ?`)
              .bind(id, now, listing.rec_holding_id).run();

            retirementRef = id;

            if (holding) {
              await c.env.DB
                .prepare(`INSERT INTO oe_rec_retirements
                  (id, participant_id, beneficiary_name, beneficiary_purpose,
                   registry_standard, total_mwh, holding_ids, retired_at, created_at)
                  VALUES (?,?,?,?,?,?,?,?,?)`)
                .bind(
                  crypto.randomUUID(),
                  row.buyer_id,
                  row.retirement_beneficiary ?? null,
                  row.retirement_purpose ?? null,
                  holding.registry_standard ?? null,
                  quantityPurchased,
                  JSON.stringify([listing.rec_holding_id]),
                  now, now,
                ).run();
            }
          } else if (listingType === 'vcm' || listingType === 'brokered_coa') {
            if (listing.vcm_holding_id) {
              await c.env.DB
                .prepare(`UPDATE oe_vcm_holdings SET status = 'retired', updated_at = ? WHERE id = ?`)
                .bind(now, listing.vcm_holding_id).run();
            }
            retirementRef = `CERT-${id.slice(0, 8).toUpperCase()}-${Date.now()}`;
          }
        }

        // ── Update listing quantity and status ────────────────────────────
        const newQuantitySold     = ((listing.quantity_sold as number) ?? 0) + quantityPurchased;
        const newQuantityReserved = Math.max(0, ((listing.quantity_reserved as number) ?? 0) - quantityPurchased);
        const newListingStatus    = newQuantitySold >= quantityListed(listing) ? 'sold_out' : 'partially_sold';

        await c.env.DB
          .prepare(`UPDATE oe_sustainability_listings
                    SET quantity_sold = ?, quantity_reserved = ?, chain_status = ?, updated_at = ?
                    WHERE id = ?`)
          .bind(newQuantitySold, newQuantityReserved, newListingStatus, now, listingId)
          .run();
      }

      settlementRef = body.settlement_ref ?? `SETTLE-${id.slice(0, 8).toUpperCase()}`;
      if (retirementRef) {
        extra.push('retirement_ref = ?');
        eb.push(retirementRef);
      }
      extra.push('settlement_ref = ?');
      eb.push(settlementRef);
      extra.push('settled_at = ?');
      eb.push(now);
    } catch (err: any) {
      settlementError = String(err?.message ?? err);
      // Log but continue — chain_status update must succeed
    }
  }

  // ── Release reservation on fail or refund ─────────────────────────────────
  if (action === 'fail_settlement' || action === 'refund') {
    try {
      await c.env.DB
        .prepare(`UPDATE oe_sustainability_listings
                  SET quantity_reserved = MAX(0, quantity_reserved - ?), updated_at = ?
                  WHERE id = ?`)
        .bind(row.quantity_purchased, now, row.listing_id)
        .run();
    } catch (_err) {
      // Non-fatal — listing reservation release failure should not block state transition
    }
    if (action === 'refund') {
      extra.push('refunded_at = ?');
      eb.push(now);
    }
    if (action === 'fail_settlement') {
      extra.push('failed_at = ?');
      eb.push(now);
    }
  }

  if (action === 'cancel') {
    try {
      await c.env.DB
        .prepare(`UPDATE oe_sustainability_listings
                  SET quantity_reserved = MAX(0, quantity_reserved - ?), updated_at = ?
                  WHERE id = ?`)
        .bind(row.quantity_purchased, now, row.listing_id)
        .run();
    } catch (_err) {
      // Non-fatal
    }
    extra.push('cancelled_at = ?');
    eb.push(now);
  }

  // ── Apply state transition ─────────────────────────────────────────────────
  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_sustainability_transactions SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  // ── Regulator inbox ───────────────────────────────────────────────────────
  if (transactionCrossesIntoRegulator(action, row.urgency_tier as TransactionUrgencyTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'sustainability_transaction', id,
        `transaction_${action}`,
        `Sustainability transaction ${action.replace(/_/g, ' ')} — ${row.urgency_tier} — ${row.listing_type} — ${(row.id as string).slice(0, 8).toUpperCase()}`,
        row.buyer_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_sustainability_transactions SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  // ── Cascade ───────────────────────────────────────────────────────────────
  // ponytail: complete_settlement is the value-bearing transition — pass total_zar
  // as commercial.entity_value so fee-engine collects the 1.5% marketplace take-rate
  // (oe_fee_schedule row trigger_event='transaction_complete_settlement', pct 0.015)
  // into oe_platform_revenue. Payer is the seller (ipp_developer per fee row).
  const commercial =
    action === 'complete_settlement'
      ? {
          entity_value: Number(row.total_zar ?? 0),
          participant_id: (row.seller_id as string) ?? undefined,
        }
      : undefined;

  await fireCascade({
    event: `transaction_${action}` as EventType,
    actor_id: user.id, entity_type: 'sustainability_transaction', entity_id: id,
    data: {
      action,
      from_status: currentStatus,
      to_status: nextStatus,
      urgency_tier: row.urgency_tier,
      listing_type: row.listing_type,
      disposition: row.disposition,
      total_zar: row.total_zar,
      ...(settlementRef ? { settlement_ref: settlementRef } : {}),
      ...(retirementRef ? { retirement_ref: retirementRef } : {}),
      ...(settlementError ? { settlement_error: settlementError } : {}),
    },
    commercial,
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_sustainability_transactions WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();

  return c.json({
    success: true,
    data: updated,
    ...(settlementError ? { settlement_warning: settlementError } : {}),
  });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await transactionSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function quantityListed(listing: Record<string, unknown>): number {
  return (listing.quantity_listed as number) ?? 0;
}

export default app;
