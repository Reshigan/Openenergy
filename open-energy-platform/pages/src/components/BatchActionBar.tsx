import React from 'react';
import { CheckSquare, Trash2, X } from 'lucide-react';

interface BatchActionBarProps {
  selectedCount: number;
  onClear: () => void;
  actions: {
    label: string;
    icon?: React.ReactNode;
    variant?: 'default' | 'danger';
    onClick: () => void;
  }[];
}

export function BatchActionBar({ selectedCount, onClear, actions }: BatchActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <CheckSquare className="w-5 h-5 text-oe-accent" />
        <span className="font-medium">{selectedCount} selected</span>
      </div>
      <div className="h-6 w-px bg-gray-700" />
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={action.onClick}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
            action.variant === 'danger' 
              ? 'hover:bg-red-600 text-red-300' 
              : 'hover:bg-gray-700'
          }`}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
      <div className="h-6 w-px bg-gray-700" />
      <button onClick={onClear} className="p-1 hover:bg-gray-700 rounded">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
