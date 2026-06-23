# Database Schema & Infrastructure Recommendations

This document outlines critical database schema additions and infrastructure changes needed for national deployment.

---

## 1. DATABASE MIGRATION STRATEGY

### 1.1 Current State
- **Database:** D1 (Cloudflare SQLite)
- **Limit:** 10GB per database
- **Replication:** Within Cloudflare (single region)
- **Backups:** Manual via `/api/backup`

### 1.2 Target State (National Deployment)
- **Primary Database:** PostgreSQL 14+ (AWS RDS, Railway, or self-managed)
- **Replication:** Multi-region (Primary in Johannesburg, Read replicas in Cape Town & Durban)
- **Backup:** Automated daily snapshots + continuous WAL archiving
- **Time-Series Data:** TimescaleDB extension (for metering, grid monitoring)
- **Cache:** Redis (session management, distributed locks)

### 1.3 Migration Roadmap

**Phase 1: Preparation (Week 1)**
```bash
# Step 1: Set up PostgreSQL database
- Provision RDS PostgreSQL 14.7 (multi-AZ enabled) in ap-south-1 (Mumbai/closer to JNB)
- Configure backup retention: 30 days automated + 1 monthly snapshot
- Enable Enhanced Monitoring
- Set up Parameter Group with optimization settings

# Step 2: Set up read replicas
- Replica 1: Same region (for failover, <100ms)
- Replica 2: Cape Town region (for geographic diversity)
- Replica 3: Durban region (for grid operator local reading)

# Step 3: Set up TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For text search
```

**Phase 2: Schema Migration (Week 2-3)**
```typescript
// Create PostgreSQL schema from D1 migrations
// Handle differences:
// 1. TEXT PRIMARY KEY → UUID or BIGSERIAL
// 2. datetime('now') → CURRENT_TIMESTAMP
// 3. CASE statements → PostGres equivalents
// 4. No JSON_EXTRACT → Use JSONB operators

// Example migration script
const d1Schema = readFile('migrations/*.sql');
const pgSchema = d1Schema
  .replace(/TEXT PRIMARY KEY/g, 'UUID PRIMARY KEY DEFAULT gen_random_uuid()')
  .replace(/datetime\('now'\)/g, 'CURRENT_TIMESTAMP')
  .replace(/CAST\((\w+) AS INTEGER\)/g, '($1)::INTEGER');

await postgresClient.query(pgSchema);
```

**Phase 3: Data Migration (Week 3-4)**
```typescript
// Step 1: Export all data from D1
const d1Data = await d1Client.executeQuery('SELECT * FROM participants');

// Step 2: Transform data for PostgreSQL (handle NULL, JSON types)
const pgData = d1Data.map(row => ({
  ...row,
  created_at: new Date(row.created_at),
  metadata: JSON.stringify(row.metadata || {}),
}));

// Step 3: Bulk insert into PostgreSQL
const pgClient = new PG.Client(postgresUrl);
await pgClient.connect();

for (const table of tables) {
  const data = d1Data[table];
  const batchSize = 1000;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await pgClient.query(
      `INSERT INTO ${table} (...) VALUES (...)`
    );
  }
}

// Step 4: Verify data consistency
const d1Count = await d1Client.query('SELECT COUNT(*) FROM participants');
const pgCount = await pgClient.query('SELECT COUNT(*) FROM participants');
assert(d1Count === pgCount);
```

**Phase 4: Validation & Testing (Week 4-5)**
```typescript
// Run comprehensive tests
- Unit tests: Each table, each query
- Integration tests: End-to-end workflows
- Performance tests: Query latency, throughput
- Data validation: Compare D1 vs PG results
- Failover tests: Read replica promotion
```

**Phase 5: Cutover (Week 6)**
```typescript
// Traffic migration strategy
- Day 1: 10% traffic → PostgreSQL, 90% → D1
- Day 2: 50% traffic → PostgreSQL, 50% → D1
- Day 3: 100% traffic → PostgreSQL
- Keep D1 as warm standby for 1 month

// Rollback plan
- If PG error rate > 1%, immediately route back to D1
- Have D1 data synchronized in real-time (dual-write during cutover)
```

---

## 2. CRITICAL SCHEMA ADDITIONS

### 2.1 Time-Series Tables (for metering & grid)

