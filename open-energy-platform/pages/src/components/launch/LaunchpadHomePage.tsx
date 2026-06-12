import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/useAuth';
import { api } from '../../lib/api';
import { getRoleConfig } from '../../ux-alternatives/launchpad-nav/roleData';
import type { Domain } from '../../ux-alternatives/launchpad-nav/roleData';

// ─── Design tokens (mockup-b OKLch) ────────────────────────────────────────
const T = {
  canvas:  'oklch(0.97 0.003 250)',
  card:    'oklch(0.99 0.002 80)',
  border:  'oklch(0.88 0.006 250)',
  text1:   'oklch(0.17 0.010 250)',
  text2:   'oklch(0.40 0.009 250)',
  text3:   'oklch(0.60 0.008 250)',
  good:    'oklch(0.40 0.12 155)',
  warn:    'oklch(0.46 0.16 55)',
  bad:     'oklch(0.46 0.18 25)',
  hover:   'oklch(0.94 0.004 250)',
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

// ─── API types ──────────────────────────────────────────────────────────────
type Tone = 'good' | 'warn' | 'bad' | 'neutral';

type LiveKpi = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  trend_value?: string;
  tone?: Tone;
  href?: string;
};

type LiveAiSuggestion = {
  key: string;
  title: string;
  why: string;
  confidence?: number;
  accept?: { label: string; href?: string; action?: string };
};

type LaunchPayload = {
  hero?: { eyebrow?: string; title?: string; subtitle?: string };
  kpis?: LiveKpi[];
  ai_suggestions?: LiveAiSuggestion[];
};

// ─── Tone helpers ────────────────────────────────────────────────────────────
const toneColor = (tone?: Tone) => {
  if (tone === 'good') return T.good;
  if (tone === 'warn') return T.warn;
  if (tone === 'bad') return T.bad;
  return T.text2;
};

const trendSymbol = (trend?: 'up' | 'down' | 'flat') => {
  if (trend === 'up') return '↑';
  if (trend === 'down') return '↓';
  return '';
};

// ─── KPI chip ────────────────────────────────────────────────────────────────
function KpiChip({ kpi }: { kpi: LiveKpi }) {
  const color = toneColor(kpi.tone);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '10px 14px',
        background: T.card,
        border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        minWidth: 100,
        cursor: kpi.href ? 'pointer' : 'default',
      }}
      onClick={kpi.href ? () => { window.location.href = kpi.href!; } : undefined}
    >
      <div style={{ fontSize: 11, color: T.text3, letterSpacing: '0.02em' }}>{kpi.label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color, fontFamily: 'ui-monospace, monospace', lineHeight: 1 }}>
        {trendSymbol(kpi.trend)}{kpi.value}{kpi.unit ? <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 2 }}>{kpi.unit}</span> : null}
      </div>
      {kpi.trend_value && (
        <div style={{ fontSize: 10.5, color: T.text3 }}>{kpi.trend_value}</div>
      )}
    </div>
  );
}

// ─── Domain tile ─────────────────────────────────────────────────────────────
function DomainTile({ domain, onClick }: { domain: Domain; onClick: () => void }) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-label={`Open ${domain.label} workspace — ${domain.features.length} workflows`}
      style={{
        height: 160,
        background: hovered ? T.hover : T.card,
        border: `1px solid ${hovered ? domain.color : T.border}`,
        borderLeft: `3px solid ${domain.color}`,
        borderRadius: 10,
        padding: '16px 14px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        textAlign: 'left',
        boxShadow: hovered ? '0 4px 16px oklch(0.17 0.010 250 / 0.07)' : 'none',
        transition: 'background 140ms, border-color 140ms, box-shadow 140ms, transform 140ms',
        transform: hovered ? 'scale(1.015)' : 'scale(1)',
        width: '100%',
        outline: 'none',
      }}
    >
      <span style={{ fontSize: 24, lineHeight: 1 }}>{domain.icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text1, lineHeight: 1.3 }}>{domain.label}</div>
        <div style={{ fontSize: 11, color: T.text2, marginTop: 4 }}>
          {domain.features.length} workflow{domain.features.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div style={{ marginTop: 'auto', fontSize: 11, color: hovered ? domain.color : T.text3, transition: 'color 140ms' }}>
        Open →
      </div>
    </button>
  );
}

