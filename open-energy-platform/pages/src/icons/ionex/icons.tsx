import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  primary?: string;
  accent?: string;
  mono?: boolean;
}

// Navigation icons with the IonEx two-stroke system
export const LaunchpadIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)',
  mono = false
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <rect x="2" y="2" width="7" height="7" rx="1" stroke={primary} strokeWidth="1.5" fill="none"/>
    <rect x="11" y="2" width="7" height="7" rx="1" stroke={primary} strokeWidth="1.5" fill="none"/>
    <rect x="2" y="11" width="7" height="7" rx="1" stroke={primary} strokeWidth="1.5" fill="none"/>
    {!mono && <rect x="11" y="11" width="7" height="7" rx="1" stroke={accent} strokeWidth="1.5" fill="none"/>}
  </svg>
);

export const TradeIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)',
  mono = false
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M3 10L10 3L17 10" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M17 10V15C17 15.5523 16.5523 16 16 16H4C3.44772 16 3 15.5523 3 15V10" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    {!mono && <path d="M13 7V10M10 7V10M7 7V10" stroke={accent} strokeWidth="1" strokeLinecap="round"/>}
  </svg>
);

export const PortfolioIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)',
  mono = false
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <circle cx="10" cy="10" r="7" stroke={primary} strokeWidth="1.5" fill="none"/>
    <path d="M10 5V10L13 13" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    {!mono && <circle cx="10" cy="10" r="2" fill={accent}/>}
  </svg>
);

export const OrdersIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)',
  mono = false
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M4 5H16M4 10H16M4 15H10" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
    {!mono && <circle cx="15" cy="12" r="3" stroke={accent} strokeWidth="1" fill="none"/>}
  </svg>
);

export const GridIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)',
  mono = false
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <rect x="2" y="2" width="7" height="7" stroke={primary} strokeWidth="1.5" fill="none"/>
    <rect x="11" y="2" width="7" height="7" stroke={primary} strokeWidth="1.5" fill="none"/>
    <rect x="2" y="11" width="7" height="7" stroke={primary} strokeWidth="1.5" fill="none"/>
    {!mono && <rect x="11" y="11" width="7" height="7" stroke={accent} strokeWidth="1.5" fill="none"/>}
    <path d="M9 5.5V11H11V5.5H9ZM5.5 9H11V11H5.5V9Z" fill={accent}/>
  </svg>
);

export const SupportIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)',
  mono = false
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <circle cx="10" cy="10" r="7" stroke={primary} strokeWidth="1.5" fill="none"/>
    <path d="M7 8C7 7.44772 7.44772 7 8 7H12C12.5523 7 13 7.44772 13 8V10.5C13 11.5 12.5 12.5 11.5 13L10 14" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="10" cy="16" r="1" fill={primary}/>
    {!mono && <path d="M8 8V6M12 8V6" stroke={accent} strokeWidth="1" strokeLinecap="round"/>}
  </svg>
);

export const ToolsIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)',
  mono = false
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M15 10C15 11.6569 13.6569 13 12 13C10.3431 13 9 11.6569 9 10C9 8.34315 10.3431 7 12 7" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M12 7V4M12 7L9 7M12 7L15 7" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M7 12C7 13.6569 5.65685 15 4 15C2.34315 15 1 13.6569 1 12C1 10.3431 2.34315 9 4 9" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M4 9V6M4 9L7 9M4 9L1 9" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
    {!mono && <circle cx="12" cy="10" r="1" fill={accent}/>}
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <circle cx="8.5" cy="8.5" r="5.5" stroke={primary} strokeWidth="1.5"/>
    <path d="M13 13L17 17" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const BellIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M10 2C7.79086 2 6 3.79086 6 6V10.586L4.707 11.879C4.077 12.509 4.523 13.5 5.414 13.5H14.586C15.477 13.5 15.923 12.509 15.293 11.879L14 10.586V6C14 3.79086 12.209 2 10 2Z" stroke={primary} strokeWidth="1.5"/>
    <path d="M8 13.5V14C8 15.1046 8.89543 16 10 16C11.1046 16 12 15.1046 12 14V13.5" stroke={primary} strokeWidth="1.5"/>
  </svg>
);

export const HelpIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <circle cx="10" cy="10" r="7" stroke={primary} strokeWidth="1.5"/>
    <path d="M7.5 7.5C7.5 6.67157 8.17157 6 9 6C9.82843 6 10.5 6.67157 10.5 7.5C10.5 8.32843 9.82843 9 9 9C8.5 9 8 9.5 8 10.5" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="9" cy="13" r="0.75" fill={primary}/>
  </svg>
);

export const UserIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <circle cx="10" cy="6" r="4" stroke={primary} strokeWidth="1.5"/>
    <path d="M3 17C3 13.6863 6.13401 11 10 11C13.866 11 17 13.6863 17 17" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const ChevronDownIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M6 8L10 12L14 8" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const ChevronRightIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M8 6L12 10L8 14" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const PlusIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M10 4V16M4 10H16" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
    {!accent && <circle cx="10" cy="10" r="4" stroke={accent} strokeWidth="1" fill="none" opacity="0.3"/>}
  </svg>
);

