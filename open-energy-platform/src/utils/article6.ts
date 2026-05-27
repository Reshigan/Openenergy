// ═══════════════════════════════════════════════════════════════════════════
// Article 6 utility — UNFCCC Paris Agreement ITMO corresponding-adjustment
// helpers. Pure functions; no DB access.
//
//   computeRegistryUri(routing, project_id, year, serial_range)
//       → deterministic anchor URL based on the country's registry pattern.
//
//   classifyArticle6Track(host_country, beneficiary_country, registry)
//       → '6.2' | '6.4' | 'voluntary_oc' | 'paris_only'.
//
//   assessDoubleCountingRisk({ host_iso, beneficiary_iso, ca_status })
//       → { risk: 'low' | 'medium' | 'high'; reasons: string[] }
//
// The ledger lifecycle is enforced server-side; these helpers only inform.
// ═══════════════════════════════════════════════════════════════════════════

export interface CountryRouting {
  country_iso: string;
  country_name: string;
  article_6_track: '6.2' | '6.4' | 'paris_only' | 'non_party' | 'unknown';
  registry_url_pattern: string | null;
  active: number;
}

export type Article6Track = '6.2' | '6.4' | 'voluntary_oc' | 'paris_only';

// Computes the deterministic registry anchor URL for a retired serial block.
// Falls back to a stable internal URI if the country has no pattern set; the
// fallback is auditable because it embeds the registry + serial.
export function computeRegistryUri(
  routing: CountryRouting | null,
  registry: string,
  projectId: string,
  vintageYear: number,
  serialRange: string,
): string {
  const fallback = `https://oe.vantax.co.za/audit/serial/${encodeURIComponent(registry)}/${encodeURIComponent(serialRange)}`;
  if (!routing?.registry_url_pattern) return fallback;
  return routing.registry_url_pattern
    .replace('{proj}', encodeURIComponent(projectId))
    .replace('{year}', String(vintageYear))
    .replace('{serial}', encodeURIComponent(serialRange))
    .replace('{registry}', encodeURIComponent(registry));
}

// Article 6.2 = cooperative approaches between two NDC parties.
// Article 6.4 = centralized UN mechanism (supersedes CDM).
// voluntary_oc = voluntary offset commitment (Verra/Gold Standard without
//                a corresponding adjustment) — high double-counting risk.
// paris_only   = host country is Paris-only with no NDC ITMO mechanism yet.
export function classifyArticle6Track(
  host: CountryRouting | null,
  beneficiary: CountryRouting | null,
  registry: string,
): Article6Track {
  // CDM credits go through the 6.4 transition track (this rule wins even
  // for domestic retirements because CDM is a UN-administered registry).
  if (registry === 'cdm') return '6.4';
  // Domestic retirement (same country) → voluntary, no CA required —
  // checked before 6.2/6.4 so a ZAF→ZAF retirement doesn't get misclassified.
  if (host && beneficiary && host.country_iso === beneficiary.country_iso) return 'voluntary_oc';
  // Cross-border with both sides on 6.2 → 6.2 cooperative approach.
  if (host?.article_6_track === '6.2' && beneficiary?.article_6_track === '6.2') return '6.2';
  // Either side 6.4 → 6.4.
  if (host?.article_6_track === '6.4' || beneficiary?.article_6_track === '6.4') return '6.4';
  // Voluntary registries with no Article 6 alignment → voluntary OC.
  if (registry === 'gold_standard' || registry === 'verra') return 'voluntary_oc';
  return 'paris_only';
}

export interface DoubleCountingInput {
  host_iso: string;
  beneficiary_iso: string;
  article_6_track: Article6Track;
  ca_status: 'draft' | 'dffe_pending' | 'dffe_cleared' | 'unfccc_ledger' | 'blocked';
}

export interface DoubleCountingAssessment {
  risk: 'low' | 'medium' | 'high';
  reasons: string[];
}

export function assessDoubleCountingRisk(input: DoubleCountingInput): DoubleCountingAssessment {
  const reasons: string[] = [];
  let risk: 'low' | 'medium' | 'high' = 'low';

  if (input.ca_status === 'blocked') {
    return { risk: 'high', reasons: ['Adjustment has been blocked by compliance review.'] };
  }

  // Cross-border + no CA cleared → at minimum medium risk.
  const isCrossBorder = input.host_iso !== input.beneficiary_iso;
  if (isCrossBorder) {
    if (input.ca_status === 'unfccc_ledger') {
      // Cleared all the way to UNFCCC central ledger.
      reasons.push('Cross-border transfer logged in UNFCCC central ledger.');
      risk = 'low';
    } else if (input.ca_status === 'dffe_cleared') {
      reasons.push('Host-country NDC authority has cleared; UNFCCC posting pending.');
      risk = 'medium';
    } else if (input.ca_status === 'dffe_pending') {
      reasons.push('Awaiting host-country NDC authority clearance.');
      risk = 'high';
    } else {
      reasons.push('No corresponding-adjustment record submitted to host NDC authority.');
      risk = 'high';
    }
  } else {
    // Domestic — only risk is voluntary double-claim if the buyer is also
    // using the credit toward their NDC.
    reasons.push('Domestic retirement — no inter-country corresponding adjustment required.');
    risk = 'low';
  }

  // Voluntary OC track + cross-border is always elevated regardless.
  if (input.article_6_track === 'voluntary_oc' && isCrossBorder) {
    reasons.push('Voluntary registry credit transferred cross-border — host NDC may still claim the tonne.');
    if (risk === 'low') risk = 'medium';
  }

  // paris_only host + cross-border = no CA mechanism available yet.
  if (input.article_6_track === 'paris_only' && isCrossBorder) {
    reasons.push('Host country has no Article 6 mechanism operational — no CA possible.');
    risk = 'high';
  }

  return { risk, reasons };
}

// Lifecycle validator: returns the legal next status, or null if invalid.
export function nextArticle6Status(
  current: DoubleCountingInput['ca_status'],
  action: 'submit_dffe' | 'clear_dffe' | 'post_unfccc' | 'block' | 'unblock',
): DoubleCountingInput['ca_status'] | null {
  if (action === 'block') return 'blocked';
  if (current === 'blocked' && action === 'unblock') return 'draft';
  if (current === 'blocked') return null;
  if (action === 'submit_dffe' && current === 'draft') return 'dffe_pending';
  if (action === 'clear_dffe' && current === 'dffe_pending') return 'dffe_cleared';
  if (action === 'post_unfccc' && current === 'dffe_cleared') return 'unfccc_ledger';
  return null;
}