```sql
-- Create TimescaleDB hypertable for metering
CREATE TABLE metering_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  kwh_consumed DECIMAL(12, 3) NOT NULL,
  temperature_c DECIMAL(5, 2),
  humidity_pct DECIMAL(5, 2),
  weather_condition TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

SELECT create_hypertable(
  'metering_data',
  'timestamp',
  if_not_exists => TRUE,
  chunk_time_interval => interval '1 day'
);

-- Index for common queries
CREATE INDEX idx_metering_site_time 
  ON metering_data (site_id, timestamp DESC);

-- Grid nodes (real-time, high frequency)
CREATE TABLE grid_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_name TEXT NOT NULL,
  nominal_voltage_kv DECIMAL(8, 2) NOT NULL,
  frequency_hz DECIMAL(6, 3),
  voltage_pu DECIMAL(6, 4), -- per-unit
  active_power_mw DECIMAL(10, 2),
  reactive_power_mvar DECIMAL(10, 2),
  status TEXT DEFAULT 'normal',
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Grid constraints (thermal limits, voltage ranges)
CREATE TABLE grid_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constraint_type TEXT NOT NULL, -- 'thermal_limit', 'voltage_limit', 'frequency_limit'
  affected_nodes TEXT[] NOT NULL, -- Array of node IDs
  limit_value DECIMAL(10, 2) NOT NULL,
  current_value DECIMAL(10, 2),
  status TEXT DEFAULT 'normal', -- 'normal', 'warning', 'critical'
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_grid_constraints_status 
  ON grid_constraints (status) WHERE status != 'normal';
```

### 2.2 Settlement & Netting Tables

```sql
-- Settlement state machine
CREATE TABLE settlement_state_machine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL UNIQUE REFERENCES trade_matches(id),
  current_state TEXT DEFAULT 'pending', 
  -- States: pending → released → in_settlement → settled → confirmed → closed
  buyer_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  buyer_confirmed BOOLEAN DEFAULT FALSE,
  seller_confirmed BOOLEAN DEFAULT FALSE,
  buyer_confirmed_at TIMESTAMPTZ,
  seller_confirmed_at TIMESTAMPTZ,
  settlement_deadline TIMESTAMPTZ NOT NULL,
  settlement_error TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Settlement netting (aggregate positions)
CREATE TABLE settlement_netting (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  netting_period_date DATE NOT NULL,
  participant_a_id UUID NOT NULL REFERENCES participants(id),
  participant_b_id UUID NOT NULL REFERENCES participants(id),
  gross_a_to_b DECIMAL(15, 2), -- Amount A owes B before netting
  gross_b_to_a DECIMAL(15, 2), -- Amount B owes A before netting
  net_amount DECIMAL(15, 2), -- Positive = A pays B, Negative = B pays A
  status TEXT DEFAULT 'calculated', -- calculated, confirmed, settled, disputed
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Settlement disputes & appeals
CREATE TABLE settlement_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES trade_matches(id),
  initiating_party UUID NOT NULL REFERENCES participants(id),
  dispute_reason TEXT NOT NULL,
  supporting_evidence JSONB, -- Documents, invoices, etc.
  status TEXT DEFAULT 'open', -- open, under_review, resolved, escalated
  assigned_to UUID REFERENCES participants(id),
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### 2.3 Compliance & Regulatory Tables

```sql
-- Automated compliance checks
CREATE TABLE compliance_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id),
  violation_type TEXT NOT NULL,
  -- 'bid_rigging', 'price_manipulation', 'unfair_exclusion', 'market_abuse'
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  evidence JSONB, -- Structured evidence
  status TEXT DEFAULT 'flagged', -- flagged, under_investigation, confirmed, dismissed, resolved
  reviewed_by UUID REFERENCES participants(id),
  reviewed_at TIMESTAMPTZ,
  resolution TEXT,
  regulatory_case_id TEXT, -- Reference to Competition Commission
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_violations_status_severity 
  ON compliance_violations (status, severity);

