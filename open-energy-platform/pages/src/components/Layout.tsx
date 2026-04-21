import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthContext, api } from '../context/AuthContext';
import { AuthContext as AuthContextType } from '../lib/api';

// Sidebar items by role
const roleSidebarItems: Record<string, { label: string, path: string, icon: string }[]> = {
  admin: [
    { label: 'Cockpit', path: '/cockpit', icon: '📊' },
    { label: 'Contracts', path: '/contracts', icon: '📄' },
    { label: 'Projects', path: '/projects', icon: '⚡' },
    { label: 'Trading', path: '/trading', icon: '📈' },
    { label: 'Carbon', path: '/carbon', icon: '🌿' },
    { label: 'Settlement', path: '/settlement', icon: '💰' },
    { label: 'Admin', path: '/admin', icon: '⚙️' },
    { label: 'Settings', path: '/settings', icon: '🔧' },
  ],
  trader: [
    { label: 'Cockpit', path: '/cockpit', icon: '📊' },
    { label: 'Trading', path: '/trading', icon: '📈' },
    { label: 'Settlement', path: '/settlement', icon: '💰' },
    { label: 'Contracts', path: '/contracts', icon: '📄' },
    { label: 'Marketplace', path: '/marketplace', icon: '🛒' },
    { label: 'Grid', path: '/grid', icon: '🔌' },
    { label: 'Notifications', path: '/notifications', icon: '🔔' },
    { label: 'Settings', path: '/settings', icon: '⚙️' },
  ],
  ipp_developer: [
    { label: 'Cockpit', path: '/cockpit', icon: '📊' },
    { label: 'Projects', path: '/projects', icon: '⚡' },
    { label: 'Contracts', path: '/contracts', icon: '📄' },
    { label: 'Settlement', path: '/settlement', icon: '💰' },
    { label: 'Grid', path: '/grid', icon: '🔌' },
    { label: 'ESG', path: '/esg', icon: '🌱' },
    { label: 'Notifications', path: '/notifications', icon: '🔔' },
    { label: 'Settings', path: '/settings', icon: '⚙️' },
  ],
  carbon_fund: [
    { label: 'Cockpit', path: '/cockpit', icon: '📊' },
    { label: 'Carbon', path: '/carbon', icon: '🌿' },
    { label: 'Projects', path: '/projects', icon: '⚡' },
    { label: 'Trading', path: '/trading', icon: '📈' },
    { label: 'Funds', path: '/funds', icon: '💎' },
    { label: 'Pipeline', path: '/pipeline', icon: '🔄' },
    { label: 'Notifications', path: '/notifications', icon: '🔔' },
    { label: 'Settings', path: '/settings', icon: '⚙️' },
  ],
  offtaker: [
    { label: 'Cockpit', path: '/cockpit', icon: '📊' },
    { label: 'Contracts', path: '/contracts', icon: '📄' },
    { label: 'Settlement', path: '/settlement', icon: '💰' },
    { label: 'Procurement', path: '/procurement', icon: '📋' },
    { label: 'Grid', path: '/grid', icon: '🔌' },
    { label: 'ESG', path: '/esg', icon: '🌱' },
    { label: 'Notifications', path: '/notifications', icon: '🔔' },
    { label: 'Settings', path: '/settings', icon: '⚙️' },
  ],
  lender: [
    { label: 'Cockpit', path: '/cockpit', icon: '📊' },
    { label: 'Projects', path: '/projects', icon: '⚡' },
    { label: 'Funds', path: '/funds', icon: '💎' },
    { label: 'Pipeline', path: '/pipeline', icon: '🔄' },
    { label: 'Settlement', path: '/settlement', icon: '💰' },
    { label: 'Grid', path: '/grid', icon: '🔌' },
    { label: 'Notifications', path: '/notifications', icon: '🔔' },
    { label: 'Settings', path: '/settings', icon: '⚙️' },
  ],
  grid_operator: [
    { label: 'Cockpit', path: '/cockpit', icon: '📊' },
    { label: 'Grid', path: '/grid', icon: '🔌' },
    { label: 'Settlement', path: '/settlement', icon: '💰' },
    { label: 'Contracts', path: '/contracts', icon: '📄' },
    { label: 'Projects', path: '/projects', icon: '⚡' },
    { label: 'Notifications', path: '/notifications', icon: '🔔' },
    { label: 'Settings', path: '/settings', icon: '⚙️' },
  ],
  regulator: [
    { label: 'Cockpit', path: '/cockpit', icon: '📊' },
    { label: 'Admin', path: '/admin', icon: '⚙️' },
    { label: 'Grid', path: '/grid', icon: '🔌' },
    { label: 'ESG', path: '/esg', icon: '🌱' },
    { label: 'Marketplace', path: '/marketplace', icon: '🛒' },
    { label: 'Notifications', path: '/notifications', icon: '🔔' },
    { label: 'Settings', path: '/settings', icon: '⚙️' },
  ],
};

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
