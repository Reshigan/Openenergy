import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (open && e.key === 'Escape' && !loading) onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const variantStyles = {
    danger: 'border-red-200 bg-[#fff5f5]',
    warning: 'border-yellow-200 bg-[#fffbf0]',
    info: 'bg-[oklch(0.96_0.008_250)] border-[oklch(0.82_0.03_250)]',
  };

  const buttonStyles = {
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-yellow-600 hover:bg-yellow-700',
    info: 'bg-[#c2873a] hover:bg-[#a3702f]',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className={`p-4 rounded-t-xl border-b ${variantStyles[variant]}`}>
          <div className="flex items-center gap-3">
            <AlertTriangle style={{ color: variant === 'danger' ? 'oklch(0.48 0.20 20)' : variant === 'warning' ? 'oklch(0.50 0.16 70)' : 'oklch(0.46 0.16 55)' }} className="w-5 h-5" />
            <h3 className="text-lg font-semibold">{title}</h3>
            <button type="button" aria-label="Close" onClick={onCancel} className="ml-auto p-1 hover:bg-[#f8fafc]/50 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6">
          <p style={{ color: '#3d4756' }}>{message}</p>
        </div>
        <div className="flex justify-end gap-3 p-4 rounded-b-xl" style={{ background: 'oklch(0.96 0.003 250)' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg disabled:opacity-50"
            style={{ border: '1px solid #dde4ec', color: '#3d4756' }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 ${buttonStyles[variant]}`}
          >
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
