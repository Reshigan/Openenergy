import React from 'react';
import { Download } from 'lucide-react';

interface ExportBarProps {
  data: any[];
  filename?: string;
  columns?: { key: string; header: string }[];
}

export function ExportBar({ data, filename = 'export', columns }: ExportBarProps) {
  const handleExport = () => {
    if (!data || data.length === 0) return;
    
    const headers = columns || Object.keys(data[0]).map(key => ({ key, header: key }));
    const csvContent = [
      headers.map(h => h.header).join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h.key];
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val ?? '';
      }).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="flex justify-end gap-2 py-2">
      <button
        onClick={handleExport}
        disabled={!data || data.length === 0}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download className="w-4 h-4" />
        Export CSV
      </button>
    </div>
  );
}
