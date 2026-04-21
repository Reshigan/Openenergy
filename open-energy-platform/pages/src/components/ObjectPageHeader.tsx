import React, { ReactNode } from 'react';

export interface ObjectKPI {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'good' | 'critical' | 'negative' | 'info';
}

interface ObjectPageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  iconColor?: string;
  badge?: {
    label: string;
    tone?: 'good' | 'critical' | 'negative' | 'info' | 'neutral' | 'indigo';
  };
  kpis?: ObjectKPI[];
  actions?: ReactNode;
  children?: ReactNode;
}

const toneColor: Record<NonNullable<ObjectKPI['tone']>, string> = {
  default: '#32363a',
  good: '#107e3e',
  critical: '#e9730c',
  negative: '#bb0000',
  info: '#0a6ed1',
};

export function ObjectPageHeader({
  title,
  subtitle,
  icon: Icon,
  iconColor = 'linear-gradient(135deg,#0a6ed1 0%,#5d36ff 100%)',
  badge,
  kpis,
  actions,
  children,
}: ObjectPageHeaderProps) {
  return (
    <section
      className="fiori-objectpage-header mb-6"
      style={{ borderRadius: 14 }}
    >
      <div className="flex items-start gap-4 flex-wrap">
        {Icon && (
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: iconColor,
              boxShadow: '0 6px 16px rgba(10,110,209,0.25)',
            }}
          >
            <Icon size={26} className="text-white" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1
              className="text-[24px] font-bold tracking-tight"
              style={{ color: '#32363a' }}
            >
              {title}
            </h1>
            {badge && (
              <span className={`fiori-chip ${badge.tone ?? 'info'}`}>{badge.label}</span>
            )}
          </div>
          {subtitle && (
            <p className="text-[14px] mt-1" style={{ color: '#6a6d70' }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {kpis && kpis.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 relative z-[1]">
          {kpis.map((kpi, i) => (
            <div key={i} className="min-w-[120px]">
              <div
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: '#89919a' }}
              >
                {kpi.label}
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span
                  className="text-[22px] font-bold tracking-tight"
                  style={{ color: toneColor[kpi.tone ?? 'default'] }}
                >
                  {kpi.value}
                </span>
                {kpi.unit && (
                  <span className="text-[12px]" style={{ color: '#6a6d70' }}>
                    {kpi.unit}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {children && <div className="mt-4 relative z-[1]">{children}</div>}
    </section>
  );
}

export default ObjectPageHeader;
