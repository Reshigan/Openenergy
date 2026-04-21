import React from 'react';

interface EntityLinkProps {
  id: string;
  type: 'participant' | 'contract' | 'trade' | 'project' | 'invoice' | 'carbon' | 'generic';
  onClick?: () => void;
}

const typeColors = {
  participant: 'text-blue-600 bg-blue-50',
  contract: 'text-purple-600 bg-purple-50',
  trade: 'text-green-600 bg-green-50',
  project: 'text-orange-600 bg-orange-50',
  invoice: 'text-red-600 bg-red-50',
  carbon: 'text-emerald-600 bg-emerald-50',
  generic: 'text-gray-600 bg-gray-50',
};

const typeIcons = {
  participant: '👤',
  contract: '📄',
  trade: '⚡',
  project: '🏗️',
  invoice: '💰',
  carbon: '🌱',
  generic: '🔗',
};

export function EntityLink({ id, type, onClick }: EntityLinkProps) {
  const shortId = id.length > 12 ? id.substring(0, 8) + '...' : id;
  const colorClass = typeColors[type] || typeColors.generic;
  
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded ${colorClass} ${onClick ? 'cursor-pointer hover:underline' : ''}`}
    >
      <span>{typeIcons[type]}</span>
      <span>{shortId}</span>
    </span>
  );
}
