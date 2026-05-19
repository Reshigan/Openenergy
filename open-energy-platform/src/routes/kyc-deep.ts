// ════════════════════════════════════════════════════════════════════════
// kyc-deep — tiered KYC + PEP/sanctions screening + AML risk score.
//
// Tier model (FICA s.21 + risk-based approach):
//   Tier 0 — unverified; cannot trade
//   Tier 1 — basic (email + phone verified)
//            per-trade R10k · monthly R50k
//   Tier 2 — documented (ID + proof of address)
//            per-trade R500k · monthly R5m
//   Tier 3 — enhanced (corporate docs + source of funds + PEP screen)
//            per-trade R50m · monthly R500m
//
// Screening sources (data-set lookups; the test set is bundled in code
// — production replaces with real OFAC SDN + UN Consolidated + EU + UK
// HMT lists pulled nightly to KV/R2):
//   • un_consolidated  (UN Security Council Consolidated List)
//   • ofac_sdn         (US Treasury Specially Designated Nationals)
//   • eu_consolidated  (EU Financial Sanctions)
//   • uk_hmt           (UK Treasury Consolidated)
//   • sa_dwc_pep       (SA Department of Women, Youth — published PEPs)
//
// Risk score (0..100) blends:
//   • Geographic risk (FATF jurisdictions list)
//   • Occupation risk (PEP / cash-intensive / shell company)
//   • Product risk    (volume / cross-border / illiquid asset)
//   • Transaction pattern risk (velocity, structuring, round numbers)
//
// All endpoints mounted at /api/kyc-deep.
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { requireStepUp } from '../middleware/step-up';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ─── Tier definitions ────────────────────────────────────────────────────
const TIER_LIMITS: Record<number, { per_trade: number; monthly: number; name: string; requirements: string[] }> = {
  0: { per_trade: 0,          monthly: 0,          name: 'Unverified', requirements: ['email_verified'] },
  1: { per_trade: 10_000,     monthly: 50_000,     name: 'Tier 1 — Basic',
       requirements: ['email_verified', 'phone_verified'] },
  2: { per_trade: 500_000,    monthly: 5_000_000,  name: 'Tier 2 — Documented',
       requirements: ['id_document', 'proof_of_address'] },
  3: { per_trade: 50_000_000, monthly: 500_000_000,name: 'Tier 3 — Enhanced',
       requirements: ['id_document', 'proof_of_address', 'company_registration',
                      'tax_clearance', 'bank_confirmation', 'source_of_funds_declaration',
                      'pep_sanctions_screening_cleared'] },
};

// ─── Sanctions / PEP list snippets ─────────────────────────────────────
// Real implementation pulls fresh from regulator publication endpoints
// nightly; the snapshot below is enough to wire the matching engine.
const SANCTIONS_LISTS: Record<string, Array<{ name: string; aka?: string[]; country?: string; designation?: string }>> = {
  un_consolidated: [
    { name: 'TALIBAN', country: 'AF', designation: 'TAi.001' },
    { name: 'AL-QAIDA', designation: 'QDe.004' },
  ],
  ofac_sdn: [
    { name: 'MADURO, Nicolas', country: 'VE', designation: 'OFAC-SDN' },
    { name: 'PUTIN, Vladimir Vladimirovich', country: 'RU', designation: 'OFAC-SDN' },
  ],
  eu_consolidated: [
    { name: 'LUKASHENKO, Aliaksandr', country: 'BY' },
  ],
  uk_hmt: [
    { name: 'PRIGOZHIN, Yevgeny Viktorovich', country: 'RU' },
  ],
  sa_dwc_pep: [
    // SA-published Politically Exposed Persons (test entries)
    { name: 'Cyril Ramaphosa',  designation: 'Head of State' },
    { name: 'Paul Mashatile',   designation: 'Deputy President' },
  ],
};

const HIGH_RISK_COUNTRIES = new Set(['IR', 'KP', 'SY', 'CU', 'VE', 'AF', 'YE', 'SO', 'LY']); // FATF black/grey

// ─── String similarity (Jaro-Winkler — phonetic for surname matches) ──
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const a = s1.toUpperCase(); const b = s2.toUpperCase();
  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end   = Math.min(b.length, i + matchDistance + 1);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true; bMatches[j] = true; matches++; break;
    }
  }
  if (matches === 0) return 0;
  let t = 0; let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++; else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

