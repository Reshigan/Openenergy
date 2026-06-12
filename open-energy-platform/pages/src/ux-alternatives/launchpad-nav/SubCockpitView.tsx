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
  domainKey: string;
  onSelectFeature: (featureKey: string) => void;
  onBack: () => void;
};

const enterVariants = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } },
  exit: { opacity: 0, x: 40, transition: { duration: 0.12, ease: 'easeIn' } },
};

const MOCK_CHAIN_STATES: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  monitoring: 'Monitoring',
  active: 'Active',
  compliant: 'Compliant',
  draft: 'Draft',
  approved: 'Approved',
  pending: 'Pending',
  settled: 'Settled',
  issued: 'Issued',
  registered: 'Registered',
  completed: 'Completed',
};

const STATE_COLORS: Record<string, string> = {
  active: 'oklch(0.50 0.16 165)',
  in_progress: 'oklch(0.48 0.14 55)',
  monitoring: 'oklch(0.46 0.10 250)',
  compliant: 'oklch(0.50 0.16 165)',
  approved: 'oklch(0.50 0.16 165)',
  draft: 'oklch(0.55 0.05 250)',
  open: 'oklch(0.48 0.14 55)',
  pending: 'oklch(0.48 0.14 55)',
  settled: 'oklch(0.50 0.16 165)',
  issued: 'oklch(0.50 0.16 165)',
  registered: 'oklch(0.50 0.16 165)',
  completed: 'oklch(0.50 0.16 165)',
};

export default function SubCockpitView({ config, domainKey, onSelectFeature, onBack }: Props) {
  const domain = config.domains.find((d) => d.key === domainKey);
  if (!domain) return null;

  return (
    <motion.div
      variants={enterVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ minHeight: '100dvh', background: CANVAS }}
    >
      {/* Header with breadcrumb */}
      <header style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        borderBottom: `1px solid ${BORDER}`,
        background: CARD,
        gap: 8,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <button
          onClick={onBack}
          style={{
            border: 'none',
            background: 'none',
            padding: '4px 8px 4px 0',
            cursor: 'pointer',
            fontSize: 13,
            color: TEXT_SECONDARY,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          ← {config.label}
        </button>
        <span style={{ color: BORDER, fontSize: 14 }}>·</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>{domain.label}</span>
      </header>

      {/* Domain hero */}
      <div style={{
        padding: '18px 24px 14px',
        borderBottom: `1px solid ${BORDER}`,
        background: CARD,
        borderLeft: `4px solid ${domain.color}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>{domain.icon}</span>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: '-0.02em' }}>
              {domain.label}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: TEXT_SECONDARY }}>
              {domain.features.length} workflows
            </p>
          </div>
        </div>
      </div>

      {/* Feature tile grid */}
      <div style={{ padding: 24 }}>
        <p style={{ margin: '0 0 14px', fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Workflows
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(218px, 1fr))',
          gap: 10,
        }}>
          {domain.features.map((feature) => (
            <FeatureTile
              key={feature.key}
              feature={feature}
              domainColor={domain.color}
              onClick={() => onSelectFeature(feature.key)}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

type FeatureTileProps = {
  feature: RoleConfig['domains'][0]['features'][0];
  domainColor: string;
  onClick: () => void;
};

function FeatureTile({ feature, domainColor, onClick }: FeatureTileProps) {
  const [hovered, setHovered] = React.useState(false);
  const stateKey = feature.mockState ?? (feature.mockStates?.[0]);
  const stateLabel = stateKey ? (MOCK_CHAIN_STATES[stateKey] ?? stateKey) : null;
  const stateColor = stateKey ? (STATE_COLORS[stateKey] ?? TEXT_SECONDARY) : TEXT_SECONDARY;

  return (
    <motion.div
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      animate={{ scale: hovered ? 1.015 : 1 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      style={{
        height: 138,
        background: CARD,
        border: `1px solid ${hovered ? domainColor : BORDER}`,
        borderRadius: 8,
        padding: '12px 14px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: hovered ? '0 2px 12px oklch(0.17 0.010 250 / 0.06)' : 'none',
        transition: 'box-shadow 140ms, border-color 140ms',
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, lineHeight: 1.3 }}>{feature.label}</div>
        <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {feature.description}
        </div>
      </div>
      {stateLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: stateColor,
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 11, color: stateColor, fontWeight: 500 }}>{stateLabel}</span>
        </div>
      )}
      {!stateLabel && feature.chainKey && (
        <div style={{ fontSize: 11, color: TEXT_SECONDARY, opacity: 0.6 }}>State machine</div>
      )}
    </motion.div>
  );
}
