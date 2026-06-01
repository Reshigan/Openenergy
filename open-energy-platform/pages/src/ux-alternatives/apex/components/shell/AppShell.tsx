import React, { useState, useCallback } from 'react';
import '../../design-tokens.css';
import { OeIconSprite } from '../icons/Icons';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { AlertBar, AlertBarItem } from './AlertBar';
import { CommandPalette } from './CommandPalette';
import { NotificationPanel } from './NotificationPanel';
import { SelfManagePanel } from './SelfManagePanel';
import { PwaInstallBanner } from './PwaInstallBanner';
import { MobileBottomNav } from './MobileBottomNav';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useNotifCount } from '../../lib/hooks';

export interface AppShellProps {
  role: RoleKey;
  userName: string;
  userEmail: string;
  navConfig: NavConfig;
  alerts?: AlertBarItem[];
  children: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  pageTitle?: string;
  pageActions?: React.ReactNode;
}

export type RoleKey =
  | 'ipp_developer'
  | 'lender'
  | 'trader'
  | 'carbon_fund'
  | 'offtaker'
  | 'regulator'
  | 'grid_operator'
  | 'support'
  | 'admin';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon?: string;
  badge?: number;
  badgeVariant?: 'default' | 'rose' | 'amber';
  onClick?: () => void;
}

export interface NavSection {
  id: string;
  label: string;
  icon?: string;
  items: NavItem[];
  defaultCollapsed?: boolean;
}

export interface NavConfig {
  sections: NavSection[];
  activeId?: string;
}

const shellStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  background: 'var(--oe-grad-body)',
  overflow: 'hidden',
  position: 'relative',
};

const bodyStyles: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
  paddingTop: 'var(--oe-topbar-h)',
};

const mainStyles: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

const contentStyles: React.CSSProperties = {
  flex: 1,
  padding: 'var(--oe-content-py) var(--oe-content-px)',
  maxWidth: '1600px',
  width: '100%',
  margin: '0 auto',
};

export function AppShell({
  role,
  userName,
  userEmail,
  navConfig,
  alerts = [],
  children,
  breadcrumbs = [],
  pageTitle,
  pageActions,
}: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { data: notifCount } = useNotifCount();

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  const hasAlerts = alerts.length > 0;
  const alertBarHeight = hasAlerts ? 'var(--oe-alertbar-h)' : '0px';

  return (
    <div className="oe-apex" style={shellStyles}>
      <OeIconSprite />

      {/* Fixed topbar */}
      <Topbar
        breadcrumbs={breadcrumbs}
        pageTitle={pageTitle}
        pageActions={pageActions}
        onOpenPalette={openPalette}
        sidebarCollapsed={sidebarCollapsed || isMobile}
        onToggleSidebar={() => setSidebarCollapsed(c => !c)}
        notifCount={notifCount ?? 0}
        onOpenNotifications={() => setNotifOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
      />

      {/* Alert bar — only rendered when alerts exist */}
      {hasAlerts && (
        <AlertBar
          items={alerts}
          style={{
            top: 'var(--oe-topbar-h)',
            marginLeft: isMobile ? 0 : (sidebarCollapsed ? '64px' : 'var(--oe-sidebar-w)'),
          }}
        />
      )}

      <div
        style={{
          ...bodyStyles,
          paddingTop: `calc(var(--oe-topbar-h) + ${alertBarHeight})`,
        }}
      >
        {/* Sidebar — hidden on mobile, shown via MobileBottomNav drawer */}
        {!isMobile && (
          <Sidebar
            role={role}
            userName={userName}
            userEmail={userEmail}
            navConfig={navConfig}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(c => !c)}
          />
        )}

        <main
          style={{
            ...mainStyles,
            marginLeft: isMobile ? 0 : (sidebarCollapsed ? '64px' : 'var(--oe-sidebar-w)'),
            paddingBottom: isMobile ? '60px' : 0,
            transition: `margin-left 160ms var(--oe-ease)`,
          }}
        >
          <div style={contentStyles}>
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      {isMobile && (
        <MobileBottomNav navConfig={navConfig} onOpenPalette={openPalette} />
      )}

      {/* PWA install banner */}
      <PwaInstallBanner />

      {paletteOpen && (
        <CommandPalette
          navConfig={navConfig}
          onClose={closePalette}
        />
      )}

      <NotificationPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
      />

      <SelfManagePanel
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </div>
  );
}

export default AppShell;
