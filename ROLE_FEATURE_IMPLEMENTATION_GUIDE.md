# Role-Specific Feature Implementation Guide

This document provides detailed implementation guidance for each role to support national-level operations.

---

## 1. ADMIN ROLE — Platform Governance

### Required Features for National Scale

#### 1.1 Role Permission Matrix (Configurable)

```typescript
// File: src/routes/admin.ts (new endpoint)

admin.post('/role-permissions/manage', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ error: 'Admin only' }, 403);

  const { roleId, resource, action, condition } = await c.req.json();
  
  // roleId: 'ipp_developer', 'trader', 'regulator', etc.
  // resource: 'trading:orders', 'contracts:sign', 'settlement:approve'
  // action: 'read', 'write', 'delete', 'approve'
  // condition: 'owner_only', 'tenant_only', 'none'
  
  await c.env.DB.prepare(`
    INSERT INTO role_permissions (id, role, resource, action, condition, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    genId('rp'),
    roleId,
    resource,
    action,
    condition,
  ).run();
  
  return c.json({ success: true });
});

// Enforcement middleware
export async function checkPermission(
  env: HonoEnv,
  user: JWTPayload,
  resource: string,
  action: string,
  context?: { owner_id?: string; tenant_id?: string }
) {
  const perm = await env.DB.prepare(`
    SELECT * FROM role_permissions
    WHERE role = ? AND resource = ? AND action = ?
  `).bind(user.role, resource, action).first();
  
  if (!perm) return false;
  
  if (perm.condition === 'owner_only' && context?.owner_id !== user.sub) return false;
  if (perm.condition === 'tenant_only' && context?.tenant_id !== user.tenant_id) return false;
  
  return true;
}
```

#### 1.2 Feature Flags (A/B Testing)

```typescript
admin.post('/feature-flags/toggle', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ error: 'Admin only' }, 403);

  const { flag_name, enabled, rollout_percentage } = await c.req.json();
  
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO feature_flags 
    (id, flag_name, enabled, rollout_percentage, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(genId('ff'), flag_name, enabled, rollout_percentage).run();
  
  return c.json({ success: true });
});

// Check if feature enabled for user
export async function isFeatureEnabled(
  env: HonoEnv,
  userId: string,
  flagName: string,
): Promise<boolean> {
  const flag = await env.DB.prepare(`
    SELECT * FROM feature_flags WHERE flag_name = ?
  `).bind(flagName).first();
  
  if (!flag?.enabled) return false;
  
  // Percentage-based rollout: hash user ID to get stable value [0-99]
  const hash = parseInt(userId.substring(0, 8), 36) % 100;
  return hash < (flag.rollout_percentage || 100);
}
```

#### 1.3 Bulk Operations

```typescript
admin.post('/bulk-import/users', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ error: 'Admin only' }, 403);

  const data = await c.req.json(); // CSV parsed to JSON
  const results = { success: 0, failed: 0, errors: [] };

  for (const row of data) {
    try {
      const id = genId('p');
      await c.env.DB.prepare(`
        INSERT INTO participants 
        (id, email, name, company_name, role, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))
      `).bind(id, row.email, row.name, row.company_name, row.role).run();
      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push({ row: row.email, error: (err as Error).message });
    }
  }

  return c.json(results);
});

