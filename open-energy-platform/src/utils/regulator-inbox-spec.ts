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
