import React from 'react';

interface SkeletonProps {
  rows?: number;
  height?: string;
  variant?: 'text' | 'card' | 'chart';
}

export function Skeleton({ rows = 3, height = 'h-4', variant = 'text' }: SkeletonProps) {
  if (variant === 'card') {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          <div className={`${height} bg-gray-200 rounded`} />
          <div className={`${height} bg-gray-200 rounded w-5/6`} />
          <div className={`${height} bg-gray-200 rounded w-4/6`} />
        </div>
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/4 mb-6" />
        <div className="flex items-end gap-2 h-48">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="flex-1 bg-gray-200 rounded-t" style={{ height: `${Math.random() * 80 + 20}%` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-pulse">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className={`${height} bg-gray-200 rounded ${i === rows - 1 ? 'w-4/6' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function TableSkeleton({ columns = 4, rows = 5 }: { columns?: number; rows?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden animate-pulse">
      <div className="border-b border-gray-100 p-4">
        <div className="flex gap-4">
          {[...Array(columns)].map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded flex-1" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="p-4 flex gap-4">
            {[...Array(columns)].map((_, j) => (
              <div key={j} className="h-4 bg-gray-100 rounded flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
