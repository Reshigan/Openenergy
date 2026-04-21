import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthContext, api } from '../context/AuthContext';
import { AuthContext as AuthContextType } from '../lib/api';
import {
  IonExLogo,
  LaunchpadIcon,
  CockpitIcon,
  ContractsIcon,
  CarbonIcon,
  TradeIcon,
  ProcurementIcon,
  GridIcon,
  ESGIcon,
  FundsIcon,
  MarketplaceIcon,
  AdminIcon,
  PipelineIcon,
  SettlementIcon,
  SupportIcon,
  ToolsIcon,
  SearchIcon,
  BellIcon,
  HelpIcon,
  UserIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '../icons/ionex';

// Icon mapping for sidebar items
const iconMap: Record<string, React.FC<{ size?: number; className?: string }>> = {
  launchpad: LaunchpadIcon,
  cockpit: CockpitIcon,
  contracts: ContractsIcon,
  carbon: CarbonIcon,
  trading: TradeIcon,
  procurement: ProcurementIcon,
  projects: TradeIcon,
  grid: GridIcon,
  esg: ESGIcon,
  funds: FundsIcon,
  marketplace: MarketplaceIcon,
  admin: AdminIcon,
  pipeline: PipelineIcon,
  settlement: SettlementIcon,
  support: SupportIcon,
  tools: ToolsIcon,
};

// Section headers for sidebar
const sectionHeaders = {
  primary: 'Primary',
  markets: 'Markets',
  procurement: 'Procurement',
  compliance: 'Compliance',
  reports: 'Reports',
  credit: 'Credit',
  operations: 'Operations',
  customers: 'Customers',
  knowledge: 'Knowledge',
  monitoring: 'Monitoring',
  system: 'System',
  security: 'Security',
  universal: 'Universal',
};

// Sidebar items by role - IonEx v2 spec
const roleSidebarItems: Record<string, { label: string, path: string, icon: string, section: string }[]> = {
  trader: [
    { label: 'Launchpad', path: '/cockpit', icon: 'launchpad', section: 'primary' },
    { label: 'Order Book', path: '/trading', icon: 'trading', section: 'primary' },
    { label: 'Trade Blotter', path: '/settlement', icon: 'trading', section: 'primary' },
    { label: 'Positions', path: '/cockpit', icon: 'portfolio', section: 'primary' },
    { label: 'Live Prices', path: '/trading', icon: 'marketplace', section: 'markets' },
    { label: 'Market Depth', path: '/trading', icon: 'grid', section: 'markets' },
    { label: 'Calendar', path: '/cockpit', icon: 'support', section: 'markets' },
    { label: 'VaR & Limits', path: '/cockpit', icon: 'funds', section: 'risk' },
    { label: 'Counterparties', path: '/cockpit', icon: 'admin', section: 'risk' },
    { label: 'Tools', path: '/cockpit', icon: 'tools', section: 'universal' },
    { label: 'Support', path: '/cockpit', icon: 'support', section: 'universal' },
  ],
  ipp_developer: [
    { label: 'Launchpad', path: '/cockpit', icon: 'launchpad', section: 'primary' },
    { label: 'Assets', path: '/projects', icon: 'grid', section: 'primary' },
    { label: 'Generation', path: '/cockpit', icon: 'trade', section: 'primary' },
    { label: 'Contracts', path: '/contracts', icon: 'contracts', section: 'primary' },
    { label: 'Settlement', path: '/settlement', icon: 'settlement', section: 'primary' },
    { label: 'Offtaker Marketplace', path: '/marketplace', icon: 'marketplace', section: 'markets' },
    { label: 'Price Discovery', path: '/trading', icon: 'funds', section: 'markets' },
    { label: 'NERSA Licensing', path: '/admin', icon: 'admin', section: 'compliance' },
    { label: 'Tools', path: '/cockpit', icon: 'tools', section: 'universal' },
    { label: 'Support', path: '/cockpit', icon: 'support', section: 'universal' },
  ],
  carbon_fund: [
    { label: 'Launchpad', path: '/cockpit', icon: 'launchpad', section: 'primary' },
    { label: 'Portfolio', path: '/cockpit', icon: 'funds', section: 'primary' },
    { label: 'Origination', path: '/pipeline', icon: 'pipeline', section: 'primary' },
    { label: 'Retirements', path: '/carbon', icon: 'carbon', section: 'primary' },
    { label: 'Registry', path: '/cockpit', icon: 'admin', section: 'primary' },
    { label: 'Carbon Market', path: '/marketplace', icon: 'marketplace', section: 'markets' },
    { label: 'Corporate Buyers', path: '/cockpit', icon: 'admin', section: 'clients' },
    { label: 'Tools', path: '/cockpit', icon: 'tools', section: 'universal' },
    { label: 'Support', path: '/cockpit', icon: 'support', section: 'universal' },
  ],
  offtaker: [
    { label: 'Launchpad', path: '/cockpit', icon: 'launchpad', section: 'primary' },
    { label: 'Contracts', path: '/contracts', icon: 'contracts', section: 'primary' },
    { label: 'Consumption', path: '/cockpit', icon: 'trade', section: 'primary' },
    { label: 'Invoices', path: '/settlement', icon: 'settlement', section: 'primary' },
    { label: 'IPP Marketplace', path: '/marketplace', icon: 'marketplace', section: 'procurement' },
    { label: 'Request Quote', path: '/cockpit', icon: 'trade', section: 'procurement' },
    { label: 'ESG Reports', path: '/esg', icon: 'esg', section: 'sustainability' },
    { label: 'Tools', path: '/cockpit', icon: 'tools', section: 'universal' },
    { label: 'Support', path: '/cockpit', icon: 'support', section: 'universal' },
  ],
  lender: [
    { label: 'Launchpad', path: '/cockpit', icon: 'launchpad', section: 'primary' },
    { label: 'Portfolio', path: '/funds', icon: 'funds', section: 'primary' },
    { label: 'Pipeline', path: '/pipeline', icon: 'pipeline', section: 'primary' },
    { label: 'Disbursements', path: '/settlement', icon: 'settlement', section: 'primary' },
    { label: 'Collections', path: '/cockpit', icon: 'admin', section: 'primary' },
    { label: 'Covenant Monitor', path: '/cockpit', icon: 'funds', section: 'credit' },
    { label: 'Risk Ratings', path: '/cockpit', icon: 'admin', section: 'credit' },
    { label: 'Tools', path: '/cockpit', icon: 'tools', section: 'universal' },
    { label: 'Support', path: '/cockpit', icon: 'support', section: 'universal' },
  ],
  grid_operator: [
    { label: 'Launchpad', path: '/cockpit', icon: 'launchpad', section: 'primary' },
    { label: 'Grid Monitor', path: '/grid', icon: 'grid', section: 'primary' },
    { label: 'Dispatch', path: '/cockpit', icon: 'trade', section: 'primary' },
    { label: 'Wheeling', path: '/settlement', icon: 'settlement', section: 'primary' },
    { label: 'Constraints', path: '/cockpit', icon: 'admin', section: 'primary' },
    { label: 'Outages', path: '/cockpit', icon: 'support', section: 'operations' },
    { label: 'Reserves', path: '/cockpit', icon: 'funds', section: 'operations' },
    { label: 'Tools', path: '/cockpit', icon: 'tools', section: 'universal' },
    { label: 'Support', path: '/cockpit', icon: 'support', section: 'universal' },
  ],
  regulator: [
    { label: 'Launchpad', path: '/cockpit', icon: 'launchpad', section: 'primary' },
    { label: 'Licensed Entities', path: '/admin', icon: 'admin', section: 'primary' },
    { label: 'Market Oversight', path: '/cockpit', icon: 'marketplace', section: 'primary' },
    { label: 'Investigations', path: '/cockpit', icon: 'admin', section: 'primary' },
    { label: 'Submissions Queue', path: '/cockpit', icon: 'contracts', section: 'compliance' },
    { label: 'Audit Trail', path: '/cockpit', icon: 'admin', section: 'compliance' },
    { label: 'Tools', path: '/cockpit', icon: 'tools', section: 'universal' },
    { label: 'Support', path: '/cockpit', icon: 'support', section: 'universal' },
  ],
  admin: [
    { label: 'Launchpad', path: '/cockpit', icon: 'launchpad', section: 'primary' },
    { label: 'Tenants', path: '/admin', icon: 'admin', section: 'primary' },
    { label: 'Users', path: '/cockpit', icon: 'support', section: 'primary' },
    { label: 'Billing', path: '/settlement', icon: 'settlement', section: 'primary' },
    { label: 'Health & Uptime', path: '/cockpit', icon: 'grid', section: 'system' },
    { label: 'API Monitoring', path: '/cockpit', icon: 'admin', section: 'system' },
    { label: 'Access Logs', path: '/cockpit', icon: 'admin', section: 'security' },
    { label: 'Tools', path: '/cockpit', icon: 'tools', section: 'universal' },
    { label: 'Support', path: '/cockpit', icon: 'support', section: 'universal' },
  ],
  support: [
    { label: 'Launchpad', path: '/cockpit', icon: 'launchpad', section: 'primary' },
    { label: 'Ticket Queue', path: '/cockpit', icon: 'support', section: 'primary' },
    { label: 'My Queue', path: '/cockpit', icon: 'support', section: 'primary' },
    { label: 'Escalations', path: '/cockpit', icon: 'admin', section: 'primary' },
    { label: 'User Search', path: '/cockpit', icon: 'search', section: 'customers' },
    { label: 'Tenant View', path: '/admin', icon: 'admin', section: 'customers' },
    { label: 'Knowledge Base', path: '/cockpit', icon: 'contracts', section: 'knowledge' },
    { label: 'Runbooks', path: '/cockpit', icon: 'contracts', section: 'knowledge' },
    { label: 'System Status', path: '/cockpit', icon: 'grid', section: 'monitoring' },
    { label: 'Incident Tracker', path: '/cockpit', icon: 'admin', section: 'monitoring' },
    { label: 'Tools', path: '/cockpit', icon: 'tools', section: 'universal' },
  ],
};

// Get sidebar sections for a role
function getSidebarSections(items: typeof roleSidebarItems[keyof typeof roleSidebarItems]) {
  const sections = new Map<string, typeof items>();
  for (const item of items) {
    const section = item.section || 'other';
    if (!sections.has(section)) {
      sections.set(section, []);
    }
    sections.get(section)!.push(item);
  }
  return sections;
}

// Sidebar section component
function SidebarSection({ title, items, isActive, onItemClick }: {
  title: string;
  items: typeof roleSidebarItems[keyof typeof roleSidebarItems];
  isActive: (path: string) => boolean;
  onItemClick: () => void;
}) {
  return (
    <div className="mb-4">
      {title !== 'universal' && title !== 'other' && (
        <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-ionex-text-mute font-medium">
          {sectionHeaders[title as keyof typeof sectionHeaders] || title}
        </div>
      )}
      {items.map((item) => {
        const IconComponent = iconMap[item.icon];
        const active = isActive(item.path);
        
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onItemClick}
            className={`
              flex items-center gap-3 px-4 py-2.5 rounded-lg mx-2 my-0.5
              text-[14px] transition-all duration-150
              ${active 
                ? 'bg-ionex-brand/8 text-ionex-brand font-medium border-l-[3px] border-ionex-accent' 
                : 'text-ionex-text-sub hover:bg-ionex-surface-alt hover:text-ionex-text'
              }
            `}
          >
            {IconComponent && <IconComponent size={16} className="shrink-0" />}
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

// Main Layout Component with Shell Bar + Sidebar
export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  
  // Default to trader role for demo
  const role = 'trader';
  const sidebarItems = roleSidebarItems[role] || roleSidebarItems.admin;
  const sections = getSidebarSections(sidebarItems);
  
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  
  return (
    <div className="min-h-screen bg-ionex-canvas">
      {/* Shell Bar - 48px top navigation */}
      <header className="fixed top-0 left-0 right-0 h-[48px] bg-ionex-shell z-50 flex items-center px-4 shadow-[0_1px_0_rgba(255,255,255,0.1)]">
        {/* Logo */}
        <div className="flex items-center gap-2 w-[240px]">
          <IonExLogo size={28} />
          <span className="text-white font-semibold text-lg tracking-tight">IonEx</span>
        </div>
        
        {/* Search */}
        <div className="flex-1 max-w-xl mx-4">
          <div className="relative">
            <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60" />
            <input
              type="text"
              placeholder="Search... ⌘K"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-10 pr-4 bg-white/10 text-white placeholder-white/40 text-sm rounded-lg border border-white/10 focus:border-white/20 focus:bg-white/15 outline-none transition-colors"
            />
          </div>
        </div>
        
        {/* Right side actions */}
        <div className="flex items-center gap-2">
          <button className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <BellIcon size={18} />
          </button>
          <button className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <HelpIcon size={18} />
          </button>
          <button className="p-1.5 bg-ionex-accent rounded-lg hover:bg-ionex-accent-deep transition-colors">
            <UserIcon size={20} primary="#062640" />
          </button>
        </div>
      </header>
      
      {/* Sidebar - 240px left navigation */}
      <aside className={`
        fixed left-0 top-[48px] bottom-0 bg-ionex-surface border-r border-ionex-border
        flex flex-col overflow-hidden transition-all duration-250
        ${sidebarCollapsed ? 'w-[56px]' : 'w-[240px]'}
      `}>
        {/* Toggle button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute top-3 -right-3 w-6 h-6 bg-ionex-surface border border-ionex-border rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow z-10"
        >
          <ChevronRightIcon 
            size={14} 
            className={`transition-transform ${sidebarCollapsed ? '' : 'rotate-180'}`} 
          />
        </button>
        
        {/* Navigation sections */}
        <nav className="flex-1 overflow-y-auto py-4">
          {Array.from(sections.entries()).map(([sectionKey, items]) => (
            <SidebarSection
              key={sectionKey}
              title={sectionKey}
              items={items}
              isActive={isActive}
              onItemClick={() => {}}
            />
          ))}
        </nav>
        
        {/* Bottom pills - Tools + Support */}
        <div className="p-2 border-t border-ionex-border">
          <div className="flex gap-2">
            <button 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`
                flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[13px]
                bg-ionex-surface-alt text-ionex-text-sub border border-ionex-border
                hover:bg-ionex-border/30 transition-colors
              `}
            >
              <ToolsIcon size={16} />
              {!sidebarCollapsed && <span>Tools</span>}
            </button>
            <button className={`
              flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[13px]
              bg-ionex-surface-alt text-ionex-text-sub border border-ionex-border
              hover:bg-ionex-border/30 transition-colors
            `}>
              <SupportIcon size={16} />
              {!sidebarCollapsed && <span>Support</span>}
            </button>
          </div>
        </div>
      </aside>
      
      {/* Content area */}
      <main className={`
        pt-[48px] min-h-screen transition-all duration-250
        ${sidebarCollapsed ? 'ml-[56px]' : 'ml-[240px]'}
      `}>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
