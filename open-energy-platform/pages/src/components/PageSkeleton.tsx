// ════════════════════════════════════════════════════════════════════════
// PageSkeleton — standardised loading placeholder used by lazy-loaded
// pages while the chunk + first data fetch resolve. Sits inside the
// existing chrome so layout doesn't shift when the real content arrives.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';

type Variant = 'workstation' | 'detail' | 'list' | 'kpi';

export function PageSkeleton({ variant = 'workstation', rows = 5 }: { variant?: Variant; rows?: number }) {
  if (variant === 'kpi') {
    return (
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="widget-card p-4">
            <div className="h-3 w-20 bg-[#e8ecf0] rounded mb-2"/>
            <div className="h-7 w-32 bg-gray-300 rounded mb-1"/>
            <div className="h-3 w-24 bg-[#eef2f7] rounded"/>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div className="p-4 space-y-3 animate-pulse">
        <div className="h-5 w-1/3 bg-[#e8ecf0] rounded"/>
        <div className="widget-card p-4 space-y-2">
          <div className="h-4 w-2/3 bg-[#e8ecf0] rounded"/>
          <div className="h-4 w-3/4 bg-[#e8ecf0] rounded"/>
          <div className="h-4 w-1/2 bg-[#e8ecf0] rounded"/>
        </div>
        <div className="widget-card p-4 space-y-2">
          <div className="h-4 w-3/4 bg-[#e8ecf0] rounded"/>
          <div className="h-4 w-2/3 bg-[#e8ecf0] rounded"/>
          <div className="h-4 w-1/3 bg-[#e8ecf0] rounded"/>
        </div>
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className="p-4 animate-pulse">
        <div className="widget-card overflow-hidden">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="px-4 py-3 border-b border-[#eef2f7] last:border-0 flex items-center gap-3">
              <div className="h-3 w-1/4 bg-[#e8ecf0] rounded"/>
              <div className="h-3 w-1/4 bg-[#e8ecf0] rounded"/>
              <div className="h-3 w-1/4 bg-[#e8ecf0] rounded"/>
              <div className="ml-auto h-3 w-12 bg-[#eef2f7] rounded"/>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // default: full workstation
  return (
    <div className="p-4 space-y-4 animate-pulse">
      <div className="h-5 w-48 bg-[#e8ecf0] rounded"/>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="widget-card p-4">
            <div className="h-3 w-20 bg-[#e8ecf0] rounded mb-2"/>
            <div className="h-7 w-32 bg-gray-300 rounded"/>
          </div>
        ))}
      </div>
      <div className="widget-card overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-[#eef2f7] last:border-0 flex items-center gap-3">
            <div className="h-3 w-1/4 bg-[#e8ecf0] rounded"/>
            <div className="h-3 w-1/4 bg-[#e8ecf0] rounded"/>
            <div className="h-3 w-1/4 bg-[#e8ecf0] rounded"/>
            <div className="ml-auto h-3 w-12 bg-[#eef2f7] rounded"/>
          </div>
        ))}
      </div>
    </div>
  );
}
