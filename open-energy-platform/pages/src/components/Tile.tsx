import React from 'react';
import { TrendUpIcon, TrendDownIcon, PlusIcon } from '../../icons/ionex';

// Tile sizes
export type TileSize = 'standard' | 'wide' | 'compact' | 'feature';

// Tile variant based on content
export interface TileConfig {
  title: string;
  value?: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  sparklineData?: number[];
  icon?: React.FC<any>;
  size?: TileSize;
  variant?: 'standard' | 'compact';
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface TileProps {
  config: TileConfig;
  onClick?: () => void;
  className?: string;
}

// Sparkline component for trend visualization
function Sparkline({ data, color = 'var(--ionex-accent)' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const height = 32;
  const width = 80;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sparkline-${color.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Tile component
export function Tile({ config, onClick, className = '' }: TileProps) {
  const { title, value, subtitle, trend, trendValue, sparklineData, icon: IconComponent, size = 'standard', variant = 'standard', action } = config;
  
  const sizeClasses = {
    standard: 'w-[176px] h-[160px]',
    wide: 'w-[368px] h-[160px]',
    compact: 'w-[88px] h-[88px]',
    feature: 'w-[176px] h-[120px]',
  };
  
  const isCompact = variant === 'compact';
  const isWide = size === 'wide';
  
  return (
    <div
      onClick={onClick}
      className={`
        ${sizeClasses[size]}
        bg-ionex-surface rounded-[6px] p-4 flex flex-col justify-between
        border border-ionex-border cursor-pointer
        transition-all duration-150 ease-ionex
        hover:shadow-[0_2px_8px_rgba(10,61,98,0.08)] hover:-translate-y-0.5
        hover:border-ionex-brand
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ionex-accent focus-visible:ring-offset-2
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className={`text-[13px] text-ionex-text-sub font-medium ${isCompact ? '' : 'leading-tight'}`}>
          {title}
        </div>
        {IconComponent && (
          <IconComponent size={16} className="text-ionex-text-mute shrink-0" />
        )}
      </div>
      
      {/* Content */}
      <div className={isCompact ? '' : 'space-y-1'}>
        {/* KPI Value */}
        {value !== undefined && (
          <div className={`
            ${isCompact ? 'text-[18px]' : 'text-[28-32px]'}
            font-semibold text-ionex-brand tracking-tight font-mono
          `} style={{ fontSize: isCompact ? '18px' : '28px' }}>
            {value}
          </div>
        )}
        
        {/* Trend + Sparkline row */}
        {!isCompact && value !== undefined && (
          <div className="flex items-center gap-2">
            {trend && (
              <div className={`flex items-center gap-1 text-[13px] ${trend === 'up' ? 'text-ionex-success' : trend === 'down' ? 'text-ionex-error' : 'text-ionex-text-mute'}`}>
                {trend === 'up' && <TrendUpIcon size={14} />}
                {trend === 'down' && <TrendDownIcon size={14} />}
                {trendValue && <span>{trendValue}</span>}
              </div>
            )}
            {sparklineData && (
              <Sparkline data={sparklineData} />
            )}
          </div>
        )}
        
        {/* Subtitle */}
        {subtitle && !isCompact && (
          <div className="text-[12px] text-ionex-text-mute truncate">
            {subtitle}
          </div>
        )}
      </div>
      
      {/* Action button */}
      {action && !isCompact && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
          className={`
            mt-2 w-full py-2 px-3 rounded-md text-[13px] font-medium
            bg-ionex-accent text-ionex-brand hover:bg-ionex-accent-deep
            transition-colors duration-150
          `}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// Action Tile (for primary actions like "New Order")
export function ActionTile({ label, description, onClick }: {
  label: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="
        w-[176px] h-[160px] rounded-[6px] p-4 flex flex-col justify-center items-center
        bg-ionex-brand text-white border-2 border-dashed border-white/20
        hover:bg-ionex-brand-light hover:border-white/40
        transition-all duration-150
      "
    >
      <PlusIcon size={24} primary="white" />
      <div className="mt-3 font-medium text-[14px]">{label}</div>
      {description && (
        <div className="mt-1 text-[12px] text-white/60">{description}</div>
      )}
    </button>
  );
}

// Tile Grid for Launchpad layouts
export function TileGrid({ tiles, columns = 4, gap = 4 }: {
  tiles: React.ReactNode[];
  columns?: number;
  gap?: number;
}) {
  return (
    <div 
      className="grid gap-4"
      style={{ 
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {tiles}
    </div>
  );
}

// Section header for launchpad
export function SectionHeader({ title, action, actionLabel, onAction }: {
  title: string;
  action?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-ionex-brand">{title}</h2>
      {action && onAction && (
        <button 
          onClick={onAction}
          className="text-[13px] text-ionex-accent hover:text-ionex-accent-deep font-medium"
        >
          {actionLabel || 'View all'}
        </button>
      )}
    </div>
  );
}

export default Tile;
