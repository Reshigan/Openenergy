import React from 'react';
import { OeIcon } from '../icons/Icons';

export interface StateFlowStep {
  id: string;
  label: string;
  sublabel?: string;
  status: 'complete' | 'current' | 'pending' | 'breach' | 'terminal';
  timestamp?: string;
  actor?: string;
}

interface StateFlowProps {
  steps: StateFlowStep[];
  compact?: boolean;
}

const STATUS_COLORS = {
  complete: { fill: 'var(--oe-green)', text: '#fff', border: 'var(--oe-green)' },
  current:  { fill: 'var(--oe-navy-1)', text: '#fff', border: 'var(--oe-navy-1)' },
  pending:  { fill: 'var(--oe-canvas)', text: 'var(--oe-text-3)', border: 'var(--oe-border)' },
  breach:   { fill: 'var(--oe-rose)', text: '#fff', border: 'var(--oe-rose)' },
  terminal: { fill: 'var(--oe-surf-2)', text: 'var(--oe-text-3)', border: 'var(--oe-border)' },
};

export function StateFlow({ steps, compact = false }: StateFlowProps) {
  return (
    <div
      style={{
        overflowX: 'auto',
        paddingBottom: '4px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0,
          minWidth: 'max-content',
        }}
      >
        {steps.map((step, i) => {
          const colors = STATUS_COLORS[step.status];
          const isLast = i === steps.length - 1;

          return (
            <React.Fragment key={step.id}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: compact ? '4px' : '6px',
                }}
              >
                {/* Node */}
                <div
                  style={{
                    width: compact ? '28px' : '32px',
                    height: compact ? '28px' : '32px',
                    borderRadius: '50%',
                    background: colors.fill,
                    border: `2px solid ${colors.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: colors.text,
                    flexShrink: 0,
                    boxShadow: step.status === 'current'
                      ? '0 0 0 3px rgba(11,31,58,0.15)'
                      : step.status === 'breach'
                        ? '0 0 0 3px rgba(176,41,41,0.15)'
                        : 'none',
                    transition: 'box-shadow 200ms',
                  }}
                >
                  {step.status === 'complete' ? (
                    <OeIcon name="check" size={compact ? 12 : 14} color="#fff" />
                  ) : step.status === 'breach' ? (
                    <OeIcon name="alert-triangle" size={compact ? 11 : 13} color="#fff" />
                  ) : step.status === 'terminal' ? (
                    <OeIcon name="check-circle" size={compact ? 12 : 14} color="var(--oe-text-3)" />
                  ) : (
                    <span
                      style={{
                        fontSize: compact ? '10px' : '11px',
                        fontWeight: 700,
                        color: colors.text,
                        lineHeight: 1,
                      }}
                    >
                      {i + 1}
                    </span>
                  )}
                </div>

                {/* Label */}
                {!compact && (
                  <div style={{ textAlign: 'center', maxWidth: '80px' }}>
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: step.status === 'current' ? 700 : 500,
                        color: step.status === 'pending' || step.status === 'terminal'
                          ? 'var(--oe-text-3)'
                          : step.status === 'breach'
                            ? 'var(--oe-rose)'
                            : step.status === 'current'
                              ? 'var(--oe-navy-1)'
                              : 'var(--oe-green)',
                        lineHeight: '1.3',
                        textAlign: 'center',
                      }}
                    >
                      {step.label}
                    </div>
                    {step.sublabel && (
                      <div style={{ fontSize: '9px', color: 'var(--oe-text-3)', marginTop: '1px' }}>
                        {step.sublabel}
                      </div>
                    )}
                    {step.timestamp && step.status !== 'pending' && (
                      <div
                        className="oe-mono"
                        style={{ fontSize: '9px', color: 'var(--oe-text-4)', marginTop: '1px' }}
                      >
                        {step.timestamp}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  style={{
                    height: '2px',
                    flex: 1,
                    minWidth: compact ? '20px' : '32px',
                    maxWidth: compact ? '32px' : '60px',
                    marginTop: compact ? '13px' : '15px',
                    background: i < steps.findIndex(s => s.status === 'current' || s.status === 'pending')
                      ? 'var(--oe-green)'
                      : 'var(--oe-border)',
                    transition: 'background 300ms',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default StateFlow;
