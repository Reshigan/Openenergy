// ═══════════════════════════════════════════════════════════════════════════
// Platform-wide cross-module infrastructure
//
// Promotes the four "Watershed-grade" primitives (AI classifier, scenario
// analysis, hash-chain audit, anomaly detection) to platform services so
// every role/module can use them with a domain tag.
//
//   /platform/ai/classify          domain-tagged AI classification
//   /platform/scenarios            list reference scenarios for a domain
//   /platform/scenarios/run        run a scenario for trading / grid / ipp / regulator
//   /platform/audit-chain          domain-filtered hash-chain audit trail
//   /platform/anomalies            cross-module anomaly register + scan
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

const platform = new Hono<HonoEnv>();
platform.use('*', authMiddleware);

const rid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── AI classifier — multi-domain ──────────────────────────────────────

platform.post('/ai/classify', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { domain, input, metadata } = body;
  if (!domain || !input) return c.json({ success: false, error: 'domain and input required' }, 400);

  // Per-domain prompt templates. Each returns a single label + categories.
  const prompts: Record<string, string> = {
    trade: `Classify this trade as one of: hedging, prop, market_making, client_facilitation, arbitrage, wash_trade, layering, normal. Reply with JSON {"label": "...", "categories": [...], "confidence": 0-1, "reasoning": "one sentence"}. INPUT: ${input}`,
    contract: `Classify this contract clause/document as one of: ppa_wheeling, ppa_btm, offtake, wheeling, loi, term_sheet, hoa, nda, epc, forward, carbon_purchase. Reply JSON {"label","categories","confidence","reasoning"}. INPUT: ${input}`,
    license: `Classify this license application as one of: generation_licence, distribution_licence, trading_licence, deviation, exempt, malformed. Reply JSON. INPUT: ${input}`,
    grid_alarm: `Triage this SCADA alarm. Severity must be one of: info, minor, major, critical. Reply JSON {"label":"<severity>","categories":["<root_cause_guess>"],"confidence":0-1,"reasoning":"one sentence"}. INPUT: ${input}`,
    ipp_milestone: `Assess this project milestone update. Categorise as: on_track, at_risk, slipping, missed. Reply JSON. INPUT: ${input}`,
    invoice: `Classify this invoice line as one of: capex, opex, fuel, labour, services, financing, taxes, recovery. Reply JSON. INPUT: ${input}`,
    counterparty: `Classify this counterparty profile risk as one of: low, medium, high, very_high. Reply JSON {"label":"<risk>","categories":["<reason>"],"confidence":0-1,"reasoning":"one sentence"}. INPUT: ${input}`,
    market_surveillance: `Classify this trading pattern as one of: normal, suspicious_layering, suspicious_spoofing, suspicious_wash, possible_insider, possible_pump_dump. Reply JSON. INPUT: ${input}`,
    generic: `Classify this input. Reply JSON {"label","categories","confidence","reasoning"}. INPUT: ${input}`,
  };
  const prompt = prompts[domain] || prompts.generic;

  let aiOut: any = null;
  let modelId = '@cf/meta/llama-3.1-8b-instruct';
  try {
    const ai: any = c.env.AI;
    const resp: any = await ai.run(modelId, { messages: [
      { role: 'system', content: 'You are a precise classifier. Reply only with valid JSON.' },
      { role: 'user', content: prompt },
    ] });
    const txt = String(resp?.response || resp?.result || resp || '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) aiOut = JSON.parse(m[0]);
  } catch { /* AI binding unavailable */ }

  if (!aiOut) {
    aiOut = { label: 'unknown', categories: [], confidence: 0.0, reasoning: 'AI unavailable; manual classification required.' };
    modelId = 'unavailable';
  }

  const id = rid('pai');
  await c.env.DB.prepare(`
    INSERT INTO platform_ai_logs (id, participant_id, domain, input_text, input_metadata_json,
      model_id, output_label, output_categories_json, confidence, reasoning)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, domain, input, metadata ? JSON.stringify(metadata) : null,
    modelId, aiOut.label ?? null, JSON.stringify(aiOut.categories || []),
    aiOut.confidence ?? null, aiOut.reasoning ?? null).run();

  return c.json({ success: true, data: { id, model_id: modelId, ...aiOut } });
});

platform.get('/ai/classify', async (c) => {
  const user = getCurrentUser(c);
  const domain = c.req.query('domain');
  const sql = `SELECT * FROM platform_ai_logs WHERE participant_id = ?${domain ? ' AND domain = ?' : ''} ORDER BY created_at DESC LIMIT 100`;
  const binds: any[] = [user.id];
  if (domain) binds.push(domain);
  const r = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: r.results || [] });
});

platform.patch('/ai/classify/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({} as any));
  await c.env.DB.prepare(`
    UPDATE platform_ai_logs SET user_accepted = ?, user_override = ?, resolved_at = datetime('now')
    WHERE id = ? AND participant_id = ?
  `).bind(body.accepted ? 1 : 0, body.override ?? null, id, user.id).run();
  return c.json({ success: true });
});

// ─── Scenarios — generic across domains ────────────────────────────────

platform.get('/scenarios', async (c) => {
  const domain = c.req.query('domain');
  let sql = `SELECT * FROM platform_scenarios`;
  const binds: any[] = [];
  if (domain) { sql += ` WHERE domain = ?`; binds.push(domain); }
  sql += ` ORDER BY domain, severity, code`;
  const r = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: r.results || [] });
});

platform.get('/scenarios/runs', async (c) => {
  const user = getCurrentUser(c);
  const domain = c.req.query('domain');
  let sql = `SELECT r.*, s.name AS scenario_name, s.severity AS scenario_severity, s.family
             FROM platform_scenario_runs r JOIN platform_scenarios s ON s.code = r.scenario_code
             WHERE r.participant_id = ?`;
  const binds: any[] = [user.id];
  if (domain) { sql += ` AND r.domain = ?`; binds.push(domain); }
  sql += ` ORDER BY r.computed_at DESC LIMIT 50`;
  const r = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: r.results || [] });
});

platform.post('/scenarios/run', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { scenario_code, horizon_unit, horizon_value } = body;
  if (!scenario_code) return c.json({ success: false, error: 'scenario_code required' }, 400);

  const scenario = await c.env.DB.prepare(`SELECT * FROM platform_scenarios WHERE code = ?`).bind(scenario_code).first<any>();
  if (!scenario) return c.json({ success: false, error: 'scenario not found' }, 404);

  const params = JSON.parse(scenario.parameters_json || '{}');
  const hu = horizon_unit || 'year';
  const hv = horizon_value || 1;
  let baseValue = 0, shockedValue = 0, worstEntity: string | null = null, worstVar = 0;
  const details: any[] = [];

  if (scenario.domain === 'trading') {
    // Sum mark-to-market across open positions
    const positions = await c.env.DB.prepare(`
      SELECT o.id, o.energy_type, o.delivery_date, o.remaining_volume_mwh,
             COALESCE(m.mark_price_zar_mwh, o.price, 0) AS mark
      FROM trade_orders o
      LEFT JOIN mark_prices m ON m.energy_type = o.energy_type
        AND (m.delivery_date = o.delivery_date OR (m.delivery_date IS NULL AND o.delivery_date IS NULL))
      WHERE o.participant_id = ? AND o.status IN ('open','partially_filled')
    `).bind(user.id).all<any>();
    const dlt = (params.price_delta_pct || 0) / 100;
    const vmlt = params.vol_multiplier || 1;
    for (const p of (positions.results || [])) {
      const baseVal = (p.remaining_volume_mwh || 0) * (p.mark || 0);
      const shocked = baseVal * (1 + dlt) * (vmlt > 1 ? 1 : 1);
      baseValue += baseVal;
      shockedValue += shocked;
      const var_ = Math.abs(shocked - baseVal) * (vmlt || 1);
      if (var_ > worstVar) { worstVar = var_; worstEntity = `${p.energy_type}/${p.delivery_date || 'spot'}`; }
      details.push({ entity: `${p.energy_type}/${p.delivery_date || 'spot'}`, base: baseVal, shocked, var_zar: var_ });
    }
  } else if (scenario.domain === 'grid') {
    // Grid contingency — sum of affected delivery capacity
    const conns = await c.env.DB.prepare(`
      SELECT id, capacity_mw, voltage_kv FROM grid_connections
      WHERE participant_id = ? AND status = 'active'
    `).bind(user.id).all<any>();
    const lossPct = params.contingency === 'largest_gen_trip' ? 0.18 :
                    params.contingency === 'line_400kv_outage' ? 0.12 :
                    params.contingency === 'gen_plus_line' ? 0.30 : 0.10;
    for (const conn of (conns.results || [])) {
      const baseVal = (conn.capacity_mw || 0) * 1000 * 1.20; // ZAR/MWh proxy
      const shocked = baseVal * (1 - lossPct);
      baseValue += baseVal; shockedValue += shocked;
      const var_ = Math.abs(shocked - baseVal);
      if (var_ > worstVar) { worstVar = var_; worstEntity = `connection ${conn.id}`; }
      details.push({ entity: conn.id, base: baseVal, shocked, var_zar: var_ });
    }
  } else if (scenario.domain === 'ipp_project') {
    // Project IRR sensitivity — project-by-project
    const projs = await c.env.DB.prepare(`
      SELECT id, name, capacity_mw, total_capex_zar, ppa_tariff_zar_mwh, expected_lcoe_zar_mwh
      FROM projects WHERE participant_id = ? AND status NOT IN ('archived','withdrawn')
    `).bind(user.id).all<any>();
    const tariffDelta = (params.tariff_delta_pct || 0) / 100;
    const availDelta = (params.availability_delta_pct || 0) / 100;
    const capexDelta = (params.capex_delta_pct || 0) / 100;
    for (const p of (projs.results || [])) {
      const baseRev = (p.capacity_mw || 0) * 8760 * 0.27 * (p.ppa_tariff_zar_mwh || 1100);
      const shockedRev = baseRev * (1 + tariffDelta + availDelta);
      const shockedCapex = (p.total_capex_zar || 0) * (1 + capexDelta);
      const baseVal = baseRev - (p.total_capex_zar || 0) / 20;
      const shocked = shockedRev - shockedCapex / 20;
      baseValue += baseVal; shockedValue += shocked;
      const var_ = Math.abs(shocked - baseVal);
      if (var_ > worstVar) { worstVar = var_; worstEntity = p.name; }
      details.push({ entity: p.name, base: baseVal, shocked, var_zar: var_ });
    }
  } else if (scenario.domain === 'regulator_tariff' || scenario.domain === 'lender_credit' || scenario.domain === 'offtaker_demand') {
    // Generic — proportional to participant's exposure across contracts
    const contracts = await c.env.DB.prepare(`
      SELECT id, contract_value_zar, contract_type FROM contracts
      WHERE (counterparty_a_id = ? OR counterparty_b_id = ?) AND status = 'active'
    `).bind(user.id, user.id).all<any>();
    const delta = (params.annual_increase_pct ?? params.demand_delta_pct ?? params.deterioration === 'sudden' ? -0.20 : 0.05) / 100;
    for (const ct of (contracts.results || [])) {
      const baseVal = ct.contract_value_zar || 0;
      const shocked = baseVal * (1 + delta);
      baseValue += baseVal; shockedValue += shocked;
      const var_ = Math.abs(shocked - baseVal);
      if (var_ > worstVar) { worstVar = var_; worstEntity = ct.id; }
      details.push({ entity: ct.id, base: baseVal, shocked, var_zar: var_ });
    }
  }

  const var_ = Math.abs(shockedValue - baseValue);
  const pctChange = baseValue > 0 ? ((shockedValue - baseValue) / baseValue) * 100 : 0;

  const id = rid('psr');
  await c.env.DB.prepare(`
    INSERT INTO platform_scenario_runs (id, participant_id, scenario_code, domain, horizon_unit, horizon_value,
      base_value_zar, shocked_value_zar, value_at_risk_zar, pct_change, worst_entity, worst_entity_var_zar, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, scenario_code, scenario.domain, hu, hv,
    baseValue, shockedValue, var_, pctChange, worstEntity, worstVar, JSON.stringify(details)).run();

  return c.json({ success: true, data: {
    id, scenario_code, domain: scenario.domain, base_value_zar: baseValue, shocked_value_zar: shockedValue,
    value_at_risk_zar: var_, pct_change: pctChange, worst_entity: worstEntity, worst_entity_var_zar: worstVar,
    details,
  }}, 201);
});

// ─── Hash-chain audit — domain-tagged ──────────────────────────────────

platform.post('/audit-chain/append', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { domain, entity_table, entity_id, operation, payload } = body;
  if (!entity_table || !entity_id || !operation) {
    return c.json({ success: false, error: 'entity_table, entity_id, operation required' }, 400);
  }
  const last = await c.env.DB.prepare(
    `SELECT sequence_no, this_hash FROM audit_chain WHERE tenant_id = 'default' ORDER BY sequence_no DESC LIMIT 1`
  ).first<any>();
  const seq = (last?.sequence_no || 0) + 1;
  const prev = last?.this_hash || 'genesis';
  const payloadJson = JSON.stringify(payload || {});
  const hash = await sha256Hex(`${prev}|${entity_table}|${entity_id}|${operation}|${payloadJson}`);
  const id = rid('ach');
  await c.env.DB.prepare(`
    INSERT INTO audit_chain (id, participant_id, sequence_no, entity_table, entity_id, operation,
      actor_id, payload_json, prev_hash, this_hash, domain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, seq, entity_table, entity_id, operation, user.id, payloadJson, prev, hash, domain ?? null).run();
  return c.json({ success: true, data: { id, sequence_no: seq, this_hash: hash } }, 201);
});

platform.get('/audit-chain', async (c) => {
  const limit = Math.min(500, Number(c.req.query('limit')) || 100);
  const domain = c.req.query('domain');
  const sql = `SELECT * FROM audit_chain WHERE tenant_id = 'default'${domain ? ' AND domain = ?' : ''} ORDER BY sequence_no DESC LIMIT ?`;
  const binds: any[] = []; if (domain) binds.push(domain); binds.push(limit);
  const r = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: r.results || [] });
});

// ─── Cross-module anomaly detection ────────────────────────────────────

platform.get('/anomalies', async (c) => {
  const user = getCurrentUser(c);
  const domain = c.req.query('domain');
  const status = c.req.query('status') || 'open';
  const sql = `SELECT * FROM platform_anomaly_flags
               WHERE participant_id = ? AND status = ?${domain ? ' AND domain = ?' : ''}
               ORDER BY detected_at DESC LIMIT 200`;
  const binds: any[] = [user.id, status]; if (domain) binds.push(domain);
  const r = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ success: true, data: r.results || [] });
});

platform.post('/anomalies', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const { domain, entity_table, entity_id, rule, severity, detail, expected_value, observed_value } = body;
  if (!domain || !rule) return c.json({ success: false, error: 'domain and rule required' }, 400);
  const id = rid('panf');
  await c.env.DB.prepare(`
    INSERT INTO platform_anomaly_flags (id, participant_id, domain, entity_table, entity_id,
      rule, severity, detail, expected_value, observed_value)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, domain, entity_table ?? null, entity_id ?? null, rule,
    severity ?? 'medium', detail ?? null, expected_value ?? null, observed_value ?? null).run();
  return c.json({ success: true, data: { id } }, 201);
});

