#!/usr/bin/env node
// Generate an ES256 (ECDSA P-256) key pair for JWT signing.
// Outputs two wrangler secret commands to copy-paste.
//
// Usage:
//   node scripts/generate-jwt-keys.mjs
//
// Then set the secrets:
//   wrangler secret put JWT_PRIVATE_KEY_JWK
//   wrangler secret put JWT_PUBLIC_KEY_JWK

const { privateKey, publicKey } = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true, // extractable
  ['sign', 'verify'],
);

const privJwk = await crypto.subtle.exportKey('jwk', privateKey);
const pubJwk  = await crypto.subtle.exportKey('jwk', publicKey);

const privStr = JSON.stringify(privJwk);
const pubStr  = JSON.stringify(pubJwk);

console.log('\n── JWT_PRIVATE_KEY_JWK ─────────────────────────────────────────────────');
console.log('Run: wrangler secret put JWT_PRIVATE_KEY_JWK');
console.log('Paste:\n' + privStr);

console.log('\n── JWT_PUBLIC_KEY_JWK ──────────────────────────────────────────────────');
console.log('Run: wrangler secret put JWT_PUBLIC_KEY_JWK');
console.log('Paste:\n' + pubStr);

console.log('\n── wrangler.toml (add under [vars] for local dev only) ─────────────────');
console.log(`JWT_PRIVATE_KEY_JWK = '${privStr}'`);
console.log(`JWT_PUBLIC_KEY_JWK  = '${pubStr}'`);
console.log('\nDone. Keep JWT_PRIVATE_KEY_JWK secret — it is the signing key.\n');
