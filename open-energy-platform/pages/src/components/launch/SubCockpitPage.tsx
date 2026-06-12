import React from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../../lib/useAuth';
import { getRoleConfig, getDomain } from '../../ux-alternatives/launchpad-nav/roleData';
import type { Feature } from '../../ux-alternatives/launchpad-nav/roleData';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  canvas:   'oklch(0.97 0.003 250)',
  card:     'oklch(0.99 0.002 80)',
  border:   'oklch(0.88 0.006 250)',
  text1:    'oklch(0.17 0.010 250)',
  text2:    'oklch(0.40 0.009 250)',
  text3:    'oklch(0.60 0.008 250)',
  hover:    'oklch(0.94 0.004 250)',
  stateBg:  'oklch(0.93 0.008 250)',
  stateFg:  'oklch(0.40 0.009 250)',
  activeBg: 'oklch(0.96 0.006 250)',
} as const;

const ROLE_ACCENT: Record<string, string> = {
  ipp_developer:  'oklch(0.46 0.16 55)',
  trader:         'oklch(0.46 0.16 250)',
  lender:         'oklch(0.46 0.16 280)',
  offtaker:       'oklch(0.46 0.14 200)',
  carbon_fund:    'oklch(0.46 0.16 145)',
  grid_operator:  'oklch(0.46 0.14 220)',
  regulator:      'oklch(0.40 0.12 5)',
  admin:          'oklch(0.30 0.015 250)',
  support:        'oklch(0.46 0.14 100)',
  esco:           'oklch(0.46 0.14 30)',
  epc_contractor: 'oklch(0.46 0.14 10)',
};

// ─── State badge ─────────────────────────────────────────────────────────────
function StateBadge({ state, color }: { state: string; color?: string }) {
  const label = state.replace(/_/g, ' ');
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 4,
        background: color ? `color-mix(in oklch, ${color} 12%, oklch(0.99 0.002 80))` : T.stateBg,
        color: color ?? T.stateFg,
        border: `1px solid ${color ? `color-mix(in oklch, ${color} 25%, oklch(0.88 0.006 250))` : T.border}`,
        fontSize: 10.5,
        fontFamily: 'ui-monospace, monospace',
        letterSpacing: '0.04em',
        fontWeight: 500,
        textTransform: 'lowercase',
      }}
    >
      {label}
    </span>
  );
}

