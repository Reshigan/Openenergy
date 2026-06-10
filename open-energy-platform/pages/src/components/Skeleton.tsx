import React from 'react';

interface SkeletonProps {
  rows?: number;
  height?: string;
  variant?: 'text' | 'card' | 'chart';
  /** Optional wrapper className — used by callers that need a custom size. */
  className?: string;
}

export function Skeleton({ rows = 3, height = 'h-4', variant = 'text', className }: SkeletonProps) {
  if (className) {
    return <div className={`rounded animate-pulse ${className}`} style={{ background: 'oklch(0.91 0.004 250)' }} />;
  }
  if (variant === 'card') {
    return (
      <div className="rounded-xl border p-6 animate-pulse" style={{ background: 'oklch(0.99 0.002 80)', borderColor: 'oklch(0.88 0.006 250)' }}>
        <div className="h-6 rounded w-1/3 mb-4" style={{ background: 'oklch(0.91 0.004 250)' }} />
        <div className="space-y-3">
          <div className={`${height} rounded`} style={{ background: 'oklch(0.91 0.004 250)' }} />
          <div className={`${height} rounded w-5/6`} style={{ background: 'oklch(0.91 0.004 250)' }} />
          <div className={`${height} rounded w-4/6`} style={{ background: 'oklch(0.91 0.004 250)' }} />
        </div>
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className="rounded-xl border p-6 animate-pulse" style={{ background: 'oklch(0.99 0.002 80)', borderColor: 'oklch(0.88 0.006 250)' }}>
        <div className="h-6 rounded w-1/4 mb-6" style={{ background: 'oklch(0.91 0.004 250)' }} />
        <div className="flex items-end gap-2 h-48">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="flex-1 rounded-t" style={{ background: 'oklch(0.91 0.004 250)', height: `${(i * 7 + 20) % 80 + 20}%` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-pulse">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className={`${height} rounded ${i === rows - 1 ? 'w-4/6' : 'w-full'}`} style={{ background: 'oklch(0.91 0.004 250)' }} />
      ))}
    </div>
  );
}

export function TableSkeleton({ columns = 4, rows = 5 }: { columns?: number; rows?: number }) {
  return (
    <div className="rounded-xl border overflow-hidden animate-pulse" style={{ background: 'oklch(0.99 0.002 80)', borderColor: 'oklch(0.88 0.006 250)' }}>
      <div className="border-b p-4" style={{ borderColor: 'oklch(0.88 0.006 250)' }}>
        <div className="flex gap-4">
          {[...Array(columns)].map((_, i) => (
            <div key={i} className="h-4 rounded flex-1" style={{ background: 'oklch(0.91 0.004 250)' }} />
          ))}
        </div>
      </div>
      <div className="divide-y" style={{ borderColor: 'oklch(0.93 0.004 250)' }}>
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="p-4 flex gap-4" style={{ borderColor: 'oklch(0.93 0.004 250)' }}>
            {[...Array(columns)].map((_, j) => (
              <div key={j} className="h-4 rounded flex-1" style={{ background: 'oklch(0.94 0.003 250)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
