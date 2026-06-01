import React from 'react';
import { OeIcon } from '../icons/Icons';
import type { NavConfig } from './AppShell';

interface MobileBottomNavProps {
  navConfig: NavConfig;
  onOpenPalette: () => void;
}

/**
 * Mobile bottom navigation — shown only on screens < 768px.
 * Shows up to 4 primary nav items + a "More" button that opens a
 * full-screen drawer with the complete nav tree.
 */
export function MobileBottomNav({ navConfig, onOpenPalette }: MobileBottomNavProps) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Take the first 4 non-settings items as primary tabs
  const primaryItems = navConfig.sections
    .flatMap(s => s.items)
    .filter(i => i.icon)
    .slice(0, 4);

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '60px',
          background: 'var(--oe-canvas)',
          borderTop: '1px solid var(--oe-border)',
          display: 'flex',
          alignItems: 'stretch',
          zIndex: 'var(--oe-z-sidebar)' as any,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {primaryItems.map(item => (
          <a
            key={item.id}
            href={item.href}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              textDecoration: 'none',
              color: navConfig.activeId === item.id ? 'var(--oe-navy-1)' : 'var(--oe-text-3)',
              fontSize: '10px',
              fontWeight: navConfig.activeId === item.id ? 700 : 400,
              position: 'relative',
            }}
          >
            {navConfig.activeId === item.id && (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '20%',
                  right: '20%',
                  height: '2px',
                  background: 'var(--oe-grad-active)',
                  borderRadius: '0 0 2px 2px',
                }}
              />
            )}
            {item.icon && <OeIcon name={item.icon as any} size={20} />}
            <span>{item.label}</span>
            {item.badge != null && item.badge > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '6px',
                  left: '50%',
                  transform: 'translateX(4px)',
                  background: 'var(--oe-rose)',
                  color: '#fff',
                  fontSize: '8px',
                  fontWeight: 700,
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </a>
        ))}

        {/* Search / More */}
        <button
          onClick={() => setDrawerOpen(true)}
          style={{
            flex: 1,
            border: 'none',
            background: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            color: 'var(--oe-text-3)',
            fontSize: '10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <OeIcon name="grid-apps" size={20} />
          <span>More</span>
        </button>
      </nav>

      {/* Full-screen nav drawer */}
      {drawerOpen && (
        <MobileNavDrawer
          navConfig={navConfig}
          onClose={() => setDrawerOpen(false)}
          onOpenPalette={() => { setDrawerOpen(false); onOpenPalette(); }}
        />
      )}
    </>
  );
}

function MobileNavDrawer({
  navConfig,
  onClose,
  onOpenPalette,
}: {
  navConfig: NavConfig;
  onClose: () => void;
  onOpenPalette: () => void;
}) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(7,24,46,0.4)',
          zIndex: 'calc(var(--oe-z-sidebar) + 1)' as any,
          backdropFilter: 'blur(4px)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          height: '85vh',
          background: 'var(--oe-canvas)',
          borderRadius: '18px 18px 0 0',
          zIndex: 'calc(var(--oe-z-sidebar) + 2)' as any,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'oe-drawerUp 200ms cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'var(--oe-border)' }} />
        </div>

        {/* Search */}
        <div style={{ padding: '0 16px 12px' }}>
          <button
            onClick={onOpenPalette}
            style={{
              width: '100%',
              border: '1px solid var(--oe-border)',
              background: 'var(--oe-surf)',
              borderRadius: '10px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: 'var(--oe-text-3)',
              fontSize: '14px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            <OeIcon name="search" size={16} />
            Search pages…
          </button>
        </div>

        {/* Nav list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          {navConfig.sections.map(section => (
            <div key={section.id} style={{ marginBottom: '20px' }}>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--oe-text-3)',
                  marginBottom: '6px',
                  padding: '0 4px',
                }}
              >
                {section.label}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {section.items.map(item => (
                  <a
                    key={item.id}
                    href={item.href}
                    onClick={onClose}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: navConfig.activeId === item.id ? 'var(--oe-surf-2)' : 'var(--oe-surf)',
                      border: navConfig.activeId === item.id ? '1px solid var(--oe-border)' : '1px solid transparent',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: navConfig.activeId === item.id ? 600 : 400,
                      color: navConfig.activeId === item.id ? 'var(--oe-navy-1)' : 'var(--oe-text-1)',
                    }}
                  >
                    {item.icon && <OeIcon name={item.icon as any} size={16} />}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                    {item.badge != null && item.badge > 0 && (
                      <span style={{ background: 'var(--oe-rose)', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '8px' }}>
                        {item.badge}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes oe-drawerUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

export default MobileBottomNav;
