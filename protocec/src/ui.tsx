import React from 'react';

export const zar = (v?: number | null, dp = 0) =>
  v == null ? '—' : `R ${Number(v).toLocaleString('en-ZA', { maximumFractionDigits: dp })}`;
export const num = (v?: number | null, dp = 0) =>
  v == null ? '—' : Number(v).toLocaleString('en-ZA', { maximumFractionDigits: dp });

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        'inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 ' +
        'text-[15px] font-semibold text-white transition active:translate-y-px ' +
        'hover:bg-accent-ink disabled:opacity-40 disabled:cursor-not-allowed ' +
        (props.className || '')
      }
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        'inline-flex items-center justify-center gap-2 rounded-full border border-line px-5 py-2.5 ' +
        'text-[14px] font-medium text-muted transition hover:text-ink hover:border-ink/30 ' +
        (props.className || '')
      }
    >
      {children}
    </button>
  );
}

export function Pill({ tone = 'neutral', children }: { tone?: 'good' | 'warn' | 'neutral'; children: React.ReactNode }) {
  const map: Record<string, string> = {
    good: 'bg-accent-soft text-accent-ink',
    warn: 'bg-amber/10 text-amber',
    neutral: 'bg-ink/5 text-muted',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="text-[26px] font-semibold leading-none">{value}</span>
      {sub && <span className="text-[12px] text-muted">{sub}</span>}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-muted" aria-busy>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      <span className="text-[14px]">{label}</span>
    </div>
  );
}
