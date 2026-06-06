// SPA client for the Layer-C cross-role action queue (/api/role-actions).
// Uses the shared axios instance in ./api.ts (baseURL '/api'); paths are relative.
import { api } from './api';

export interface CrossOption {
  action_label: string;
  target_route: string;
  prefill?: Record<string, unknown>;
}

export interface RoleAction {
  id: string;
  target_role: string;
  target_participant_id: string | null;
  source_event: string;
  source_chain_key: string | null;
  source_entity_type: string;
  source_entity_id: string;
  title: string;
  body: Record<string, unknown> | null;
  cross_option: CrossOption | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'pending' | 'acknowledged' | 'actioned' | 'dismissed';
  sla_due_at: string | null;
  actioned_by: string | null;
  actioned_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Pending (or status-filtered) cross-role actions addressed to the current user's role. */
export async function listRoleActions(status?: RoleAction['status']): Promise<RoleAction[]> {
  const res = await api.get<{ items: RoleAction[] }>('/role-actions', {
    params: status ? { status } : undefined,
  });
  return res.data.items ?? [];
}

/** Badge count of pending actions for the current role. */
export async function roleActionCount(): Promise<number> {
  const res = await api.get<{ pending: number }>('/role-actions/count');
  return res.data.pending ?? 0;
}

/** Transition a single action: acknowledge | action (terminal) | dismiss. */
export async function actOnRoleAction(
  id: string,
  kind: 'acknowledge' | 'action' | 'dismiss',
): Promise<void> {
  await api.post(`/role-actions/${encodeURIComponent(id)}/${kind}`, {});
}
