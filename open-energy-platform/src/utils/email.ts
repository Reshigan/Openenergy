// ═══════════════════════════════════════════════════════════════════════════
// Email send seam + outbox audit (MailChannels transport, dev no-op default)
// ═══════════════════════════════════════════════════════════════════════════
//
// sendEmail() is the single place the platform turns an intent to email someone
// into an actual delivery attempt. Every attempt is written to oe_email_outbox
// (migration 510) so there is an append-only record even when nothing is sent.
//
// Live delivery is DARK by default. The real MailChannels POST only runs when
// env.ENVIRONMENT === 'production' AND env.EMAIL_FROM is set. In dev/test (the
// default, since wrangler.toml leaves EMAIL_FROM unset) sendEmail is a no-op
// that still records the row with status 'sent'. This lets callers (register
// verification, invite, reset, KYC decision) wire in safely without sending a
// single real email until the gate is deliberately opened.
//
// A failed transport NEVER throws back to the caller: the outbox row is marked
// 'failed' with the error captured, and the caller's request proceeds.
//
// Security: every SQL identifier here is a static literal; all request/input
// values (to, template, payload, status, error) bind only to ? placeholders.
// ═══════════════════════════════════════════════════════════════════════════

import type { HonoBindings } from './types';

export type EmailTemplate = 'verify' | 'reset' | 'invite' | 'kyc_decision';

export interface SendEmailInput {
  to: string;
  template: EmailTemplate;
  data: Record<string, unknown>;
}

export interface SendEmailResult {
  id: string;
  status: 'sent' | 'failed';
}

const MAILCHANNELS_ENDPOINT = 'https://api.mailchannels.net/tx/v1/send';
const ERROR_MAX_LEN = 500;

// ── Template copy ────────────────────────────────────────────────────────────
// Plain hyphens only, no dashes/emoji. Each entry derives a subject and a plain
// text body from the input data. Missing data fields degrade gracefully so a
// thin caller never produces an empty body.
interface TemplateDef {
  subject: string;
  body: (data: Record<string, unknown>) => string;
}

function str(data: Record<string, unknown>, key: string, fallback = ''): string {
  const v = data[key];
  return v == null ? fallback : String(v);
}

const TEMPLATES: Record<EmailTemplate, TemplateDef> = {
  verify: {
    subject: 'Verify your Open Energy Platform account',
    body: (d) => {
      const link = str(d, 'link') || str(d, 'token', '(verification token missing)');
      return [
        'Welcome to the Open Energy Platform.',
        '',
        'Please confirm your email address to activate your account:',
        link,
        '',
        'If you did not create this account you can ignore this message.',
      ].join('\n');
    },
  },
  reset: {
    subject: 'Reset your Open Energy Platform password',
    body: (d) => {
      const link = str(d, 'link') || str(d, 'token', '(reset token missing)');
      return [
        'We received a request to reset your password.',
        '',
        'Use the link below to choose a new password:',
        link,
        '',
        'If you did not request this you can safely ignore this message.',
      ].join('\n');
    },
  },
  invite: {
    subject: 'You have been invited to the Open Energy Platform',
    body: (d) => {
      const org = str(d, 'org', 'an organisation');
      const link = str(d, 'link') || str(d, 'token', '');
      return [
        `You have been invited to join ${org} on the Open Energy Platform.`,
        '',
        link ? `Accept the invitation here:\n${link}` : 'Sign in to accept the invitation.',
      ].join('\n');
    },
  },
  kyc_decision: {
    subject: 'Update on your Open Energy Platform KYC review',
    body: (d) => {
      const decision = str(d, 'decision', 'updated');
      const reason = str(d, 'reason');
      const lines = [
        `Your KYC review status is now: ${decision}.`,
      ];
      if (reason) {
        lines.push('', reason);
      }
      return lines.join('\n');
    },
  },
};

// ── Outbox helpers ───────────────────────────────────────────────────────────
async function markStatus(
  env: HonoBindings,
  id: string,
  status: 'sent' | 'failed',
  error: string | null,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE oe_email_outbox SET status = ?, error = ? WHERE id = ?`,
  ).bind(status, error, id).run();
}

// ── Seam ─────────────────────────────────────────────────────────────────────
export async function sendEmail(env: HonoBindings, input: SendEmailInput): Promise<SendEmailResult> {
  const id = crypto.randomUUID();
  const payload = JSON.stringify(input.data ?? {});

  // Record intent first (status 'queued'), so a crash mid-send still leaves a
  // trace. The default status column value is 'queued'; we set it explicitly.
  await env.DB.prepare(
    `INSERT INTO oe_email_outbox (id, to_addr, template, payload, status) VALUES (?, ?, ?, ?, 'queued')`,
  ).bind(id, input.to, input.template, payload).run();

  // Runtime guard: the template field is a typed union at compile time, but a
  // bad caller could still pass an unknown key. Reject it here (before the gate
  // decision) so neither the no-op nor the live path can send a blank email.
  if (!Object.prototype.hasOwnProperty.call(TEMPLATES, input.template)) {
    const msg = `unknown template: ${String(input.template)}`.slice(0, ERROR_MAX_LEN);
    await markStatus(env, id, 'failed', msg);
    return { id, status: 'failed' };
  }

  const live = env.ENVIRONMENT === 'production' && !!env.EMAIL_FROM;

  if (!live) {
    // Dev/test no-op: record the intent, send nothing.
    await markStatus(env, id, 'sent', null);
    return { id, status: 'sent' };
  }

  const tpl = TEMPLATES[input.template];
  const subject = tpl ? tpl.subject : 'Open Energy Platform';
  const value = tpl ? tpl.body(input.data ?? {}) : '';

  try {
    const response = await fetch(MAILCHANNELS_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: { email: env.EMAIL_FROM },
        subject,
        content: [{ type: 'text/plain', value }],
      }),
    });
    // Inspect the resolved response: a 4xx/5xx is a real delivery failure and
    // must NOT be recorded as 'sent', or the audit log would lie. Only an ok
    // (2xx) response counts as accepted by the edge transport.
    if (!response.ok) {
      const msg = `MailChannels HTTP ${response.status}`.slice(0, ERROR_MAX_LEN);
      await markStatus(env, id, 'failed', msg);
      return { id, status: 'failed' };
    }
    await markStatus(env, id, 'sent', null);
    return { id, status: 'sent' };
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, ERROR_MAX_LEN);
    await markStatus(env, id, 'failed', msg);
    return { id, status: 'failed' };
  }
}
