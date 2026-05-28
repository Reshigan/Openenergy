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
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0);

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

    // ─── Wave 22 — Offtaker PPA contract lifecycle ─────────────────────────
    case 'ppa_contract.executed':
      // NERSA Section 34 determination visibility for strategic-tier (≥100MW).
      if (str('capacity_tier') === 'strategic') {
        return {
          severity: 'high',
          title: `Strategic PPA EXECUTED — ${str('ppa_number') || entityId} (${str('project_name') || ''} / ${str('capacity_mw') || '?'}MW / ${str('offtaker_name') || ''} / ${str('nersa_section34_ref') || 'S34 pending'})`.trim(),
        };
      }
      return null;
    case 'ppa_contract.terminated':
      // Strategic-tier termination — market-stability visibility.
      if (str('capacity_tier') === 'strategic') {
        return {
          severity: 'high',
          title: `Strategic PPA TERMINATED — ${str('ppa_number') || entityId} (${str('project_name') || ''} / ${str('termination_reason') || 'no reason'})`.trim(),
        };
      }
      return null;
    case 'ppa_contract.sla_breached':
      if (str('capacity_tier') === 'strategic') {
        return {
          severity: 'high',
          title: `Strategic PPA SLA breached — ${str('ppa_number') || entityId} (${str('chain_status') || ''} / ${str('sla_window') || ''})`.trim(),
        };
      }
      return null;

    // ─── Wave 23 — Insurance claim chain (FSCA Section 38) ─────────────────
    case 'insurance_claim.settled':
      if (str('claim_value_tier') === 'catastrophic') {
        return {
          severity: 'high',
          title: `Catastrophic insurance claim SETTLED — ${str('claim_number') || entityId} (${str('insurer_name') || ''} / R${str('settled_value_zar') || str('claim_value_zar') || '?'} / ${str('fsca_report_ref') || 'FSCA §38 pending'})`.trim(),
        };
      }
      return null;
    case 'insurance_claim.declined':
      if (str('claim_value_tier') === 'catastrophic') {
        return {
          severity: 'high',
          title: `Catastrophic insurance claim DECLINED — ${str('claim_number') || entityId} (${str('insurer_name') || ''} / ${str('decline_reason') || 'no reason'})`.trim(),
        };
      }
      return null;
    case 'insurance_claim.sla_breached':
      if (str('claim_value_tier') === 'catastrophic') {
        return {
          severity: 'high',
          title: `Catastrophic insurance claim SLA breached — ${str('claim_number') || entityId} (${str('chain_status') || ''})`.trim(),
        };
      }
      return null;

    // ─── Wave 24 — Esums PR sustained-underperformance chain ───────────────
    case 'pr_chain.escalated':
      if (str('capacity_tier') === 'utility') {
        return {
          severity: 'high',
          title: `Utility PR escalation — ${str('case_number') || entityId} (${str('site_name') || ''} / ${str('capacity_mw') || '?'}MW / baseline ${str('baseline_pr') || '?'} → observed ${str('observed_pr') || '?'} / cause: ${str('primary_cause') || 'TBD'})`.trim(),
        };
      }
      return null;
    case 'pr_chain.sla_breached':
      if (str('capacity_tier') === 'utility') {
        return {
          severity: 'high',
          title: `Utility PR-chain SLA breached — ${str('case_number') || entityId} (${str('site_name') || ''} / ${str('chain_status') || ''})`.trim(),
        };
      }
      return null;

    // ─── Wave 25 — HSE/SHEQ incident chain (OHSA s24 + NEMA s30) ──────────────
    // Reportable tiers: fatal | major | environmental cross into regulator inbox.
    case 'hse_incident.notified_authority': {
      const tier = str('incident_tier');
      if (tier === 'fatal' || tier === 'major' || tier === 'environmental') {
        const auth = str('authority') || (tier === 'environmental' ? 'DFFE' : 'DEL');
        return {
          severity: tier === 'fatal' ? 'high' : 'medium',
          title: `${tier === 'environmental' ? 'NEMA s30' : 'OHSA s24'} authority notification — ${str('case_number') || entityId} (${auth} ref ${str('authority_ref') || 'pending'} / ${str('site_name') || ''})`.trim(),
        };
      }
      return null;
    }
    case 'hse_incident.escalated': {
      const tier = str('incident_tier');
      if (tier === 'fatal' || tier === 'major' || tier === 'environmental') {
        return {
          severity: 'high',
          title: `HSE incident escalated — ${str('case_number') || entityId} (${tier} / ${str('site_name') || ''} / ${str('persons_affected') || 0} affected)`.trim(),
        };
      }
      return null;
    }
    case 'hse_incident.closed': {
      const tier = str('incident_tier');
      if (tier === 'fatal' || tier === 'major' || tier === 'environmental') {
        return {
          severity: tier === 'fatal' ? 'high' : 'medium',
          title: `HSE incident closed — ${str('case_number') || entityId} (${tier} / ${str('site_name') || ''} / authority ref ${str('authority_ref') || 'n/a'})`.trim(),
        };
      }
      return null;
    }
    case 'hse_incident.sla_breached': {
      const tier = str('incident_tier');
      if (tier === 'fatal' || tier === 'major' || tier === 'environmental') {
        return {
          severity: tier === 'fatal' ? 'high' : 'medium',
          title: `HSE chain SLA breached — ${str('case_number') || entityId} (${tier} / ${str('chain_status') || ''} / ${str('site_name') || ''})`.trim(),
        };
      }
      return null;
    }

    // ─── Wave 26 — Cybersecurity / POPIA s22 / Cybercrimes Act s54 chain ───────
    // Reportable tiers: catastrophic | major | personal_data cross into regulator inbox.
    case 'cyber_incident.notified_regulator': {
      const tier = str('incident_tier');
      if (tier === 'catastrophic' || tier === 'major' || tier === 'personal_data') {
        const auth = str('regulator_authority') || 'IR';
        const sapsTag = auth.includes('SAPS') ? ' + SAPS Cybercrime' : '';
        return {
          severity: tier === 'catastrophic' ? 'high' : 'medium',
          title: `POPIA s22 notification — ${str('case_number') || entityId} (Information Regulator${sapsTag} ref ${str('regulator_ref') || 'pending'} / ${str('asset_scope') || ''} / ${str('records_affected') || 0} records)`.trim(),
        };
      }
      return null;
    }
    case 'cyber_incident.escalated': {
      const tier = str('incident_tier');
      if (tier === 'catastrophic' || tier === 'major' || tier === 'personal_data') {
        return {
          severity: 'high',
          title: `Cyber incident escalated — ${str('case_number') || entityId} (${tier} / ${str('asset_scope') || ''} / ${str('records_affected') || 0} records)`.trim(),
        };
      }
      return null;
    }
    case 'cyber_incident.closed': {
      const tier = str('incident_tier');
      if (tier === 'catastrophic' || tier === 'major' || tier === 'personal_data') {
        return {
          severity: tier === 'catastrophic' ? 'high' : 'medium',
          title: `Cyber incident closed — ${str('case_number') || entityId} (${tier} / ${str('asset_scope') || ''} / IR ref ${str('regulator_ref') || 'n/a'})`.trim(),
        };
      }
      return null;
    }
    case 'cyber_incident.sla_breached': {
      const tier = str('incident_tier');
      if (tier === 'catastrophic' || tier === 'major' || tier === 'personal_data') {
        return {
          severity: tier === 'catastrophic' ? 'high' : 'medium',
          title: `Cyber chain SLA breached — ${str('case_number') || entityId} (${tier} / ${str('chain_status') || ''} / ${str('asset_scope') || ''})`.trim(),
        };
      }
      return null;
    }

    // ─── Wave 27 — REIPPPP Economic Development (ED) commitment chain ───────
    // ownership + local_content are HIGH-scoring REIPPPP commitments — DTI Codes
    // + IPPO + DMRE-level enforcement. jobs + skills are mid-scoring (DMRE).
    // enterprise_dev / socio_economic / community_trust cross only on escalate.
    case 'ed_commitment.cure_plan_required': {
      const tier = str('commitment_type');
      if (tier === 'ownership' || tier === 'local_content') {
        return {
          severity: 'medium',
          title: `REIPPPP ED cure plan required — ${str('case_number') || entityId} (${tier} / ${str('project_name') || ''} / variance ${str('variance_pct') || '?'}%)`.trim(),
        };
      }
      return null;
    }
    case 'ed_commitment.penalty_issued': {
      const tier = str('commitment_type');
      if (tier === 'ownership' || tier === 'local_content' || tier === 'jobs' || tier === 'skills') {
        return {
          severity: tier === 'ownership' || tier === 'local_content' ? 'high' : 'medium',
          title: `REIPPPP ED penalty — ${str('case_number') || entityId} (${tier} / ${str('project_name') || ''} / R${str('penalty_amount_zar') || 0} / ref ${str('penalty_ref') || 'pending'})`.trim(),
        };
      }
      return null;
    }
    case 'ed_commitment.escalated': {
      // Any escalation crosses — DTI Codes Council referral
      return {
        severity: 'high',
        title: `REIPPPP ED escalated to DTI — ${str('case_number') || entityId} (${str('commitment_type') || ''} / ${str('project_name') || ''})`.trim(),
      };
    }
    case 'ed_commitment.closed': {
      const tier = str('commitment_type');
      // Only high-scoring closed-with-penalty / closed-escalated crossings carry forward.
      // Routine clean closures don't notify the regulator.
      const hadPenalty = !!str('penalty_amount_zar');
      const hadEscalation = !!str('escalated_at');
      if ((hadPenalty || hadEscalation) && (tier === 'ownership' || tier === 'local_content')) {
        return {
          severity: 'medium',
          title: `REIPPPP ED case closed — ${str('case_number') || entityId} (${tier} / ${str('project_name') || ''} / ${hadPenalty ? 'penalty' : 'escalated'})`.trim(),
        };
      }
      return null;
    }
    case 'ed_commitment.sla_breached': {
      const tier = str('commitment_type');
      if (tier === 'ownership' || tier === 'local_content' || tier === 'jobs' || tier === 'skills') {
        return {
          severity: tier === 'ownership' || tier === 'local_content' ? 'high' : 'medium',
          title: `REIPPPP ED chain SLA breached — ${str('case_number') || entityId} (${tier} / ${str('chain_status') || ''} / ${str('project_name') || ''})`.trim(),
        };
      }
      return null;
    }

    // ─── Wave 28 — Grid Connection Agreement (UNGCA) chain — NERSA Grid Code C-1 ───
    // Transmission tier (>132kV, ≥75MW utility) crosses on execute/energise/commission.
    // Reject crosses for transmission + distribution (grid-stability denial = NERSA-reportable).
    // Embedded SSEG (<33kV) never crosses. Withdrawal never crosses.
    case 'gca.executed': {
      const tier = str('connection_tier');
      if (tier === 'transmission') {
        return {
          severity: 'medium',
          title: `UNGCA executed — ${str('case_number') || entityId} (${str('project_name') || ''} / ${str('voltage_kv') || ''}kV @ ${str('poc_substation') || ''} / R${str('cost_accepted_zar') || 0} / ref ${str('ungca_ref') || 'pending'})`.trim(),
        };
      }
      return null;
    }
    case 'gca.energised': {
      const tier = str('connection_tier');
      if (tier === 'transmission') {
        return {
          severity: 'medium',
          title: `Transmission interconnection energised — ${str('case_number') || entityId} (${str('project_name') || ''} / ${str('capacity_mw') || ''}MW @ ${str('poc_substation') || ''})`.trim(),
        };
      }
      return null;
    }
    case 'gca.in_service': {
      const tier = str('connection_tier');
      if (tier === 'transmission') {
        return {
          severity: 'medium',
          title: `Transmission connection in commercial service — ${str('case_number') || entityId} (${str('project_name') || ''} / ${str('capacity_mw') || ''}MW)`.trim(),
        };
      }
      return null;
    }
    case 'gca.rejected': {
      const tier = str('connection_tier');
      if (tier === 'transmission' || tier === 'distribution') {
        return {
          severity: tier === 'transmission' ? 'high' : 'medium',
          title: `GCA rejected — ${str('case_number') || entityId} (${tier} / ${str('project_name') || ''} / reason: ${str('rod_reason') || 'unspecified'})`.trim(),
        };
      }
      return null;
    }
    case 'gca.sla_breached': {
      const tier = str('connection_tier');
      if (tier === 'transmission' || tier === 'distribution') {
        return {
          severity: tier === 'transmission' ? 'high' : 'medium',
          title: `GCA chain SLA breached — ${str('case_number') || entityId} (${tier} / ${str('chain_status') || ''} / ${str('project_name') || ''})`.trim(),
        };
      }
      return null;
    }

    // ─── Wave 29 — Trader Position Limit Compliance chain — FSCA Section 41 ───
    // prop + market_maker tiers cross on hard_breach + margin_call_issued.
    // ALL tiers cross on escalated (forced liquidation) — FSCA Section 41 hard line.
    // SLA breach crosses for all tiers (precursor to escalation).
    case 'poslimit.hard_breach': {
      const tier = str('trader_tier');
      if (tier === 'prop' || tier === 'market_maker') {
        return {
          severity: 'high',
          title: `Position limit hard breach — ${str('case_number') || entityId} (${tier} / ${str('trader_party') || ''} / ${str('instrument') || ''} ${str('utilisation_pct') || '?'}% / FSCA ref ${str('fsca_ref') || 'pending'})`.trim(),
        };
      }
      return null;
    }
    case 'poslimit.margin_call_issued': {
      const tier = str('trader_tier');
      if (tier === 'prop' || tier === 'market_maker') {
        return {
          severity: 'high',
          title: `Margin call issued — ${str('case_number') || entityId} (${tier} / ${str('trader_party') || ''} / R${str('margin_called_zar') || 0} on ${str('instrument') || ''})`.trim(),
        };
      }
      return null;
    }
    case 'poslimit.escalated': {
      return {
        severity: 'critical',
        title: `Forced liquidation triggered — ${str('case_number') || entityId} (${str('trader_tier') || ''} / ${str('trader_party') || ''} / ${str('instrument') || ''} / order ${str('liquidation_order_ref') || 'pending'})`.trim(),
      };
    }
    case 'poslimit.sla_breached': {
      return {
        severity: 'high',
        title: `Position limit cure SLA breached — ${str('case_number') || entityId} (${str('trader_tier') || ''} / ${str('chain_status') || ''} / ${str('trader_party') || ''})`.trim(),
      };
    }

    // ─── Wave 30 — Lender Disbursement UoP Reconciliation chain — SARB + Equator Principles ───
    // Clawback is universal hard line: ALL tiers cross to SARB Exchange Control + Equator Principles
    // secretariat. SLA breach crosses for senior_a + senior_b only (bridges/mezz aggregated in
    // monthly Banking Sector Conduct Standards returns).
    case 'disbursement.clawback_executed': {
      return {
        severity: 'critical',
        title: `Disbursement clawback executed — ${str('case_number') || entityId} (${str('tranche_tier') || ''} / ${str('lender_party') || ''} ↔ ${str('borrower_party') || ''} / R${str('clawback_amount_zar') || 0} on facility ${str('facility_ref') || ''} / SARB ${str('sarb_exchange_control_ref') || 'pending'} / EP ${str('equator_principles_ref') || 'pending'})`.trim(),
      };
    }
    case 'disbursement.sla_breached': {
      const tier = str('tranche_tier');
      if (tier === 'senior_a' || tier === 'senior_b') {
        return {
          severity: 'high',
          title: `Disbursement UoP SLA breached — ${str('case_number') || entityId} (${tier} / ${str('chain_status') || ''} / ${str('lender_party') || ''} ↔ ${str('borrower_party') || ''} / facility ${str('facility_ref') || ''})`.trim(),
        };
      }
      return null;
    }

    // ─── Wave 31 — Regulator Compliance Notice Disposition chain — NERSA Act §10 ───
    // close + escalate cross Council for critical + high only (systemic / safety / financial);
    // sla_breached crosses for ALL tiers (Section 10 hard line — DG-level reporting).
    // dismiss / refer are audit-only.
    case 'disposition.closed': {
      const tier = str('severity_tier');
      if (tier === 'critical' || tier === 'high') {
        return {
          severity: tier === 'critical' ? 'critical' : 'high',
          title: `Disposition closed — ${str('case_number') || entityId} (${tier} / ${str('source_wave') || ''} / ${str('source_party') || ''} / Council ${str('council_panel_ref') || 'pending'} / §10 ${str('section10_report_ref') || 'pending'})`.trim(),
        };
      }
      return null;
    }
    case 'disposition.escalated': {
      const tier = str('severity_tier');
      if (tier === 'critical' || tier === 'high') {
        return {
          severity: 'critical',
          title: `Disposition escalated to Council — ${str('case_number') || entityId} (${tier} / ${str('source_wave') || ''} / ${str('source_party') || ''} / Council ${str('council_panel_ref') || 'pending'} / §10 ${str('section10_report_ref') || 'pending'})`.trim(),
        };
      }
      return null;
    }
    case 'disposition.sla_breached': {
      return {
        severity: 'critical',
        title: `Disposition SLA breached (§10) — ${str('case_number') || entityId} (${str('severity_tier') || ''} / ${str('chain_status') || ''} / ${str('source_wave') || ''} / ${str('source_party') || ''})`.trim(),
      };
    }

    // ─── Wave 32 — Offtaker Take-or-Pay Annual Reconciliation ─────────────
    // settle + dispute + waive cross for catastrophic + major tiers.
    // sla_breached crosses for ALL tiers (annual TOP return hard line).
    case 'top.settled': {
      const tier = str('severity_tier');
      if (tier === 'catastrophic' || tier === 'major') {
        return {
          severity: tier === 'catastrophic' ? 'critical' : 'high',
          title: `TOP settled — ${str('case_number') || entityId} (Y${num('reconciliation_year')} / ${tier} / ${num('shortfall_pct').toFixed(1)}% / R${(num('top_amount_settled') / 1_000_000).toFixed(1)}m / ${str('settlement_ref') || ''})`.trim(),
        };
      }
      return null;
    }
    case 'top.disputed': {
      const tier = str('severity_tier');
      if (tier === 'catastrophic' || tier === 'major') {
        return {
          severity: 'critical',
          title: `TOP disputed (Section 34) — ${str('case_number') || entityId} (Y${num('reconciliation_year')} / ${tier} / ${num('shortfall_pct').toFixed(1)}% / panel ${str('dispute_panel_ref') || 'pending'} / filing ${str('section34_filing_ref') || 'pending'})`.trim(),
        };
      }
      return null;
    }
    case 'top.waived': {
      const tier = str('severity_tier');
      if (tier === 'catastrophic' || tier === 'major') {
        return {
          severity: tier === 'catastrophic' ? 'critical' : 'high',
          title: `TOP waived — ${str('case_number') || entityId} (Y${num('reconciliation_year')} / ${tier} / ${num('shortfall_pct').toFixed(1)}% / ${str('waiver_minute_ref') || ''})`.trim(),
        };
      }
      return null;
    }
    case 'top.sla_breached': {
      return {
        severity: 'critical',
        title: `TOP SLA breached — ${str('case_number') || entityId} (Y${num('reconciliation_year')} / ${str('severity_tier') || ''} / ${str('chain_status') || ''} / ${num('shortfall_pct').toFixed(1)}%)`.trim(),
      };
    }

    // ─── Wave 33 — Regulator Licence Renewal (NERSA s14-s16) ──────────────
    // refused crosses for ALL tiers; granted + amended cross for generation_utility only.
    // sla_breached crosses for ALL tiers (s14(2)(b) statutory hard line).
    case 'licence_renewal.refused': {
      const klass = str('licence_class');
      return {
        severity: klass === 'generation_utility' ? 'critical' : 'high',
        title: `Licence renewal REFUSED — ${str('case_number') || entityId} (${klass || ''} / ${str('applicant_party_name') || ''} / ${str('facility_name') || ''} / appeal ${str('appeal_filing_ref') || '—'})`.trim(),
      };
    }
    case 'licence_renewal.granted': {
      const klass = str('licence_class');
      if (klass === 'generation_utility') {
        return {
          severity: 'high',
          title: `Utility licence GRANTED — ${str('case_number') || entityId} (${str('applicant_party_name') || ''} / ${str('facility_name') || ''} → ${str('granted_expiry_date') || ''})`.trim(),
        };
      }
      return null;
    }
    case 'licence_renewal.amended': {
      const klass = str('licence_class');
      if (klass === 'generation_utility') {
        return {
          severity: 'high',
          title: `Utility licence AMENDED — ${str('case_number') || entityId} (${str('applicant_party_name') || ''} / ${str('facility_name') || ''} / conditions attached → ${str('granted_expiry_date') || ''})`.trim(),
        };
      }
      return null;
    }
    case 'licence_renewal.sla_breached': {
      return {
        severity: 'critical',
        title: `Licence renewal SLA breached — ${str('case_number') || entityId} (${str('licence_class') || ''} / ${str('chain_status') || ''} / ${str('applicant_party_name') || ''})`.trim(),
      };
    }

    // ─── Wave 34 — Grid CSC-1 Load Curtailment (NERSA Grid Code §CSC-1 + §C-3) ──
    // refused crosses for ALL stages (§C-3 mandatory disclosure).
    // partial_compliance crosses for stage_3_4+.
    // target_achieved + post_mortem_closed cross for stage_5_6+ (national reporting).
    // sla_breached crosses for stage_5_6+ only.
    case 'load_curtailment.refused': {
      const stage = str('load_shed_stage');
      const severity: InboxSeverity = (stage === 'stage_5_6' || stage === 'stage_7_8') ? 'critical' : 'high';
      return {
        severity,
        title: `Load curtailment REFUSED — ${str('case_number') || entityId} (${stage} / ${str('customer_party_name') || ''} / ${str('target_mw') || ''}MW / tribunal ${str('tribunal_case_ref') || '—'})`.trim(),
      };
    }
    case 'load_curtailment.partial_compliance': {
      const stage = str('load_shed_stage');
      if (stage === 'stage_1_2') return null;
      const severity: InboxSeverity = stage === 'stage_7_8' ? 'critical' : 'high';
      return {
        severity,
        title: `Load curtailment PARTIAL — ${str('case_number') || entityId} (${stage} / ${str('customer_party_name') || ''} / ${num('actual_shed_mw')}MW of ${num('target_mw')}MW / penalty R${num('penalty_zar')})`.trim(),
      };
    }
    case 'load_curtailment.target_achieved': {
      const stage = str('load_shed_stage');
      if (stage !== 'stage_5_6' && stage !== 'stage_7_8') return null;
      return {
        severity: stage === 'stage_7_8' ? 'high' : 'medium',
        title: `Load curtailment target achieved — ${str('case_number') || entityId} (${stage} / ${str('customer_party_name') || ''} / ${num('actual_shed_mw') || num('target_mw')}MW)`.trim(),
      };
    }
    case 'load_curtailment.post_mortem_closed': {
      const stage = str('load_shed_stage');
      if (stage !== 'stage_5_6' && stage !== 'stage_7_8') return null;
      return {
        severity: stage === 'stage_7_8' ? 'high' : 'medium',
        title: `Load curtailment post-mortem closed — ${str('case_number') || entityId} (${stage} / ${str('customer_party_name') || ''} / ${str('post_mortem_ref') || ''})`.trim(),
      };
    }
    case 'load_curtailment.sla_breached': {
      const stage = str('load_shed_stage');
      if (stage !== 'stage_5_6' && stage !== 'stage_7_8') return null;
      return {
        severity: 'critical',
        title: `Load curtailment SLA breached — ${str('case_number') || entityId} (${stage} / ${str('chain_status') || ''} / ${str('customer_party_name') || ''})`.trim(),
      };
    }

    // ─── Wave 35 — Esums O&M Warranty Vendor-Side Escalation (CPA §56/§61 + NRCS) ──
    // recall_issued crosses for ALL classes (NRCS recall always notifiable).
    // oem_decision crosses for safety_recall only (CPA §61 product-liability).
    // arbitration + closed cross for safety_recall + fleet_systemic.
    // sla_breached crosses for safety_recall + fleet_systemic.
    case 'vendor_escalation.recall_issued': {
      const cls = str('defect_class');
      return {
        severity: cls === 'safety_recall' ? 'critical' : 'high',
        title: `Component RECALL issued — ${str('case_number') || entityId} (${cls} / ${str('component_type') || ''} ${str('component_model') || ''} / ${num('fleet_units_affected')} units / OEM ${str('oem_party_name') || str('vendor_party_name') || ''} / recall ${str('recall_ref') || '—'})`.trim(),
      };
    }
    case 'vendor_escalation.oem_decision': {
      const cls = str('defect_class');
      if (cls !== 'safety_recall') return null;
      return {
        severity: 'high',
        title: `Safety-defect OEM determination — ${str('case_number') || entityId} (${str('component_type') || ''} ${str('component_model') || ''} / ${num('fleet_units_affected')} units / liability ${str('liability_accepted') === '1' ? 'accepted' : 'disputed'} / OEM ${str('oem_party_name') || ''})`.trim(),
      };
    }
    case 'vendor_escalation.arbitration': {
      const cls = str('defect_class');
      if (cls !== 'safety_recall' && cls !== 'fleet_systemic') return null;
      return {
        severity: cls === 'safety_recall' ? 'critical' : 'high',
        title: `Vendor warranty dispute → arbitration — ${str('case_number') || entityId} (${cls} / ${str('component_type') || ''} / R${num('claim_value_zar')} / case ${str('arbitration_case_ref') || '—'})`.trim(),
      };
    }
    case 'vendor_escalation.closed': {
      const cls = str('defect_class');
      if (cls !== 'safety_recall' && cls !== 'fleet_systemic') return null;
      return {
        severity: cls === 'safety_recall' ? 'high' : 'medium',
        title: `Reportable vendor-defect closed — ${str('case_number') || entityId} (${cls} / ${str('component_type') || ''} / remedy ${str('remedy_type') || ''} R${num('remedy_cost_zar')})`.trim(),
      };
    }
    case 'vendor_escalation.sla_breached': {
      const cls = str('defect_class');
      if (cls !== 'safety_recall' && cls !== 'fleet_systemic') return null;
      return {
        severity: 'critical',
        title: `Vendor escalation SLA breached — ${str('case_number') || entityId} (${cls} / ${str('chain_status') || ''} / ${str('component_type') || ''} / ${str('vendor_party_name') || ''})`.trim(),
      };
    }

    // ─── Wave 36 — Trader Best-Execution / RFQ Compliance (FSCA Conduct Standard 1 of 2020 + FAIS) ──
    // exception_escalated crosses for EVERY tier (a deliberate best-ex breach
    // escalation is always notifiable, even for an ECP).
    // override_executed crosses for retail + professional only (ECP waived best-ex).
    // sla_breached crosses for retail + professional only.
    case 'best_execution.exception_escalated': {
      const tier = str('client_tier');
      return {
        severity: tier === 'retail' ? 'critical' : 'high',
        title: `Best-execution exception escalated — ${str('rfq_number') || entityId} (${tier} / ${str('instrument') || ''} / R${num('notional_zar')} notional / slippage ${str('slippage_bps') || '—'}bps / desk ${str('desk_party_name') || ''})`.trim(),
      };
    }
    case 'best_execution.override_executed': {
      const tier = str('client_tier');
      if (tier !== 'retail' && tier !== 'professional') return null;
      return {
        severity: tier === 'retail' ? 'high' : 'medium',
        title: `Best-ex override — executed away from best quote — ${str('rfq_number') || entityId} (${tier} / ${str('instrument') || ''} / best CP ${str('best_quote_counterparty') || ''} → exec CP ${str('executed_counterparty') || ''} / R${num('notional_zar')})`.trim(),
      };
    }
    case 'best_execution.sla_breached': {
      const tier = str('client_tier');
      if (tier !== 'retail' && tier !== 'professional') return null;
      return {
        severity: tier === 'retail' ? 'high' : 'medium',
        title: `Best-execution SLA breached — ${str('rfq_number') || entityId} (${tier} / ${str('chain_status') || ''} / ${str('instrument') || ''} / client ${str('client_party_name') || ''})`.trim(),
      };
    }

    // ─── Wave 37 — Carbon Project Registration / PDD Validation (Gold Standard + Verra VCS + Article 6.4 + SA DFFE DNA) ──
    // rejected crosses for EVERY tier (stopping a non-additional / fraudulent
    // mitigation project is always a market-integrity event).
    // registered crosses for high-integrity tiers (afolu_redd + large_scale) only.
    // sla_breached crosses for high-integrity tiers only.
    case 'carbon_registration.rejected': {
      const tier = str('project_tier');
      return {
        severity: tier === 'afolu_redd' ? 'critical' : 'high',
        title: `Carbon project rejected — ${str('project_number') || entityId} (${tier} / ${str('standard') || ''} / ${str('methodology') || ''} / ${str('project_name') || ''} / developer ${str('developer_party_name') || ''}${str('reason_code') ? ' / ' + str('reason_code') : ''})`.trim(),
      };
    }
    case 'carbon_registration.registered': {
      const tier = str('project_tier');
      if (tier !== 'afolu_redd' && tier !== 'large_scale') return null;
      return {
        severity: tier === 'afolu_redd' ? 'high' : 'medium',
        title: `Carbon project registered — ${str('project_number') || entityId} (${tier} / ${str('standard') || ''} / ${num('estimated_total_tco2e')} tCO₂e / serial ${str('registered_serial_block') || '—'} / ${str('project_name') || ''})`.trim(),
      };
    }
    case 'carbon_registration.sla_breached': {
      const tier = str('project_tier');
      if (tier !== 'afolu_redd' && tier !== 'large_scale') return null;
      return {
        severity: tier === 'afolu_redd' ? 'high' : 'medium',
        title: `Carbon registration SLA breached — ${str('project_number') || entityId} (${tier} / ${str('chain_status') || ''} / ${str('standard') || ''} / developer ${str('developer_party_name') || ''})`.trim(),
      };
    }

    // ─── Wave 38 — Lender Covenant Compliance Certificate (LMA + Equator Principles + SARB large-exposure) ──
    // accelerate (event of default) crosses for EVERY tier (declaring an EoD is
    // always notifiable — SARB large-exposure hard line). breach declarations +
    // SLA breaches cross for senior_secured + mezzanine only (subordinated
    // breaches sit between junior lenders, less systemic).
    case 'covenant_certificate.accelerated': {
      const tier = str('facility_tier');
      return {
        severity: tier === 'senior_secured' ? 'critical' : 'high',
        title: `Covenant acceleration (event of default) — ${str('certificate_number') || entityId} (${tier} / ${str('facility_name') || ''} / borrower ${str('borrower_party_name') || ''} / breached ${str('breached_covenants') || '—'}${str('reason_code') ? ' / ' + str('reason_code') : ''})`.trim(),
      };
    }
    case 'covenant_certificate.breach_identified': {
      const tier = str('facility_tier');
      if (tier !== 'senior_secured' && tier !== 'mezzanine') return null;
      return {
        severity: tier === 'senior_secured' ? 'high' : 'medium',
        title: `Covenant breach declared — ${str('certificate_number') || entityId} (${tier} / ${str('facility_name') || ''} / ${str('test_period') || ''} / breached ${str('breached_covenants') || '—'} / borrower ${str('borrower_party_name') || ''})`.trim(),
      };
    }
    case 'covenant_certificate.sla_breached': {
      const tier = str('facility_tier');
      if (tier !== 'senior_secured' && tier !== 'mezzanine') return null;
      return {
        severity: tier === 'senior_secured' ? 'high' : 'medium',
        title: `Covenant certificate SLA breached — ${str('certificate_number') || entityId} (${tier} / ${str('chain_status') || ''} / ${str('facility_name') || ''} / borrower ${str('borrower_party_name') || ''})`.trim(),
      };
    }

    // ─── Wave 39 — Offtaker PPA Tariff Indexation / CPI Escalation (NERSA ERA §4 tariff oversight) ──
    // refer_arbitration crosses for EVERY tier (referring a tariff dispute to
    // NERSA / arbitration is always notifiable). dispute declarations + SLA
    // breaches cross for utility_scale + commercial only (embedded disputes sit
    // between two private parties, less systemic).
    case 'tariff_indexation.arbitrated': {
      const tier = str('contract_tier');
      return {
        severity: tier === 'utility_scale' ? 'critical' : 'high',
        title: `Tariff indexation referred to arbitration — ${str('indexation_number') || entityId} (${tier} / ${str('project_name') || ''} / offtaker ${str('offtaker_party_name') || ''} / disputed R${str('disputed_amount_zar') || '—'}${str('reason_code') ? ' / ' + str('reason_code') : ''})`.trim(),
      };
    }
    case 'tariff_indexation.disputed': {
      const tier = str('contract_tier');
      if (tier !== 'utility_scale' && tier !== 'commercial') return null;
      return {
        severity: tier === 'utility_scale' ? 'high' : 'medium',
        title: `Tariff indexation disputed — ${str('indexation_number') || entityId} (${tier} / ${str('project_name') || ''} / ${str('index_type') || ''} / offtaker ${str('offtaker_party_name') || ''} / disputed R${str('disputed_amount_zar') || '—'})`.trim(),
      };
    }
    case 'tariff_indexation.sla_breached': {
      const tier = str('contract_tier');
      if (tier !== 'utility_scale' && tier !== 'commercial') return null;
      return {
        severity: tier === 'utility_scale' ? 'high' : 'medium',
        title: `Tariff indexation SLA breached — ${str('indexation_number') || entityId} (${tier} / ${str('chain_status') || ''} / ${str('project_name') || ''} / offtaker ${str('offtaker_party_name') || ''})`.trim(),
      };
    }

    // ─── Wave 40 — Regulator Compliance Inspection & Enforcement (NERSA ERA §10 + §34/§35) ──
    // A regulator-native chain that still surfaces its significant enforcement
    // decisions onto the Council oversight queue / Tribunal docket. lodge_appeal
    // crosses for EVERY tier (any appeal lands on the Tribunal docket). penalty
    // impositions + SLA breaches cross for critical + serious only (minor
    // administrative penalties are handled at officer level).
    case 'compliance_inspection.appealed': {
      const tier = str('contravention_tier');
      return {
        severity: tier === 'critical' ? 'critical' : 'high',
        title: `Compliance penalty appealed to Tribunal — ${str('inspection_number') || entityId} (${tier} / ${str('facility_name') || ''} / respondent ${str('respondent_party_name') || ''} / penalty R${str('penalty_amount_zar') || '—'}${str('appeal_ref') ? ' / ' + str('appeal_ref') : ''})`.trim(),
      };
    }
    case 'compliance_inspection.penalty_imposed': {
      const tier = str('contravention_tier');
      if (tier !== 'critical' && tier !== 'serious') return null;
      return {
        severity: tier === 'critical' ? 'critical' : 'high',
        title: `Compliance penalty imposed — ${str('inspection_number') || entityId} (${tier} / ${str('facility_name') || ''} / respondent ${str('respondent_party_name') || ''} / R${str('penalty_amount_zar') || '—'}${str('reason_code') ? ' / ' + str('reason_code') : ''})`.trim(),
      };
    }
    case 'compliance_inspection.sla_breached': {
      const tier = str('contravention_tier');
      if (tier !== 'critical' && tier !== 'serious') return null;
      return {
        severity: tier === 'critical' ? 'high' : 'medium',
        title: `Compliance inspection SLA breached — ${str('inspection_number') || entityId} (${tier} / ${str('chain_status') || ''} / ${str('facility_name') || ''} / respondent ${str('respondent_party_name') || ''})`.trim(),
      };
    }

    // ─── Wave 41 — OEM-Support ITIL Problem Management (ITIL 4 + ISO/IEC 20000-1) ──
    // Internal IT/OT problem management; MAJOR PROBLEMS ONLY surface to the
    // regulator — a major problem touching a regulated platform service is a
    // market-availability / integrity matter. escalate + close + sla_breached
    // cross for major_problem; everything else is internal.
    case 'problem_management.escalated': {
      if (str('problem_priority') !== 'major_problem') return null;
      return {
        severity: 'high',
        title: `Major problem escalated — ${str('problem_number') || entityId} (${str('service_name') || ''}${str('affected_tenant') ? ' / ' + str('affected_tenant') : ''}${str('reason_code') ? ' / ' + str('reason_code') : ''}${str('major_problem_ref') ? ' / ' + str('major_problem_ref') : ''})`.trim(),
      };
    }
    case 'problem_management.closed': {
      if (str('problem_priority') !== 'major_problem') return null;
      return {
        severity: 'medium',
        title: `Major problem closed — ${str('problem_number') || entityId} (${str('service_name') || ''}${str('reason_code') ? ' / ' + str('reason_code') : ''})`.trim(),
      };
    }
    case 'problem_management.sla_breached': {
      if (str('problem_priority') !== 'major_problem') return null;
      return {
        severity: 'medium',
        title: `Major problem SLA breached — ${str('problem_number') || entityId} (${str('chain_status') || ''} / ${str('service_name') || ''})`.trim(),
      };
    }

    // ─── Wave 42 — Carbon Reversal / Buffer-Pool & Permanence Management ──
    // Integrity safeguard of the carbon-credit lifecycle. escalate (total
    // reversal / fraud / termination) AND require_replacement (intentional /
    // proponent-at-fault reversal) cross for EVERY tier — both are market-
    // integrity events regardless of size. close + sla_breached cross for
    // material tiers (catastrophic + significant); minor unintentional
    // reversals are routine buffer accounting and stay internal.
    case 'carbon_reversal.escalated': {
      return {
        severity: 'high',
        title: `Carbon reversal escalated — ${str('reversal_number') || entityId} (${str('project_name') || ''}${str('reversal_cause') ? ' / ' + str('reversal_cause') : ''}${num('reversed_tco2e') ? ' / ' + num('reversed_tco2e').toLocaleString() + ' tCO2e' : ''}${str('regulator_ref') ? ' / ' + str('regulator_ref') : ''})`.trim(),
      };
    }
    case 'carbon_reversal.replacement_required': {
      return {
        severity: 'high',
        title: `Intentional carbon reversal — replacement required — ${str('reversal_number') || entityId} (${str('project_name') || ''}${str('reversal_cause') ? ' / ' + str('reversal_cause') : ''}${num('reversed_tco2e') ? ' / ' + num('reversed_tco2e').toLocaleString() + ' tCO2e' : ''})`.trim(),
      };
    }
    case 'carbon_reversal.closed': {
      const tier = str('reversal_tier');
      if (tier !== 'catastrophic' && tier !== 'significant') return null;
      return {
        severity: 'medium',
        title: `Material carbon reversal resolved — ${str('reversal_number') || entityId} (${str('project_name') || ''}${str('reason_code') ? ' / ' + str('reason_code') : ''})`.trim(),
      };
    }
    case 'carbon_reversal.sla_breached': {
      const tier = str('reversal_tier');
      if (tier !== 'catastrophic' && tier !== 'significant') return null;
      return {
        severity: 'medium',
        title: `Carbon reversal SLA breached — ${str('reversal_number') || entityId} (${str('chain_status') || ''} / ${str('project_name') || ''})`.trim(),
      };
    }

    // ─── Wave 43 — Tariff / Revenue (MYPD Price-Control) Determination ────
    // NERSA's economic-regulation core (ERA §15–§16 + MYPD + RCA). remit
    // (court set-aside) crosses for EVERY class — a judicial review is a
    // universal Council oversight event. issue_determination + reject +
    // sla_breached cross for material classes (multi_year + annual_tariff);
    // SSEG feed-in schedules are administrative and stay internal.
    case 'tariff_determination.remitted': {
      return {
        severity: 'high',
        title: `Tariff determination set aside (court remit) — ${str('determination_number') || entityId} (${str('determination_class') || ''} / ${str('tariff_entity') || ''}${str('court_ref') ? ' / ' + str('court_ref') : ''}${str('reason_code') ? ' / ' + str('reason_code') : ''})`.trim(),
      };
    }
    case 'tariff_determination.determination_issued': {
      const klass = str('determination_class');
      if (klass !== 'multi_year' && klass !== 'annual_tariff') return null;
      return {
        severity: 'medium',
        title: `Tariff determination issued — ${str('determination_number') || entityId} (${klass} / ${str('tariff_entity') || ''}${str('allowed_revenue_zar_m') ? ' / allowed R' + str('allowed_revenue_zar_m') + 'm' : ''}${str('tariff_increase_pct') ? ' / ' + str('tariff_increase_pct') + '%' : ''}${str('gazette_ref') ? ' / ' + str('gazette_ref') : ''})`.trim(),
      };
    }
    case 'tariff_determination.rejected': {
      const klass = str('determination_class');
      if (klass !== 'multi_year' && klass !== 'annual_tariff') return null;
      return {
        severity: 'medium',
        title: `Tariff revenue application rejected — ${str('determination_number') || entityId} (${klass} / ${str('tariff_entity') || ''}${str('reason_code') ? ' / ' + str('reason_code') : ''})`.trim(),
      };
    }
    case 'tariff_determination.sla_breached': {
      const klass = str('determination_class');
      if (klass !== 'multi_year' && klass !== 'annual_tariff') return null;
      return {
        severity: 'medium',
        title: `Tariff determination SLA breached — ${str('determination_number') || entityId} (${str('chain_status') || ''} / ${klass} / ${str('tariff_entity') || ''})`.trim(),
      };
    }

    // ─── Wave 44 — Trade-Repository Reporting & Reconciliation ───────────
    // The desk's post-trade FMA / FSCA OTC reporting obligation. THEMATIC
    // INVERSION: for a reporting chain the SLA breach IS the violation, so
    // sla_breached crosses for EVERY class (a late / missing transaction
    // report is directly sanctionable under the FMA). tr_rejected crosses
    // for material classes (otc_derivative + physical_forward); break_identified
    // crosses for otc_derivative only (the systemic-risk product).
    case 'trade_report.sla_breached': {
      return {
        severity: 'high',
        title: `Transaction report SLA breached — ${str('report_number') || entityId} (${str('chain_status') || ''} / ${str('report_class') || ''} / ${str('product') || ''}${str('counterparty_name') ? ' vs ' + str('counterparty_name') : ''})`.trim(),
      };
    }
    case 'trade_report.tr_rejected': {
      const klass = str('report_class');
      if (klass !== 'otc_derivative' && klass !== 'physical_forward') return null;
      return {
        severity: 'medium',
        title: `Trade Repository rejected report — ${str('report_number') || entityId} (${klass} / ${str('product') || ''}${str('rejection_ref') ? ' / ' + str('rejection_ref') : ''}${str('reason_code') ? ' / ' + str('reason_code') : ''})`.trim(),
      };
    }
    case 'trade_report.break_identified': {
      if (str('report_class') !== 'otc_derivative') return null;
      return {
        severity: 'medium',
        title: `OTC reconciliation break — ${str('report_number') || entityId} (${str('product') || ''}${str('counterparty_name') ? ' vs ' + str('counterparty_name') : ''}${str('break_ref') ? ' / ' + str('break_ref') : ''})`.trim(),
      };
    }

    // ─── Wave 45 — Lender Loan Default & Enforcement / Step-in (LMA EoD + SARB impairment + Insolvency/Companies Act business-rescue) ──
    // write_off (loss crystallised → SARB impairment) crosses for EVERY tier —
    // a realised credit loss is always notifiable (the universal hard line).
    // accelerate (event of default) + commence_enforcement (security enforcement
    // / step-in) + SLA breaches cross for senior_secured + mezzanine only
    // (subordinated workouts sit between junior lenders, less systemic).
    case 'loan_default.written_off': {
      const tier = str('facility_tier');
      return {
        severity: tier === 'subordinated' ? 'high' : 'critical',
        title: `Loan write-off (loss crystallised) — ${str('default_number') || entityId} (${tier} / ${str('facility_name') || ''} / borrower ${str('borrower_party_name') || ''} / loss R${str('write_off_amount') || '—'}${str('reason_code') ? ' / ' + str('reason_code') : ''})`.trim(),
      };
    }
    case 'loan_default.accelerated': {
      const tier = str('facility_tier');
      if (tier !== 'senior_secured' && tier !== 'mezzanine') return null;
      return {
        severity: tier === 'senior_secured' ? 'critical' : 'high',
        title: `Loan acceleration (event of default) — ${str('default_number') || entityId} (${tier} / ${str('facility_name') || ''} / borrower ${str('borrower_party_name') || ''} / ${str('default_type') || ''} / called R${str('accelerated_amount') || '—'})`.trim(),
      };
    }
    case 'loan_default.enforcement_commenced': {
      const tier = str('facility_tier');
      if (tier !== 'senior_secured' && tier !== 'mezzanine') return null;
      return {
        severity: tier === 'senior_secured' ? 'high' : 'medium',
        title: `Security enforcement / step-in commenced — ${str('default_number') || entityId} (${tier} / ${str('facility_name') || ''} / borrower ${str('borrower_party_name') || ''}${str('enforcement_ref') ? ' / ' + str('enforcement_ref') : ''})`.trim(),
      };
    }
    case 'loan_default.sla_breached': {
      const tier = str('facility_tier');
      if (tier !== 'senior_secured' && tier !== 'mezzanine') return null;
      return {
        severity: tier === 'senior_secured' ? 'high' : 'medium',
        title: `Loan default SLA breached — ${str('default_number') || entityId} (${tier} / ${str('chain_status') || ''} / ${str('facility_name') || ''} / borrower ${str('borrower_party_name') || ''})`.trim(),
      };
    }

    // ─── Wave 46 — Offtaker PPA Curtailment / Deemed-Energy Compensation (REIPPPP/PPA deemed-energy + NERSA Grid Code economic-dispatch curtailment) ──
    // refer_arbitration → arbitrated crosses for EVERY tier — a formal arbitration
    // referral is always notifiable (the universal hard line). reject_non_compensable
    // (denied claim → dispute risk) + settle_compensation (material system-cost
    // settlement) + SLA breaches cross for utility_scale + commercial only
    // (embedded / SSEG deemed-energy sits below the NERSA materiality threshold).
    case 'curtailment_claim.arbitrated': {
      const tier = str('facility_tier');
      return {
        severity: tier === 'utility_scale' ? 'critical' : 'high',
        title: `Curtailment claim referred to arbitration — ${str('claim_number') || entityId} (${tier} / ${str('facility_name') || ''} / seller ${str('seller_party_name') || ''}${str('arbiter_name') ? ' / ' + str('arbiter_name') : ''} / claimed R${str('claimed_amount') || '—'})`.trim(),
      };
    }
    case 'curtailment_claim.compensation_settled': {
      const tier = str('facility_tier');
      if (tier !== 'utility_scale' && tier !== 'commercial') return null;
      return {
        severity: tier === 'utility_scale' ? 'high' : 'medium',
        title: `Curtailment compensation settled (deemed energy) — ${str('claim_number') || entityId} (${tier} / ${str('facility_name') || ''} / seller ${str('seller_party_name') || ''} / paid R${str('settled_amount') || '—'})`.trim(),
      };
    }
    case 'curtailment_claim.non_compensable': {
      const tier = str('facility_tier');
      if (tier !== 'utility_scale' && tier !== 'commercial') return null;
      return {
        severity: tier === 'utility_scale' ? 'high' : 'medium',
        title: `Curtailment claim denied (non-compensable) — ${str('claim_number') || entityId} (${tier} / ${str('facility_name') || ''} / seller ${str('seller_party_name') || ''}${str('reason_code') ? ' / ' + str('reason_code') : ''})`.trim(),
      };
    }
    case 'curtailment_claim.sla_breached': {
      const tier = str('facility_tier');
      if (tier !== 'utility_scale' && tier !== 'commercial') return null;
      return {
        severity: tier === 'utility_scale' ? 'high' : 'medium',
        title: `Curtailment claim SLA breached — ${str('claim_number') || entityId} (${tier} / ${str('chain_status') || ''} / ${str('facility_name') || ''} / seller ${str('seller_party_name') || ''})`.trim(),
      };
    }

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
