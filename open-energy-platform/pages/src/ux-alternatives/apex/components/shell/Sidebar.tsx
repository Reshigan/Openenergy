import React, { useState } from 'react';
import { OeIcon } from '../icons/Icons';
import type { RoleKey, NavConfig, NavSection, NavItem } from './AppShell';

interface SidebarProps {
  role: RoleKey;
  userName: string;
  userEmail: string;
  navConfig: NavConfig;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const ROLE_LABELS: Record<RoleKey, string> = {
  ipp_developer: 'IPP Developer',
  lender: 'Lender',
  trader: 'Trader',
  carbon_fund: 'Carbon Fund',
  offtaker: 'Offtaker',
  regulator: 'Regulator',
  grid_operator: 'Grid Operator',
  support: 'O&M Support',
  admin: 'Admin',
};

const ROLE_COLORS: Record<RoleKey, string> = {
  ipp_developer: '#0b7040',
  lender:        '#1549a0',
  trader:        '#8c5a09',
  carbon_fund:   '#5c2d91',
  offtaker:      '#b02929',
  regulator:     '#0b1f3a',
  grid_operator: '#1549a0',
  support:       '#0b7040',
  admin:         '#0b1f3a',
};

export function Sidebar({ role, userName, userEmail, navConfig, collapsed, onToggleCollapse }: SidebarProps) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(
    Object.fromEntries(navConfig.sections.map(s => [s.id, s.defaultCollapsed ?? false]))
  );

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const totalAlerts = navConfig.sections.reduce((sum, s) =>
    sum + s.items.reduce((isum, i) => isum + (i.badge ?? 0), 0), 0);

  return (
    <aside
      style={{
        position: 'fixed',
        top: 'var(--oe-topbar-h)',
        left: 0,
        bottom: 0,
        width: collapsed ? '64px' : 'var(--oe-sidebar-w)',
        background: 'var(--oe-grad-sidebar)',
        borderRight: '1px solid var(--oe-border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 'var(--oe-z-sidebar)' as any,
        transition: 'width 160ms var(--oe-ease)',
        overflow: 'hidden',
      }}
    >
      {/* Wordmark / Logo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: collapsed ? '14px 0' : '14px 16px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderBottom: '1px solid var(--oe-border-2)',
          minHeight: '52px',
        }}
      >
        <OeLogo size={28} />
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: '14px',
                letterSpacing: '-0.01em',
                background: 'var(--oe-grad-title)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                whiteSpace: 'nowrap',
              }}
            >
              Open Energy
            </div>
            <div style={{ fontSize: '10px', color: 'var(--oe-text-3)', marginTop: '-1px', whiteSpace: 'nowrap' }}>
              {ROLE_LABELS[role]}
            </div>
          </div>
        )}
      </div>

      {/* Nav sections — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        {navConfig.sections.map(section => (
          <NavSectionBlock
            key={section.id}
            section={section}
            collapsed={collapsed}
            sectionCollapsed={collapsedSections[section.id] ?? false}
            activeId={navConfig.activeId}
            onToggleSection={() => toggleSection(section.id)}
          />
        ))}
      </div>

      {/* User footer */}
      <div
        style={{
          borderTop: '1px solid var(--oe-border-2)',
          padding: collapsed ? '10px 0' : '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <div
          style={{
            width: '30px',
            height: '30px',
            borderRadius: 'var(--oe-r-avatar)',
            background: ROLE_COLORS[role],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {userName.slice(0, 2).toUpperCase()}
        </div>
        {!collapsed && (
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--oe-text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userName}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--oe-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userEmail}
            </div>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--oe-text-3)',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
            title="Collapse sidebar"
          >
            <OeIcon name="chevron-left" size={14} />
          </button>
        )}
        {collapsed && (
          <button
            onClick={onToggleCollapse}
            style={{
              position: 'absolute',
              right: '-12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '24px',
              height: '24px',
              background: 'var(--oe-canvas)',
              border: '1px solid var(--oe-border)',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--oe-text-2)',
              boxShadow: 'var(--oe-shadow-card)',
              zIndex: 1,
            }}
            title="Expand sidebar"
          >
            <OeIcon name="chevron-right" size={12} />
          </button>
        )}
      </div>
    </aside>
  );
}