admin.post('/bulk-kyc/approve', async (c) => {
  const { participant_ids } = await c.req.json();
  
  const stmt = await c.env.DB.prepare(`
    UPDATE participants 
    SET kyc_status = 'approved' 
    WHERE id IN (?, ?, ?, ...)
  `);
  
  // Batch in chunks to avoid timeout
  for (let i = 0; i < participant_ids.length; i += 100) {
    const batch = participant_ids.slice(i, i + 100);
    await stmt.bind(...batch).run();
  }

  return c.json({ success: true, approved: participant_ids.length });
});
```

#### 1.4 Billing/Invoicing Dashboard

```typescript
admin.get('/billing/dashboard', async (c) => {
  const period = c.req.query('period') || 'month'; // 'day', 'week', 'month', 'year'
  
  const mau = await c.env.DB.prepare(`
    SELECT COUNT(DISTINCT id) as mau
    FROM participants
    WHERE last_login >= datetime('now', '-1 month')
  `).first();

  const subscription_breakdown = await c.env.DB.prepare(`
    SELECT subscription_tier, COUNT(*) as count
    FROM participants
    WHERE status = 'active'
    GROUP BY subscription_tier
  `).all();

  const revenue = await c.env.DB.prepare(`
    SELECT 
      subscription_tier,
      COUNT(*) * tier_price as monthly_recurring_revenue
    FROM (
      SELECT subscription_tier, 
        CASE 
          WHEN subscription_tier = 'free' THEN 0
          WHEN subscription_tier = 'starter' THEN 99
          WHEN subscription_tier = 'professional' THEN 499
          WHEN subscription_tier = 'enterprise' THEN 1999
        END as tier_price
      FROM participants
      WHERE status = 'active'
    )
    GROUP BY subscription_tier
  `).all();

  return c.json({ mau, subscription_breakdown, revenue });
});
```

---

## 2. REGULATOR ROLE — Compliance & Market Oversight

### Required Features for National Scale

#### 2.1 Real-Time Market Monitoring

```typescript
// File: src/routes/regulator.ts (enhancements)

