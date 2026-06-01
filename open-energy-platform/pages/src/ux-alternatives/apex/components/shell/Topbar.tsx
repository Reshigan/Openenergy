import React from 'react';
import { OeIcon } from '../icons/Icons';
import type { BreadcrumbItem } from './AppShell';

interface TopbarProps {
  breadcrumbs: BreadcrumbItem[];
  pageTitle?: string;
  pageActions?: React.ReactNode;
  onOpenPalette: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function Topbar({
  breadcrumbs,
  pageTitle,
  pageActions,
  onOpenPalette,
  sidebarCollapsed,
  onToggleSidebar,
}: TopbarProps) {
  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 'var(--oe-topbar-h)',
        background: 'var(--oe-grad-topbar)',
        borderBottom: '1px solid var(--oe-border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px 0 0',
        gap: '8px',
        zIndex: 'var(--oe-z-topbar)' as any,
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Sidebar toggle — width matches sidebar */}
      <div
        style={{
          width: sidebarCollapsed ? '64px' : 'var(--oe-sidebar-w)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: '12px',
          transition: 'width 160ms var(--oe-ease)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onToggleSidebar}
          style={iconBtnStyle}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <OeIcon name="grid-apps" size={16} />
        </button>
      </div>

      {/* Breadcrumbs */}
      <nav
        aria-label="Breadcrumb"
        style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, overflow: 'hidden' }}
      >
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <OeIcon name="chevron-right" size={12} color="var(--oe-text-4)" />
            )}
            {crumb.href && i < breadcrumbs.length - 1 ? (
              <a
                href={crumb.href}
                style={{
                  fontSize: '13px',
                  color: 'var(--oe-text-3)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  transition: 'color 80ms',
                }}
              >
                {crumb.label}
              </a>
            ) : (
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
                  color: i === breadcrumbs.length - 1 ? 'var(--oe-text-1)' : 'var(--oe-text-3)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {crumb.label}
              </span>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Right-side actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {pageActions}

        {/* Command palette trigger */}
        <button
          onClick={onOpenPalette}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            border: '1px solid var(--oe-border)',
            borderRadius: '6px',
            background: 'var(--oe-surf)',
            color: 'var(--oe-text-3)',
            fontSize: '12px',
            padding: '4px 10px',
            cursor: 'pointer',
            transition: 'border-color 80ms, background 80ms',
          }}
          title="Command palette (⌘K)"
        >
          <OeIcon name="search" size={13} />
          <span style={{ display: 'none' /* shown on wider screens */ }}>Search</span>
          <kbd
            style={{
              background: 'var(--oe-surf-2)',
              border: '1px solid var(--oe-border)',
              borderRadius: '4px',
              padding: '0 4px',
              fontSize: '10px',
              color: 'var(--oe-text-4)',
              fontFamily: 'inherit',
            }}
          >
            ⌘K
          </kbd>
        </button>

        <button style={iconBtnStyle} title="Notifications">
          <OeIcon name="bell" size={16} />
        </button>

        <button style={iconBtnStyle} title="Settings">
          <OeIcon name="gear" size={16} />
        </button>
      </div>
    </header>
  );
}

const iconBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  color: 'var(--oe-text-2)',
  padding: '6px',
  borderRadius: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 80ms var(--oe-ease), color 80ms var(--oe-ease)',
};

export default Topbar;