platform.post('/anomalies/scan', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as any));
  const domain = body.domain || 'all';
  const flagged: any[] = [];

  if (domain === 'all' || domain === 'trading') {
    // Wash-trade detection: same participant on both sides within 5 minutes
    const washes = await c.env.DB.prepare(`
      SELECT a.id AS a_id, b.id AS b_id, a.price
      FROM trade_fills a JOIN trade_fills b ON a.id != b.id
      WHERE a.buyer_id = b.seller_id AND a.seller_id = b.buyer_id
        AND a.buyer_id = ?
        AND abs(julianday(a.executed_at) - julianday(b.executed_at)) < 0.0035
      LIMIT 50
    `).bind(user.id).all<any>().catch(() => ({ results: [] as any[] }));
    for (const w of (washes.results || [])) {
      const id = rid('panf');
      await c.env.DB.prepare(`
        INSERT OR IGNORE INTO platform_anomaly_flags
          (id, participant_id, domain, entity_table, entity_id, rule, severity, detail, observed_value)
        VALUES (?, ?, 'trading', 'trade_fills', ?, 'wash_trade', 'high', ?, ?)
      `).bind(id, user.id, w.b_id, `Possible wash trade: fill ${w.a_id} <-> ${w.b_id}`, w.price).run();
      flagged.push({ id, rule: 'wash_trade' });
    }
  }

  if (domain === 'all' || domain === 'invoice') {
    // Duplicate invoice: same counterparty + amount + month
    const dupes = await c.env.DB.prepare(`
      SELECT a.id AS a_id, b.id AS b_id, a.total_zar
      FROM invoices a JOIN invoices b
        ON a.participant_id = b.participant_id
       AND a.counterparty_id = b.counterparty_id
       AND substr(a.issued_at,1,7) = substr(b.issued_at,1,7)
       AND abs(a.total_zar - b.total_zar) < 0.01
       AND a.id < b.id
      WHERE a.participant_id = ? LIMIT 100
    `).bind(user.id).all<any>().catch(() => ({ results: [] as any[] }));
    for (const d of (dupes.results || [])) {
      const id = rid('panf');
      await c.env.DB.prepare(`
        INSERT OR IGNORE INTO platform_anomaly_flags
          (id, participant_id, domain, entity_table, entity_id, rule, severity, detail, observed_value)
        VALUES (?, ?, 'invoice', 'invoices', ?, 'duplicate_invoice', 'high', ?, ?)
      `).bind(id, user.id, d.b_id, `Possible duplicate of invoice ${d.a_id}`, d.total_zar).run();
      flagged.push({ id, rule: 'duplicate_invoice' });
    }
  }

  if (domain === 'all' || domain === 'metering') {
    // Metering dropout: 0 readings for >24h on an active connection
    const dropouts = await c.env.DB.prepare(`
      SELECT c.id, MAX(m.reading_date) AS last_reading
      FROM grid_connections c
      LEFT JOIN metering_readings m ON m.connection_id = c.id
      WHERE c.participant_id = ? AND c.status = 'active'
      GROUP BY c.id
      HAVING last_reading IS NULL OR julianday('now') - julianday(last_reading) > 1
    `).bind(user.id).all<any>().catch(() => ({ results: [] as any[] }));
    for (const d of (dropouts.results || [])) {
      const id = rid('panf');
      await c.env.DB.prepare(`
        INSERT OR IGNORE INTO platform_anomaly_flags
          (id, participant_id, domain, entity_table, entity_id, rule, severity, detail)
        VALUES (?, ?, 'metering', 'grid_connections', ?, 'telemetry_dropout', 'medium', ?)
      `).bind(id, user.id, d.id, `No metering readings in last 24h for connection ${d.id}`).run();
      flagged.push({ id, rule: 'telemetry_dropout' });
    }
  }

  return c.json({ success: true, data: { flagged_count: flagged.length, domain, flagged } });
});

