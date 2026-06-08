import React from 'react';
import { Inbox, Plus } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode | string;     // string → rendered as text/emoji glyph
  title: string;
  description?: string;
  /** Alias for `description` — accepted for legacy callers. */
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, subtitle, action }: EmptyStateProps) {
  const body = description ?? subtitle;
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        {icon || <Inbox className="w-8 h-8 text-gray-400" />}
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>
      {body && <p className="text-sm text-gray-500 mb-4 max-w-sm">{body}</p>}
      {action && (
        <button type="button"
          onClick={action.onClick}
          className="flex items-center gap-2 px-4 py-2 bg-oe-accent text-white rounded-lg hover:bg-oe-accent/90"
        >
          <Plus className="w-4 h-4" />
          {action.label}
        </button>
      )}
    </div>
  );
}
