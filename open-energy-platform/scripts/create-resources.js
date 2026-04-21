#!/usr/bin/env node
/**
 * Cloudflare Resource Provisioning Script
 * Creates D1, KV, R2 resources for Open Energy Platform
 */

const CLOUDFLARE_API_KEY = process.env.CLOUDFLARE_API_KEY || '21fff817fa4a851d0ddc3975c7f8c1a31fbc4';
const EMAIL = 'reshigan@vantax.co.za';

async function cfRequest(endpoint, method = 'GET', body = null) {
  const url = `https://api.cloudflare.com/client/v4${endpoint}`;
  const headers = {
    'X-Auth-Email': EMAIL,
    'X-Auth-Key': CLOUDFLARE_API_KEY,
    'Content-Type': 'application/json',
  };
  
  console.log(`API Request: ${method} ${endpoint}`);
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    console.error('CF API Error:', JSON.stringify(data, null, 2));
    throw new Error(data.errors?.[0]?.message || 'API request failed');
  }
  
  return data;
}

async function getAccountId() {
  console.log('Fetching Cloudflare account info...');
  const accounts = await cfRequest('/accounts');
  if (accounts.result?.[0]) {
    return accounts.result[0].id;
  }
  return null;
}

async function createD1Database(accountId, name) {
  console.log(`Creating D1 database: ${name}...`);
  const result = await cfRequest('/accounts/' + accountId + '/d1/databases', 'POST', { name });
  console.log(`✓ D1 database created: ${result.result?.uuid}`);
  return result.result;
}

async function createKVNamespace(accountId, name) {
  console.log(`Creating KV namespace: ${name}...`);
  const result = await cfRequest('/accounts/' + accountId + '/storage/kv/namespaces', 'POST', { title: name });
  console.log(`✓ KV namespace created: ${result.result?.id}`);
  return result.result;
}

async function createR2Bucket(accountId, name) {
  console.log(`Creating R2 bucket: ${name}...`);
  const result = await cfRequest('/accounts/' + accountId + '/r2/buckets', 'POST', {
    name,
    location: 'auto',
  });
  console.log(`✓ R2 bucket created: ${result.result?.name}`);
  return result.result;
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   Open Energy Platform — Cloudflare Provisioning   ');
  console.log('═══════════════════════════════════════════════════\n');
  
  const accountId = await getAccountId();
  if (!accountId) {
    console.error('❌ Could not get Cloudflare account ID');
    process.exit(1);
  }
  console.log(`Account ID: ${accountId}\n`);
  
  console.log('Creating Cloudflare resources...\n');
  
  const d1 = await createD1Database(accountId, 'open-energy-db');
  const kv = await createKVNamespace(accountId, 'open-energy-kv');
  const r2 = await createR2Bucket(accountId, 'open-energy-vault');
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('   Resource IDs');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Account ID:       ${accountId}`);
  console.log(`D1 Database ID:   ${d1.uuid}`);
  console.log(`KV Namespace ID:  ${kv.id}`);
  console.log(`R2 Bucket:        ${r2.name}`);
  
  // Generate updated wrangler.toml
  const wranglerToml = `name = "open-energy-platform"
main = "src/index.ts"
compatibility_date = "2024-01-01"

account_id = "${accountId}"

[[d1_databases]]
binding = "DB"
database_name = "open-energy-db"
database_id = "${d1.uuid}"

[[kv_namespaces]]
binding = "KV"
id = "${kv.id}"

[[r2_buckets]]
binding = "R2"
bucket_name = "open-energy-vault"

[[durable_objects]]
class_name = "OrderBookDO"
binding = "ORDER_BOOK"

[[durable_objects]]
class_name = "EscrowManagerDO"
binding = "ESCROW_MGR"

[[durable_objects]]
class_name = "RiskEngineDO"
binding = "RISK_ENGINE"

[[durable_objects]]
class_name = "SmartContractDO"
binding = "SMART_CONTRACT"

[triggers]
crons = ["0 4 * * *"]
`;
  
  // Save updated wrangler.toml
  const fs = await import('fs');
  fs.writeFileSync('wrangler.toml', wranglerToml);
  console.log('\n✓ wrangler.toml updated with real IDs');
  
  console.log('\n✅ All resources provisioned successfully!');
  console.log('\nNext steps:');
  console.log('1. Run: wrangler d1 migrations apply open-energy-db --local');
  console.log('2. Run: wrangler secret put JWT_SECRET');
  console.log('3. Run: wrangler deploy');
}

main().catch(err => {
  console.error('\n❌ Provisioning failed:', err.message);
  process.exit(1);
});