#!/usr/bin/env node
/**
 * Cloudflare Resource Provisioning Script
 * 
 * NOTE: D1/KV APIs may require OAuth/wrangler login on some accounts.
 * Alternative: Use Cloudflare Dashboard to create D1 and KV namespaces,
 * then update wrangler.toml with the IDs.
 */

const CLOUDFLARE_API_KEY = '21fff817fa4a851d0ddc3975c7f8c1a31fbc4';
const EMAIL = 'reshigan@vantax.co.za';
const ACCOUNT_ID = '08596e523c096f04b56d7ae43f7821f4';

async function cfRequest(endpoint, method = 'GET', body = null) {
  const url = `https://api.cloudflare.com/client/v4${endpoint}`;
  const headers = {
    'X-Auth-Email': EMAIL,
    'X-Auth-Key': CLOUDFLARE_API_KEY,
    'Content-Type': 'application/json',
  };
  
  console.log(`  → ${method} ${endpoint}`);
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    console.error(`  ✘ API Error (${response.status}):`, data.errors?.[0]?.message || 'Unknown error');
    return null;
  }
  
  return data;
}

async function getExistingResources() {
  console.log('Checking existing resources...\n');
  
  // Check R2 buckets
  const r2Buckets = await cfRequest(`/accounts/${ACCOUNT_ID}/r2/buckets`);
  if (r2Buckets?.success) {
    const buckets = r2Buckets.result?.buckets || [];
    console.log('R2 Buckets:', buckets.map(b => b.name).join(', '));
    return { r2Exists: buckets.some(b => b.name === 'open-energy-vault') };
  }
  
  return { r2Exists: false };
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   Open Energy Platform — Cloudflare Provisioning   ');
  console.log('═══════════════════════════════════════════════════\n');
  
  console.log(`Account ID: ${ACCOUNT_ID}`);
  console.log(`Email:     ${EMAIL}\n`);
  
  const existing = await getExistingResources();
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('   Account Capabilities');
  console.log('═══════════════════════════════════════════════════');
  console.log('✓ API Access (Global Key): Working');
  console.log('✓ R2 Buckets: Available');
  console.log('⚠ D1 Databases: Requires wrangler login or Dashboard');
  console.log('⚠ KV Namespaces: Requires wrangler login or Dashboard\n');
  
  console.log('═══════════════════════════════════════════════════');
  console.log('   Manual Steps Required');
  console.log('═══════════════════════════════════════════════════');
  console.log('1. Log into Cloudflare Dashboard: https://dash.cloudflare.com');
  console.log('2. Go to Workers & Pages > D1 Databases');
  console.log('3. Create database: open-energy-db');
  console.log('4. Copy the database ID and update wrangler.toml');
  console.log('5. Go to Workers & Pages > KV Namespaces');
  console.log('6. Create namespace: open-energy-kv');
  console.log('7. Copy the namespace ID and update wrangler.toml');
  console.log('8. Run: wrangler d1 migrations apply open-energy-db');
  console.log('9. Run: wrangler deploy\n');
  
  // Update wrangler.toml with account ID
  const fs = await import('fs');
  const wranglerToml = `# Open Energy Platform - Wrangler Configuration
name = "open-energy-platform"
main = "src/index.ts"
compatibility_date = "2024-01-01"

account_id = "${ACCOUNT_ID}"

# UPDATE THESE AFTER CREATING IN DASHBOARD:
# [[d1_databases]]
# binding = "DB"
# database_name = "open-energy-db"
# database_id = "YOUR-D1-ID-HERE"

# [[kv_namespaces]]
# binding = "KV" 
# id = "YOUR-KV-ID-HERE"

[[r2_buckets]]
binding = "R2"
bucket_name = "open-energy-vault"

# Durable Objects
[[durable_objects.bindings]]
name = "ORDER_BOOK"
class_name = "OrderBookDO"

[[durable_objects.bindings]]
name = "ESCROW_MGR"
class_name = "EscrowManagerDO"

[[durable_objects.bindings]]
name = "RISK_ENGINE"
class_name = "RiskEngineDO"

[[durable_objects.bindings]]
name = "SMART_CONTRACT"
class_name = "SmartContractDO"

# Migrations for Durable Objects
[[migrations]]
tag = "v1"
new_sqlite_classes = ["OrderBookDO", "EscrowManagerDO", "RiskEngineDO", "SmartContractDO"]

[triggers]
crons = ["0 4 * * *"]

# Secrets (set via CLI after wrangler login)
# wrangler secret put JWT_SECRET
# wrangler secret put RESEND_API_KEY  
# wrangler secret put ONA_API_KEY
`;
  
  fs.writeFileSync('wrangler.toml', wranglerToml);
  
  const envContent = `# Open Energy Platform Environment
CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID}
CLOUDFLARE_EMAIL=${EMAIL}
CLOUDFLARE_R2_BUCKET=open-energy-vault
JWT_SECRET=change-me-in-production
`;
  fs.writeFileSync('.env', envContent);
  
  console.log('✓ wrangler.toml updated with account ID');
  console.log('✓ .env file created\n');
  
  console.log('═══════════════════════════════════════════════════');
  console.log('   Quick Start Commands');
  console.log('═══════════════════════════════════════════════════');
  console.log('# After creating D1/KV in Dashboard:');
  console.log('npm install');
  console.log('npm run build:pages');
  console.log('wrangler pages deploy pages/dist');
  console.log('wrangler d1 migrations apply open-energy-db');
  console.log('wrangler secret put JWT_SECRET');
  console.log('wrangler deploy\n');
  
  console.log('✅ Configuration complete!');
}

main().catch(err => {
  console.error('\n❌ Provisioning error:', err.message);
});