-- Market concentration snapshot (HHI, top-N share)
CREATE TABLE market_concentration_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date TIMESTAMPTZ NOT NULL,
  period_type TEXT NOT NULL, -- 'hourly', 'daily', 'weekly', 'monthly'
  active_traders INTEGER,
  total_volume_mwh DECIMAL(15, 2),
  avg_price_per_mwh DECIMAL(10, 2),
  price_volatility DECIMAL(8, 4),
  hhi_index DECIMAL(8, 2), -- Herfindahl-Hirschman Index [0-10000]
  largest_trader_share DECIMAL(6, 3), -- Percentage [0-100]
  top_3_trader_share DECIMAL(6, 3),
  top_5_trader_share DECIMAL(6, 3),
  liquidity_score DECIMAL(6, 2), -- 0-100
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_concentration_snapshot 
  ON market_concentration_snapshot (snapshot_date DESC, period_type);
```

### 2.4 Audit & Compliance Logging

```sql
-- Immutable audit log (for compliance audit trails)
CREATE TABLE audit_log_immutable (
  id BIGSERIAL PRIMARY KEY, -- Use sequence, not UUID
  event_id UUID DEFAULT gen_random_uuid() UNIQUE,
  actor_id UUID NOT NULL REFERENCES participants(id),
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  status TEXT DEFAULT 'logged',
  -- Make immutable: no UPDATE, only INSERT
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Set immutability
ALTER TABLE audit_log_immutable 
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_append 
  ON audit_log_immutable
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY audit_log_no_delete
  ON audit_log_immutable
  FOR DELETE
  USING (false);

-- POPIA data subject rights tracking
CREATE TABLE popia_data_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_subject_id UUID NOT NULL REFERENCES participants(id),
  actor_id UUID NOT NULL REFERENCES participants(id),
  access_type TEXT NOT NULL, -- 'dsar_export', 'admin_view', 'support_view', 'impersonation'
  justification TEXT,
  data_accessed TEXT[], -- Array of column names accessed
  record_count INTEGER,
  accessed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_popia_access_subject 
  ON popia_data_access_log (data_subject_id, accessed_at DESC);
```

### 2.5 High-Volume Data Tables (optimize for bulk operations)

```sql
-- Trade history (append-only, partitioned by date)
CREATE TABLE trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES trade_matches(id),
  action TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES participants(id),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

-- Create partitions per month
CREATE TABLE trade_history_2024_01 PARTITION OF trade_history
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Error logs (high volume, queryable but not critical for transactions)
CREATE TABLE error_log (
  id BIGSERIAL PRIMARY KEY,
  req_id TEXT NOT NULL,
  source TEXT, -- 'server', 'client'
  severity TEXT,
  route TEXT,
  method TEXT,
  status INTEGER,
  participant_id UUID REFERENCES participants(id),
  tenant_id UUID,
  error_name TEXT,
  error_message TEXT,
  error_stack TEXT,
  user_agent TEXT,
  ip INET,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

-- Monthly partitions, auto-delete after 90 days
CREATE TABLE error_log_2024_01 PARTITION OF error_log
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

---

## 3. PERFORMANCE OPTIMIZATION INDEXES

```sql
-- Critical queries needing indexes

-- 1. Trading order matching
CREATE INDEX idx_trade_orders_market_match 
  ON trade_orders (energy_type, delivery_date, side) 
  WHERE status = 'open';

-- 2. Settlement lookup by participant
CREATE INDEX idx_trade_matches_participants 
  ON trade_matches (buy_order_id, sell_order_id, status);

-- 3. Invoice search by status
CREATE INDEX idx_invoices_participant_status 
  ON invoices (from_participant_id, status, created_at DESC);

-- 4. Contract queries
CREATE INDEX idx_contracts_tenant_status 
  ON contract_documents (tenant_id, phase, creator_id) 
  WHERE status IN ('active', 'amended');

-- 5. Project milestones
CREATE INDEX idx_milestones_project_status 
  ON project_milestones (project_id, status) 
  WHERE status IN ('pending', 'satisfied');

-- 6. Covenant monitoring
CREATE INDEX idx_covenants_project_active 
  ON loan_covenants (project_id, status) 
  WHERE status = 'active';

-- JSONB indexes for query optimization
CREATE INDEX idx_contract_terms_gin 
  ON contract_documents USING GIN (commercial_terms);

CREATE INDEX idx_audit_changes_gin 
  ON audit_log_immutable USING GIN (changes);

-- Full-text search indexes
CREATE INDEX idx_participants_search 
  ON participants USING GIN (to_tsvector('english', name || ' ' || company_name));
```

---

## 4. CACHING STRATEGY

### 4.1 Redis Configuration

```yaml
# Redis cluster for sessions + distributed caching
Redis Cluster:
  - 3 master nodes (Primary, DR1, DR2)
  - 3 replica nodes (failover)
  - Key space: 64 GB
  - Eviction policy: allkeys-lru
  - Persistence: AOF (Append-Only File)

Regions:
  - Primary: Johannesburg (ap-south-1)
  - DR1: Cape Town (region specific)
  - DR2: Durban (region specific)
```

### 4.2 Cache Warming Strategy

```typescript
// Cache hot data on startup
export async function warmCache(env: HonoEnv) {
  // 1. Cache reference data (projects, participants, carbon credits)
  const projects = await env.DB.query('SELECT id, project_name FROM ipp_projects');
  for (const p of projects) {
    await env.REDIS.set(`project:${p.id}`, JSON.stringify(p), 'EX', 3600);
  }

  // 2. Cache market reference data
  const carbons = await env.DB.query(
    'SELECT id, credit_type, price FROM carbon_projects'
  );
  for (const c of carbons) {
    await env.REDIS.set(`carbon:${c.id}`, JSON.stringify(c), 'EX', 1800);
  }

  // 3. Cache recent market data (5-min TTL)
  const marketSnapshot = await calculateMarketSnapshot(env);
  await env.REDIS.set('market:snapshot', JSON.stringify(marketSnapshot), 'EX', 300);

  console.log('Cache warming completed');
}

// Invalidation on updates
export async function invalidateCache(key: string, env: HonoEnv) {
  await env.REDIS.del(key);
  // Also invalidate dependent caches
  if (key.startsWith('project:')) {
    await env.REDIS.del('market:snapshot'); // Market depends on projects
  }
}
```

---

## 5. INFRASTRUCTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                     INTERNET / USERS                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   [Johannesburg]    [Cape Town]     [Durban]
   Cloudflare Edge   Edge Node       Edge Node
        │                │                │
        └────────────────┼────────────────┘
                         │
              [Cloudflare Workers]
                    (API Routing)
                         │
        ┌────────────────┴────────────────┐
        │                                 │
   [PostgreSQL RDS]          [Redis Cluster]
   Primary (JNB)             (Distributed)
   Read Replicas:            Cache/Sessions
   - CPT (read)
   - DBN (read)
        │
        ├─→ [TimescaleDB]  (Metering & Grid)
        ├─→ [R2 Buckets]   (Document Storage)
        ├─→ [KV+Durable Objects] (Rate Limiting)
        └─→ [Queues]       (Async Processing)
```

---

## 6. IMPLEMENTATION TIMELINE

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| **Assessment** | 1 week | DB audit, capacity planning, cost estimation |
| **Infrastructure Setup** | 2 weeks | RDS provisioning, replicas, monitoring |
| **Schema Design** | 1 week | Full PostgreSQL schema, migrations |
| **Data Migration** | 2 weeks | D1 → PG transfer, validation, reconciliation |
| **Testing** | 2 weeks | Performance tests, failover drills, UAT |
| **Cutover** | 1 week | Gradual traffic migration, rollback readiness |
| **Stabilization** | 2 weeks | Monitoring, optimization, documentation |
| **TOTAL** | **12 weeks** | Production-ready multi-region setup |

---

## 7. SUCCESS METRICS

```
Performance:
  ✓ Query p95 latency: <200ms (API), <50ms (queries)
  ✓ Throughput: 10,000 requests/sec sustained
  ✓ Metering ingestion: 100k data points/sec

Reliability:
  ✓ Uptime: >99.95% (multi-region)
  ✓ RTO (Recovery Time Objective): <4 hours
  ✓ RPO (Recovery Point Objective): <15 minutes

Compliance:
  ✓ Audit log immutable: No data loss
  ✓ Backup retention: 30 days + monthly archives
  ✓ Encryption: At-rest (AWS KMS), in-transit (TLS 1.3)
  ✓ GDPR/POPIA: Data residency in ZA regions
```

---

This infrastructure supports **5,000+ concurrent users**, **100M+ annual data points**, and **national-scale compliance requirements**.
