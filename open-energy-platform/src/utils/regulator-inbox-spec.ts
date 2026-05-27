// ═══════════════════════════════════════════════════════════════════════════
// Wave 5 — regulator-inbox spec helpers.
//
// Pure functions only — no DB, no env. The cascade materializer in
// cascade.ts and the unit tests in tests/regulator-inbox-spec.test.ts both
// import from here.
// ═══════════════════════════════════════════════════════════════════════════

export type InboxSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface InboxSpec {
  severity: InboxSeverity;
  title: string;
}

/**
 * Returns the SLA window in hours by severity. critical=1h, high=4h,
 * medium=24h, low=72h, info=168h.
 */
export const SLA_HOURS_BY_SEVERITY: Record<InboxSeverity, number> = {
  critical: 1,
  high: 4,
  medium: 24,
  low: 72,
  info: 168,
};

/**
 * Decide whether an event lands in the regulator inbox, and at what
 * severity + title. Returns null to skip materialisation.
 *
 * Severity is derived from the event type plus data fields where
 * applicable (e.g. surveillance alert severity is taken from data).
 */
export function regulatorInboxSpec(
  event: string,
  entityId: string,
  data: Record<string, unknown> | undefined,
): InboxSpec | null {
  const d = data || {};
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');

  switch (event) {
    case 'clearing.disclosure.published':
      return {
        severity: 'info',
        title: `Clearing disclosure published — ${str('period') || entityId}`,
      };

    case 'carbon.article6.unfccc_posted':
      return {
        severity: 'info',
        title: `Article 6 ITMO posted to UNFCCC — ${str('host_iso') || '?'}→${str('beneficiary_iso') || '?'} ${str('volume_tco2e') || ''} tCO₂e`,
      };
    case 'carbon.article6.blocked':
      return {
        severity: 'high',
        title: `Article 6 adjustment BLOCKED — ${str('host_iso') || '?'}→${str('beneficiary_iso') || '?'}`,
      };

    case 'surveillance.alert_raised':
    case 'regulator.surveillance_alert_raised': {
      const sev = (str('severity') || 'medium').toLowerCase();
      if (sev === 'low' || sev === 'info') return null;
      return {
        severity: sev as InboxSeverity,
        title: `Surveillance alert — ${str('alert_type') || 'unspecified'}`,
      };
    }
    case 'regulator.surveillance_escalated':
      return {
        severity: 'high',
        title: `Surveillance escalated — ${str('alert_type') || entityId}`,
      };

    case 'regulator.enforcement_opened':
      return {
        severity: 'high',
        title: `Enforcement case opened — ${str('subject') || entityId}`,
      };
    case 'regulator.enforcement_finding':
      return {
        severity: 'high',
        title: `Enforcement finding issued — ${str('finding_type') || entityId}`,
      };

    case 'regulator.licence_varied':
      return {
        severity: 'medium',
        title: `Licence varied — ${str('licence_number') || entityId}`,
      };
    case 'regulator.licence_suspended':
      return {
        severity: 'critical',
        title: `Licence SUSPENDED — ${str('licence_number') || entityId}`,
      };
    case 'regulator.licence_revoked':
      return {
        severity: 'critical',
        title: `Licence REVOKED — ${str('licence_number') || entityId}`,
      };

    // Wave 6 — lender dunning cycle 3 expiry crosses into regulator scope.
    case 'lender.watchlist_critical_escalation':
      return {
        severity: 'high',
        title: `Lender watchlist critical — ${str('borrower_id') || entityId} (${str('trigger_signal') || 'breach'})`,
      };

    // Wave 7 — PPA take-or-pay trigger is regulator-reportable.
    case 'offtaker.obligation_take_or_pay':
      return {
        severity: 'high',
        title: `PPA take-or-pay triggered — ${str('ppa_id') || entityId} ${str('period_month') || ''}`.trim(),
      };

    // Wave 8 — Wheeling charge escalation crosses into regulator scope.
    case 'grid.wheeling_charge_escalated':
      return {
        severity: 'high',
        title: `Wheeling charge escalated — ${str('agreement_id') || entityId} ${str('period_month') || ''}`.trim(),
      };

    default:
      return null;
  }
}

/**
 * Compute the SLA due time for a row of given severity.
 */
export function computeSlaDueAt(severity: InboxSeverity, now: Date = new Date()): string {
  const hours = SLA_HOURS_BY_SEVERITY[severity];
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

/**
 * Glob-ish event pattern match used by the SLA cron's rule engine.
 * Supports exact match, '*', and trailing wildcard ('regulator.*').
 */
export function eventMatches(event: string, pattern: string): boolean {
  if (pattern === '*' || pattern === event) return true;
  if (pattern.endsWith('*')) return event.startsWith(pattern.slice(0, -1));
  return false;
}

const SEVERITY_RANK: Record<InboxSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function severityAtLeast(actual: InboxSeverity, min: InboxSeverity): boolean {
  return SEVERITY_RANK[actual] >= SEVERITY_RANK[min];
}
