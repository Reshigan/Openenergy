/**
 * Apex Design — Entry point
 *
 * Mount this at a route like /apex to preview the new design.
 * Role is derived from the JWT in localStorage (same pattern as App.tsx).
 * Unauthenticated visitors are redirected to /login.
 *
 * Usage:
 *   In App.tsx (already wired):
 *     <Route path="/apex"   element={<ApexApp />} />
 *     <Route path="/apex/*" element={<ApexApp />} />
 */

import React, { Suspense, lazy } from 'react';
import { Navigate } from 'react-router-dom';
import './apex-global.css';

type RoleKey =
  | 'ipp_developer' | 'lender' | 'trader' | 'carbon_fund'
  | 'offtaker' | 'regulator' | 'grid_operator' | 'support' | 'admin' | 'esums';

interface TokenPayload { role?: string; exp?: number }

function getAuthState(): { role: RoleKey; authenticated: boolean } {
  try {
    const token = localStorage.getItem('token');
    if (!token) return { role: 'ipp_developer', authenticated: false };
    const parts = token.split('.');
    if (parts.length !== 3) return { role: 'ipp_developer', authenticated: false };
    const payload = JSON.parse(atob(parts[1])) as TokenPayload;
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return { role: 'ipp_developer', authenticated: false };
    }
    const raw = payload.role ?? 'ipp_developer';
    const role: RoleKey =
      raw === 'ipp_developer' ? 'ipp_developer' :
      raw === 'grid_operator' ? 'grid_operator' :
      raw === 'carbon_fund'   ? 'carbon_fund'   :
      raw === 'admin'         ? 'admin'          :
      raw as RoleKey;
    return { role, authenticated: true };
  } catch {
    return { role: 'ipp_developer', authenticated: false };
  }
}

// Lazy-load every workstation — keeps the initial bundle small
const IppWorkstation       = lazy(() => import('./pages/ipp/IppWorkstation').then(m       => ({ default: m.IppWorkstation })));
const LenderWorkstation    = lazy(() => import('./pages/lender/LenderWorkstation').then(m => ({ default: m.LenderWorkstation })));
const TraderWorkstation    = lazy(() => import('./pages/trader/TraderWorkstation').then(m => ({ default: m.TraderWorkstation })));
const CarbonWorkstation    = lazy(() => import('./pages/carbon/CarbonWorkstation').then(m => ({ default: m.CarbonWorkstation })));
const OfftakerWorkstation  = lazy(() => import('./pages/offtaker/OfftakerWorkstation').then(m => ({ default: m.OfftakerWorkstation })));
const RegulatorWorkstation = lazy(() => import('./pages/regulator/RegulatorWorkstation').then(m => ({ default: m.RegulatorWorkstation })));
const GridWorkstation      = lazy(() => import('./pages/grid/GridWorkstation').then(m     => ({ default: m.GridWorkstation })));
const EsumsWorkstation     = lazy(() => import('./pages/esums/EsumsWorkstation').then(m  => ({ default: m.EsumsWorkstation })));
const OemWorkstation       = lazy(() => import('./pages/oem/OemWorkstation').then(m      => ({ default: m.OemWorkstation })));
const AdminWorkstation     = lazy(() => import('./pages/admin/AdminWorkstation').then(m  => ({ default: m.AdminWorkstation })));

function LoadingFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--oe-grad-body)',
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        border: '2px solid var(--oe-border)',
        borderTopColor: 'var(--oe-navy-1)',
        animation: 'spin 600ms linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function ApexApp() {
  const { role, authenticated } = getAuthState();

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      {role === 'ipp_developer'  && <IppWorkstation />}
      {role === 'lender'         && <LenderWorkstation />}
      {role === 'trader'         && <TraderWorkstation />}
      {role === 'carbon_fund'    && <CarbonWorkstation />}
      {role === 'offtaker'       && <OfftakerWorkstation />}
      {role === 'regulator'      && <RegulatorWorkstation />}
      {role === 'grid_operator'  && <GridWorkstation />}
      {role === 'support'        && <OemWorkstation />}
      {role === 'esums'          && <EsumsWorkstation />}
      {role === 'admin'          && <AdminWorkstation />}
    </Suspense>
  );
}

export default ApexApp;