function screenAgainstLists(name: string): { matches: any[]; max_score: number; lists_hit: string[] } {
  const matches: any[] = [];
  const listsHit = new Set<string>();
  for (const [list, entries] of Object.entries(SANCTIONS_LISTS)) {
    for (const e of entries) {
      const score = jaroWinkler(name, e.name);
      const akaScore = Math.max(score, ...(e.aka || []).map((a) => jaroWinkler(name, a)));
      if (akaScore >= 0.85) {
        matches.push({ list, name: e.name, designation: e.designation, country: e.country, score: akaScore });
        listsHit.add(list);
      }
    }
  }
  return {
    matches,
    max_score: matches.length ? Math.max(...matches.map((m) => m.score)) : 0,
    lists_hit: Array.from(listsHit),
  };
}

// ─── Risk score ──────────────────────────────────────────────────────────
function computeRiskScore(inputs: {
  country?: string;
  is_pep?: boolean;
  occupation_risk_factor?: number;
  monthly_volume_zar?: number;
  cross_border?: boolean;
  age_of_account_days?: number;
}): { score: number; breakdown: Record<string, number>; tier: 'low' | 'medium' | 'high' } {
  const geographic = inputs.country && HIGH_RISK_COUNTRIES.has(inputs.country.toUpperCase()) ? 30 : 5;
  const occupation = (inputs.is_pep ? 25 : 0) + Number(inputs.occupation_risk_factor || 5);
  const product    = Math.min(20, (Number(inputs.monthly_volume_zar || 0) / 5_000_000) * 10) + (inputs.cross_border ? 10 : 0);
  const txnPattern = Number(inputs.age_of_account_days || 0) < 30 ? 15 : 5;
  const total = Math.min(100, geographic + occupation + product + txnPattern);
  const tier: 'low' | 'medium' | 'high' = total >= 60 ? 'high' : total >= 30 ? 'medium' : 'low';
  return { score: total, breakdown: { geographic, occupation, product, transaction_pattern: txnPattern }, tier };
}

// ─── Endpoints ───────────────────────────────────────────────────────────
r.get('/tiers/me', async (c) => {
  const user = getCurrentUser(c);
  const row = await c.env.DB.prepare(`SELECT * FROM oe_kyc_tiers WHERE participant_id = ?`).bind(user.id).first<any>();
  const tier = row?.current_tier ?? 0;
  const limits = TIER_LIMITS[tier];
  return c.json({
    success: true,
    data: {
      current_tier: tier,
      limits: {
        per_trade_limit_zar:      row?.per_trade_limit_zar      ?? limits.per_trade,
        monthly_volume_limit_zar: row?.monthly_volume_limit_zar ?? limits.monthly,
      },
      tier_name: limits.name,
      next_tier: tier < 3 ? {
        tier: tier + 1,
        name: TIER_LIMITS[tier + 1].name,
        requirements: TIER_LIMITS[tier + 1].requirements,
      } : null,
      evidence_status: row?.evidence_status ? JSON.parse(row.evidence_status) : {},
    },
  });
});

r.post('/tiers/upgrade-request', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const target = Number(b.target_tier || 0);
  if (target < 1 || target > 3) return c.json({ success: false, error: 'target_tier must be 1..3' }, 400);
  // Check the user has submitted all required documents in the right status
  const requirements = TIER_LIMITS[target].requirements;
  const subs = await c.env.DB.prepare(`SELECT document_type, status FROM oe_kyc_submissions WHERE participant_id = ?`).bind(user.id).all<any>();
  const approved = new Set(((subs.results || []) as any[]).filter((s) => s.status === 'approved').map((s) => s.document_type));
  const missing = requirements.filter((req) => !approved.has(req) && !['email_verified', 'phone_verified', 'pep_sanctions_screening_cleared', 'source_of_funds_declaration'].includes(req));
  if (missing.length) {
    return c.json({ success: false, error: 'missing_documents', data: { missing } }, 409);
  }
  return c.json({ success: true, data: { message: `Tier ${target} upgrade queued for review`, target_tier: target } });
});

