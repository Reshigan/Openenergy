// ═══════════════════════════════════════════════════════════════════════════
// AI decision audit — every AI surface (rejection explainer, ghost-text
// suggestions, narrative one-liners) writes prompt + response to the
// `ai_decisions` table here. The regulator audit pack reads from this
// table to prove no AI output silently drove a financial action.
//
// Surfaces are short string identifiers (e.g. 'rejection_explainer',
// 'order_size_suggest', 'risk_narrative') so we can group + count by surface
// in dashboards without parsing JSON.
// ═══════════════════════════════════════════════════════════════════════════

import type { D1Database } from '@cloudflare/workers-types';

export interface AiDecisionInput {
  surface: string;
  participant_id?: string | null;
  intent?: string | null;
  prompt_summary?: string | null;
  prompt_hash?: string | null;
  response_text?: string | null;
  response_json?: Record<string, unknown> | null;
  model?: string | null;
  fallback?: boolean;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
}

export async function logAiDecision(
  db: D1Database,
  input: AiDecisionInput,
): Promise<{ id: string }> {
  const id = `aid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await db
    .prepare(
      `INSERT INTO ai_decisions
         (id, surface, participant_id, intent, prompt_hash, prompt_summary,
          response_text, response_json, model, fallback,
          related_entity_type, related_entity_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.surface,
      input.participant_id ?? null,
      input.intent ?? null,
      input.prompt_hash ?? null,
      input.prompt_summary?.slice(0, 500) ?? null,
      input.response_text?.slice(0, 4000) ?? null,
      input.response_json ? JSON.stringify(input.response_json).slice(0, 8000) : null,
      input.model ?? null,
      input.fallback ? 1 : 0,
      input.related_entity_type ?? null,
      input.related_entity_id ?? null,
    )
    .run();
  return { id };
}

export async function markAiDecisionAccepted(
  db: D1Database,
  decisionId: string,
  accepted: boolean,
): Promise<void> {
  await db
    .prepare(`UPDATE ai_decisions SET accepted = ? WHERE id = ?`)
    .bind(accepted ? 1 : 0, decisionId)
    .run();
}

// Stable digest used as a cache key. Fast, non-cryptographic — we only need
// equality semantics, not collision resistance.
export async function digest(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex.slice(0, 32);
}
