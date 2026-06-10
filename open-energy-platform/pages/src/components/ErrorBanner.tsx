import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

interface ErrorBannerProps {
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorBanner({ message = 'Something went wrong', onRetry, onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border" style={{ background: '#fff5f5', borderColor: '#fca5a5' }}>
      <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#c0392b' }} />
      <p className="text-sm flex-1" style={{ color: '#c0392b' }}>{message}</p>
      {onRetry && (
        <button type="button"
          onClick={onRetry}
          className="flex items-center gap-1 px-3 py-1 text-sm rounded"
          style={{ color: '#c0392b' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="p-1 rounded"
          style={{ color: '#c0392b' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