regulator.get('/market-snapshot', async (c) => {
  const now = new Date().toISOString();
  
  const snapshot = await c.env.DB.prepare(`
    WITH hourly_data AS (
      SELECT 
        DATE_TRUNC('hour', tm.matched_at) as hour,
        COUNT(*) as match_count,
        SUM(tm.matched_volume_mwh) as total_mwh,
        AVG(tm.matched_price) as avg_price,
        MIN(tm.matched_price) as min_price,
        MAX(tm.matched_price) as max_price,
        STDDEV(tm.matched_price) as price_volatility
      FROM trade_matches tm
      WHERE tm.matched_at >= now - interval '24 hours'
      GROUP BY hour
    )
    SELECT * FROM hourly_data
    ORDER BY hour DESC
    LIMIT 24
  `).all();

  // Calculate HHI (Herfindahl-Hirschman Index)
  const marketShares = await c.env.DB.prepare(`
    SELECT 
      tp.id,
      tp.name,
      SUM(tm.matched_volume_mwh) as total_volume,
      SUM(tm.matched_volume_mwh) / 
        (SELECT SUM(matched_volume_mwh) FROM trade_matches WHERE matched_at >= now - interval '1 day')
      as market_share
    FROM participants tp
    JOIN trade_matches tm ON (tp.id = tm.buy_order_id OR tp.id = tm.sell_order_id)
    WHERE tm.matched_at >= now - interval '1 day'
    GROUP BY tp.id, tp.name
    ORDER BY total_volume DESC
  `).all();

  const hhi = marketShares
    .map((s: any) => Math.pow(s.market_share * 100, 2))
    .reduce((a: number, b: number) => a + b, 0);

  return c.json({
    timestamp: now,
    hourly_data: snapshot.results,
    market_concentration: {
      hhi_index: hhi,
      top_5_share: marketShares.slice(0, 5)
        .reduce((sum: number, s: any) => sum + s.market_share, 0),
      participant_count: marketShares.length,
    },
  });
});
```

#### 2.2 Compliance Violation Detection

```typescript
regulator.post('/detect-violations', async (c) => {
  const violations = [];

  // Check 1: Price manipulation (>20% change in 1 hour)
  const priceSwings = await c.env.DB.prepare(`
    WITH hourly_prices AS (
      SELECT 
        DATE_TRUNC('hour', matched_at) as hour,
        AVG(matched_price) as avg_price,
        LAG(AVG(matched_price)) OVER (ORDER BY DATE_TRUNC('hour', matched_at)) as prev_price
      FROM trade_matches
      WHERE matched_at >= now - interval '7 days'
      GROUP BY hour
    )
    SELECT *
    FROM hourly_prices
    WHERE prev_price > 0 AND ABS((avg_price - prev_price) / prev_price) > 0.20
  `).all();

  violations.push(...priceSwings.results?.map((row: any) => ({
    type: 'price_manipulation',
    severity: 'high',
    evidence: row,
  })) || []);

  // Check 2: Bid rigging (identical bids from competitors)
  const identicalBids = await c.env.DB.prepare(`
    SELECT 
      to1.participant_id as trader_1,
      to2.participant_id as trader_2,
      to1.price_max as price,
      COUNT(*) as identical_count
    FROM trade_orders to1
    JOIN trade_orders to2 ON 
      to1.price_max = to2.price_max 
      AND to1.volume_mwh = to2.volume_mwh
      AND to1.participant_id != to2.participant_id
      AND to1.created_at BETWEEN to2.created_at AND to2.created_at + interval '1 minute'
    WHERE to1.created_at >= now - interval '7 days'
    GROUP BY trader_1, trader_2, price
    HAVING COUNT(*) > 5
  `).all();

  violations.push(...identicalBids.results?.map((row: any) => ({
    type: 'bid_rigging',
    severity: 'critical',
    traders: [row.trader_1, row.trader_2],
    evidence: row,
  })) || []);

  // Store violations for investigation
  for (const v of violations) {
    await c.env.DB.prepare(`
      INSERT INTO compliance_violations 
      (id, violation_type, severity, description, evidence, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'flagged', datetime('now'))
    `).bind(genId('cv'), v.type, v.severity, JSON.stringify(v), JSON.stringify(v.evidence)).run();
  }

  return c.json({ violations_detected: violations.length, violations });
});
```

#### 2.3 Automated Reporting to NERSA

```typescript
regulator.post('/submit-to-nersa', async (c) => {
  const periodEnd = c.req.query('period') || new Date().toISOString().split('T')[0];
  
  // Generate NERSA weekly market report
  const report = {
    reporting_period: periodEnd,
    market_summary: {
      total_trades: await getMetric(c.env, 'total_trades', periodEnd),
      total_volume_mwh: await getMetric(c.env, 'total_volume_mwh', periodEnd),
      average_price: await getMetric(c.env, 'average_price', periodEnd),
      price_range: await getMetric(c.env, 'price_range', periodEnd),
      participant_count: await getMetric(c.env, 'active_traders', periodEnd),
    },
    concentration_analysis: {
      hhi: await getMetric(c.env, 'hhi', periodEnd),
      top_3_share: await getMetric(c.env, 'top_3_share', periodEnd),
    },
    liquidity_metrics: {
      bid_ask_spread: await getMetric(c.env, 'bid_ask_spread', periodEnd),
      order_book_depth: await getMetric(c.env, 'order_book_depth', periodEnd),
    },
    compliance_status: {
      violations_detected: await getMetric(c.env, 'violations', periodEnd),
      breaches_resolved: await getMetric(c.env, 'breaches_resolved', periodEnd),
    },
  };

  // Submit to NERSA API (if available)
  // const response = await fetch('https://nersa.org.za/api/market-reports', {
  //   method: 'POST',
  //   body: JSON.stringify(report),
  // });

  // Store for audit trail
  await c.env.DB.prepare(`
    INSERT INTO regulator_filings_store 
    (id, participant_id, filing_type, title, period_start, period_end, body_json, status, submitted_at, created_at)
    VALUES (?, ?, 'nersa_weekly', ?, ?, ?, ?, 'submitted', datetime('now'), datetime('now'))
  `).bind(
    genId('rf'),
    c.get('auth').user.id,
    'NERSA Weekly Market Report',
    new Date(periodEnd).toISOString(),
    periodEnd,
    JSON.stringify(report),
  ).run();

  return c.json({ success: true, report });
});
```

---

## 3. GRID OPERATOR ROLE — Real-Time Grid Management

### Required Features for National Scale

#### 3.1 Real-Time Dispatch Dashboard

```typescript
// File: src/routes/grid.ts (new endpoints)

grid.get('/real-time/status', async (c) => {
  const status = await c.env.DB.prepare(`
    SELECT 
      SUM(active_power_mw) as total_generation_mw,
      SUM(CASE WHEN node_type = 'demand' THEN active_power_mw ELSE 0 END) as total_demand_mw,
      AVG(frequency_hz) as avg_frequency,
      AVG(voltage_pu) as avg_voltage,
      MAX(reactive_power_mvar) as max_reactive_power,
      COUNT(*) as total_nodes,
      SUM(CASE WHEN status = 'alert' THEN 1 ELSE 0 END) as alerts_count
    FROM grid_nodes
    WHERE last_updated >= datetime('now', '-5 minutes')
  `).first();

  return c.json(status);
});

