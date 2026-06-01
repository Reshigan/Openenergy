import React, { useState } from 'react';
import { OeIcon } from '../icons/Icons';
import { StatusPill, stateVariant } from './StatusPill';

export interface ChainLink {
  id: string;
  label: string;
  state: string;
  role: string;
  relationship: 'parent' | 'child' | 'cross-role' | 'peer';
  href?: string;
  /** Chain type e.g. "GCA", "Credit Facility", "Stage Gate" */
  chainType?: string;
}

interface ChainMapProps {
  chainLabel: string;
  chainType?: string;
  currentState: string;
  links: ChainLink[];
}

interface DrawerProps {
  link: ChainLink;
  onClose: () => void;
}

const REL_LABELS: Record<ChainLink['relationship'], { label: string; color: string }> = {
  parent:     { label: 'Parent chain',   color: 'var(--oe-navy-1)' },
  child:      { label: 'Child chain',    color: 'var(--oe-green)' },
  'cross-role': { label: 'Cross-role',  color: 'var(--oe-blue)' },
  peer:       { label: 'Related',        color: 'var(--oe-text-3)' },
};

export function ChainMap({ chainLabel, chainType, currentState, links }: ChainMapProps) {
  const [activeLink, setActiveLink] = useState<ChainLink | null>(null);

  return (
    <>
      <div
        style={{
          background: 'var(--oe-canvas)',
          border: '1px solid var(--oe-border)',
          borderRadius: 'var(--oe-r-card)',
          overflow: 'hidden',
          boxShadow: 'var(--oe-shadow-card)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--oe-border-2)',
            background: 'var(--oe-surf)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <OeIcon name="chain" size={14} color="var(--oe-navy-1)" />
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--oe-text-1)' }}>
              {chainLabel}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--oe-text-3)', marginTop: '1px' }}>
              {chainType} · {currentState}
            </div>
          </div>
        </div>

        {/* Current state pill */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--oe-border-2)' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
            Current State
          </div>
          <StatusPill label={currentState} variant={stateVariant(currentState)} size="md" />
        </div>

        {/* Linked chains */}
        {links.length > 0 && (
          <div style={{ padding: '10px 14px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Connected Chains
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {links.map(link => {
                const relStyle = REL_LABELS[link.relationship];
                return (
                  <button
                    key={link.id}
                    onClick={() => setActiveLink(link)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 8px',
                      borderRadius: '7px',
                      border: '1px solid var(--oe-border-2)',
                      background: 'var(--oe-surf)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 80ms, border-color 80ms',
                      fontFamily: 'inherit',
                      width: '100%',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--oe-surf-2)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--oe-border)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--oe-surf)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--oe-border-2)';
                    }}
                  >
                    {/* Relationship indicator */}
                    <div
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: relStyle.color,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--oe-text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {link.label}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--oe-text-3)', display: 'flex', gap: '6px', marginTop: '1px', alignItems: 'center' }}>
                        <span style={{ color: relStyle.color, fontWeight: 600 }}>{relStyle.label}</span>
                        <span>·</span>
                        <span>{link.role}</span>
                      </div>
                    </div>
                    <StatusPill label={link.state} variant={stateVariant(link.state)} size="xs" />
                    <OeIcon name="chevron-right" size={11} color="var(--oe-text-3)" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {links.length === 0 && (
          <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--oe-text-3)', fontSize: '12px' }}>
            No connected chains
          </div>
        )}
      </div>

      {/* Side drawer for linked chain detail */}
      {activeLink && (
        <ChainDrawer link={activeLink} onClose={() => setActiveLink(null)} />
      )}
    </>
  );
}

function ChainDrawer({ link, onClose }: DrawerProps) {
  const relStyle = REL_LABELS[link.relationship];

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          zIndex: 'calc(var(--oe-z-drawer) - 1)' as any,
          background: 'rgba(7,24,46,0.2)',
        }}
      />
      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 'var(--oe-topbar-h)',
          bottom: 0,
          width: 'min(400px, 100vw)',
          background: 'var(--oe-canvas)',
          borderLeft: '1px solid var(--oe-border)',
          boxShadow: 'var(--oe-shadow-drawer)',
          zIndex: 'var(--oe-z-drawer)' as any,
          display: 'flex',
          flexDirection: 'column',
          animation: 'oe-drawerIn 160ms var(--oe-ease)',
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--oe-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--oe-text-2)', padding: '4px', borderRadius: '6px' }}
          >
            <OeIcon name="close" size={16} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--oe-text-1)' }}>{link.label}</div>
            <div style={{ fontSize: '11px', color: relStyle.color, fontWeight: 600 }}>{relStyle.label} · {link.role}</div>
          </div>
          {link.href && (
            <a
              href={link.href}
              style={{
                border: '1px solid var(--oe-border)',
                background: 'var(--oe-surf)',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '12px',
                color: 'var(--oe-text-1)',
                textDecoration: 'none',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              Open
              <OeIcon name="expand" size={12} />
            </a>
          )}
        </div>

        {/* Drawer body */}
        <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              State
            </div>
            <StatusPill label={link.state} variant={stateVariant(link.state)} size="md" />
          </div>

          {link.chainType && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                Chain Type
              </div>
              <div style={{ fontSize: '13px', color: 'var(--oe-text-1)' }}>{link.chainType}</div>
            </div>
          )}

          <div
            style={{
              padding: '12px',
              background: 'var(--oe-surf)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--oe-text-2)',
              lineHeight: '1.5',
            }}
          >
            Navigate to this chain to see the full state machine, history, and available actions.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes oe-drawerIn {
          from { transform: translateX(100%); opacity: 0.5; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

export default ChainMap;