// ─── Journey process flow ─────────────────────────────────────────────────────
function JourneyFlow({
  features,
  domainColor,
  onFeatureClick,
}: {
  features: Feature[];
  domainColor: string;
  onFeatureClick: (f: Feature) => void;
}) {
  const [hovIdx, setHovIdx] = React.useState<number | null>(null);

  return (
    <div
      role="list"
      aria-label="Workflow journey"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0,
        overflowX: 'auto',
        paddingBottom: 8,
        scrollbarWidth: 'thin',
      }}
    >
      {features.map((feature, idx) => {
        const isActive = !!feature.mockState;
        const isHov = hovIdx === idx;

        return (
          <React.Fragment key={feature.key}>
            <button
              role="listitem"
              type="button"
              aria-label={`Step ${idx + 1}: ${feature.label}${feature.mockState ? ` — ${feature.mockState.replace(/_/g, ' ')}` : ''}`}
              onClick={() => onFeatureClick(feature)}
              onMouseEnter={() => setHovIdx(idx)}
              onMouseLeave={() => setHovIdx(null)}
              onFocus={() => setHovIdx(idx)}
              onBlur={() => setHovIdx(null)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '10px 14px',
                borderRadius: 10,
                border: `1px solid ${isHov ? domainColor : isActive ? `color-mix(in oklch, ${domainColor} 30%, ${T.border})` : T.border}`,
                background: isHov
                  ? `color-mix(in oklch, ${domainColor} 8%, ${T.card})`
                  : isActive
                  ? `color-mix(in oklch, ${domainColor} 5%, ${T.card})`
                  : T.card,
                cursor: 'pointer',
                transition: 'background 130ms, border-color 130ms, transform 130ms, box-shadow 130ms',
                transform: isHov ? 'scale(1.03)' : 'scale(1)',
                boxShadow: isHov ? `0 4px 14px color-mix(in oklch, ${domainColor} 20%, transparent)` : 'none',
                minWidth: 130,
                maxWidth: 160,
                flexShrink: 0,
                textAlign: 'center',
                outline: 'none',
              }}
            >
              {/* Step circle */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: isActive
                    ? domainColor
                    : isHov
                    ? `color-mix(in oklch, ${domainColor} 30%, ${T.stateBg})`
                    : T.stateBg,
                  color: isActive ? 'white' : isHov ? domainColor : T.text3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: 'ui-monospace, monospace',
                  transition: 'background 130ms, color 130ms',
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </div>

              {/* Label */}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? T.text1 : T.text2,
                  lineHeight: 1.35,
                  wordBreak: 'break-word',
                  transition: 'color 130ms',
                }}
              >
                {feature.label}
              </div>

              {/* State badge */}
              {feature.mockState && (
                <StateBadge state={feature.mockState} color={domainColor} />
              )}
            </button>

            {/* Connector arrow */}
            {idx < features.length - 1 && (
              <div
                aria-hidden
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 4px',
                  color: T.text3,
                  fontSize: 12,
                  flexShrink: 0,
                  paddingTop: 22,
                }}
              >
                →
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Feature tile ─────────────────────────────────────────────────────────────
function FeatureTile({
  feature,
  domainColor,
  stepNumber,
  onClick,
}: {
  feature: Feature;
  domainColor: string;
  stepNumber: number;
  onClick: (f: Feature) => void;
}) {
  const [hov, setHov] = React.useState(false);

  return (
    <button
      type="button"
      onClick={() => onClick(feature)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onFocus={() => setHov(true)}
      onBlur={() => setHov(false)}
      aria-label={`${feature.label}${feature.mockState ? ` — ${feature.mockState.replace(/_/g, ' ')}` : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        textAlign: 'left',
        padding: '14px 16px',
        borderRadius: 10,
        border: `1px solid ${hov ? domainColor : T.border}`,
        borderLeft: `3px solid ${domainColor}`,
        background: hov ? T.hover : T.card,
        cursor: 'pointer',
        transition: 'background 130ms, border-color 130ms, box-shadow 130ms, transform 130ms',
        boxShadow: hov ? '0 4px 14px oklch(0.17 0.010 250 / 0.06)' : 'none',
        transform: hov ? 'scale(1.012)' : 'scale(1)',
        minHeight: 110,
        width: '100%',
        outline: 'none',
      }}
    >
      {/* Step indicator + label row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
          <span
            style={{
              flexShrink: 0,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: feature.mockState
                ? domainColor
                : `color-mix(in oklch, ${domainColor} 15%, ${T.stateBg})`,
              color: feature.mockState ? 'white' : domainColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9.5,
              fontWeight: 700,
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {stepNumber}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text1, lineHeight: 1.3 }}>
            {feature.label}
          </span>
        </div>
        <span style={{ fontSize: 10, color: hov ? domainColor : T.text3, transition: 'color 130ms', flexShrink: 0, marginTop: 1 }}>→</span>
      </div>

      {/* Description */}
      <div style={{ fontSize: 11.5, color: T.text2, lineHeight: 1.5, flex: 1 }}>
        {feature.description}
      </div>

      {/* State badge */}
      {feature.mockState && (
        <div style={{ marginTop: 2 }}>
          <StateBadge state={feature.mockState} color={domainColor} />
        </div>
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SubCockpitPage() {
  const { user } = useAuth();
  const { role: routeRole, domain: domainKey } = useParams<{ role: string; domain: string }>();
  const navigate = useNavigate();

  const roleKey = routeRole ?? user?.role ?? '';
  const accent = ROLE_ACCENT[roleKey] ?? 'oklch(0.46 0.16 250)';
  const config = getRoleConfig(roleKey);
  const domain = domainKey ? getDomain(roleKey, domainKey) : undefined;

  const [view, setView] = React.useState<'journey' | 'grid'>('journey');

  if (!config) {
    return (
      <div style={{ padding: 32, color: T.text2, fontSize: 14 }}>
        No launchpad config for role: <code>{roleKey}</code>
      </div>
    );
  }

  if (!domain) {
    return (
      <div style={{ padding: 32, color: T.text2, fontSize: 14 }}>
        Domain not found: <code>{domainKey}</code>{' '}
        <Link to={`/launch/${roleKey}`} style={{ color: accent }}>← Back to launchpad</Link>
      </div>
    );
  }

  const handleFeatureClick = (feature: Feature) => {
    const tabKey = feature.chainKey ?? feature.key;
    navigate(`${config.workstationPath}?tab=${tabKey}`);
  };

  const activeCount = domain.features.filter((f) => f.mockState).length;

  return (
    <div style={{ minHeight: '100dvh', background: T.canvas }}>

      {/* ── Breadcrumb header ─────────────────────────────────────────────── */}
      <div
        style={{
          padding: '14px 32px',
          background: T.card,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Link
          to={`/launch/${roleKey}`}
          style={{
            fontSize: 13,
            color: T.text2,
            textDecoration: 'none',
            fontWeight: 500,
            letterSpacing: '-0.01em',
            transition: 'color 120ms',
          }}
          onMouseEnter={(e) => { (e.currentTarget).style.color = accent; }}
          onMouseLeave={(e) => { (e.currentTarget).style.color = T.text2; }}
        >
          {config.label}
        </Link>
        <span style={{ fontSize: 13, color: T.text3 }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text1 }}>{domain.label}</span>
      </div>

      {/* ── Domain hero ───────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '18px 32px 16px',
          background: T.card,
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: `color-mix(in oklch, ${domain.color} 14%, white)`,
              border: `1.5px solid color-mix(in oklch, ${domain.color} 35%, oklch(0.88 0.006 250))`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            {domain.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                color: T.text1,
                letterSpacing: '-0.025em',
                lineHeight: 1.1,
              }}
            >
              {domain.label}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: T.text2 }}>
              {domain.features.length} workflow{domain.features.length !== 1 ? 's' : ''}
              {activeCount > 0 && (
                <span style={{ color: domain.color, fontWeight: 600, marginLeft: 8 }}>
                  · {activeCount} active
                </span>
              )}
            </p>
          </div>

          {/* View toggle */}
          <div
            role="group"
            aria-label="View mode"
            style={{
              display: 'flex',
              borderRadius: 7,
              border: `1px solid ${T.border}`,
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {(['journey', 'grid'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                style={{
                  padding: '6px 12px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: view === v ? domain.color : T.card,
                  color: view === v ? 'white' : T.text2,
                  transition: 'background 130ms, color 130ms',
                  textTransform: 'capitalize',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Journey view ──────────────────────────────────────────────────── */}
      {view === 'journey' && (
        <div style={{ padding: '24px 32px 40px' }}>

          {/* Journey flow header */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: T.text3,
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              marginBottom: 16,
            }}
          >
            Process journey — {domain.features.length} steps
          </div>

          {/* Journey flow strip */}
          <div
            style={{
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: '18px 20px',
              marginBottom: 32,
            }}
          >
            <JourneyFlow
              features={domain.features}
              domainColor={domain.color}
              onFeatureClick={handleFeatureClick}
            />
          </div>

          {/* Detailed activity list */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: T.text3,
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              marginBottom: 14,
            }}
          >
            Activities
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {domain.features.map((feature, idx) => (
              <ActivityRow
                key={feature.key}
                feature={feature}
                stepNumber={idx + 1}
                domainColor={domain.color}
                isLast={idx === domain.features.length - 1}
                onClick={handleFeatureClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Grid view ─────────────────────────────────────────────────────── */}
      {view === 'grid' && (
        <div style={{ padding: '24px 32px 40px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: T.text3,
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              marginBottom: 14,
            }}
          >
            Workflows
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
              gap: 10,
            }}
          >
            {domain.features.map((feature, idx) => (
              <FeatureTile
                key={feature.key}
                feature={feature}
                domainColor={domain.color}
                stepNumber={idx + 1}
                onClick={handleFeatureClick}
              />
            ))}
            {domain.features.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '24px', textAlign: 'center', color: T.text3, fontSize: 13 }}>
                No workflows configured for this domain yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Back to launchpad ──────────────────────────────────────────────── */}
      <div style={{ padding: '0 32px 40px' }}>
        <Link
          to={`/launch/${roleKey}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: T.text2,
            textDecoration: 'none',
            padding: '8px 14px',
            borderRadius: 7,
            border: `1px solid ${T.border}`,
            background: T.card,
            transition: 'color 130ms, border-color 130ms, background 130ms',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.color = accent;
            el.style.borderColor = accent;
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.color = T.text2;
            el.style.borderColor = T.border;
          }}
        >
          ← All workspaces
        </Link>
      </div>
    </div>
  );
}

// ─── Activity row (journey view detailed list) ────────────────────────────────
function ActivityRow({
  feature,
  stepNumber,
  domainColor,
  isLast,
  onClick,
}: {
  feature: Feature;
  stepNumber: number;
  domainColor: string;
  isLast: boolean;
  onClick: (f: Feature) => void;
}) {
  const [hov, setHov] = React.useState(false);

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {/* Timeline spine */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40, flexShrink: 0 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: feature.mockState ? domainColor : `color-mix(in oklch, ${domainColor} 14%, ${T.stateBg})`,
            color: feature.mockState ? 'white' : domainColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10.5,
            fontWeight: 700,
            fontFamily: 'ui-monospace, monospace',
            flexShrink: 0,
            marginTop: 14,
            zIndex: 1,
            position: 'relative',
          }}
        >
          {stepNumber}
        </div>
        {!isLast && (
          <div
            style={{
              width: 2,
              flex: 1,
              minHeight: 16,
              background: `color-mix(in oklch, ${domainColor} 20%, ${T.border})`,
              marginTop: 2,
            }}
          />
        )}
      </div>

      {/* Activity card */}
      <button
        type="button"
        onClick={() => onClick(feature)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onFocus={() => setHov(true)}
        onBlur={() => setHov(false)}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          textAlign: 'left',
          padding: '10px 16px',
          borderRadius: 10,
          border: `1px solid ${hov ? domainColor : T.border}`,
          background: hov ? T.hover : T.card,
          cursor: 'pointer',
          transition: 'background 130ms, border-color 130ms, box-shadow 130ms',
          boxShadow: hov ? `0 2px 10px color-mix(in oklch, ${domainColor} 12%, transparent)` : 'none',
          marginLeft: 8,
          marginBottom: isLast ? 0 : 4,
          marginTop: 8,
          outline: 'none',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text1, marginBottom: 2 }}>
            {feature.label}
          </div>
          <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.45 }}>
            {feature.description}
          </div>
        </div>
        {feature.mockState && (
          <div style={{ flexShrink: 0 }}>
            <StateBadge state={feature.mockState} color={domainColor} />
          </div>
        )}
        <span style={{ flexShrink: 0, fontSize: 12, color: hov ? domainColor : T.text3, transition: 'color 130ms' }}>
          →
        </span>
      </button>
    </div>
  );
}