grid.post('/dispatch/command', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'grid_operator' && user.role !== 'admin') {
    return c.json({ error: 'Grid operator access required' }, 403);
  }

  const { node_id, command, value, duration_minutes } = await c.req.json();
  // command: 'reduce_output', 'increase_output', 'load_shedding', 'connect', 'disconnect'

  // Validate against grid constraints
  const node = await c.env.DB.prepare(
    'SELECT * FROM grid_nodes WHERE id = ?'
  ).bind(node_id).first();

  if (!node) return c.json({ error: 'Node not found' }, 404);

  // Execute command
  const id = genId('cmd');
  await c.env.DB.prepare(`
    INSERT INTO grid_dispatch_commands 
    (id, node_id, operator_id, command, value, duration_minutes, status, executed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'executed', datetime('now'), datetime('now'))
  `).bind(id, node_id, user.id, command, value, duration_minutes).run();

  // TODO: Send SCADA command to physical device
  // await sendSCADACommand(node_id, command, value);

  return c.json({ success: true, command_id: id });
});
```

#### 3.2 Metering Data Ingestion Pipeline

```typescript
// File: src/routes/metering.ts (enhancements)

metering.post('/ingest/bulk', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'offtaker' && user.role !== 'grid_operator' && user.role !== 'admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const readings = await c.req.json(); // Array of { site_id, timestamp, kwh, temperature }

  // Use Cloudflare Queue for async processing (prevents timeout on large batches)
  const queue = c.env.METERING_QUEUE;
  
  const batch_id = genId('batch');
  await queue.send({
    type: 'meter_readings',
    batch_id,
    readings,
    submitted_by: user.id,
    submitted_at: new Date().toISOString(),
  });

  return c.json({ success: true, batch_id, reading_count: readings.length });
});

