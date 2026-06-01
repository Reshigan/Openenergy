// PulseDrawer — orb-click detail.
// Right-side drawer (not modal) — Emil rule: drawer over modal for
// non-destructive detail. Action footer hosts Revoke (destructive) which
// elevates to a ConfirmModal centred overlay.

import React, { useState } from 'react';
import { ChainRow, slaColor, STATUS_LABEL, TIER_LABEL, urgencyColor } from '../shared/SampleChainData';
import { Drawer, Button, ConfirmModal } from '../shared/primitives';

export function PulseDrawer({
  row,
  onClose,
}: {
  row: ChainRow | null;
  onClose: () => void;
}) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  if (!row) return null;
  return (
    <>
      <Drawer
        open={!!row}
        onClose={onClose}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#5fa8e8' }}>
              {row.number}
            </span>
            <span>{row.substation}</span>
          </div>
        }
      >
        <Detail row={row} />
        <Footer onRevoke={() => setConfirmRevoke(true)} />
      </Drawer>
      <ConfirmModal
        open={confirmRevoke}
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={() => {
          // Prototype: stub action — wire to API in production.
          setConfirmRevoke(false);
          onClose();
        }}
        title={`Revoke ${row.number}?`}
        body={
          <>
            <p style={{ marginBottom: 8 }}>
              This will REVOKE the SCADA connector certificate for <strong>{row.substation}</strong> and is reportable under NERSA Grid Code C-3 + IEC 62351 + SARB BA 700.
            </p>
            <p style={{ color: '#525a66', fontSize: 12 }}>
              Cascades: cyber incident bridge (W26), grid code compliance (W67), audit block (W118).
            </p>
          </>
        }
        confirmLabel="Revoke connector"
      />
    </>
  );
}

function Detail({ row }: { row: ChainRow }) {
  const breachStyle: React.CSSProperties = row.sla_breached
    ? { color: '#5a0e08', fontWeight: 700 }
    : { color: slaColor(row.sla_pct_remaining), fontWeight: 700 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Pill label="Status" value={STATUS_LABEL[row.status]} />
        <Pill label="Tier" value={TIER_LABEL[row.tier]} />
        <Pill label="Authority" value={row.authority} />
        <Pill label="Urgency" value={row.urgency} valueStyle={{ color: urgencyColor(row.urgency), fontWeight: 700 }} />
      </div>

      <Section title="SLA">
        <Row label="Window">
          <span className="oe-num">{row.sla_target_hours > 0 ? `${row.sla_target_hours}h` : '—'}</span>
        </Row>
        <Row label="Remaining">
          {row.sla_target_hours > 0 ? (
            <span className="oe-num" style={breachStyle}>
              {row.sla_breached ? 'BREACHED' : `${row.sla_pct_remaining}%`}
            </span>
          ) : <span>—</span>}
        </Row>
        <Row label="Deadline">
          <span className="oe-num" style={{ fontSize: 12 }}>{row.sla_deadline_at?.slice(0, 16).replace('T', ' ') ?? '—'}</span>
        </Row>
        <Row label="Escalation">
          <span className="oe-num">{row.escalation_level}</span>
        </Row>
      </Section>

      <Section title="Telemetry">
        <Row label="Quality index"><span className="oe-num">{row.telemetry_quality_index ?? '—'}</span></Row>
        <Row label="Latency p99"><span className="oe-num">{row.latency_p99_ms ? `${row.latency_p99_ms}ms` : '—'}</span></Row>
        <Row label="Messages/min"><span className="oe-num">{row.messages_per_minute ?? '—'}</span></Row>
        <Row label="Capacity"><span className="oe-num">{row.capacity_mva} MVA</span></Row>
      </Section>

      <Section title="Cert">
        <Row label="Days to renewal">
          <span
            className="oe-num"
            style={{ color: row.days_to_cert_renewal < 30 ? '#c0392b' : row.days_to_cert_renewal < 90 ? '#d97706' : '#0e6d68', fontWeight: 700 }}
          >
            {row.days_to_cert_renewal}
          </span>
        </Row>
      </Section>

      {row.regulator_relevant && (
        <Section title="NERSA crossing">
          <Row label="Ref"><code style={{ fontSize: 11 }}>{row.regulator_ref}</code></Row>
        </Section>
      )}

      <Section title="Bridges">
        {[
          ['W110 outage', row.w110_outage_ref],
          ['W50 reserve', row.w50_reserve_ref],
          ['W67 grid code', row.w67_grid_code_ref],
          ['W26 cyber', row.w26_cyber_ref],
          ['W118 audit block', row.w118_block_ref],
        ].filter(([_, v]) => v).map(([k, v]) => (
          <Row key={k as string} label={k as string}>
            <code style={{ fontSize: 11, color: '#1a3a5c' }}>{v as string}</code>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: '#6b7685',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ background: '#f5f8fb', borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, alignItems: 'center', minHeight: 24 }}>
      <span style={{ color: '#525a66' }}>{label}</span>
      {children}
    </div>
  );
}

function Pill({ label, value, valueStyle }: { label: string; value: string; valueStyle?: React.CSSProperties }) {
  return (
    <div style={{ background: '#f5f8fb', borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, color: '#6b7685', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 2, fontWeight: 600, ...valueStyle }}>{value}</div>
    </div>
  );
}

function Footer({ onRevoke }: { onRevoke: () => void }) {
  return (
    <div
      style={{
        marginTop: 22,
        paddingTop: 18,
        borderTop: '1px solid #e3e8ee',
        display: 'flex',
        gap: 8,
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
      }}
    >
      <Button variant="secondary">Suspend</Button>
      <Button variant="secondary">Failover</Button>
      <Button variant="danger" onClick={onRevoke}>Revoke</Button>
    </div>
  );
}
