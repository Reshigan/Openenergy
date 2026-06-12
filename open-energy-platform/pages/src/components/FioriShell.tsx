import React, { useState, useMemo, useEffect, useRef, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { LogoMark } from './Logo';
import { MatIcon } from './OEIcon';
import { LtmLogo } from './LtmLogo';
import { themeFor } from '../lib/role-themes';

/* ════════════════════════════════════════════════════════════════════════
 * Open Energy Platform — App Shell
 * Forest Green gradient header · IBM Plex Sans / Metropolis · Material Symbols
 * Industrial-Fintech aesthetic — sized for data-dense workflows
 *
 * Filename retained as `FioriShell` for compat with existing imports.
 * ═══════════════════════════════════════════════════════════════════════ */

type NavItem = {
  path: string;
  label: string;
  icon: string;       // Material Symbols name
  section: string;
  badge?: string;
};

/**
 * Master navigation. Sections track the Stitch Launchpad grouping:
 * Home → Commerce → Operations → Sustainability → Finance → Insights → Compliance → System
 * Workstation deep-links are grouped per-role under their capability section names.
 */
const BASE_NAV: NavItem[] = [
  // ── Home ──────────────────────────────────────────────────────────────────
  { path: '/launch',       label: 'Launchpad',     icon: 'dashboard',          section: 'Home' },

  // ── Commerce ──────────────────────────────────────────────────────────────
  { path: '/contracts',    label: 'Contracts',     icon: 'description',        section: 'Commerce' },
  { path: '/lois',         label: 'Letters of Intent', icon: 'assignment',     section: 'Commerce' },
  { path: '/trading',      label: 'Trading',       icon: 'trending_up',        section: 'Commerce' },
  { path: '/settlement',   label: 'Settlement',    icon: 'receipt_long',       section: 'Commerce' },
  { path: '/settlement-ops', label: 'Settlement Ops', icon: 'receipt_long',    section: 'Commerce' },
  { path: '/procurement',  label: 'Procurement',   icon: 'shopping_cart',      section: 'Commerce' },
  { path: '/marketplace',  label: 'Marketplace',   icon: 'storefront',         section: 'Commerce' },
  { path: '/documents',    label: 'Documents',     icon: 'description',        section: 'Commerce' },

  // ── Trader workstation deep-links ─────────────────────────────────────────
  { path: '/trader-risk/workstation',                        label: 'Trader workstation',    icon: 'trending_up',   section: 'Trading' },
  { path: '/trader-risk/workstation?tab=orders',             label: 'Order book',            icon: 'trending_up',   section: 'Trading' },
  { path: '/trader-risk/workstation?tab=best-ex',            label: 'Best execution',        icon: 'search',        section: 'Trading' },
  { path: '/trader-risk/workstation?tab=trade-allocation',   label: 'Trade allocation',      icon: 'swap_horiz',    section: 'Trading' },
  { path: '/trader-risk/workstation?tab=risk',               label: 'Risk dashboard',        icon: 'insights',      section: 'Risk' },
  { path: '/trader-risk/workstation?tab=margin',             label: 'Margin',                icon: 'price_check',   section: 'Risk' },
  { path: '/trader-risk/workstation?tab=poslimit',           label: 'Position limits',       icon: 'warning',       section: 'Risk' },
  { path: '/trader-risk/workstation?tab=counterparty-margin',label: 'Counterparty margin',   icon: 'account_balance',section: 'Risk' },
  { path: '/trader-risk/workstation?tab=market-abuse',       label: 'Surveillance / STOR',   icon: 'security',      section: 'Compliance (Trader)' },
  { path: '/trader-risk/workstation?tab=algo-cert',          label: 'Algo certification',    icon: 'code',          section: 'Compliance (Trader)' },
  { path: '/trader-risk/workstation?tab=trade-reporting',    label: 'Trade reporting',       icon: 'description',   section: 'Compliance (Trader)' },
  { path: '/trader-risk/workstation?tab=fsca_conduct_reports',label: 'FSCA conduct reports', icon: 'gavel',         section: 'Compliance (Trader)' },
  { path: '/trader-risk/workstation?tab=cross_border_trades',label: 'Cross-border trades',   icon: 'public',        section: 'Compliance (Trader)' },

  // ── IPP workstation deep-links ────────────────────────────────────────────
  { path: '/ipp-lifecycle/workstation',                       label: 'IPP workstation',       icon: 'apartment',     section: 'Project Controls' },
  { path: '/ipp-lifecycle/workstation?tab=projects',          label: 'Projects',              icon: 'apartment',     section: 'Project Controls' },
  { path: '/ipp-lifecycle/workstation?tab=milestones',        label: 'Milestones',            icon: 'flag',          section: 'Project Controls' },
  { path: '/ipp-lifecycle/workstation?tab=stage-gates',       label: 'Stage gates',           icon: 'verified',      section: 'Project Controls' },
  { path: '/ipp-lifecycle/workstation?tab=risk-register',     label: 'Risk register',         icon: 'warning',       section: 'Project Controls' },
  { path: '/ipp-lifecycle/workstation?tab=milestone-variance',label: 'Milestone variance',    icon: 'timeline',      section: 'Project Controls' },
  { path: '/ipp-lifecycle/workstation?tab=document-control',  label: 'Document control',      icon: 'folder',        section: 'Document Control (IPP)' },
  { path: '/ipp-lifecycle/workstation?tab=submittals',        label: 'Submittals',            icon: 'upload_file',   section: 'Document Control (IPP)' },
  { path: '/ipp-lifecycle/workstation?tab=rfis',              label: 'RFIs',                  icon: 'help',          section: 'Document Control (IPP)' },
  { path: '/ipp-lifecycle/workstation?tab=change-orders',     label: 'Change orders',         icon: 'change_circle', section: 'Document Control (IPP)' },
  { path: '/ipp-lifecycle/workstation?tab=cod',               label: 'COD milestone',         icon: 'bolt',          section: 'Construction (IPP)' },
  { path: '/ipp-lifecycle/workstation?tab=hse_chain',         label: 'HSE incidents',         icon: 'health_and_safety', section: 'Construction (IPP)' },
  { path: '/ipp-lifecycle/workstation?tab=dscr-reports',      label: 'DSCR reports',          icon: 'bar_chart',     section: 'Finance (IPP)' },
  { path: '/ipp-lifecycle/workstation?tab=bonds',             label: 'Bonds & insurance',     icon: 'shield',        section: 'Finance (IPP)' },
  { path: '/ipp-lifecycle/workstation?tab=procurement',       label: 'REIPPPP procurement',   icon: 'shopping_cart', section: 'Regulatory (IPP)' },
  { path: '/ipp-lifecycle/workstation?tab=gca_chain',         label: 'Grid connection',       icon: 'electrical_services', section: 'Regulatory (IPP)' },

  // ── Lender workstation deep-links ─────────────────────────────────────────
  { path: '/lender-suite/workstation',                        label: 'Lender workstation',    icon: 'account_balance',section: 'Credit' },
  { path: '/lender-suite/workstation?tab=credit_origination', label: 'Credit origination',   icon: 'credit_card',   section: 'Credit' },
  { path: '/lender-suite/workstation?tab=facilities',         label: 'Facility register',     icon: 'description',   section: 'Credit' },
  { path: '/lender-suite/workstation?tab=cp_clearances',      label: 'CP clearances',         icon: 'checklist',     section: 'Credit' },
  { path: '/lender-suite/workstation?tab=drawdown',           label: 'Drawdowns',             icon: 'payments',      section: 'Credit' },
  { path: '/lender-suite/workstation?tab=covenant_cert',      label: 'Covenant certificates', icon: 'verified',      section: 'Monitoring' },
  { path: '/lender-suite/workstation?tab=dscr_monitoring',    label: 'DSCR monitoring',       icon: 'bar_chart',     section: 'Monitoring' },
  { path: '/lender-suite/workstation?tab=esap_monitoring_chain',label: 'ESAP monitoring',     icon: 'eco',           section: 'Monitoring' },
  { path: '/lender-suite/workstation?tab=loan_default',       label: 'Default & enforcement', icon: 'gavel',         section: 'Default Management' },

  // ── Offtaker workstation deep-links ───────────────────────────────────────
  { path: '/offtaker-suite/workstation',                      label: 'Offtaker workstation',  icon: 'flash_on',      section: 'Contracts (Offtaker)' },
  { path: '/offtaker-suite/workstation?tab=ppa_contract',     label: 'PPA contracts',         icon: 'description',   section: 'Contracts (Offtaker)' },
  { path: '/offtaker-suite/workstation?tab=tariff_indexation',label: 'Tariff indexation',     icon: 'price_change',  section: 'Contracts (Offtaker)' },
  { path: '/offtaker-suite/workstation?tab=payment_security', label: 'Payment security',      icon: 'shield',        section: 'Contracts (Offtaker)' },
  { path: '/offtaker-suite/workstation?tab=ppa_annual_recon', label: 'PPA reconciliation',    icon: 'balance',       section: 'Operations (Offtaker)' },
  { path: '/offtaker-suite/workstation?tab=curtailment_claim',label: 'Curtailment claims',    icon: 'electric_bolt', section: 'Operations (Offtaker)' },
  { path: '/offtaker-suite/workstation?tab=take_or_pay',      label: 'Take-or-pay',           icon: 'gavel',         section: 'Operations (Offtaker)' },
  { path: '/offtaker-suite/workstation?tab=recs',             label: 'RECs & sustainability', icon: 'eco',           section: 'Compliance (Offtaker)' },
  { path: '/offtaker-suite/workstation?tab=scope2',           label: 'Scope 2 reporting',     icon: 'public',        section: 'Compliance (Offtaker)' },

  // ── Grid workstation deep-links ───────────────────────────────────────────
  { path: '/grid-operator/workstation',                        label: 'Grid workstation',     icon: 'bolt',          section: 'Operations (Grid)' },
  { path: '/grid-operator/workstation?tab=dispatch_nomination',label: 'Dispatch nominations', icon: 'bolt',          section: 'Operations (Grid)' },
  { path: '/grid-operator/workstation?tab=demand_response',    label: 'Demand response',      icon: 'electric_bolt', section: 'Operations (Grid)' },
  { path: '/grid-operator/workstation?tab=ancillary',          label: 'Ancillary services',   icon: 'settings_backup_restore', section: 'Operations (Grid)' },
  { path: '/grid-operator/workstation?tab=eop_activations',    label: 'EOP activations',      icon: 'emergency',     section: 'Operations (Grid)' },
  { path: '/grid-operator/workstation?tab=planned_outage',     label: 'Planned outages',      icon: 'event',         section: 'Infrastructure' },
  { path: '/grid-operator/workstation?tab=substation-assets',  label: 'Substation assets',    icon: 'power',         section: 'Infrastructure' },
  { path: '/grid-operator/workstation?tab=wheeling_charges',   label: 'Wheeling charges',     icon: 'receipt',       section: 'Commercial (Grid)' },
  { path: '/grid-operator/workstation?tab=grid_capacity_allocations',label:'Capacity queue',  icon: 'queue',         section: 'Commercial (Grid)' },
  { path: '/grid-operator/workstation?tab=grid_code_compliance',label: 'Grid code compliance',icon: 'gavel',         section: 'Regulatory (Grid)' },

  // ── Carbon workstation deep-links ─────────────────────────────────────────
  { path: '/carbon-registry/workstation',                      label: 'Carbon workstation',   icon: 'eco',           section: 'Registry' },
  { path: '/carbon-registry/workstation?tab=mrv_chain',        label: 'MRV verification',     icon: 'verified',      section: 'Registry' },
  { path: '/carbon-registry/workstation?tab=registration_chain',label: 'Project registration',icon: 'app_registration', section: 'Registry' },
  { path: '/carbon-registry/workstation?tab=retirement_chain', label: 'Credit retirements',   icon: 'delete_forever',section: 'Transactions (Carbon)' },
  { path: '/carbon-registry/workstation?tab=article6',         label: 'Article 6 ITMOs',      icon: 'swap_horiz',    section: 'Transactions (Carbon)' },
  { path: '/carbon-registry/workstation?tab=erpa_chain',       label: 'ERPA forward delivery',icon: 'schedule',      section: 'Transactions (Carbon)' },
  { path: '/carbon-registry/workstation?tab=reversal_chain',   label: 'Carbon reversals',     icon: 'restart_alt',   section: 'Integrity (Carbon)' },
  { path: '/carbon-registry/workstation?tab=carbon_tax_returns',label:'Carbon tax returns',   icon: 'receipt',       section: 'Integrity (Carbon)' },

  // ── Regulator workstation deep-links ──────────────────────────────────────
  { path: '/regulator-suite/workstation',                      label: 'Regulator workstation',icon: 'gavel',         section: 'Inbox (Regulator)' },
  { path: '/regulator-suite/workstation?tab=inbox',            label: 'Regulatory inbox',     icon: 'inbox',         section: 'Inbox (Regulator)' },
  { path: '/regulator-suite/workstation?tab=surveillance',     label: 'Surveillance',         icon: 'monitor_heart', section: 'Inbox (Regulator)' },
  { path: '/regulator-suite/workstation?tab=licence_applications',label:'Licence applications',icon: 'approval',     section: 'Licensing' },
  { path: '/regulator-suite/workstation?tab=licence_renewals', label: 'Licence renewals',     icon: 'autorenew',     section: 'Licensing' },
  { path: '/regulator-suite/workstation?tab=compliance_inspections',label:'Inspections',      icon: 'fact_check',    section: 'Enforcement' },
  { path: '/regulator-suite/workstation?tab=enforcement',      label: 'Enforcement actions',  icon: 'security',      section: 'Enforcement' },
  { path: '/regulator-suite/workstation?tab=tariff_determinations',label:'Tariff determinations',icon:'price_change', section: 'Economics' },
  { path: '/regulator-suite/workstation?tab=levy_assessments', label: 'Levy assessments',     icon: 'receipt',       section: 'Economics' },

  // ── Admin workstation deep-links ──────────────────────────────────────────
  { path: '/admin-platform/workstation',                       label: 'Platform admin',       icon: 'settings',      section: 'Platform' },
  { path: '/admin-platform/workstation?tab=kyc-verifications', label: 'KYC verifications',    icon: 'verified_user', section: 'Platform' },
  { path: '/admin-platform/workstation?tab=flags',             label: 'Feature flags',        icon: 'toggle_on',     section: 'Platform' },
  { path: '/admin-platform/workstation?tab=cascade-dlq',       label: 'Cascade DLQ',          icon: 'error',         section: 'Audit' },
  { path: '/admin-platform/workstation?tab=settlement_audit',  label: 'Settlement audit',     icon: 'balance',       section: 'Audit' },
  { path: '/admin-platform/workstation?tab=anomaly-detection-ml',label:'Anomaly ML',          icon: 'psychology',    section: 'ML & AI' },

  // ── Support workstation deep-links ────────────────────────────────────────
  { path: '/support/workstation',                              label: 'Support workstation',  icon: 'support_agent', section: 'Tickets' },
  { path: '/support/workstation?tab=ticket_chain',             label: 'Ticket lifecycle',     icon: 'support_agent', section: 'Tickets' },
  { path: '/support/workstation?tab=csat',                     label: 'CSAT & SLA',           icon: 'star',          section: 'Tickets' },
  { path: '/support/workstation?tab=problem_chain',            label: 'Problem management',   icon: 'bug_report',    section: 'ITIL Chains' },
  { path: '/support/workstation?tab=change_chain',             label: 'Change enablement',    icon: 'change_circle', section: 'ITIL Chains' },
  { path: '/support/workstation?tab=security_remediation',     label: 'Security remediations',icon: 'security',      section: 'ITIL Chains' },
  { path: '/support/workstation?tab=warranty_recovery',        label: 'Warranty recovery',    icon: 'build',         section: 'OEM' },
  { path: '/support/workstation?tab=spare_parts',              label: 'Spare parts',          icon: 'inventory',     section: 'OEM' },

  // ── ESCO workstation deep-links ───────────────────────────────────────────
  { path: '/esco/workstation',                                 label: 'O&M workstation',      icon: 'build',         section: 'Portfolio' },
  { path: '/esco/workstation?tab=service-contracts',           label: 'Service contracts',    icon: 'description',   section: 'Portfolio' },
  { path: '/esco/workstation?tab=work-orders',                 label: 'Work orders',          icon: 'build',         section: 'Operations (O&M)' },
  { path: '/esco/workstation?tab=pm-compliance',               label: 'PM compliance',        icon: 'event_repeat',  section: 'Operations (O&M)' },
  { path: '/esco/workstation?tab=permit-to-work',              label: 'Permit-to-work',       icon: 'key',           section: 'Operations (O&M)' },
  { path: '/esco/workstation?tab=prognostics',                 label: 'Asset prognostics',    icon: 'psychology',    section: 'Asset Health' },
  { path: '/esco/workstation?tab=availability',                label: 'Availability guarantees',icon:'health_and_safety', section: 'Asset Health' },
  { path: '/esco/workstation?tab=spare-parts',                 label: 'Spare parts',          icon: 'inventory',     section: 'Supply Chain' },
  { path: '/esco/workstation?tab=vendor-escalation',           label: 'Vendor escalation',    icon: 'escalator_warning', section: 'Supply Chain' },
  { path: '/esco/workstation?tab=warranty-claims',             label: 'Warranty claims',      icon: 'shield',        section: 'Supply Chain' },
  { path: '/esco/workstation?tab=hse',                         label: 'HSE incidents',        icon: 'health_and_safety', section: 'Safety (O&M)' },
  { path: '/esco/workstation?tab=commissioning',               label: 'Site commissioning',   icon: 'electric_bolt', section: 'Safety (O&M)' },

  // ── EPC workstation deep-links ────────────────────────────────────────────
  { path: '/epc/workstation',                                  label: 'EPC workstation',      icon: 'construction',  section: 'Document Control (EPC)' },
  { path: '/epc/workstation?tab=submittals',                   label: 'Submittals',           icon: 'upload_file',   section: 'Document Control (EPC)' },
  { path: '/epc/workstation?tab=rfis',                         label: 'RFIs',                 icon: 'help',          section: 'Document Control (EPC)' },
  { path: '/epc/workstation?tab=change-orders',                label: 'Change orders',        icon: 'change_circle', section: 'Document Control (EPC)' },
  { path: '/epc/workstation?tab=technical-queries',            label: 'Technical queries',    icon: 'quiz',          section: 'Document Control (EPC)' },
  { path: '/epc/workstation?tab=itps',                         label: 'ITPs',                 icon: 'checklist',     section: 'Quality (EPC)' },
  { path: '/epc/workstation?tab=ncrs',                         label: 'NCRs',                 icon: 'report',        section: 'Quality (EPC)' },
  { path: '/epc/workstation?tab=punch-list',                   label: 'Punch list',           icon: 'playlist_add_check', section: 'Quality (EPC)' },
  { path: '/epc/workstation?tab=method-statements',            label: 'Method statements',    icon: 'article',       section: 'Quality (EPC)' },
  { path: '/epc/workstation?tab=site-diary',                   label: 'Site diary',           icon: 'book',          section: 'Site (EPC)' },
  { path: '/epc/workstation?tab=hse',                          label: 'HSE incidents',        icon: 'health_and_safety', section: 'Site (EPC)' },

  // ── Shared Ops / Sustainability / Finance / Insights ─────────────────────
  { path: '/projects',     label: 'IPP Projects',  icon: 'apartment',          section: 'Operations' },
  { path: '/ipp/variations', label: 'Variation Orders', icon: 'assignment',    section: 'Operations' },
  { path: '/pipeline',     label: 'Pipeline',      icon: 'account_tree',       section: 'Operations' },
  { path: '/grid',         label: 'Grid',          icon: 'bolt',               section: 'Operations' },
  { path: '/esums',        label: 'Esums O&M',     icon: 'build',              section: 'Operations' },
  { path: '/ops/l5',       label: 'L5 Ops Console', icon: 'monitor_heart',     section: 'Operations' },
  { path: '/ops/depth',    label: 'Depth Ops',     icon: 'monitor_heart',      section: 'Operations' },
  { path: '/carbon',       label: 'Carbon',        icon: 'eco',                section: 'Sustainability' },
  { path: '/esg',          label: 'ESG',           icon: 'public',             section: 'Sustainability' },
  { path: '/funds',        label: 'Funds',         icon: 'savings',            section: 'Finance' },
  { path: '/intelligence', label: 'Intelligence',  icon: 'insights',           section: 'Insights' },
  { path: '/briefing',     label: 'Briefing',      icon: 'wb_sunny',           section: 'Insights' },
  { path: '/reports',      label: 'Reports',       icon: 'bar_chart',          section: 'Insights' },
  { path: '/design-gallery', label: 'Design gallery', icon: 'palette',          section: 'Insights' },
  { path: '/popia',        label: 'POPIA',         icon: 'privacy_tip',        section: 'Compliance' },
  { path: '/audit',        label: 'Audit transparency', icon: 'privacy_tip',   section: 'Compliance' },
  { path: '/admin/paia',   label: 'PAIA queue',    icon: 'privacy_tip',        section: 'Compliance' },
  { path: '/settings/compliance-admin', label: 'Compliance admin', icon: 'privacy_tip', section: 'Compliance' },
  { path: '/admin',        label: 'Admin',         icon: 'settings',           section: 'System' },
  { path: '/admin/platform-console', label: 'Platform console', icon: 'settings', section: 'System' },
  { path: '/admin/bulk-ops', label: 'Bulk operations', icon: 'settings',       section: 'System' },
  { path: '/settings/passkeys', label: 'Passkeys', icon: 'settings',           section: 'System' },
  { path: '/support',      label: 'Support',       icon: 'support_agent',      section: 'System' },
  { path: '/admin/monitoring', label: 'Monitoring', icon: 'monitor_heart',     section: 'System' },
  { path: '/dashboard',      label: 'National Dashboard', icon: 'bar_chart',   section: 'System' },
  { path: '/modules',        label: 'Platform modules', icon: 'grid_view',     section: 'System' },
];

function navForRole(role: string | undefined): NavItem[] {
  const adminOnlyPaths = new Set(['/admin', '/support', '/admin/monitoring', '/admin/platform-console',
    '/admin/bulk-ops', '/settings/compliance-admin', '/dashboard']);
  const nonSystem = BASE_NAV.filter((n) => !adminOnlyPaths.has(n.path));
  if (!role) return nonSystem;

  // Helper: pick items whose path starts with any of the given prefixes,
  // plus always include the launchpad and passkeys.
  const pick = (...prefixes: string[]) => {
    const set = new Set(['/launch', '/settings/passkeys', ...prefixes]);
    return BASE_NAV.filter((n) => {
      if (set.has(n.path)) return true;
      return prefixes.some((p) => n.path.startsWith(p + '?') || n.path.startsWith(p + '/'));
    });
  };

  switch (role) {
    case 'admin':
      return BASE_NAV;

    case 'support':
      return pick(
        '/support/workstation',
        '/admin/monitoring',
        '/intelligence', '/briefing',
        '/popia', '/admin/paia', '/audit',
        '/esums', '/settlement-ops', '/documents', '/modules',
      );

    case 'trader':
    case 'trader_risk':
      return pick(
        '/trader-risk/workstation',
        '/settlement', '/contracts', '/marketplace',
        '/intelligence', '/reports', '/popia', '/briefing', '/documents', '/modules',
      );

    case 'ipp_developer':
      return pick(
        '/ipp-lifecycle/workstation',
        '/contracts', '/settlement', '/marketplace',
        '/esg', '/intelligence', '/reports', '/popia', '/briefing', '/documents', '/modules',
      );

    case 'carbon_fund':
      return pick(
        '/carbon-registry/workstation',
        '/marketplace', '/funds', '/pipeline',
        '/esg', '/intelligence', '/reports', '/popia', '/briefing', '/documents', '/modules',
      );

    case 'offtaker':
      return pick(
        '/offtaker-suite/workstation',
        '/contracts', '/lois', '/procurement', '/marketplace', '/settlement',
        '/esg', '/intelligence', '/reports', '/popia', '/briefing', '/documents', '/modules',
      );

    case 'lender':
      return pick(
        '/lender-suite/workstation',
        '/projects', '/pipeline', '/funds', '/settlement',
        '/intelligence', '/reports', '/popia', '/briefing', '/documents', '/modules',
      );

    case 'grid_operator':
      return pick(
        '/grid-operator/workstation',
        '/settlement',
        '/intelligence', '/reports', '/popia', '/briefing', '/documents', '/modules',
      );

    case 'regulator':
      return pick(
        '/regulator-suite/workstation',
        '/marketplace', '/esg', '/audit',
        '/intelligence', '/reports', '/popia', '/briefing', '/documents', '/modules',
      );

    case 'esco':
      return pick(
        '/esco/workstation',
        '/esums',
        '/intelligence', '/reports', '/popia', '/briefing', '/modules',
      );

    case 'epc_contractor':
      return pick(
        '/epc/workstation',
        '/projects', '/documents',
        '/intelligence', '/reports', '/popia', '/briefing', '/modules',
      );

    default:
      return nonSystem;
  }
}

function initialsOf(name: string | undefined): string {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/* The MIcon helper used to render the Material Symbols icon font. We now
 * route every call through the custom OE icon set so nothing in the shell
 * depends on Google's icon font or any stock library. All previous Material
 * Symbol names (`dashboard`, `bolt`, `eco` etc.) are mapped onto our OE
 * SVGs in OEIcon.tsx::MATERIAL_MAP. */
function MIcon({ name, className = '', filled, size = 20 }: { name: string; className?: string; filled?: boolean; size?: number }) {
  return <MatIcon name={name} size={size} className={className} filled={filled} />;
}

/** Shell-bar notifications bell. Polls /api/notifications/unread-count
 *  every 60s; navigates to /notifications on click. Badge shows live
 *  unread count up to 99. */
function NotificationsBell() {
  const [n, setN] = useState(0);
  const navigate = useNavigate();
  // Visibility-aware — no requests while tab is hidden. With ~25% of
  // session time spent on hidden tabs in practice, this alone is a
  // significant reduction in Worker request volume against the
  // unread-count endpoint.
  React.useEffect(() => {
    let cancelled = false;
    let id: ReturnType<typeof setInterval> | null = null;
    const fetchN = async () => {
      try {
        const r = await fetch('/api/notifications/unread-count', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        setN(Number(j?.data?.unread_count || 0));
      } catch { /* swallow */ }
    };
    const start = () => { if (id === null) id = setInterval(fetchN, 60_000); };
    const stop  = () => { if (id !== null) { clearInterval(id); id = null; } };
    const onVis = () => {
      if (document.visibilityState === 'visible') { void fetchN(); start(); }
      else { stop(); }
    };
    void fetchN();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return (
    <button
      type="button"
      aria-label={`Notifications${n > 0 ? ` — ${n} unread` : ''}`}
      onClick={() => navigate('/notifications')}
      className="relative w-10 h-10 rounded-md flex items-center justify-center transition-colors"
      style={{ color: 'oklch(0.35 0.025 250)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.94 0.004 250)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <MIcon name="notifications" size={18} />
      {n > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#f86c52] text-white text-[9px] font-bold flex items-center justify-center"
          style={{ boxShadow: '0 0 0 2px oklch(0.99 0.002 80)' }}
        >
          {n > 99 ? '99+' : n}
        </span>
      )}
    </button>
  );
}

/** SAST wall clock — surfaces the active timezone in the shell bar so a
 *  trader / regulator viewing from outside SA sees that timestamps render
 *  in Africa/Johannesburg, not their local TZ. Ticks every 30s. */
function SastClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(i);
  }, []);
  // installSastClock() in main.tsx already injects Africa/Johannesburg
  // as the default for toLocaleTimeString. Pass an explicit timeZone
  // here for safety in case this component renders before the patch.
  const t = now.toLocaleTimeString('en-ZA', {
    timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return (
    <div
      role="status"
      aria-label={`Current time in South African Standard Time: ${t}`}
      title="South African Standard Time (UTC+2)"
      className="hidden md:flex items-center gap-1.5 h-10 px-3 font-mono tabular-nums"
      style={{ fontSize: 12, color: 'oklch(0.50 0.008 250)' }}
    >
      <MIcon name="schedule" size={13} />
      <span style={{ color: 'oklch(0.15 0.025 250)', fontVariantNumeric: 'tabular-nums' }}>{t}</span>
      <span style={{ fontSize: 10, color: 'oklch(0.55 0.008 250)' }}>SAST</span>
    </div>
  );
}

/** Track whether the viewport is sub-md (Tailwind's md breakpoint = 768px).
 *  When mobile, the side rail is hidden in favour of the hamburger drawer
 *  + the bottom-nav strip, and the canvas reclaims the left padding. */
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < breakpoint,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

const ROLE_DISPLAY: Record<string, string> = {
  ipp_developer: 'IPP', ipp: 'IPP', trader: 'Trader', lender: 'Lender',
  offtaker: 'Offtaker', grid_operator: 'Grid', grid: 'Grid',
  carbon_fund: 'Carbon', carbon: 'Carbon', regulator: 'Regulator',
  esco: 'ESCO', admin: 'Admin', support: 'Support', om: 'O&M',
};

const ADMIN_ROLE_TABS = [
  { label: 'IPP',       path: '/ipp-lifecycle/workstation',   prefix: '/ipp-lifecycle' },
  { label: 'Trader',    path: '/trader-risk/workstation',     prefix: '/trader-risk' },
  { label: 'Lender',    path: '/lender-suite/workstation',    prefix: '/lender-suite' },
  { label: 'Offtaker',  path: '/offtaker-suite/workstation',  prefix: '/offtaker-suite' },
  { label: 'Grid',      path: '/grid-operator/workstation',   prefix: '/grid-operator' },
  { label: 'Carbon',    path: '/carbon-registry/workstation', prefix: '/carbon-registry' },
  { label: 'Regulator', path: '/regulator-suite/workstation', prefix: '/regulator-suite' },
  { label: 'Admin',     path: '/admin',                       prefix: '/admin' },
  { label: 'Support',   path: '/support/workstation',         prefix: '/support' },
];

export function FioriShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Launchpad + workstation mode: suppress sidebar so these pages fill the full canvas.
  // Workstation pages have their own tab nav and a back-to-launchpad breadcrumb.
  const WORKSTATION_PREFIXES = [
    '/launch/',
    '/ipp-lifecycle/', '/trader-risk/', '/lender-suite/', '/offtaker-suite/',
    '/carbon-registry/', '/grid-operator/', '/support/', '/regulator-suite/',
    '/admin-platform/', '/esco/', '/epc/',
    // Meridian pages bring their own chrome — never show the Fiori sidebar.
    '/horizon', '/thread/', '/atlas',
  ];
  const isLaunchpadPage = WORKSTATION_PREFIXES.some(p => location.pathname.startsWith(p));
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('oe_rail_collapsed') === 'true'; } catch { return false; }
  });
  const [query, setQuery] = useState('');
  const [userMenu, setUserMenu] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();

  // Close hamburger on route change / outside click / Escape.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDown(ev: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Close user menu on outside click.
  useEffect(() => {
    if (!userMenu) return undefined;
    function onDown() { setUserMenu(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [userMenu]);

  // Cmd/Ctrl-K → focus search.
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'k') {
        ev.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const nav = useMemo(() => navForRole(user?.role), [user?.role]);
  const sections = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of nav) {
      if (!map.has(item.section)) map.set(item.section, []);
      map.get(item.section)!.push(item);
    }
    return Array.from(map.entries());
  }, [nav]);

  // Active nav item = longest registered prefix matching the current location.
  const activePath = useMemo(() => {
    const candidates = nav
      .map((n) => n.path)
      .filter((p) => location.pathname === p || location.pathname.startsWith(p + '/'))
      .sort((a, b) => b.length - a.length);
    return candidates[0];
  }, [nav, location.pathname]);
  const isActive = (path: string) => path === activePath;

  const currentLabel = nav.find((n) => n.path === activePath)?.label ?? 'Open Energy Platform';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const sidebarWidth = collapsed ? 56 : 256;

  // Submit search → /search?q= (backed by /api/search cross-entity lookup).
  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  const roleTheme = themeFor(user?.role);
  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.97 0.003 250)' }} data-role={roleTheme.key}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none"
        style={{ background: 'oklch(0.99 0.002 80)', color: 'oklch(0.20 0.025 250)' }}
      >
        Skip to main content
      </a>

      {/* ════════════ Shell Bar — mockup-B light nav ════════════ */}
      <header
        role="banner"
        className="fixed top-0 left-0 right-0 z-50 flex items-center px-2 sm:px-4"
        style={{ height: 'var(--shell-height)', background: 'oklch(0.99 0.002 80)', borderBottom: '1px solid oklch(0.88 0.006 250)' }}
      >
        {/* Hamburger / nav menu */}
        <div className="relative" ref={menuRef}>
          <button type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center justify-center w-10 h-10 rounded-md transition-colors"
            style={{ color: 'oklch(0.30 0.025 250)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.94 0.004 250)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            aria-label="Open navigation menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MIcon name="menu" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="Primary navigation"
              className="fixed sm:absolute left-0 top-14 sm:top-12 mt-1 w-[90vw] sm:w-[340px] max-h-[calc(100vh-72px)] overflow-y-auto rounded-md z-50"
              style={{ background: 'oklch(0.99 0.002 80)', border: '1px solid oklch(0.88 0.006 250)', boxShadow: '0 12px 32px rgba(15,20,40,0.18)' }}
            >
              <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'oklch(0.93 0.004 250)' }}>
                <span className="text-[11px] uppercase tracking-[0.08em] font-semibold font-mono" style={{ color: 'oklch(0.55 0.008 250)' }}>
                  Navigation
                </span>
              </div>
              {sections.length === 0 && (
                <div className="px-4 py-4 text-[13px]" style={{ color: 'oklch(0.55 0.008 250)' }}>
                  Sign in to see navigation.
                </div>
              )}
              {sections.map(([section, items]) => (
                <div key={section} className="py-1">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.10em] font-semibold font-mono" style={{ color: 'oklch(0.60 0.008 250)' }}>
                    {section}
                  </div>
                  {items.map((item) => {
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-[13px] transition-colors"
                        style={{
                          background: active ? 'oklch(0.93 0.006 250)' : 'transparent',
                          color: active ? 'oklch(0.20 0.025 250)' : 'oklch(0.30 0.020 250)',
                          fontWeight: active ? 600 : 400,
                          transition: 'background 150ms cubic-bezier(0.23,1,0.32,1)',
                        }}
                      >
                        <MIcon name={item.icon} size={18} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
              <div className="border-t p-2" style={{ borderColor: 'oklch(0.93 0.004 250)' }}>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); handleLogout(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] rounded transition-colors"
                  style={{ color: 'oklch(0.45 0.18 25)', transition: 'background 150ms cubic-bezier(0.23,1,0.32,1)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.97 0.015 25)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <MIcon name="logout" size={16} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Brand mark — mockup-b OE/ amber mono */}
        <Link
          to="/feed"
          className="flex items-center select-none ml-1 mr-4"
          aria-label="Open Energy Platform — Activity Feed"
          style={{ textDecoration: 'none' }}
        >
          <span style={{ fontFamily: '"IBM Plex Mono","Fira Code",monospace', fontSize: 14, fontWeight: 800, color: 'oklch(0.46 0.16 55)', letterSpacing: '0.06em' }}>
            OE/
          </span>
        </Link>

        {/* Role tabs */}
        {user && (
          <div className="hidden md:flex items-center gap-0.5 ml-3 overflow-x-auto" style={{ flexShrink: 0, maxWidth: 520 }}>
            {user.role === 'admin' ? (
              ADMIN_ROLE_TABS.map(({ label, path, prefix }) => {
                const active = location.pathname === path || location.pathname.startsWith(prefix + '/');
                return (
                  <Link
                    key={path}
                    to={path}
                    className="flex items-center px-2.5 py-1.5 rounded text-[11px] font-semibold transition-colors whitespace-nowrap"
                    style={{
                      background: active ? 'oklch(0.96 0.05 55)' : 'transparent',
                      color: active ? 'oklch(0.46 0.16 55)' : 'oklch(0.55 0.008 250)',
                      border: active ? '1px solid oklch(0.80 0.12 55)' : '1px solid transparent',
                    }}
                  >
                    {label}
                  </Link>
                );
              })
            ) : (
              <span
                className="flex items-center px-3 py-1.5 rounded text-[11px] font-semibold"
                style={{ background: 'oklch(0.96 0.05 55)', color: 'oklch(0.46 0.16 55)', border: '1px solid oklch(0.80 0.12 55)' }}
              >
                {ROLE_DISPLAY[user.role] ?? user.role}
              </span>
            )}
          </div>
        )}

        {/* Search */}
        <form onSubmit={onSearchSubmit} className="flex-1 flex justify-center px-3" role="search">
          <div className="relative w-full max-w-xl">
            <MIcon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              aria-label="Search across Open Energy Platform"
              placeholder="Search projects, contracts, counterparties, settlements…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-9 pl-10 pr-12 rounded-md text-[13px] border transition-colors font-body focus:outline-none"
              style={{ background: 'oklch(0.95 0.003 250)', color: 'oklch(0.15 0.025 250)', border: '1px solid oklch(0.85 0.006 250)' } as React.CSSProperties}
              onFocus={(e) => { e.currentTarget.style.background = 'oklch(0.97 0.002 250)'; e.currentTarget.style.borderColor = 'oklch(0.65 0.010 250)'; }}
              onBlur={(e) => { e.currentTarget.style.background = 'oklch(0.95 0.003 250)'; e.currentTarget.style.borderColor = 'oklch(0.85 0.006 250)'; }}
            />
            <kbd className="hidden sm:inline absolute right-2 top-1/2 -translate-y-1/2 text-[10px] rounded px-1.5 py-[1px] font-mono" style={{ color: 'oklch(0.50 0.008 250)', border: '1px solid oklch(0.82 0.006 250)' } as React.CSSProperties}>
              ⌘K
            </kbd>
          </div>
        </form>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate('/actions/new')}
            className="hidden sm:flex items-center gap-1.5 h-8 px-3 rounded text-[11px] font-bold text-white"
            style={{ background: 'oklch(0.46 0.16 55)', flexShrink: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.38 0.18 55)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'oklch(0.46 0.16 55)')}
          >
            + New action
          </button>
          <SastClock />
          <button
            type="button"
            aria-label="Schedule"
            onClick={() => navigate('/schedule')}
            className="w-10 h-10 rounded-md flex items-center justify-center transition-colors"
            style={{ color: 'oklch(0.35 0.025 250)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.94 0.004 250)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <MIcon name="event" size={18} />
          </button>
          <NotificationsBell />
          <button
            type="button"
            aria-label="Help"
            onClick={() => navigate('/support')}
            className="w-10 h-10 rounded-md flex items-center justify-center transition-colors"
            style={{ color: 'oklch(0.35 0.025 250)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.94 0.004 250)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <MIcon name="help_outline" size={18} />
          </button>

          {/* User menu */}
          <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setUserMenu((v) => !v)}
              aria-label="User menu"
              aria-haspopup="menu"
              aria-expanded={userMenu}
              className="flex items-center gap-2 ml-1 pl-1 pr-2 h-10 rounded-md transition-colors"
              onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.94 0.004 250)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white font-headline"
                style={{
                  background: 'oklch(0.46 0.16 55)',
                  boxShadow: '0 0 0 2px oklch(0.88 0.006 250)',
                }}
              >
                {initialsOf(user?.name)}
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-[12px] font-semibold" style={{ color: 'oklch(0.15 0.025 250)' }}>
                  {user?.name?.split(' ')[0] ?? 'Guest'}
                </div>
                <div className="text-[10px] capitalize font-mono tracking-wide" style={{ color: 'oklch(0.50 0.015 250)' }}>
                  {user?.role?.replace(/_/g, ' ') ?? '—'}
                </div>
              </div>
            </button>
            {userMenu && (
              <div
                role="menu"
                aria-label="User menu"
                className="absolute right-0 top-full mt-1 w-64 rounded-md overflow-hidden"
                style={{ background: 'oklch(0.99 0.002 80)', border: '1px solid oklch(0.88 0.006 250)', boxShadow: '0 8px 24px rgba(15,20,40,0.15)' }}
              >
                <div className="p-3 border-b" style={{ borderColor: 'oklch(0.93 0.004 250)' }}>
                  <div className="text-[14px] font-semibold" style={{ color: 'oklch(0.20 0.025 250)' }}>
                    {user?.name ?? 'Guest'}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: 'oklch(0.45 0.015 250)' }}>
                    {user?.email}
                  </div>
                  <div
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold px-2 py-0.5 rounded"
                    style={{ background: 'oklch(0.93 0.006 250)', color: 'oklch(0.30 0.020 250)' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'oklch(0.55 0.10 250)' }} />
                    {user?.role?.replace(/_/g, ' ') ?? '—'}
                  </div>
                </div>
                {[
                  { label: 'Activity feed', icon: 'inbox', path: '/feed' },
                  { label: 'Profile & preferences', icon: 'person', path: '/settings' },
                  { label: 'Security & MFA', icon: 'security', path: '/settings/security' },
                ].map(({ label, icon, path }) => (
                  <button key={path} type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left"
                    style={{ color: 'oklch(0.30 0.020 250)', transition: 'background 150ms cubic-bezier(0.23,1,0.32,1)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.95 0.003 250)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => { setUserMenu(false); navigate(path); }}
                  >
                    <MIcon name={icon} size={16} /> {label}
                  </button>
                ))}
                {user?.role === 'admin' && (
                  <button type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left"
                    style={{ color: 'oklch(0.30 0.020 250)', transition: 'background 150ms cubic-bezier(0.23,1,0.32,1)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.95 0.003 250)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => { setUserMenu(false); navigate('/admin'); }}
                  >
                    <MIcon name="admin_panel_settings" size={16} /> Admin console
                  </button>
                )}
                <button type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left border-t"
                  style={{ color: 'oklch(0.45 0.18 25)', borderColor: 'oklch(0.93 0.004 250)', transition: 'background 150ms cubic-bezier(0.23,1,0.32,1)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.97 0.015 25)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={handleLogout}
                >
                  <MIcon name="logout" size={16} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ════════════ Sidebar rail (desktop ≥ 768px only) ════════════ */}
      <aside
        className="oe-rail fiori-rail hidden md:flex md:flex-col"
        data-density={roleTheme.workstationDensity}
        data-chrome={roleTheme.chrome}
        style={{
          display: isLaunchpadPage ? 'none' : undefined,
          position: 'fixed',
          left: 0,
          top: 'var(--shell-height)',
          height: 'calc(100vh - var(--shell-height))',
          overflowY: 'auto',
          overflowX: 'hidden',
          width: sidebarWidth,
          transition: 'width 200ms cubic-bezier(0.23,1,0.32,1)',
          zIndex: 40,
          background: 'oklch(0.99 0.002 80)',
          borderRight: '1px solid oklch(0.88 0.006 250)',
          ['--rail-accent' as any]: roleTheme.accent,
          ['--rail-accent-secondary' as any]: roleTheme.accentSecondary ?? roleTheme.accent,
          ['--rail-accent-soft' as any]: roleTheme.accentSoft,
        }}
      >
        <nav className="flex-1 py-3" aria-label="Primary">
          {sections.length === 0 && !collapsed && (
            <div className="px-4 py-3 text-[12px]" style={{ color: 'oklch(0.55 0.008 250)' }}>
              Loading navigation…
            </div>
          )}
          {sections.map(([section, items]) => (
            <div key={section} className="mb-2">
              {!collapsed && (
                <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-[0.10em] font-semibold font-mono" style={{ color: 'oklch(0.60 0.008 250)' }}>{section}</div>
              )}
              {collapsed && (
                <div className="mx-3 my-1 h-px" style={{ background: 'oklch(0.93 0.004 250)' }} />
              )}
              {items.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`oe-rail-item fiori-rail-item ${active ? 'active' : ''}`}
                    title={collapsed ? item.label : undefined}
                    style={{
                      background: active ? 'oklch(0.93 0.006 250)' : 'transparent',
                      color: active ? 'oklch(0.20 0.025 250)' : 'oklch(0.40 0.015 250)',
                      fontWeight: active ? 600 : 400,
                      transition: 'background 150ms cubic-bezier(0.23,1,0.32,1)',
                    }}
                  >
                    <MIcon name={item.icon} size={18} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: 'oklch(0.88 0.006 250)' }}>
          <button type="button"
            onClick={() => setCollapsed((v) => { const n = !v; try { localStorage.setItem('oe_rail_collapsed', String(n)); } catch {} return n; })}
            className="w-full flex items-center gap-2 h-9 px-2 rounded text-[12px]"
            style={{ color: 'oklch(0.55 0.008 250)', transition: 'background 150ms cubic-bezier(0.23,1,0.32,1)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'oklch(0.95 0.003 250)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <MIcon name={collapsed ? 'chevron_right' : 'chevron_left'} size={16} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ════════════ Canvas ════════════ */}
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-screen"
        style={{
          background: 'oklch(0.97 0.003 250)',
          paddingTop: 'var(--shell-height)',
          paddingLeft: (isMobile || isLaunchpadPage) ? 0 : sidebarWidth,
          paddingBottom: isMobile ? 'calc(64px + env(safe-area-inset-bottom))' : 0,
          transition: 'padding-left 200ms cubic-bezier(0.23,1,0.32,1)',
        }}
      >
        <div className="w-full fade-in">
          {children}
        </div>
      </main>

      {/* ════════════ Mobile bottom nav (sub-md only) ════════════ */}
      {!isLaunchpadPage && <MobileBottomNav nav={nav} isActive={isActive} />}

      {/* ════════════ Partner brand — LTM Energy Group, bottom-right ════════════ */}
      <LtmLogo />
    </div>
  );
}

/**
 * Sub-md bottom navigation — five most-used destinations per role plus a
 * "More" button that opens the same hamburger drawer the header uses.
 *
 * Mirrors the desktop rail's role gating: takes the first 4 nav entries
 * from the role-scoped list and pins them; a "More" tile opens the menu.
 * The bar respects `env(safe-area-inset-bottom)` for iOS Home indicator.
 */
function MobileBottomNav({
  nav,
  isActive,
}: {
  nav: NavItem[];
  isActive: (path: string) => boolean;
}) {
  // First 4 of the role-scoped nav, but always include /cockpit if present.
  const top4 = (() => {
    const cockpit = nav.find((n) => n.path === '/launch');
    const others = nav.filter((n) => n.path !== '/launch').slice(0, cockpit ? 3 : 4);
    return cockpit ? [cockpit, ...others] : others;
  })();
  if (top4.length === 0) return null;

  return (
    <nav
      className="md:hidden fixed left-0 right-0 bottom-0 flex items-stretch justify-around"
      style={{
        background: 'oklch(0.99 0.002 80)',
        borderTop: '1px solid oklch(0.88 0.006 250)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 45,
        boxShadow: '0 -2px 8px rgba(15,20,40,0.08)',
      }}
      role="navigation"
      aria-label="Primary mobile navigation"
    >
      {top4.map((item) => {
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5"
            style={{
              color: active ? 'oklch(0.30 0.020 250)' : 'oklch(0.55 0.008 250)',
              background: active ? 'oklch(0.93 0.006 250)' : 'transparent',
              transition: 'background 150ms cubic-bezier(0.23,1,0.32,1)',
            }}
          >
            <MIcon name={item.icon} size={20} filled={active} />
            <span className="text-[10px] font-semibold truncate max-w-full px-1">{item.label}</span>
          </Link>
        );
      })}
      <MoreButton />
    </nav>
  );
}

function MoreButton() {
  // Re-fire a click on the header hamburger so we don't duplicate the menu
  // logic. Falls back to navigating to /support if the hamburger isn't
  // present (e.g. partially rendered SSR shell).
  function openMenu() {
    const btn = document.querySelector<HTMLButtonElement>('[aria-label="Open navigation menu"]');
    if (btn) { btn.click(); return; }
  }
  return (
    <button
      onClick={openMenu}
      type="button"
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5"
      style={{ color: 'oklch(0.55 0.008 250)' }}
      aria-label="More navigation"
    >
      <MIcon name="menu" size={20} />
      <span className="text-[10px] font-semibold">More</span>
    </button>
  );
}

export default FioriShell;
