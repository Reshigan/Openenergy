import React, { ReactNode } from 'react';
import { ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react';

export type FioriAccent =
  | 'blue'
  | 'indigo'
  | 'teal'
  | 'plum'
  | 'pink'
  | 'amber'
  | 'green'
  | 'red';

export type FioriTileVariant = 'kpi' | 'feature' | 'action' | 'news';

interface FioriTileProps {
  title: string;
  subtitle?: string;
  value?: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  trendValue?: string;
  footer?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  accent?: FioriAccent;
  variant?: FioriTileVariant;
  featureBg?: 'indigo' | 'teal' | 'sunset' | 'ocean';
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
  badge?: string;
}

export function FioriTile({
  title,
  subtitle,
  value,
  unit,
  trend,
  trendValue,
  footer,
  icon: Icon,
  accent = 'blue',
  variant = 'kpi',
  featureBg,
  onClick,
  children,
  className = '',
  badge,
}: FioriTileProps) {
  const accentClass = `accent-${accent}`;
  const variantClass = variant === 'feature' ? 'feature' : '';
  const bgClass = variant === 'feature' && featureBg ? `bg-${featureBg}` : '';
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : ArrowRight;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`fiori-tile ${accentClass} ${variantClass} ${bgClass} text-left w-full ${className}`}
      style={{ minHeight: 176 }}
    >
      <div className="flex items-start justify-between gap-2 relative z-[1]">
        <div className="min-w-0">
          <div className="kpi-label truncate">{title}</div>
          {subtitle && (
            <div
              className="text-[12px] mt-0.5 truncate"
              style={{
                color: variant === 'feature' ? 'rgba(255,255,255,0.75)' : '#6a6d70',
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {badge && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{
                background:
                  variant === 'feature' ? 'rgba(255,255,255,0.22)' : '#efeafe',
                color: variant === 'feature' ? '#ffffff' : '#5d36ff',
              }}
            >
              {badge}
            </span>
          )}
          {Icon && (
            <Icon
              size={18}
              className={variant === 'feature' ? 'text-white/85' : 'text-[#89919a]'}
            />
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center relative z-[1] my-2">
        {value !== undefined && (
          <div className="flex items-baseline gap-1">
            <div className="kpi-value">{value}</div>
            {unit && (
              <div
                className="text-[14px] font-semibold"
                style={{
                  color: variant === 'feature' ? 'rgba(255,255,255,0.75)' : '#6a6d70',
                }}
              >
                {unit}
              </div>
            )}
          </div>
        )}
        {children}
      </div>

      <div className="flex items-center justify-between gap-2 relative z-[1]">
        {trend && trendValue && (
          <span className={`kpi-trend ${trend}`}>
            <TrendIcon size={14} />
            {trendValue}
          </span>
        )}
        {footer && (
          <span
            className="text-[12px] truncate"
            style={{
              color: variant === 'feature' ? 'rgba(255,255,255,0.75)' : '#6a6d70',
            }}
          >
            {footer}
          </span>
        )}
      </div>
    </button>
  );
}

export function FioriTileGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`grid gap-4 ${className}`}
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      }}
    >
      {children}
    </div>
  );
}

export function FioriTileGroup({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="flex items-end justify-between mb-3 px-0.5">
        <div>
          <h2
            className="text-[18px] font-bold tracking-tight"
            style={{ color: '#32363a' }}
          >
            {title}
          </h2>
          {description && (
            <p className="text-[13px] mt-0.5" style={{ color: '#6a6d70' }}>
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <FioriTileGrid>{children}</FioriTileGrid>
    </section>
  );
}

export default FioriTile;
