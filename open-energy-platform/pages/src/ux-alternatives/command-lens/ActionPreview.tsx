// ActionPreview — the inline preview card that shows when a typed command
// would mutate something (revoke / suspend / failover). Shows target row +
// effects + confirm button. Drawer-over-modal — this is non-destructive
// preview; clicking Confirm escalates to ConfirmModal for revoke.

import React from 'react';
import { ChainRow, STATUS_LABEL, TIER_LABEL, healthColor, slaColor } from '../shared/SampleChainData';
import { Button } from '../shared/primitives';

export interface PreviewedAction {
  verb: 'revoke' | 'suspend' | 'failover' | 'open';
  target: ChainRow;
}

export function ActionPreview({
  action,
  onConfirm,
  onCancel,
}: {
  action: PreviewedAction;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const verbColor: Record<PreviewedAction['verb'], string> = {
    revoke: '#c0392b',
    suspend: '#d97706',
    failover: '#3b82c4',
    open: '#1a3a5c',
  };
  const verbLabel: Record<PreviewedAction['verb'], string> = {
    revoke: 'REVOKE certificate',
    suspend: 'SUSPEND streaming',
    failover: 'FAILOVER to secondary peer',
    open: 'OPEN detail drawer',
  };
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #dde4ec',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(15,28,46,0.08)',
        overflow: 'hidden',
        marginTop: 16,
      }}
    >
      <div
        style={{
          padding: '8px 14px',
          background: verbColor[action.verb] + '14',
          color: verbColor[action.verb],
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: verbColor[action.verb] }} />
        Will {verbLabel[action.verb]}
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#6b7685', fontFamily: 'ui-monospace, monospace' }}>{action.target.number}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: '#0f1c2e' }}>
              {action.target.substation}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#3d4756' }}>
              {action.target.title}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 12 }}>
              <Metric label="Status" value={STATUS_LABEL[action.target.status]} color={healthColor(action.target.health)} />
              <Metric label="Tier" value={TIER_LABEL[action.target.tier]} />
              <Metric label="Authority" value={action.target.authority} />
              <Metric
                label="SLA"
                value={action.target.sla_target_hours > 0 ? (action.target.sla_breached ? 'BREACHED' : action.target.sla_pct_remaining + '%') : '—'}
                color={slaColor(action.target.sla_pct_remaining)}
                numeric
              />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button onClick={onCancel} variant="secondary">Cancel (esc)</Button>
            <Button onClick={onConfirm} variant={action.verb === 'revoke' ? 'danger' : 'primary'}>
              Confirm (⏎)
            </Button>
          </div>
        </div>

        {action.verb === 'revoke' && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              background: 'rgba(192,57,43,0.06)',
              border: '1px solid rgba(192,57,43,0.20)',
              borderRadius: 8,
              fontSize: 12,
              color: '#5a0e08',
              lineHeight: 1.55,
            }}
          >
            <strong>Reportable under:</strong> NERSA Grid Code C-3 · IEC 62351 · SANS 27001 · SARB BA 700 cyber notice.<br />
            Cascades trigger W26 cyber incident, W67 grid-code compliance, W118 audit block.
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, color, numeric }: { label: string; value: string; color?: string; numeric?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#6b7685', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700 }}>{label}</div>
      <div className={numeric ? 'oe-num' : ''} style={{ fontSize: 13, fontWeight: 600, color: color ?? '#0f1c2e', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
