// ════════════════════════════════════════════════════════════════════════
// RoleLaunchBoard — resolves /launch/:role and routes to the right shell
//
// Authz rules:
//   - signed-out → /login
//   - missing :role → /launch/<user.role>
//   - unknown :role → /launch/<user.role>
//   - cross-role (you trying to read someone else's board):
//       admin + support can do this (assisted walkthroughs / debug)
//       everyone else gets bounced back to their own board
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/useAuth';
import { LaunchBoardShell } from './LaunchBoardShell';
import { SignatureLaunchBoard } from './SignatureLaunchBoard';

// Roles that have been migrated to the signature design system. Adding a
// role to this set switches its launch board to the new chrome without
// touching the API surface.
const SIGNATURE_ROLES = new Set([
  'trader',
  'lender',
  'ipp_developer',
  'offtaker',
  'grid_operator',
  'regulator',
  'carbon_fund',
  'admin',
  'support',
]);

const KNOWN_ROLES = new Set([
  'trader',
  'ipp_developer',
  'offtaker',
  'lender',
  'grid_operator',
  'regulator',
  'carbon_fund',
  'admin',
  'support',
]);

export function RoleLaunchBoard() {
  const { role } = useParams<{ role: string }>();
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const fallback = `/launch/${user.role || 'admin'}`;
  if (!role || !KNOWN_ROLES.has(role)) return <Navigate to={fallback} replace />;

  // Cross-role browsing — only admin/support can do this. Everyone else
  // gets bounced to their own board.
  if (role !== user.role && user.role !== 'admin' && user.role !== 'support') {
    return <Navigate to={fallback} replace />;
  }

  if (SIGNATURE_ROLES.has(role)) return <SignatureLaunchBoard role={role} />;
  return <LaunchBoardShell role={role} />;
}

export function launchHrefForUser(userRole: string | undefined): string {
  if (!userRole) return '/login';
  if (!KNOWN_ROLES.has(userRole)) return '/launch/admin';
  return `/launch/${userRole}`;
}
