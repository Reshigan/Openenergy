import React from 'react';
import { motion } from 'framer-motion';
import type { RoleConfig } from './roleData';

const CANVAS = 'oklch(0.96 0.003 250)';
const CARD = 'oklch(0.99 0.002 80)';
const BORDER = 'oklch(0.87 0.006 250)';
const TEXT_PRIMARY = 'oklch(0.17 0.010 250)';
const TEXT_SECONDARY = 'oklch(0.40 0.009 250)';
const ACCENT = 'oklch(0.46 0.16 55)';

type Props = {
  config: RoleConfig;
  allRoles: RoleConfig[];
  currentRole: string;
  onSelectDomain: (domainKey: string) => void;
  onSwitchRole: (role: string) => void;
};

const enterVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.14, ease: 'easeIn' } },
};

const MOCK_KPIS: Record<string, string[]> = {
  ipp_developer: ['8 active projects', '2 gates pending', '3 documents overdue'],
  trader: ['12 open orders', 'R4.2M VaR', '1 margin call'],
  lender: ['R890M portfolio', '3 covenant reviews', '1 watchlist item'],
  offtaker: ['6 PPA contracts', '2 ToP windows', '14 GWh this month'],
  carbon_fund: ['142,000 tCO₂ inventory', '3 MRV pending', '1 retirement request'],
  grid_operator: ['99.4% dispatch rate', '4 nominations active', '1 REZ pending'],
  support: ['17 tickets open', '2 P1 SLA breaches', '4 WOs in progress'],
  regulator: ['9 licence applications', '3 enforcement actions', '1 MYPD open'],
  admin: ['41 tenants', 'R2.1M MRR', '0 DLQ errors'],
};

export default function LaunchpadView({ config, allRoles, currentRole, onSelectDomain, onSwitchRole }: Props) {
  const kpis = MOCK_KPIS[config.role] ?? [];

  return (
    <motion.div
      variants={enterVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ minHeight: '100dvh', background: CANVAS }}
    >
      {/* Header */}
      <header style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        borderBottom: `1px solid ${BORDER}`,
        background: CARD,
        gap: 16,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: TEXT_PRIMARY, letterSpacing: '-0.02em' }}>
          ◈ Open Energy
        </span>
        <div style={{ flex: 1 }} />
        <select
          value={currentRole}
          onChange={(e) => onSwitchRole(e.target.value)}
          style={{
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 13,
            color: TEXT_PRIMARY,
            background: CANVAS,
            cursor: 'pointer',
          }}
        >
          {allRoles.map((r) => (
            <option key={r.role} value={r.role}>{r.label}</option>
          ))}
        </select>
      </header>

      {/* Hero strip */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: `1px solid ${BORDER}`,
        background: CARD,
      }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: '-0.03em' }}>
          {config.label}
        </h1>
        <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
          {kpis.map((kpi, i) => (
            <span key={i} style={{
              fontSize: 12,
              color: i === 1 ? ACCENT : TEXT_SECONDARY,
              fontWeight: i === 1 ? 600 : 400,
              borderRadius: 4,
              padding: '2px 0',
            }}>
              {kpi}
            </span>
          ))}
        </div>
      </div>

      {/* Domain tile grid */}
      <div style={{ padding: 24 }}>
        <p style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Workspaces
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(178px, 1fr))',
          gap: 12,
        }}>
          {config.domains.map((domain) => (
            <DomainTile
              key={domain.key}
              domain={domain}
              onClick={() => onSelectDomain(domain.key)}
            />
          ))}
        </div>

        {/* AI assist strip */}
        <div style={{ marginTop: 32 }}>
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Suggested actions
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {getAiSuggestions(config.role).map((s, i) => (
              <div key={i} style={{
                background: CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: '10px 14px',
                maxWidth: 280,
                cursor: 'pointer',
                transition: 'border-color 150ms',
              }}>
                <div style={{ fontSize: 11, color: ACCENT, fontWeight: 600, marginBottom: 4 }}>AI · {s.why}</div>
                <div style={{ fontSize: 13, color: TEXT_PRIMARY }}>{s.action}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function DomainTile({ domain, onClick }: { domain: RoleConfig['domains'][0]; onClick: () => void }) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <motion.div
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      animate={{ scale: hovered ? 1.02 : 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      style={{
        height: 160,
        background: CARD,
        border: `1px solid ${hovered ? domain.color : BORDER}`,
        borderLeft: `3px solid ${domain.color}`,
        borderRadius: 10,
        padding: '16px 14px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: hovered ? '0 4px 16px oklch(0.17 0.010 250 / 0.08)' : 'none',
        transition: 'box-shadow 150ms, border-color 150ms',
      }}
    >
      <span style={{ fontSize: 24, lineHeight: 1 }}>{domain.icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, lineHeight: 1.3 }}>{domain.label}</div>
        <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 4 }}>
          {domain.features.length} workflow{domain.features.length !== 1 ? 's' : ''}
        </div>
      </div>
    </motion.div>
  );
}

function getAiSuggestions(role: string) {
  const map: Record<string, { why: string; action: string }[]> = {
    ipp_developer: [
      { why: 'Stage gate overdue', action: 'DG2 decision pending for Saldanha Wind — 3 days past target.' },
      { why: 'Cash position', action: 'Drawdown request #DR-0041 approved — schedule disbursement.' },
    ],
    trader: [
      { why: 'Risk breach', action: 'Position limit 94% utilised on DA-Base — review before session open.' },
      { why: 'Post-trade', action: '3 trade allocations awaiting affirmation — deadline T+1.' },
    ],
    lender: [
      { why: 'Covenant breach', action: 'Atlantis SPV DSCR fallen to 1.12 — issue cure notice within 5 days.' },
    ],
    offtaker: [
      { why: 'PPA delivery', action: 'Shortfall of 420 MWh against ToP threshold — cure window closes Friday.' },
    ],
    carbon_fund: [
      { why: 'MRV expiry', action: 'Verification for VCS-2387 expires in 14 days — submit renewal.' },
    ],
    grid_operator: [
      { why: 'Capacity queue', action: '2 REZ capacity allocation applications pending technical assessment.' },
    ],
    support: [
      { why: 'SLA breach', action: 'P1 ticket #T-0892 approaching 60-min SLA — escalate to engineering.' },
    ],
    regulator: [
      { why: 'Licence renewal', action: 'Enel SA licence renewal application — public comment period ends 15 Jun.' },
    ],
    admin: [
      { why: 'DLQ alert', action: 'Cascade DLQ has 2 failed notification events — retry or re-process.' },
    ],
  };
  return map[role] ?? [];
}
