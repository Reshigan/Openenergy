import React from 'react';
import { motion } from 'framer-motion';
import ChainStateBar from '../../components/ChainStateBar';
import { getDomain, getFeature } from './roleData';
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
  featureKey: string;
  onBack: () => void;
  onBackToLaunchpad: () => void;
};

const enterVariants = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } },
  exit: { opacity: 0, x: 40, transition: { duration: 0.12, ease: 'easeIn' } },
};

const FALLBACK_STATES = ['draft', 'active', 'resolved', 'closed'] as const;

export default function FeatureView({ config, domainKey, featureKey, onBack, onBackToLaunchpad }: Props) {
  const domain = getDomain(config.role, domainKey);
  const feature = getFeature(config.role, domainKey, featureKey);

  if (!domain || !feature) return null;

  const allStates = feature.mockStates ?? FALLBACK_STATES;
  const currentState = feature.mockState ?? allStates[Math.floor(allStates.length / 2)];

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
        gap: 8,
        position: 'sticky',
        top: 0,
        zIndex: 10,
        flexWrap: 'wrap',
        rowGap: 0,
      }}>
        <button
          onClick={onBackToLaunchpad}
          style={{ border: 'none', background: 'none', padding: '4px 8px 4px 0', cursor: 'pointer', fontSize: 12, color: TEXT_SECONDARY }}
        >
          {config.label}
        </button>
        <span style={{ color: BORDER }}>·</span>
        <button
          onClick={onBack}
          style={{ border: 'none', background: 'none', padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: TEXT_SECONDARY }}
        >
          {domain.label}
        </button>
        <span style={{ color: BORDER }}>·</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>{feature.label}</span>
      </header>

      <div style={{ padding: 24 }}>
        {/* Feature hero */}
        <div style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderLeft: `4px solid ${domain.color}`,
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: '-0.02em' }}>
                {feature.label}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: TEXT_SECONDARY }}>{feature.description}</p>
            </div>
            {feature.chainKey && (
              <span style={{
                fontSize: 11,
                color: TEXT_SECONDARY,
                background: 'oklch(0.93 0.004 250)',
                border: `1px solid ${BORDER}`,
                borderRadius: 4,
                padding: '3px 8px',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
              }}>
                {feature.chainKey}
              </span>
            )}
          </div>
        </div>

        {/* Chain state bar */}
        {allStates.length > 1 && (
          <div style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: '14px 20px',
            marginBottom: 16,
          }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Workflow state
            </p>
            <ChainStateBar
              allStates={allStates as unknown as readonly string[]}
              currentState={currentState}
              variant="full"
            />
          </div>
        )}

        {/* Main content + AI assist */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
          {/* Chain detail skeleton */}
          <div style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: '16px 20px',
          }}>
            <p style={{ margin: '0 0 14px', fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Record details
            </p>
            <SkeletonRows count={6} />
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
              <SkeletonRows count={3} />
            </div>
          </div>

          {/* AI assist card */}
          <div style={{
            background: CARD,
            border: `1px solid oklch(0.87 0.020 55)`,
            borderRadius: 10,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: ACCENT, fontWeight: 700 }}>◈ AI assist</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.5 }}>
              {getAiAssist(feature.key, feature.label)}
            </p>
            <button style={{
              border: `1px solid ${ACCENT}`,
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: ACCENT,
              background: 'none',
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}>
              Accept suggestion →
            </button>
          </div>
        </div>

        {/* Primary action */}
        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <button style={{
            background: TEXT_PRIMARY,
            color: CARD,
            border: 'none',
            borderRadius: 6,
            padding: '9px 20px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}>
            {getPrimaryAction(currentState, feature.label)}
          </button>
          <button style={{
            background: 'none',
            color: TEXT_SECONDARY,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: '9px 16px',
            fontSize: 13,
            cursor: 'pointer',
          }}>
            Export
          </button>
          <button style={{
            background: 'none',
            color: TEXT_SECONDARY,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: '9px 16px',
            fontSize: 13,
            cursor: 'pointer',
          }}>
            History
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{
            height: 11,
            borderRadius: 3,
            background: 'oklch(0.91 0.004 250)',
            width: `${30 + (i % 3) * 15}%`,
          }} />
          <div style={{
            height: 11,
            borderRadius: 3,
            background: 'oklch(0.93 0.003 250)',
            width: `${20 + (i % 2) * 12}%`,
          }} />
        </div>
      ))}
    </div>
  );
}

function getPrimaryAction(state: string, label: string): string {
  const actionMap: Record<string, string> = {
    draft: `Submit ${label} →`,
    active: `Update ${label} →`,
    monitoring: `Record update →`,
    in_progress: `Progress action →`,
    approved: `Proceed to next step →`,
    pending: `Confirm & submit →`,
    open: `Assign & progress →`,
    issued: `Acknowledge →`,
    registered: `Activate →`,
    settled: `Close record →`,
    compliant: `Issue compliance certificate →`,
  };
  return actionMap[state] ?? `Advance state →`;
}

function getAiAssist(featureKey: string, label: string): string {
  const assists: Record<string, string> = {
    stage_gates: 'DG2 technical review score is 87/100 — 3 risk items remain open. Recommend scheduling a risk closure workshop before submitting the approval request.',
    wbs_schedule: 'Critical path shows a 12-day float on the civil works package. Weather forecast for Week 18 shows a 40% rain probability — consider pulling forward tower erection by 5 days.',
    risk: 'VaR utilisation at 94% — consider hedging the 15MW position in the evening peak book with a cap at R1,850/MWh.',
    covenant_certificate: 'DSCR is 1.12, below the 1.20 maintenance covenant. Prepare a cure notice and cash flow projection for the lender before the 30-day cure window lapses.',
    article6: '2,400 tCO₂ awaiting corresponding adjustment confirmation from the DNA. Expected UNFCCC processing time is 8 business days.',
    dispatch_nominations: 'Unit 3 nomination was rejected — SO technical constraint on the 132kV line. Recommend re-submitting at 85% of declared capacity.',
  };
  return assists[featureKey] ?? `Based on current ${label} status and historical patterns, I can suggest an optimal next step. Review the chain context and accept to apply.`;
}