// ─── AI suggestion card ───────────────────────────────────────────────────────
function AiCard({ suggestion, accent, onAccept }: { suggestion: LiveAiSuggestion; accent: string; onAccept?: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);

  const handleAccept = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAccepted(true);
    if (suggestion.accept?.href) {
      window.location.href = suggestion.accept.href;
    } else if (onAccept) {
      onAccept();
    }
  };

  return (
    <div
      style={{
        background: accepted
          ? `color-mix(in oklch, ${T.good} 8%, ${T.card})`
          : hovered ? T.hover : T.card,
        border: `1px solid ${accepted ? T.good : T.border}`,
        borderRadius: 8,
        padding: '12px 14px',
        maxWidth: 320,
        minWidth: 220,
        cursor: 'default',
        transition: 'background 140ms, border-color 140ms',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ fontSize: 10.5, color: accent, fontWeight: 700, letterSpacing: '0.04em' }}>
        AI · {suggestion.why}
        {suggestion.confidence != null && (
          <span style={{ color: T.text3, fontWeight: 500, marginLeft: 4 }}>{Math.round(suggestion.confidence * 100)}%</span>
        )}
      </div>
      <div style={{ fontSize: 13, color: T.text1, lineHeight: 1.45 }}>
        {suggestion.title}
      </div>
      {suggestion.accept && !accepted && (
        <button
          type="button"
          onClick={handleAccept}
          style={{
            marginTop: 4,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            background: accent,
            color: 'white',
            border: 'none',
            borderRadius: 5,
            cursor: 'pointer',
            alignSelf: 'flex-start',
            transition: 'opacity 130ms',
          }}
          onMouseEnter={(e) => { (e.currentTarget).style.opacity = '0.85'; }}
          onMouseLeave={(e) => { (e.currentTarget).style.opacity = '1'; }}
        >
          {suggestion.accept.label}
        </button>
      )}
      {accepted && (
        <div style={{ fontSize: 11, color: T.good, fontWeight: 600 }}>✓ Accepted</div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function LaunchpadHomePage() {
  const { user } = useAuth();
  const { role: routeRole } = useParams<{ role: string }>();
  const navigate = useNavigate();

  const roleKey = routeRole ?? user?.role ?? '';
  const config = getRoleConfig(roleKey);
  const accent = ROLE_ACCENT[roleKey] ?? 'oklch(0.46 0.16 250)';

  const [liveData, setLiveData] = useState<LaunchPayload | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (roleKey) {
      setLoadingKpis(true);
      api.get<{ data?: LaunchPayload }>(`/launch/${roleKey}/kpis`)
        .then((res) => {
          if (!cancelled) {
            const payload = (res.data as unknown as LaunchPayload) ?? null;
            setLiveData(payload);
          }
        })
        .catch(() => { /* Silently fall back to static data on error */ })
        .finally(() => { if (!cancelled) setLoadingKpis(false); });
    }
    return () => { cancelled = true; };
  }, [roleKey]);

  const handleDomainClick = (domainKey: string) => {
    if (!config) return;
    navigate(`/launch/${roleKey}/${domainKey}`);
  };

  if (!config) {
    return (
      <div style={{ padding: 32, color: T.text2, fontSize: 14 }}>
        No launchpad config found for role: <code>{roleKey}</code>
      </div>
    );
  }

  const kpis: LiveKpi[] = liveData?.kpis ?? [];
  const aiSuggestions = liveData?.ai_suggestions ?? [];
  const heroTitle = liveData?.hero?.title ?? config.label;
  const heroSubtitle = liveData?.hero?.subtitle ?? '';

  return (
    <div style={{ minHeight: '100dvh', background: T.canvas }}>

      {/* ── Hero strip ─────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '20px 32px 16px',
          borderBottom: `1px solid ${T.border}`,
          background: T.card,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: T.text1,
            letterSpacing: '-0.025em',
          }}
        >
          {heroTitle}
        </h1>
        {heroSubtitle && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: T.text2 }}>{heroSubtitle}</p>
        )}

        {/* Live KPI chips */}
        {!loadingKpis && kpis.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {kpis.slice(0, 6).map((kpi) => (
              <KpiChip key={kpi.key} kpi={kpi} />
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {loadingKpis && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  width: 110,
                  height: 56,
                  borderRadius: 8,
                  background: T.border,
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Domain tile grid ────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 32px 0' }}>
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
          Workspaces
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          {config.domains.map((domain) => (
            <DomainTile
              key={domain.key}
              domain={domain}
              onClick={() => handleDomainClick(domain.key)}
            />
          ))}
        </div>
      </div>

      {/* ── AI suggested actions ─────────────────────────────────────────────── */}
      {aiSuggestions.length > 0 && (
        <div style={{ padding: '28px 32px 40px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: T.text3,
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              marginBottom: 12,
            }}
          >
            Suggested actions
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {aiSuggestions.slice(0, 4).map((s) => (
              <AiCard key={s.key} suggestion={s} accent={accent} />
            ))}
          </div>
        </div>
      )}

      {/* ── Pulse animation keyframe ─────────────────────────────────────────── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
