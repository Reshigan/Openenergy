import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

interface ErrorBannerProps {
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorBanner({ message = 'Something went wrong', onRetry, onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
      <p className="text-sm text-red-700 flex-1">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 px-3 py-1 text-sm text-red-700 hover:bg-red-100 rounded"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} className="p-1 hover:bg-red-100 rounded">
          <X className="w-4 h-4 text-red-600" />
        </button>
      )}
    </div>
  );
}