function NavSectionBlock({
  section,
  collapsed,
  sectionCollapsed,
  activeId,
  onToggleSection,
}: {
  section: NavSection;
  collapsed: boolean;
  sectionCollapsed: boolean;
  activeId?: string;
  onToggleSection: () => void;
}) {
  const sectionBadge = section.items.reduce((sum, i) => sum + (i.badge ?? 0), 0);

  if (collapsed) {
    return (
      <div style={{ padding: '2px 0' }}>
        {section.items.map(item => (
          <CollapsedNavItem key={item.id} item={item} active={activeId === item.id} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '4px' }}>
      <button
        onClick={onToggleSection}
        style={{
          width: '100%',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 12px 4px 16px',
          color: 'var(--oe-text-3)',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        <span>{section.label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {sectionBadge > 0 && sectionCollapsed && (
            <span
              style={{
                background: 'var(--oe-rose-bg)',
                color: 'var(--oe-rose)',
                fontSize: '9px',
                fontWeight: 700,
                padding: '0 5px',
                borderRadius: '10px',
                lineHeight: '16px',
              }}
            >
              {sectionBadge}
            </span>
          )}
          <span
            style={{
              transform: sectionCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 150ms var(--oe-ease)',
              display: 'flex',
            }}
          >
            <OeIcon name="chevron-down" size={12} />
          </span>
        </span>
      </button>
      {!sectionCollapsed && (
        <div>
          {section.items.map(item => (
            <SidebarNavItem key={item.id} item={item} active={activeId === item.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarNavItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <a
      href={item.href}
      onClick={item.onClick ? (e) => { e.preventDefault(); item.onClick!(); } : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px 6px 16px',
        borderRadius: '0 8px 8px 0',
        marginRight: '8px',
        textDecoration: 'none',
        fontSize: '13px',
        fontWeight: active ? 600 : 400,
        background: active ? 'var(--oe-grad-active)' : 'transparent',
        color: active ? '#ffffff' : 'var(--oe-text-2)',
        transition: `background ${80}ms var(--oe-ease), color ${80}ms var(--oe-ease)`,
        position: 'relative',
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'var(--oe-surf-2)';
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
      }}
    >
      {item.icon && (
        <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }}>
          <svg width="14" height="14" fill="none">
            <use href={`#oe-ic-${item.icon}`} />
          </svg>
        </span>
      )}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.label}
      </span>
      {item.badge != null && item.badge > 0 && (
        <span
          style={{
            background: item.badgeVariant === 'rose'
              ? 'var(--oe-rose-bg)'
              : item.badgeVariant === 'amber'
                ? 'var(--oe-amber-bg)'
                : active ? 'rgba(255,255,255,0.2)' : 'var(--oe-surf-3)',
            color: item.badgeVariant === 'rose'
              ? 'var(--oe-rose)'
              : item.badgeVariant === 'amber'
                ? 'var(--oe-amber)'
                : active ? '#ffffff' : 'var(--oe-text-2)',
            fontSize: '10px',
            fontWeight: 700,
            padding: '0 5px',
            borderRadius: '10px',
            lineHeight: '16px',
            flexShrink: 0,
          }}
        >
          {item.badge}
        </span>
      )}
    </a>
  );
}

function CollapsedNavItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <a
      href={item.href}
      title={item.label}
      onClick={item.onClick ? (e) => { e.preventDefault(); item.onClick!(); } : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        height: '36px',
        margin: '1px auto',
        borderRadius: '8px',
        textDecoration: 'none',
        background: active ? 'var(--oe-grad-active)' : 'transparent',
        color: active ? '#ffffff' : 'var(--oe-text-3)',
        position: 'relative',
        transition: `background 80ms var(--oe-ease)`,
      }}
    >
      {item.icon ? (
        <svg width="16" height="16" fill="none">
          <use href={`#oe-ic-${item.icon}`} />
        </svg>
      ) : (
        <span style={{ fontSize: '11px', fontWeight: 700 }}>{item.label.slice(0, 2)}</span>
      )}
      {item.badge != null && item.badge > 0 && (
        <span
          style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
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
            lineHeight: 1,
          }}
        >
          {item.badge > 9 ? '9+' : item.badge}
        </span>
      )}
    </a>
  );
}

function OeLogo({ size = 32 }: { size?: number }) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.29;
  const sw = s * 0.07;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx={cx - s * 0.09} cy={cy - s * 0.04} r={r}
        stroke="#3b82c4" strokeWidth={sw} strokeDasharray={`${r * 2.7} ${r * 1.3}`} strokeDashoffset={`${-r * 0.32}`} />
      <circle cx={cx + s * 0.09} cy={cy - s * 0.04} r={r}
        stroke="#1f9b95" strokeWidth={sw} strokeDasharray={`${r * 2.7} ${r * 1.3}`} strokeDashoffset={`${-r * 0.32}`} />
      <circle cx={cx} cy={cy + s * 0.18} r={r}
        stroke="#1a3a5c" strokeWidth={sw} strokeDasharray={`${r * 2.7} ${r * 1.3}`} strokeDashoffset={`${-r * 0.32}`} />
      <circle cx={cx} cy={cy - s * 0.05} r={s * 0.07} fill="#1a3a5c" />
      <circle cx={cx} cy={cy - s * 0.05} r={s * 0.035} fill="#5fa8e8" />
    </svg>
  );
}

export default Sidebar;
