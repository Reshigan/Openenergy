// DocumentDownloadButton — triggers a /api/pdf/* download in the browser.
//
// Usage:
//   <DocumentDownloadButton docType="invoice" entityId={inv.id} label="Download Invoice" />
//   <DocumentDownloadButton docType="carbon-cert" entityId={ret.id} />
//   <DocumentDownloadButton docType="audit-export" />   (no entityId needed)
//
// The button streams the PDF response directly to a hidden <a download>, so
// the browser treats it as a save-as rather than a page navigation.

import React, { useState } from 'react';
import { OeIcon } from '../icons/Icons';
import { api } from '../../../../lib/api';

export type PdfDocType =
  | 'invoice'
  | 'carbon-cert'
  | 'covenant-report'
  | 'work-order'
  | 'stage-gate'
  | 'settlement'
  | 'audit-export';

interface DocumentDownloadButtonProps {
  docType: PdfDocType;
  entityId?: string;
  /** Extra query params, e.g. { period: '2026-03' } for covenant reports */
  params?: Record<string, string>;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  /** Called after a successful download */
  onSuccess?: () => void;
}

export function DocumentDownloadButton({
  docType,
  entityId,
  params,
  label,
  variant = 'secondary',
  size = 'sm',
  onSuccess,
}: DocumentDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const path = entityId
        ? `/pdf/${docType}/${entityId}`
        : `/pdf/${docType}`;

      const qs = params ? '?' + new URLSearchParams(params).toString() : '';

      // Fetch as binary so axios doesn't try to parse JSON
      const res = await api.get<ArrayBuffer>(`${path}${qs}`, {
        responseType: 'arraybuffer',
      });

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      // Derive filename from Content-Disposition if available, else fall back
      const cd = (res.headers as any)['content-disposition'] ?? '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `OE-${docType}-${entityId ?? 'export'}.pdf`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onSuccess?.();
    } catch {
      setError('Download failed');
    } finally {
      setLoading(false);
    }
  };

  const heights: Record<string, string> = { sm: '28px', md: '34px' };
  const fontSizes: Record<string, string> = { sm: '11px', md: '12px' };
  const pads: Record<string, string> = { sm: '0 10px', md: '0 14px' };
  const iconSizes: Record<string, number> = { sm: 12, md: 14 };

  const bg =
    variant === 'primary'  ? 'var(--oe-navy)' :
    variant === 'ghost'    ? 'transparent'    : 'var(--oe-surf-2)';
  const fg =
    variant === 'primary'  ? '#fff'                    :
    variant === 'ghost'    ? 'var(--oe-text-3)'         : 'var(--oe-text-2)';
  const border =
    variant === 'ghost'    ? '1px solid transparent'   : '1px solid var(--oe-border)';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
      <button
        onClick={handleClick}
        disabled={loading}
        title={label ?? `Download ${docType.replace(/-/g, ' ')} PDF`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          height: heights[size],
          padding: pads[size],
          fontSize: fontSizes[size],
          fontFamily: 'var(--oe-font)',
          fontWeight: 500,
          background: bg,
          color: fg,
          border,
          borderRadius: '6px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
          transition: 'all 80ms',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {loading ? (
          <span
            style={{
              width: iconSizes[size],
              height: iconSizes[size],
              border: `2px solid ${fg}`,
              borderTopColor: 'transparent',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'oe-spin 0.65s linear infinite',
              flexShrink: 0,
            }}
          />
        ) : (
          <OeIcon name="download" size={iconSizes[size]} color={fg} />
        )}
        {label ?? 'PDF'}
      </button>

      {error && (
        <span style={{ fontSize: '10px', color: 'var(--oe-rose)', paddingLeft: '2px' }}>
          {error}
        </span>
      )}

      <style>{`@keyframes oe-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default DocumentDownloadButton;