platform.patch('/anomalies/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({} as any));
  if (!['open','investigating','dismissed','resolved'].includes(body.status)) {
    return c.json({ success: false, error: 'status must be open|investigating|dismissed|resolved' }, 400);
  }
  await c.env.DB.prepare(`
    UPDATE platform_anomaly_flags
    SET status = ?, resolved_at = CASE WHEN ? IN ('dismissed','resolved') THEN datetime('now') ELSE resolved_at END,
        resolved_by = ?
    WHERE id = ? AND participant_id = ?
  `).bind(body.status, body.status, user.id, id, user.id).run();
  return c.json({ success: true });
});

// ─── Cross-module headline summary ─────────────────────────────────────

platform.get('/summary', async (c) => {
  const user = getCurrentUser(c);
  const [openAnom, scenRuns, aiClass, audit] = await Promise.all([
    c.env.DB.prepare(`SELECT domain, COUNT(*) AS n FROM platform_anomaly_flags WHERE participant_id = ? AND status = 'open' GROUP BY domain`).bind(user.id).all(),
    c.env.DB.prepare(`SELECT domain, COUNT(*) AS n FROM platform_scenario_runs WHERE participant_id = ? GROUP BY domain`).bind(user.id).all(),
    c.env.DB.prepare(`SELECT domain, COUNT(*) AS n, AVG(confidence) AS avg_conf FROM platform_ai_logs WHERE participant_id = ? GROUP BY domain`).bind(user.id).all(),
    c.env.DB.prepare(`SELECT domain, COUNT(*) AS n FROM audit_chain WHERE participant_id = ? GROUP BY domain`).bind(user.id).all(),
  ]);
  return c.json({ success: true, data: {
    anomalies_by_domain: openAnom.results || [],
    scenarios_by_domain: scenRuns.results || [],
    ai_classifications_by_domain: aiClass.results || [],
    audit_chain_by_domain: audit.results || [],
  }});
});

export default platform;
