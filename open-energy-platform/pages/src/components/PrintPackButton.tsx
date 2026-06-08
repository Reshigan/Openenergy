// ════════════════════════════════════════════════════════════════════════
// PrintPackButton — opens a server-rendered HTML pack in a new tab. The
// pack includes a "Save as PDF" button and an A4 print stylesheet.
//
// We can't pass the Authorization header through a window.open() target,
// so we fetch the HTML with auth, blob it, and open the blob URL.
// ════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { Printer } from 'lucide-react';

type Props = {
  /** Pack kind: 'regulator', 'lender', 'audit' */
  kind: 'regulator' | 'lender' | 'audit';
  /** ID segment (participant_id, project_id, day YYYY-MM-DD) */
  ref: string;
  label?: string;
  className?: string;
};

export function PrintPackButton({ kind, ref: refId, label, className }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const open = async () => {
    setBusy(true); setErr(null);
    try {
      const url = `/api/print-packs/${kind}/${encodeURIComponent(refId)}`;
      const token = window.localStorage.getItem('token');
      const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const u = URL.createObjectURL(blob);
      const w = window.open(u, '_blank');
      if (!w) throw new Error('Pop-up blocked — allow pop-ups to view the print pack.');
      setTimeout(() => URL.revokeObjectURL(u), 60_000);
    } catch (e: any) {
      setErr(e?.message || 'failed');
    } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" onClick={open} disabled={busy} className={className || 'h-8 px-3 rounded border border-[#dde4ec] text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50'}>
        <Printer size={12}/> {busy ? 'Building…' : (label || 'Print pack')}
      </button>
      {err && <span className="ml-2 text-[11px] text-[#c0392b]">{err}</span>}
    </>
  );
}
