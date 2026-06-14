// pages/src/meridian/MeridianFrame.tsx — Meridian chrome wrapper for secondary routes.
// Phase E relocates the non-chain surfaces (master-data CRUD, analytics/ML panels,
// connectors) that used to live as workstation tabs into standalone full-canvas routes.
// They are NOT chains, so they get no Ledger/Thread; they get this frame instead: the
// shared MeridianHeader strip + a `.mer` body, matching LedgerPage/HorizonPage chrome.
// Mount bare in App.tsx inside <ProtectedRoute> with NO <Layout> wrapper (Meridian
// routes are full-canvas — App.tsx comment: "full-canvas pages with their own chrome").
import React from 'react';
import './meridian.css';
import { MeridianHeader } from './MeridianHeader';

export function MeridianFrame({
  title,
  ctx,
  children,
}: {
  title?: string;                 // short page title, shown bold in the header ctx slot
  ctx?: React.ReactNode;          // optional richer header ctx (overrides title when given)
  children: React.ReactNode;
}) {
  return (
    <div className="mer mer-frame">
      <MeridianHeader ctx={ctx ?? (title ? <b>{title}</b> : undefined)} />
      <main className="mer-frame-body">{children}</main>
    </div>
  );
}

export default MeridianFrame;
