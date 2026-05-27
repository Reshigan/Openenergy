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

    // Wave 9 — MM obligation breach escalated to regulator after N misses.
    case 'trader.mm_obligation_breach_escalated':
      return {
        severity: 'high',
        title: `MM obligation breach escalated — ${str('participant_id') || entityId} ${str('energy_type') || ''}`.trim(),
      };

    // Wave 10 — IPP performance-bond expired without renewal/replacement.
    case 'ipp.bond_expiry_escalated':
      return {
        severity: 'high',
        title: `Performance bond expired — ${str('bond_number') || entityId} (${str('project_id') || ''})`.trim(),
      };

    // Wave 11 — Carbon Article 6 / UNFCCC MRV verification chain.
    case 'carbon.mrv_doe_opinion_recorded': {
      const op = (str('doe_opinion') || '').toLowerCase();
      if (op === 'adverse') {
        return {
          severity: 'critical',
          title: `DOE adverse opinion — submission ${entityId} (${str('project_id') || ''})`.trim(),
        };
      }
      if (op === 'disclaimer') {
        return {
          severity: 'high',
          title: `DOE disclaimer of opinion — submission ${entityId} (${str('project_id') || ''})`.trim(),
        };
      }
      return null;
    }
    case 'carbon.mrv_cra_rejected':
      return {
        severity: 'high',
        title: `CRA rejected submission — ${entityId} (${str('project_id') || ''})`.trim(),
      };
    case 'carbon.mrv_sla_breached':
      return {
        severity: 'high',
        title: `MRV verification SLA breached — ${entityId} (${str('chain_status') || ''})`.trim(),
      };

    // ─── Wave 12 — Esums site commissioning chain ────────────────────────
    case 'esums.commissioning_failed':
      return {
        severity: 'high',
        title: `Site commissioning failed — ${str('site_name') || entityId} (${str('failed_at_status') || ''})`.trim(),
      };
    case 'esums.commissioning_sla_breached':
      return {
        severity: 'high',
        title: `Site commissioning SLA breached — ${str('site_name') || entityId} (${str('commissioning_status') || ''})`.trim(),
      };

    // ─── Wave 13 — Grid operator dispatch nomination chain ────────────────
    case 'dispatch.nomination_rejected':
      return {
        severity: 'high',
        title: `SO rejected dispatch nomination — ${entityId} (${str('rejection_reason') || ''})`.trim(),
      };
    case 'dispatch.dispute_raised':
      return {
        severity: 'high',
        title: `Dispatch nomination disputed — ${entityId} (${str('dispute_reason') || ''})`.trim(),
      };
    case 'dispatch.sla_breached':
      return {
        severity: 'high',
        title: `Dispatch nomination SLA breached — ${entityId} (${str('nomination_status') || ''})`.trim(),
      };

    // ─── Wave 14 — Support ticket P6 chain ─────────────────────────────────
    case 'support.ticket_escalated':
      // Only P1 escalations or compliance-category escalations cross to regulator.
      if (str('priority') === 'urgent' || str('category') === 'compliance') {
        return {
          severity: 'high',
          title: `Support ticket escalated — ${str('ticket_number') || entityId} (${str('priority') || ''}/${str('category') || ''})`.trim(),
        };
      }
      return null;
    case 'support.ticket_sla_breached':
      // Crossings: P1 always; lower priority only when compliance-flagged.
      if (str('priority') === 'urgent' || str('category') === 'compliance') {
        return {
          severity: 'high',
          title: `Support SLA breached — ${str('ticket_number') || entityId} (${str('sla_window') || ''} ${str('priority') || ''})`.trim(),
        };
      }
      return null;

    // ─── Wave 15 — OEM warranty / RMA claim chain ─────────────────────────
    case 'warranty.claim_denied':
      if (str('severity') === 'safety') {
        return {
          severity: 'high',
          title: `Safety warranty claim DENIED — ${str('claim_number') || entityId} (${str('oem_name') || ''})`.trim(),
        };
      }
      return null;
    case 'warranty.claim_disputed':
      if (str('severity') === 'safety') {
        return {
          severity: 'high',
          title: `Safety warranty claim disputed — ${str('claim_number') || entityId} (${str('oem_name') || ''})`.trim(),
        };
      }
      return null;
    case 'warranty.claim_sla_breached':
      if (str('severity') === 'safety') {
        return {
          severity: 'high',
          title: `Safety warranty SLA breached — ${str('claim_number') || entityId} (${str('sla_window') || ''})`.trim(),
        };
      }
      return null;

    // ─── Wave 16 — Work order dispatch chain (Esums O&M) ──────────────────
    case 'wo.cancelled':
      if (str('priority') === 'critical') {
        return {
          severity: 'high',
          title: `Critical work order CANCELLED — ${str('wo_number') || entityId} (${str('site_id') || ''})`.trim(),
        };
      }
      return null;
    case 'wo.sla_breached':
      if (str('priority') === 'critical') {
        return {
          severity: 'high',
          title: `Critical WO SLA breached — ${str('wo_number') || entityId} (${str('chain_status') || ''} / ${str('sla_window') || ''})`.trim(),
        };
      }
      return null;

    // ─── Wave 17 — Carbon credit retirement chain ─────────────────────────
    case 'carbon.retirement.retired':
      // Article 6 retirement = corresponding adjustment posted into national registry.
      if (str('scope') === 'article6') {
        return {
          severity: 'high',
          title: `Article 6 retirement finalized — ${str('certificate_number') || entityId} (${str('beneficiary_country') || ''} / ${str('quantity') || ''}t)`.trim(),
        };
      }
      return null;
    case 'carbon.retirement.rejected':
      if (str('scope') === 'article6') {
        return {
          severity: 'critical',
          title: `Article 6 retirement REJECTED — ${str('beneficiary_name') || entityId} (${str('rejection_reason') || 'no reason'})`.trim(),
        };
      }
      if (str('scope') === 'compliance') {
        return {
          severity: 'high',
          title: `Compliance retirement rejected — ${str('beneficiary_name') || entityId} (${str('rejection_reason') || 'no reason'})`.trim(),
        };
      }
      return null;
    case 'carbon.retirement.sla_breached':
      if (str('scope') === 'article6') {
        return {
          severity: 'critical',
          title: `Article 6 retirement SLA breached — ${str('beneficiary_name') || entityId} (${str('chain_status') || ''} / ${str('sla_window') || ''})`.trim(),
        };
      }
      if (str('scope') === 'compliance') {
        return {
          severity: 'high',
          title: `Compliance retirement SLA breached — ${str('beneficiary_name') || entityId} (${str('chain_status') || ''} / ${str('sla_window') || ''})`.trim(),
        };
      }
      return null;

    // ─── Wave 18 — Planned outage submission chain (NERSA Grid Code) ──────
    case 'outage.commenced':
      // NERSA Grid Code §C-1.3 — emergency outage visibility for critical/high.
      if (str('severity') === 'critical' || str('severity') === 'high') {
        return {
          severity: str('severity') === 'critical' ? 'critical' : 'high',
          title: `Planned outage COMMENCED — ${str('outage_number') || entityId} (${str('asset_name') || ''} / ${str('affected_mw') || ''}MW)`.trim(),
        };
      }
      return null;
    case 'outage.rejected':
      if (str('severity') === 'critical' || str('severity') === 'high') {
        return {
          severity: 'high',
          title: `Planned outage REJECTED — ${str('outage_number') || entityId} (${str('asset_name') || ''} / ${str('rejection_reason') || 'no reason'})`.trim(),
        };
      }
      return null;
    case 'outage.sla_breached':
      if (str('severity') === 'critical') {
        return {
          severity: 'critical',
          title: `Critical outage SLA breached — ${str('outage_number') || entityId} (${str('chain_status') || ''} / ${str('sla_window') || ''})`.trim(),
        };
      }
      if (str('severity') === 'high') {
        return {
          severity: 'high',
          title: `High-severity outage SLA breached — ${str('outage_number') || entityId} (${str('chain_status') || ''} / ${str('sla_window') || ''})`.trim(),
        };
      }
      return null;

    // ─── Wave 19 — IPP procurement / RFP chain (REIPPPP transparency) ──────
    case 'procurement.awarded':
      // REIPPPP / DMRE requires public bid award transparency for high-tier (≥R500m).
      if (str('capex_tier') === 'high') {
        return {
          severity: 'high',
          title: `IPP procurement AWARDED — ${str('rfp_number') || entityId} (${str('award_name') || 'vendor'} / R${str('award_amount_zar') || '?'})`.trim(),
        };
      }
      return null;
    case 'procurement.disputed':
      // Bid-protest visibility for high-tier RFPs only — keeps regulator inbox useful.
      if (str('capex_tier') === 'high') {
        return {
          severity: 'high',
          title: `IPP procurement DISPUTED — ${str('rfp_number') || entityId} (${str('title') || ''} / ${str('dispute_notes') || 'no notes'})`.trim(),
        };
      }
      return null;
    case 'procurement.sla_breached':
      if (str('capex_tier') === 'high') {
        return {
          severity: 'high',
          title: `High-tier procurement SLA breached — ${str('rfp_number') || entityId} (${str('chain_status') || ''} / ${str('sla_window') || ''})`.trim(),
        };
      }
      return null;

    // ─── Wave 20 — IPP construction → COD certification chain ──────────────
    case 'cod.cod_certified':
      // NERSA SCADA registration + DMRE generation registry mandatory at ≥100MW.
      if (str('capacity_tier') === 'large') {
        return {
          severity: 'high',
          title: `IPP COD CERTIFIED — ${str('cod_number') || entityId} (${str('project_name') || ''} / ${str('capacity_mw') || '?'}MW / IE: ${str('ie_certifier') || 'unknown'})`.trim(),
        };
      }
      return null;
    case 'cod.cancelled':
      // Bid-window allocation surrender → DMRE bond claw-back + reissue visibility.
      if (str('capacity_tier') === 'large') {
        return {
          severity: 'high',
          title: `IPP construction CANCELLED — ${str('cod_number') || entityId} (${str('project_name') || ''} / ${str('capacity_mw') || '?'}MW / ${str('cancellation_reason') || 'no reason'})`.trim(),
        };
      }
      return null;
    case 'cod.sla_breached':
      // Delivery risk to NERSA grid-planning for utility-scale.
      if (str('capacity_tier') === 'large') {
        return {
          severity: 'high',
          title: `Large-tier COD SLA breached — ${str('cod_number') || entityId} (${str('chain_status') || ''} / ${str('sla_window') || ''})`.trim(),
        };
      }
      return null;

    // ─── Wave 21 — Lender drawdown / disbursement chain ────────────────────
    case 'drawdown.approved':
      // SARB large-exposure disclosure mandate for senior-tier (≥R500m tranche).
      if (str('tranche_tier') === 'senior') {
        return {
          severity: 'high',
          title: `Senior drawdown APPROVED — ${str('drawdown_number') || entityId} (${str('project_name') || ''} / R${str('amount_zar') || '?'} / ${str('lender_id') || 'lender'})`.trim(),
        };
      }
      return null;
    case 'drawdown.rejected':
      // IPP financing-failure visibility to DMRE (bid-window risk).
      if (str('tranche_tier') === 'senior') {
        return {
          severity: 'high',
          title: `Senior drawdown REJECTED — ${str('drawdown_number') || entityId} (${str('project_name') || ''} / ${str('rejection_reason') || 'no reason'})`.trim(),
        };
      }
      return null;
    case 'drawdown.sla_breached':
      if (str('tranche_tier') === 'senior') {
        return {
          severity: 'high',
          title: `Senior drawdown SLA breached — ${str('drawdown_number') || entityId} (${str('chain_status') || ''} / ${str('sla_window') || ''})`.trim(),
        };
      }
      return null;

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
