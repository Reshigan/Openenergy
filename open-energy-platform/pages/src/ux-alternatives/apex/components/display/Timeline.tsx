import React from 'react';
import { OeIcon, IconName } from '../icons/Icons';
import { StatusPill, PillVariant } from './StatusPill';

export interface TimelineEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail?: string;
  variant?: PillVariant;
  icon?: IconName;
  hash?: string;
}

interface TimelineProps {
  events: TimelineEvent[];
  maxVisible?: number;
  compact?: boolean;
}

export function Timeline({ events, maxVisible, compact = false }: TimelineProps) {
  const [expanded, setExpanded] = React.useState(false);
  const visible = maxVisible && !expanded ? events.slice(0, maxVisible) : events;
  const hasMore = maxVisible && events.length > maxVisible;

  return (
    <div style={{ position: 'relative' }}>
      {visible.map((evt, i) => {
        const isLast = i === visible.length - 1;
        return (
          <div
            key={evt.id}
            style={{ display: 'flex', gap: '12px', position: 'relative' }}
          >
            {/* Line */}
            {!isLast && (
              <div
                style={{
                  position: 'absolute',
                  left: compact ? '11px' : '13px',
                  top: compact ? '22px' : '26px',
                  bottom: '-2px',
                  width: '1px',
                  background: 'var(--oe-border)',
                }}
              />
            )}

            {/* Dot */}
            <div style={{ flexShrink: 0, paddingTop: '2px' }}>
              <div
                style={{
                  width: compact ? '24px' : '28px',
                  height: compact ? '24px' : '28px',
                  borderRadius: '50%',
                  border: '2px solid var(--oe-border)',
                  background: 'var(--oe-canvas)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--oe-text-3)',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {evt.icon ? (
                  <OeIcon name={evt.icon} size={compact ? 11 : 13} />
                ) : (
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--oe-text-3)',
                    }}
                  />
                )}
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, paddingBottom: compact ? '12px' : '16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <span
                    style={{
                      fontSize: compact ? '11px' : '12px',
                      fontWeight: 600,
                      color: 'var(--oe-text-1)',
                    }}
                  >
                    {evt.action}
                  </span>
                  {evt.variant && (
                    <span style={{ marginLeft: '6px' }}>
                      <StatusPill label={evt.action} variant={evt.variant} size="xs" dot={false} />
                    </span>
                  )}
                </div>
                <span
                  className="oe-mono"
                  style={{ fontSize: '10px', color: 'var(--oe-text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {evt.timestamp}
                </span>
              </div>
              <div style={{ fontSize: compact ? '10px' : '11px', color: 'var(--oe-text-2)', marginTop: '2px' }}>
                {evt.actor}
                {evt.detail && <> · {evt.detail}</>}
              </div>
              {evt.hash && (
                <div
                  className="oe-mono"
                  style={{
                    fontSize: '9px',
                    color: 'var(--oe-text-4)',
                    marginTop: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <OeIcon name="lock" size={9} />
                  SHA:{evt.hash}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {hasMore && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--oe-blue)',
            fontSize: '12px',
            fontWeight: 600,
            padding: '4px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontFamily: 'inherit',
            marginLeft: compact ? '36px' : '40px',
          }}
        >
          <OeIcon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} />
          {expanded ? 'Show less' : `Show ${events.length - maxVisible!} more events`}
        </button>
      )}
    </div>
  );
}

export default Timeline;
