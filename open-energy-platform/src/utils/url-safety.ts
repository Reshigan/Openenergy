// URL safety validator — blocks SSRF via webhook/SIEM/adapter URLs.
// Validates at storage time (POST/PUT) and again at use time (fetch call site).
//
// Limitations in the Cloudflare Workers environment:
//   • We cannot resolve DNS to check destination IPs before the request.
//   • Workers fetch() follows 30x by default → require redirect:'manual' at
//     call sites so Location header is re-validated before following.
//   • Hostname-only blocking is the correct Workers-native first defence;
//     an egress proxy / Cloudflare Gateway allowlist adds second-layer defence.

function ipToUint32(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = parseInt(p, 10);
    if (isNaN(v) || v < 0 || v > 255 || String(v) !== p) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function isPrivateIPv4(n: number): boolean {
  // All IANA special-use ranges (RFC 6890 + RFC 8215 etc.)
  const ranges: [number, number][] = [
    [0x00000000, 0xFF000000],       // 0.0.0.0/8
    [0x0A000000, 0xFF000000],       // 10.0.0.0/8
    [0x64400000, 0xFFC00000],       // 100.64.0.0/10 (carrier NAT)
    [0x7F000000, 0xFF000000],       // 127.0.0.0/8
    [0xA9FE0000, 0xFFFF0000],       // 169.254.0.0/16 (link-local)
    [0xAC100000, 0xFFF00000],       // 172.16.0.0/12
    [0xC0000000, 0xFFFFFF00],       // 192.0.0.0/24
    [0xC0000200, 0xFFFFFF00],       // 192.0.2.0/24 (TEST-NET-1)
    [0xC0A80000, 0xFFFF0000],       // 192.168.0.0/16
    [0xC6120000, 0xFFFE0000],       // 198.18.0.0/15 (benchmarking)
    [0xC6336400, 0xFFFFFF00],       // 198.51.100.0/24 (TEST-NET-2)
    [0xCB007100, 0xFFFFFF00],       // 203.0.113.0/24 (TEST-NET-3)
    [0xE0000000, 0xF0000000],       // 224.0.0.0/4 (multicast)
    [0xF0000000, 0xF0000000],       // 240.0.0.0/4 (reserved)
    [0xFFFFFFFF, 0xFFFFFFFF],       // 255.255.255.255
  ];
  return ranges.some(([base, mask]) => (n & mask) === base);
}

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  // Bare localhost or *.localhost
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  // IPv4 decimal
  const n4 = ipToUint32(h);
  if (n4 !== null) return isPrivateIPv4(n4);
  // IPv4 hex/octal/decimal single-number (e.g. 0x7f000001, 2130706433)
  if (/^(0x[0-9a-f]+|0[0-7]+|\d+)$/i.test(h)) {
    const numeric = Number(h);
    if (!isNaN(numeric) && numeric >= 0 && numeric <= 0xFFFFFFFF) {
      return isPrivateIPv4(numeric >>> 0);
    }
  }
  // IPv6 loopback and private
  if (h === '::1' || h === '[::1]') return true;
  const bare = h.replace(/^\[|\]$/g, '');
  // fe80::/10 link-local, fc00::/7 unique-local
  if (/^fe[89ab]/i.test(bare) || /^f[cd]/i.test(bare)) return true;
  // ::ffff:0:0/96 IPv4-mapped
  if (/^::ffff:/i.test(bare)) {
    const v4 = bare.slice(7);
    const n = ipToUint32(v4);
    if (n !== null) return isPrivateIPv4(n);
  }
  return false;
}

export function assertSafeWebhookUrl(url: string, requireHttps = false): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }
  const allowedProtocols = requireHttps ? ['https:'] : ['https:', 'http:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`URL must use ${requireHttps ? 'https' : 'http or https'} scheme`);
  }
  // Reject empty hostname
  if (!parsed.hostname) {
    throw new Error('URL must have a valid hostname');
  }
  if (isPrivateHostname(parsed.hostname)) {
    throw new Error('URL must not point to a private or loopback address');
  }
}

// Re-validate a redirect Location before following it.
// Call this at every fetch() call site that may follow 30x responses:
//   const res = await fetch(url, { redirect: 'manual' });
//   if (res.status >= 300 && res.status < 400) {
//     const location = res.headers.get('Location');
//     if (!location) throw new Error('redirect without Location');
//     assertSafeWebhookUrl(location, requireHttps);
//     // then follow manually with a new fetch()
//   }
export { assertSafeWebhookUrl as assertSafeRedirectUrl };
