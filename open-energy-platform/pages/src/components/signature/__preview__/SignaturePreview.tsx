// Dev-only signature preview. Mounted at /dev/signature when import.meta.env.DEV.
// Demonstrates every signature primitive against a chosen role theme; flip
// the role via the chrome bar at the top to see cinematic vs Bloomberg modes.

import React, { useEffect, useState } from 'react';
import {
  RoleShell,
  HeroNumeral,
  Ticker,
  SignatureHero,
  DensityCard,
  FrostedCard,
  KineticChart,
  CommandRail,
  AiInlineCard,
  StatusPulse,
} from '../index';
import { roleThemes, type RoleKey } from '../../../lib/role-themes';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

const ROLE_KEYS = Object.keys(roleThemes) as RoleKey[];

function useLiveTickerRows() {
  const [rows, setRows] = useState([
    { symbol: 'PEAK', label: 'Peak ZAR/MWh', value: 1842.5, delta: 12.3 },
    { symbol: 'OFF', label: 'Off-peak ZAR/MWh', value: 642.1, delta: -3.4 },
    { symbol: 'CER', label: 'Carbon CER R/t', value: 296.0, delta: 0.0 },
    { symbol: 'HZ', label: 'Grid frequency', value: 49.98, delta: -0.02 },
  ]);
  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) =>
        prev.map((r) => {
          const drift = (Math.random() - 0.5) * 4;
          const next = +(r.value + drift).toFixed(2);
          return { ...r, value: next, delta: +(next - r.value + r.delta).toFixed(2) };
        }),
      );
    }, 2400);
    return () => clearInterval(id);
  }, []);
  return rows;
}

const sparkSample = Array.from({ length: 24 }, (_, i) => ({
  t: i,
  v: 1400 + Math.sin(i / 2) * 180 + i * 12,
}));

export default function SignaturePreview() {
  const [role, setRole] = useState<RoleKey>('trader');
  const theme = roleThemes[role];
  const rows = useLiveTickerRows();

  return (
    <div style={{ minHeight: '100vh', background: '#0a1622' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 24px',
          background: '#0a1622',
          color: '#eef2f7',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          Signature preview
        </strong>
        {ROLE_KEYS.map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              background: r === role ? roleThemes[r].accent : 'transparent',
              color: r === role ? '#0a1622' : '#eef2f7',
              border: `1px solid ${roleThemes[r].accent}`,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {roleThemes[r].label}
          </button>
        ))}
      </div>

      <RoleShell role={role}>
        <SignatureHero
          eyebrow={`${theme.label} · ${theme.workstationDensity} workstation`}
          title="A $100M experience, role by role."
          subtitle="Every surface flexes between cinematic launch boards and Bloomberg-density workstations. Same tokens, different rhythm."
          primaryCta={{ label: 'Open workstation', href: '#' }}
        />

        {theme.workstationDensity === 'bloomberg' ? (
          <CommandRail
            items={[
              { key: 'new-order', label: 'New order', shortcut: 'alt+n', onTrigger: () => {} },
              { key: 'mark', label: 'Mark prices', shortcut: 'alt+m', onTrigger: () => {} },
              { key: 'halt', label: 'Halt market', shortcut: 'alt+shift+h', onTrigger: () => {}, tone: 'danger' },
            ]}
          />
        ) : null}

        <div style={{ padding: 32, display: 'grid', gap: 32 }}>
          <Ticker rows={rows} ariaLabel="Live market tape" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24 }}>
            <FrostedCard>
              <HeroNumeral
                eyebrow="Cleared today"
                value={1842.5}
                unit="ZAR/MWh"
                delta={{ value: 12.3, tone: 'good', label: 'vs yesterday' }}
                sparkline={sparkSample.map((p) => p.v)}
              />
            </FrostedCard>
            <DensityCard>
              <HeroNumeral
                eyebrow="Open positions"
                value={28}
                unit="contracts"
                delta={{ value: -2, tone: 'bad' }}
              />
            </DensityCard>
            <DensityCard>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <StatusPulse tone="live" label="Live · markets open" />
                <StatusPulse tone="warn" label="Margin call queue · 3" />
                <StatusPulse tone="critical" label="DLQ retry · 1" />
                <StatusPulse tone="idle" label="Settlement run · idle" />
              </div>
            </DensityCard>
          </div>

          <DensityCard>
            <KineticChart height={220} caption="ZAR/MWh, last 24 hours">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparkSample}>
                  <XAxis dataKey="t" hide />
                  <YAxis hide domain={['dataMin - 50', 'dataMax + 50']} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke={theme.accent}
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </KineticChart>
          </DensityCard>

          <AiInlineCard
            title="Suggest raising bid by R8 to clear remaining 12 MWh"
            why="Bid book at 1834 has thinned to 6 MWh and your VWAP target is 1842. Lifting matches you against your own price targets."
            confidence={0.82}
            accept={{ label: 'Apply +R8' }}
            dismiss={{ label: 'Dismiss' }}
          />
        </div>
      </RoleShell>
    </div>
  );
}