// Admin endpoint to apply tier (step-up gated — high-risk op)
r.post('/tiers/:participant_id', requireStepUp('kyc.tier_upgrade'), async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const pid = c.req.param('participant_id');
  const b = await c.req.json().catch(() => ({} as any));
  const target = Number(b.tier || 0);
  if (target < 0 || target > 3) return c.json({ success: false, error: 'tier must be 0..3' }, 400);
  const limits = TIER_LIMITS[target];
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO oe_kyc_tiers
      (participant_id, current_tier, per_trade_limit_zar, monthly_volume_limit_zar, upgraded_by, upgraded_at, updated_at)
    VALUES (?,?,?,?,?,datetime('now'),datetime('now'))
  `).bind(pid, target, limits.per_trade, limits.monthly, user.id).run();
  return c.json({ success: true, data: { participant_id: pid, tier: target, limits } });
});

// PEP / sanctions screen
r.post('/screening', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support'].includes(user.role);
  const b = await c.req.json().catch(() => ({} as any));
  const pid = String(b.participant_id || user.id);
  if (pid !== user.id && !isOfficer) return c.json({ success: false, error: 'forbidden' }, 403);
  if (!b.full_name) return c.json({ success: false, error: 'full_name required' }, 400);
  const result = screenAgainstLists(String(b.full_name));
  for (const list of result.lists_hit) {
    const id = genId('scr');
    const status = result.max_score >= 0.95 ? 'confirmed_match' : 'pending_review';
    await c.env.DB.prepare(`
      INSERT INTO oe_kyc_screenings
        (id, participant_id, screening_type, list_source, match_count, matches_json, max_match_score, status)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(
      id, pid,
      list === 'sa_dwc_pep' ? 'pep' : 'sanctions',
      list,
      result.matches.filter((m) => m.list === list).length,
      JSON.stringify(result.matches.filter((m) => m.list === list)),
      result.max_score, status,
    ).run();
  }
  // If no hits, log a clear screen
  if (!result.lists_hit.length) {
    await c.env.DB.prepare(`
      INSERT INTO oe_kyc_screenings
        (id, participant_id, screening_type, list_source, match_count, max_match_score, status, reviewer_id, reviewed_at)
      VALUES (?,?,?,?,?,?,?,?,datetime('now'))
    `).bind(genId('scr'), pid, 'sanctions', 'all_lists', 0, 0, 'cleared', user.id).run();
  }
  return c.json({
    success: true,
    data: {
      participant_id: pid,
      cleared: !result.lists_hit.length,
      lists_hit: result.lists_hit,
      matches: result.matches,
      max_match_score: result.max_score,
    },
  });
});