// Consumer: process metering data from queue
export async function handleMeteringBatch(env: HonoEnv, batch: any) {
  const { batch_id, readings } = batch;
  const results = { inserted: 0, errors: 0 };

  // Bulk insert with batching to avoid memory overflow
  const BATCH_SIZE = 1000;
  for (let i = 0; i < readings.length; i += BATCH_SIZE) {
    const chunk = readings.slice(i, i + BATCH_SIZE);
    
    const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(',');
    const values = chunk.flatMap(r => [
      genId('mr'),
      r.site_id,
      r.timestamp,
      r.kwh,
    ]);

    try {
      await env.DB.prepare(`
        INSERT INTO metering_data (id, site_id, timestamp, kwh_consumed, created_at)
        VALUES ${placeholders}
      `).bind(...values).run();
      results.inserted += chunk.length;
    } catch (err) {
      results.errors++;
      console.error(`Metering batch ${batch_id} error:`, err);
    }
  }

  // Log completion
  await env.DB.prepare(`
    INSERT INTO metering_batch_log (id, batch_id, inserted, errors, completed_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(genId('bl'), batch_id, results.inserted, results.errors).run();

  return results;
}
```

---

## 4. IPP DEVELOPER ROLE — Project Lifecycle Management

#### 4.1 Financial Modeling

```typescript
// File: src/utils/financial-modeling.ts

export interface ProjectFinancials {
  capex_total: number;
  opex_annual: number;
  useful_life_years: number;
  wacc: number; // Weighted Average Cost of Capital
  ppa_volume_mwh: number;
  ppa_price: number;
}

export function calculateNPV(
  cashflows: number[],
  discountRate: number,
): number {
  return cashflows.reduce((npv, cf, year) => 
    npv + cf / Math.pow(1 + discountRate, year)
  , 0);
}

export function calculateIRR(cashflows: number[], initialGuess = 0.1): number {
  let rate = initialGuess;
  for (let i = 0; i < 100; i++) {
    const npv = calculateNPV(cashflows, rate);
    const derivative = cashflows.reduce((sum, cf, year) =>
      sum - (year * cf) / Math.pow(1 + rate, year + 1)
    , 0);
    const newRate = rate - npv / derivative;
    if (Math.abs(newRate - rate) < 1e-6) return rate;
    rate = newRate;
  }
  return rate;
}

export function projectCashflows(financials: ProjectFinancials): number[] {
  const cf = [-financials.capex_total]; // Year 0: Capital investment

  for (let year = 1; year <= financials.useful_life_years; year++) {
    const revenue = financials.ppa_volume_mwh * financials.ppa_price;
    const opex = financials.opex_annual * (1.02 ** year); // 2% annual escalation
    cf.push(revenue - opex);
  }

  return cf;
}

// Usage in route
ipp.post('/project/:id/financial-model', async (c) => {
  const projectId = c.req.param('id');
  const input = await c.req.json();

  const cf = projectCashflows(input);
  const npv = calculateNPV(cf, input.wacc);
  const irr = calculateIRR(cf);
  const payback = cf.reduce((year, sum) => {
    if (sum < 0) return year + 1;
    return year;
  }, 0);

  return c.json({ npv, irr, payback_years: payback, cashflows: cf });
});
```

---

## 5. LENDER ROLE — Covenant Management

#### 5.1 Automated Covenant Monitoring

```typescript
// File: src/utils/covenant-monitoring.ts

export async function checkCovenants(env: HonoEnv, projectId: string) {
  const covenants = await env.DB.prepare(`
    SELECT * FROM loan_covenants
    WHERE project_id = ? AND status = 'active'
  `).bind(projectId).all();

  const breaches = [];

  for (const c of covenants.results || []) {
    let currentValue: number | null = null;

    if (c.covenant_type === 'debt_service_coverage_ratio') {
      currentValue = await calculateDSCR(env, projectId);
      if (currentValue < c.threshold_value) {
        breaches.push({
          covenant_id: c.id,
          type: 'DSCR',
          threshold: c.threshold_value,
          current: currentValue,
          status: 'BREACH',
        });
      }
    } else if (c.covenant_type === 'interest_coverage_ratio') {
      currentValue = await calculateICR(env, projectId);
      if (currentValue < c.threshold_value) {
        breaches.push({
          covenant_id: c.id,
          type: 'ICR',
          threshold: c.threshold_value,
          current: currentValue,
          status: 'BREACH',
        });
      }
    }
  }

  // If breaches detected, notify lender
  if (breaches.length > 0) {
    await notifyLenderBreach(env, projectId, breaches);
  }

  return breaches;
}

async function notifyLenderBreach(env: HonoEnv, projectId: string, breaches: any[]) {
  const project = await env.DB.prepare(
    'SELECT * FROM ipp_projects WHERE id = ?'
  ).bind(projectId).first();

  // Send email/webhook to lender
  console.log(`COVENANT BREACH: Project ${projectId}`, breaches);
}
```

---

## 6. TRADER ROLE — Advanced Order Types

#### 6.1 TWAP (Time-Weighted Average Price) Orders

```typescript
// File: src/utils/trading-algorithms.ts

export interface TWAPOrder {
  base_order_id: string;
  total_quantity: number;
  start_time: string;
  end_time: string;
  num_slices: number;
}

export async function executeTWAPOrder(env: HonoEnv, twap: TWAPOrder) {
  const sliceSize = twap.total_quantity / twap.num_slices;
  const totalMinutes = 
    (new Date(twap.end_time).getTime() - new Date(twap.start_time).getTime()) / 60000;
  const intervalMinutes = totalMinutes / twap.num_slices;

  for (let i = 0; i < twap.num_slices; i++) {
    const nextExecTime = new Date(twap.start_time);
    nextExecTime.setMinutes(nextExecTime.getMinutes() + i * intervalMinutes);

    // Schedule order for execution
    await env.DB.prepare(`
      INSERT INTO scheduled_orders 
      (id, parent_order_id, slice_number, quantity, execute_at, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(genId('so'), twap.base_order_id, i, sliceSize, nextExecTime.toISOString()).run();
  }
}
```

---

## 7. CARBON FUND ROLE — Portfolio Management

#### 7.1 IFRS 13 Fair Value Calculation

```typescript
// File: src/utils/carbon-valuation.ts

export interface CarbonHolding {
  credit_type: string; // 'CER', 'VER', 'EUA'
  vintage_year: number;
  quantity: number;
  cost_basis: number;
}

export async function calculatePortfolioNAV(holdings: CarbonHolding[]): Promise<number> {
  let totalNav = 0;

  for (const h of holdings) {
    // Use market prices as primary valuation (Level 1: Observable Market Prices)
    const marketPrice = await getMarketPrice(h.credit_type, h.vintage_year);
    
    if (marketPrice) {
      totalNav += h.quantity * marketPrice;
    } else {
      // Fallback: Use cost basis (Level 3: Unobservable Inputs)
      totalNav += h.quantity * h.cost_basis;
    }
  }

  return totalNav;
}

export async function getMarketPrice(creditType: string, vintageYear: number): Promise<number | null> {
  // Query recent trades for this vintage
  const recent = await DB.prepare(`
    SELECT AVG(price_per_tco2) as avg_price
    FROM carbon_trades
    WHERE credit_type = ? AND vintage_year = ?
      AND created_at >= datetime('now', '-7 days')
      AND status = 'settled'
  `).bind(creditType, vintageYear).first();

  return recent?.avg_price || null;
}
```

---

## 8. OFFTAKER ROLE — Consumption Analytics

#### 8.1 Time-Series Forecasting

```typescript
// File: src/utils/consumption-forecast.ts

export async function forecastConsumption(
  historicalData: { timestamp: string; kwh: number }[],
  daysAhead: number = 7,
): Promise<number[]> {
  // Simple exponential smoothing with trend
  const alpha = 0.3; // Smoothing factor
  const beta = 0.1;  // Trend factor

  let level = historicalData[0].kwh;
  let trend = (historicalData[1].kwh - historicalData[0].kwh) / 1;

  const forecast: number[] = [];

  for (let i = 0; i < daysAhead; i++) {
    const predicted = level + (i + 1) * trend;
    forecast.push(Math.max(0, predicted)); // Consumption can't be negative

    // Update estimates if actual data available
    if (i < historicalData.length) {
      const actual = historicalData[i].kwh;
      const prevLevel = level;
      level = alpha * actual + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }
  }

  return forecast;
}

// Usage in route
offtaker.get('/forecast/:deliveryPointId', async (c) => {
  const dpId = c.req.param('deliveryPointId');
  
  const history = await c.env.DB.prepare(`
    SELECT timestamp, kwh_consumed
    FROM metering_data
    WHERE site_id = ?
    ORDER BY timestamp DESC
    LIMIT 30
  `).bind(dpId).all();

  const forecast = await forecastConsumption(
    history.results || [],
    7
  );

  return c.json({ forecast, unit: 'kwh', days: 7 });
});
```

---

## 9. SUPPORT ROLE — Ticket Management

#### 9.1 Ticketing System

```typescript
support.post('/tickets', async (c) => {
  const user = getCurrentUser(c);
  const { subject, description, priority } = await c.req.json();

  const ticket_id = genId('tkt');
  await c.env.DB.prepare(`
    INSERT INTO support_tickets 
    (id, participant_id, subject, description, priority, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', datetime('now'))
  `).bind(ticket_id, user.id, subject, description, priority).run();

  return c.json({ ticket_id, status: 'open', created_at: new Date().toISOString() });
});

support.get('/tickets/:ticketId', async (c) => {
  const ticketId = c.req.param('ticketId');
  const user = getCurrentUser(c);

  const ticket = await c.env.DB.prepare(`
    SELECT * FROM support_tickets
    WHERE id = ? AND (participant_id = ? OR ? = 'support' OR ? = 'admin')
  `).bind(ticketId, user.id, user.role, user.role).first();

  if (!ticket) return c.json({ error: 'Not found' }, 404);

  return c.json(ticket);
});
```

---

This guide provides implementation details for scaling each role to national deployment levels. Each feature should be tested thoroughly before rollout.