export const TrendUpIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-success)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M3 14L8 9L11 12L17 6" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 6H17V9" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const TrendDownIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-error)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M3 6L8 11L11 8L17 14" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 14H17V11" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const ContractsIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)',
  mono = false
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M6 3H14C14.5523 3 15 3.44772 15 4V16C15 16.5523 14.5523 17 14 17H6C5.44772 17 5 16.5523 5 16V4C5 3.44772 5.44772 3 6 3Z" stroke={primary} strokeWidth="1.5"/>
    <path d="M8 7H12M8 10H12M8 13H10" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
    {!mono && <rect x="12" y="12" width="3" height="3" fill={accent}/>}
  </svg>
);

export const CarbonIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <circle cx="10" cy="10" r="7" stroke={primary} strokeWidth="1.5"/>
    <path d="M10 5V10L13 13" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6 7C7 6 8 6 8 6M12 13C13 14 14 14 14 14" stroke={accent} strokeWidth="1" strokeLinecap="round"/>
  </svg>
);

export const MarketplaceIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M3 5H17M3 5V4C3 3.44772 3.44772 3 4 3H16C16.5523 3 17 3.44772 17 4V5M3 5V15C3 15.5523 3.44772 16 4 16H16C16.5523 16 17 15.5523 17 15V5" stroke={primary} strokeWidth="1.5"/>
    <circle cx="7" cy="10" r="2" stroke={primary} strokeWidth="1.5"/>
    <circle cx="13" cy="10" r="2" stroke={primary} strokeWidth="1.5"/>
  </svg>
);

export const AdminIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M10 2L13 6H17L14 10L15 14L10 12L5 14L6 10L3 6H7L10 2Z" stroke={primary} strokeWidth="1.5" strokeLinejoin="round"/>
    {!accent && <circle cx="10" cy="8" r="2" fill={accent}/>}
  </svg>
);

export const FundsIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M10 2V4M10 16V18M18 10H16M4 10H2" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="10" cy="10" r="6" stroke={primary} strokeWidth="1.5"/>
    <path d="M10 7V13M7.5 8.5C8 7 10 6 10 6M12.5 11.5C12 13 10 14 10 14" stroke={accent} strokeWidth="1" strokeLinecap="round"/>
  </svg>
);

export const ESGIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M4 16L7 12L10 14L14 8L17 10" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 16L7 12L10 14L14 8L17 10" stroke={accent} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" transform="translate(0, 2)"/>
  </svg>
);

export const PipelineIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <circle cx="4" cy="10" r="2" stroke={primary} strokeWidth="1.5"/>
    <circle cx="10" cy="10" r="2" stroke={primary} strokeWidth="1.5"/>
    <circle cx="16" cy="10" r="2" stroke={primary} strokeWidth="1.5"/>
    <path d="M6 10H8M12 10H14" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/>
    <path d="M6 10L10 6M12 10L10 14" stroke={accent} strokeWidth="1" strokeLinecap="round"/>
  </svg>
);

export const CockpitIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <circle cx="10" cy="10" r="7" stroke={primary} strokeWidth="1.5"/>
    <path d="M10 5V10L13 13" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6 6L7 7M13 7L14 6M14 13L13 14M7 14L6 13" stroke={accent} strokeWidth="1" strokeLinecap="round"/>
  </svg>
);

export const ProcurementIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <rect x="3" y="6" width="14" height="10" rx="1" stroke={primary} strokeWidth="1.5"/>
    <path d="M6 6V4C6 3.44772 6.44772 3 7 3H13C13.5523 3 14 3.44772 14 4V6" stroke={primary} strokeWidth="1.5"/>
    <path d="M10 9V12M10 12V15M10 12H7M10 12H13" stroke={accent} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const SettlementIcon: React.FC<IconProps> = ({ 
  size = 20, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
    <path d="M4 8H16M4 12H16" stroke={primary} strokeWidth="1.5" strokeLinecap="round"/>
    <rect x="3" y="4" width="14" height="12" rx="1" stroke={primary} strokeWidth="1.5"/>
    {!accent && <path d="M7 10L9 12L13 8" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>}
  </svg>
);

export default {
  LaunchpadIcon,
  TradeIcon,
  PortfolioIcon,
  OrdersIcon,
  GridIcon,
  SupportIcon,
  ToolsIcon,
  SearchIcon,
  BellIcon,
  HelpIcon,
  UserIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  TrendUpIcon,
  TrendDownIcon,
  ContractsIcon,
  CarbonIcon,
  MarketplaceIcon,
  AdminIcon,
  FundsIcon,
  ESGIcon,
  PipelineIcon,
  CockpitIcon,
  ProcurementIcon,
  SettlementIcon,
};