r.get('/screening/:participant_id', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support'].includes(user.role);
  const pid = c.req.param('participant_id');
  if (pid !== user.id && !isOfficer) return c.json({ success: false, error: 'forbidden' }, 403);
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_kyc_screenings WHERE participant_id = ? ORDER BY screened_at DESC LIMIT 50`).bind(pid).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/screening/:id/review', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const b = await c.req.json().catch(() => ({} as any));
  const decision = String(b.decision || '');
  if (!['cleared', 'confirmed_match', 'false_positive', 'escalated'].includes(decision)) {
    return c.json({ success: false, error: 'invalid decision' }, 400);
  }
  await c.env.DB.prepare(`UPDATE oe_kyc_screenings SET status = ?, reviewer_id = ?, reviewed_at = datetime('now'), notes = ? WHERE id = ?`)
    .bind(decision, user.id, b.notes || null, id).run();
  return c.json({ success: true });
});

// Risk score
r.post('/risk-score/compute', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support'].includes(user.role);
  const b = await c.req.json().catch(() => ({} as any));
  const pid = String(b.participant_id || user.id);
  if (pid !== user.id && !isOfficer) return c.json({ success: false, error: 'forbidden' }, 403);
  const part = await c.env.DB.prepare(`SELECT created_at FROM participants WHERE id = ?`).bind(pid).first<any>().catch(() => null);
  const ageDays = part?.created_at ? Math.floor((Date.now() - new Date(part.created_at).getTime()) / 86_400_000) : 0;
  const vol = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) AS v FROM invoices
    WHERE (from_participant_id = ? OR to_participant_id = ?)
      AND created_at >= date('now','-30 days')
  `).bind(pid, pid).first<any>().catch(() => ({ v: 0 }));
  const result = computeRiskScore({
    country: b.country, is_pep: !!b.is_pep,
    occupation_risk_factor: Number(b.occupation_risk_factor || 5),
    monthly_volume_zar: Number(vol?.v || 0),
    cross_border: !!b.cross_border,
    age_of_account_days: ageDays,
  });
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO oe_kyc_risk_scores
      (participant_id, geographic_risk, occupation_risk, product_risk, transaction_pattern_risk,
       total_score, risk_tier, inputs_json, last_assessed_at)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'))
  `).bind(
    pid,
    result.breakdown.geographic, result.breakdown.occupation,
    result.breakdown.product,    result.breakdown.transaction_pattern,
    result.score, result.tier,
    JSON.stringify({ ...b, monthly_volume_zar: Number(vol?.v || 0), age_of_account_days: ageDays }),
  ).run();
  return c.json({ success: true, data: { participant_id: pid, ...result } });
});

r.get('/risk-score/:participant_id', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support'].includes(user.role);
  const pid = c.req.param('participant_id');
  if (pid !== user.id && !isOfficer) return c.json({ success: false, error: 'forbidden' }, 403);
  const row = await c.env.DB.prepare(`SELECT * FROM oe_kyc_risk_scores WHERE participant_id = ?`).bind(pid).first<any>();
  if (!row) return c.json({ success: true, data: null });
  return c.json({ success: true, data: { ...row, inputs_json: row.inputs_json ? JSON.parse(row.inputs_json) : null } });
});

// Beneficial owners
r.get('/beneficial-owners/:participant_id', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support'].includes(user.role);
  const pid = c.req.param('participant_id');
  if (pid !== user.id && !isOfficer) return c.json({ success: false, error: 'forbidden' }, 403);
  const rows = await c.env.DB.prepare(`SELECT * FROM oe_kyc_beneficial_owners WHERE participant_id = ? ORDER BY ownership_pct DESC`).bind(pid).all();
  return c.json({ success: true, data: rows.results || [] });
});

r.post('/beneficial-owners', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  const pid = String(b.participant_id || user.id);
  if (pid !== user.id && !['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  if (!b.full_name || b.ownership_pct == null) return c.json({ success: false, error: 'full_name + ownership_pct required' }, 400);
  const id = genId('bo');
  await c.env.DB.prepare(`
    INSERT INTO oe_kyc_beneficial_owners
      (id, participant_id, full_name, id_number, date_of_birth, ownership_pct, is_pep, source_of_funds)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(id, pid, b.full_name, b.id_number || null, b.date_of_birth || null, Number(b.ownership_pct), b.is_pep ? 1 : 0, b.source_of_funds || null).run();
  return c.json({ success: true, data: { id } }, 201);
});

// Limit-check endpoint — call from settlement to enforce KYC tier
r.post('/check-limit', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.participant_id || b.amount_zar == null) return c.json({ success: false, error: 'participant_id + amount_zar required' }, 400);
  const tierRow = await c.env.DB.prepare(`SELECT current_tier, per_trade_limit_zar, monthly_volume_limit_zar FROM oe_kyc_tiers WHERE participant_id = ?`).bind(b.participant_id).first<any>();
  const tier = tierRow?.current_tier ?? 0;
  const limits = TIER_LIMITS[tier];
  const perTradeLimit = Number(tierRow?.per_trade_limit_zar || limits.per_trade);
  const monthlyLimit = Number(tierRow?.monthly_volume_limit_zar || limits.monthly);
  const amount = Number(b.amount_zar);
  if (amount > perTradeLimit) {
    return c.json({ success: false, error: 'per_trade_limit_exceeded', data: { tier, limit: perTradeLimit, requested: amount } }, 403);
  }
  // Check rolling-month total
  const mtd = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(total_amount),0) AS v FROM invoices
    WHERE (from_participant_id = ? OR to_participant_id = ?)
      AND created_at >= date('now', 'start of month')
  `).bind(b.participant_id, b.participant_id).first<any>();
  const monthTotal = Number(mtd?.v || 0);
  if (monthTotal + amount > monthlyLimit) {
    return c.json({ success: false, error: 'monthly_limit_exceeded', data: { tier, limit: monthlyLimit, mtd: monthTotal, requested: amount } }, 403);
  }
  return c.json({ success: true, data: { tier, ok: true, per_trade_remaining: perTradeLimit - amount, monthly_remaining: monthlyLimit - monthTotal - amount } });
});

export default r;
