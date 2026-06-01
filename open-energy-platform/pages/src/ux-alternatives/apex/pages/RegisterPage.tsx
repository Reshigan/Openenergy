// Public self-registration page — no auth required.
// Mounts at /apex/register (or the platform root /register).
// Supports:
//   ?token=<invitation_token>  → invitation-prefilled flow (role locked)
//   no token                   → open self-registration for self-register roles

import React, { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelfRegRole { role: string; display_name: string; }
interface InvitationInfo {
  id: string;
  email: string | null;
  role: string;
  organization: string | null;
  note: string | null;
  invited_by_name: string | null;
  invited_by_company: string | null;
}

type Step = 'form' | 'submitted' | 'error';

// ─── Constants ────────────────────────────────────────────────────────────────

const ORG_TYPES = [
  { value: 'pty_ltd',       label: 'Private Company (Pty) Ltd' },
  { value: 'soc',           label: 'State-Owned Company (SOC)' },
  { value: 'trust',         label: 'Trust' },
  { value: 'partnership',   label: 'Partnership' },
  { value: 'sole_prop',     label: 'Sole Proprietor' },
  { value: 'npc',           label: 'Non-Profit Company (NPC)' },
  { value: 'public_entity', label: 'Public Entity' },
  { value: 'other',         label: 'Other' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function RegisterPage() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const invToken = params.get('token');

  const [roles, setRoles] = useState<SelfRegRole[]>([]);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [invError, setInvError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [registrationId, setRegistrationId] = useState('');
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    email: '', password: '', password_confirm: '',
    full_name: '', company_name: '', requested_role: '',
    organization_type: '', reg_number: '', phone: '', motivation: '',
  });

  // Load available roles (open registration)
  useEffect(() => {
    api.get('/rbac/register/roles').then(r => setRoles((r.data as any).data ?? []));
  }, []);

  // Resolve invitation token
  useEffect(() => {
    if (!invToken) return;
    api.get(`/rbac/invitations/${invToken}`).then(r => {
      const inv = (r.data as any).data as InvitationInfo;
      setInvitation(inv);
      setForm(f => ({ ...f, email: inv.email ?? '', requested_role: inv.role }));
    }).catch(err => {
      setInvError((err?.response?.data as any)?.error ?? 'Invalid or expired invitation link');
    });
  }, [invToken]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.password_confirm) {
      setServerError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setServerError('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    setServerError('');
    try {
      const payload: any = {
        email: form.email, password: form.password, full_name: form.full_name,
        company_name: form.company_name || undefined, requested_role: form.requested_role,
        organization_type: form.organization_type || undefined,
        reg_number: form.reg_number || undefined, phone: form.phone || undefined,
        motivation: form.motivation || undefined,
      };
      if (invToken) payload.invitation_token = invToken;

      const r = await api.post('/rbac/registrations', payload);
      const data = (r.data as any).data;
      setRegistrationId(data.registration_id ?? data.participant_id ?? '');
      setStep('submitted');
    } catch (err: any) {
      setServerError(err?.response?.data?.error ?? 'Registration failed. Please try again.');
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  };

  const isInvited = !!invToken;
  const lockedRole = invitation?.role;
  const isViaInvitation = isInvited && !invError;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--oe-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>

        {/* Logo / brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--oe-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#F59E0B', fontWeight: 900, fontSize: '15px', letterSpacing: '-0.05em' }}>OE</span>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--oe-text-1)', letterSpacing: '-0.02em' }}>Open Energy</div>
            <div style={{ fontSize: '11px', color: 'var(--oe-text-4)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>South Africa</div>
          </div>
        </div>

        {/* Invitation banner */}
        {isViaInvitation && invitation && (
          <div style={{ padding: '12px 16px', background: 'rgba(79,156,249,0.1)', border: '1px solid rgba(79,156,249,0.3)', borderRadius: '10px', marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#4f9cf9', marginBottom: '4px' }}>You have been invited</div>
            <div style={{ fontSize: '12px', color: 'var(--oe-text-2)' }}>
              {invitation.invited_by_name ?? 'Someone'} from {invitation.invited_by_company ?? 'Open Energy'} has invited you to join as <strong>{invitation.role.replace('_', ' ')}</strong>.
              {invitation.note && <em> "{invitation.note}"</em>}
            </div>
          </div>
        )}

        {invError && (
          <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', marginBottom: '20px', fontSize: '13px', color: 'var(--oe-rose)' }}>
            {invError}
          </div>
        )}

        {/* Success state */}
        {step === 'submitted' && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(52,199,89,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span style={{ fontSize: '24px' }}>✓</span>
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, color: 'var(--oe-text-1)' }}>
              {isViaInvitation ? 'Account created' : 'Registration submitted'}
            </h2>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--oe-text-3)', lineHeight: 1.6 }}>
              {isViaInvitation
                ? 'Your account is ready. You can now log in using your email and password.'
                : 'Your registration is under review. You will receive an email once your account has been approved by the platform administrator.'}
            </p>
            {isViaInvitation && (
              <a href="/login" style={{ display: 'inline-block', marginTop: '20px', padding: '10px 24px', borderRadius: '8px', background: 'var(--oe-navy)', color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: 700 }}>
                Go to login
              </a>
            )}
          </div>
        )}

        {/* Registration form */}
        {step !== 'submitted' && !invError && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            <h1 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: 800, color: 'var(--oe-text-1)', letterSpacing: '-0.03em' }}>
              {isViaInvitation ? 'Complete your account' : 'Create account'}
            </h1>
            <p style={{ margin: '0 0 24px', fontSize: '13px', color: 'var(--oe-text-3)' }}>
              {isViaInvitation
                ? 'Fill in your details to activate your invitation.'
                : 'Join the Open Energy Platform. Your account will be reviewed before activation.'}
            </p>

            <Section title="Account details">
              <Field label="Email address *" htmlFor="email">
                <input id="email" type="email" required value={form.email} onChange={set('email')}
                  disabled={!!invitation?.email} placeholder="you@company.co.za" style={inputStyle} />
              </Field>
              <Field label="Full name *" htmlFor="full_name">
                <input id="full_name" type="text" required value={form.full_name} onChange={set('full_name')}
                  placeholder="First Surname" style={inputStyle} />
              </Field>
              <TwoCol>
                <Field label="Password *" htmlFor="password">
                  <input id="password" type="password" required minLength={8} value={form.password} onChange={set('password')} placeholder="Min. 8 characters" style={inputStyle} />
                </Field>
                <Field label="Confirm password *" htmlFor="password_confirm">
                  <input id="password_confirm" type="password" required value={form.password_confirm} onChange={set('password_confirm')} placeholder="Repeat password" style={inputStyle} />
                </Field>
              </TwoCol>
            </Section>

            <Section title="Organisation">
              <TwoCol>
                <Field label="Company / Organisation name" htmlFor="company_name">
                  <input id="company_name" type="text" value={form.company_name} onChange={set('company_name')} placeholder="Acme Energy (Pty) Ltd" style={inputStyle} />
                </Field>
                <Field label="CIPC / Reg number" htmlFor="reg_number">
                  <input id="reg_number" type="text" value={form.reg_number} onChange={set('reg_number')} placeholder="2023/123456/07" style={inputStyle} />
                </Field>
              </TwoCol>
              <TwoCol>
                <Field label="Organisation type" htmlFor="org_type">
                  <select id="org_type" value={form.organization_type} onChange={set('organization_type')} style={inputStyle}>
                    <option value="">— select —</option>
                    {ORG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Phone" htmlFor="phone">
                  <input id="phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+27 11 123 4567" style={inputStyle} />
                </Field>
              </TwoCol>
            </Section>

            <Section title="Role & purpose">
              <Field label="Requested role *" htmlFor="role">
                {isViaInvitation ? (
                  <div style={{ ...inputStyle, background: 'var(--oe-surf-2)', color: 'var(--oe-text-2)', display: 'flex', alignItems: 'center' }}>
                    {lockedRole?.replace(/_/g, ' ')} <span style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--oe-text-4)' }}>(set by invitation)</span>
                  </div>
                ) : (
                  <select id="role" required value={form.requested_role} onChange={set('requested_role')} style={inputStyle}>
                    <option value="">— select your role —</option>
                    {roles.map(r => <option key={r.role} value={r.role}>{r.display_name}</option>)}
                  </select>
                )}
              </Field>
              {!isViaInvitation && (
                <Field label="Why do you need this role? (optional)" htmlFor="motivation">
                  <textarea id="motivation" value={form.motivation} onChange={set('motivation')} rows={3}
                    placeholder="Briefly describe your use case and organisation…"
                    style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }} />
                </Field>
              )}
            </Section>

            {serverError && (
              <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '7px', marginBottom: '16px', fontSize: '12px', color: 'var(--oe-rose)' }}>
                {serverError}
              </div>
            )}

            <button type="submit" disabled={submitting}
              style={{ padding: '12px', borderRadius: '9px', background: 'var(--oe-navy)', color: '#fff', border: 'none', fontSize: '14px', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.8 : 1, transition: 'opacity 150ms', letterSpacing: '-0.01em' }}>
              {submitting ? 'Submitting…' : isViaInvitation ? 'Create account' : 'Submit registration'}
            </button>

            <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--oe-text-4)', marginTop: '16px' }}>
              Already have an account?{' '}
              <a href="/login" style={{ color: 'var(--oe-navy)', fontWeight: 600, textDecoration: 'none' }}>Sign in</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: '7px',
  border: '1px solid var(--oe-border)', background: 'var(--oe-surf)',
  color: 'var(--oe-text-1)', fontSize: '13px', boxSizing: 'border-box',
  outline: 'none',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--oe-text-4)', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid var(--oe-border)' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--oe-text-3)', display: 'block', marginBottom: '4px' }}>{label}</label>
      {children}
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>{children}</div>;
}

export default RegisterPage;
