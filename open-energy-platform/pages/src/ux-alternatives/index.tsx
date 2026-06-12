// UX-alternatives index — direction picker.
//
// Mounted at /ux-prototype. Lists the 4 directions with a 1-line elevator
// pitch + entry route. Adaptive density toggle visible top-right and
// persisted in localStorage across direction switches.

import React from 'react';
import { Link } from 'react-router-dom';
import './shared/animations.css';
import { DensityProvider, useDensity } from './shared/DensityContext';
import { Tooltip } from './shared/primitives';

const DIRECTIONS = [
  {
    slug: 'pulse-lens',
    name: 'Pulse Lens',
    pitch: 'Spatial state-space — chains arrange by status × urgency, breach orbits pulse to centre.',
    affinity: 'Ops on-call; SOC-style situational awareness primary.',
    accent: '#c0392b',
  },
  {
    slug: 'time-axis',
    name: 'Time Axis',
    pitch: 'Time-as-x-axis Gantt strip — every SLA window mapped on a 7d/30d/90d horizon.',
    affinity: 'Schedulers, regulators tracking deadlines.',
    accent: '#1a8a5b',
  },
  {
    slug: 'command-lens',
    name: 'Command Lens',
    pitch: 'Type-first workstation — Raycast-grade Cmd-K palette is the primary interface.',
    affinity: 'Power users, traders, support.',
    accent: '#1a3a5c',
  },
  {
    slug: 'cockpit-grid',
    name: 'Cockpit Grid',
    pitch: 'Resizable 12-col tile canvas — drop chain tiles in, F1-F12 jumps focus, persisted layout.',
    affinity: 'Day-long workstation users, multi-asset operators.',
    accent: '#5d3a7e',
  },
  {
    slug: 'launchpad-nav',
    name: 'Launchpad Nav',
    pitch: 'Menuless 3-level spatial nav — Launchpad → Sub-cockpit → Feature. All 9 roles, all 76 chains, no sidebar.',
    affinity: 'All roles; onboarding-friendly, mobile-first spatial orientation.',
    accent: '#7e57c2',
  },
];

function PickerBody() {
  const { density, toggle } = useDensity();
  return (
    <div
      data-density={density}
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 12% 18%, rgba(95,168,232,0.10) 0%, transparent 55%),' +
          'radial-gradient(circle at 88% 82%, rgba(31,155,149,0.08) 0%, transparent 55%),' +
          '#f5f8fb',
        fontFamily: 'Inter Variable, -apple-system, BlinkMacSystemFont, sans-serif',
        color: '#0f1c2e',
      }}
    >
      <header
        style={{
          padding: '36px 48px 24px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ maxWidth: 760 }}>
          <div style={{ fontSize: 12, color: '#5fa8e8', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            UX Exploration · 2026-05-31
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 700, marginTop: 8, letterSpacing: -0.5, lineHeight: 1.05 }}>
            Four ways the workstation could feel.
          </h1>
          <p style={{ marginTop: 12, color: '#3d4756', fontSize: 15, lineHeight: 1.55 }}>
            Live, mountable prototypes. Each direction is a different answer to
            the same question: <em>"What is the primary surface of a transaction-heavy
            energy workstation?"</em> Density toggle persists across all four.
          </p>
        </div>
        <Tooltip label="Toggle density" shortcut="⌘⇧D" position="bottom">
          <button
            type="button"
            onClick={toggle}
            className="oe-btn"
            style={{
              padding: '8px 14px',
              border: '1px solid #c5cdd6',
              borderRadius: 8,
              fontSize: 12,
              background: '#fff',
              color: '#0f1c2e',
              cursor: 'pointer',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: density === 'compact' ? '#1a3a5c' : '#9bc8ee',
              }}
            />
            {density === 'compact' ? 'Compact 30px rows' : 'Comfortable 44px rows'}
          </button>
        </Tooltip>
      </header>

      <main
        style={{
          padding: '0 48px 80px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 20,
          maxWidth: 1400,
          margin: '0 auto',
        }}
      >
        {DIRECTIONS.map((d) => (
          <Link
            key={d.slug}
            to={`/ux-prototype/${d.slug}`}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
              padding: 24,
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #dde4ec',
              transition: 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 160ms cubic-bezier(0.23, 1, 0.32, 1)',
              boxShadow: '0 1px 2px rgba(15,28,46,0.04)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 8px 28px rgba(15,28,46,0.10)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 1px 2px rgba(15,28,46,0.04)';
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: `${d.accent}1a`,
                color: d.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                marginBottom: 16,
                fontSize: 14,
              }}
            >
              {d.slug.charAt(0).toUpperCase()}
            </div>
            <div style={{ fontSize: 11, color: '#6b7685', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Direction
            </div>
            <h2 style={{ marginTop: 4, fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>{d.name}</h2>
            <p style={{ marginTop: 10, color: '#3d4756', fontSize: 13.5, lineHeight: 1.55 }}>
              {d.pitch}
            </p>
            <div style={{ marginTop: 14, fontSize: 11.5, color: '#525a66', fontStyle: 'italic' }}>
              {d.affinity}
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 12,
                color: d.accent,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Open prototype →
            </div>
          </Link>
        ))}
      </main>

      <footer
        style={{
          padding: '0 48px 48px',
          maxWidth: 1400,
          margin: '0 auto',
          color: '#525a66',
          fontSize: 12.5,
          lineHeight: 1.6,
        }}
      >
        <div style={{ borderTop: '1px solid #dde4ec', paddingTop: 18, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div>Press <kbd style={{ background: '#fff', border: '1px solid #c5cdd6', padding: '2px 6px', borderRadius: 4, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>⌘K</kbd> inside any prototype to open the command palette.</div>
          <div>Press <kbd style={{ background: '#fff', border: '1px solid #c5cdd6', padding: '2px 6px', borderRadius: 4, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>⌘⇧D</kbd> anywhere to flip density.</div>
          <div>Sample data: SCC chain (W122). 16 connectors from <code>scc-001</code> to <code>scc-016</code>.</div>
        </div>
      </footer>
    </div>
  );
}

export default function UxAlternativesIndex() {
  return (
    <DensityProvider>
      <PickerBody />
    </DensityProvider>
  );
}
