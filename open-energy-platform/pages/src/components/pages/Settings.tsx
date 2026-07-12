import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Bell, Globe, Lock, ShieldCheck, Save } from 'lucide-react';
import { api } from '../../context/AuthContext';
import { useAuth } from '../../lib/useAuth';
import { Skeleton } from '../Skeleton';

// Unified /settings page — every role lands here from the avatar menu.
// Four panes:
//   1. Profile      — name + company (via PUT /auth/profile)
//   2. Preferences  — notification toggles + locale/currency/timezone
//                     (via GET / PUT /auth/preferences)
//   3. Password     — current + new (POST /auth/change-password)
//   4. Security     — link to /settings/security (MFA + sessions)

const BG      = 'var(--s0, oklch(0.96 0.003 250))';
const BG1     = 'var(--s1, oklch(0.99 0.002 80))';
const BG2     = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER  = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1     = 'var(--ink, oklch(0.17 0.010 250))';
const TX2     = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3     = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC     = 'var(--accent, oklch(0.46 0.16 250))';
const BAD     = 'var(--bad, oklch(0.48 0.20 20))';
const BAD_BG  = 'color-mix(in oklab, var(--bad) 15%, var(--s1))';
const GOOD    = 'var(--good, oklch(0.40 0.16 155))';
const GOOD_BG = 'color-mix(in oklab, var(--good) 15%, var(--s1))';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

type Prefs = {
  notify_email_contracts: number;
  notify_email_settlement: number;
  notify_email_covenants: number;
  notify_email_lois: number;
  notify_in_app: number;
  locale: string;
  currency: string;
  timezone: string;
  date_format: string;
};

type Msg = { kind: 'ok' | 'err'; text: string } | null;

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
  color: TX1,
  background: BG,
  outline: 'none',
  boxSizing: 'border-box',
};

const readonlyInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: BG2,
  color: TX2,
};

function Msg({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <span style={{
      fontSize: 12,
      color: msg.kind === 'ok' ? GOOD : BAD,
      background: msg.kind === 'ok' ? GOOD_BG : BAD_BG,
      padding: '4px 10px',
      borderRadius: 6,
      fontWeight: 500,
    }}>
      {msg.text}
    </span>
  );
}

function SectionCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: BG1,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      marginBottom: 16,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 20px',
        borderBottom: `1px solid ${BORDER}`,
        background: BG2,
      }}>
        <Icon size={14} style={{ color: TX2 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: TX3, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {children}
    </div>
  );
}

function PrefRow({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '9px 0',
      borderBottom: `1px solid ${BORDER}`,
    }}>
      <span style={{ fontSize: 13, color: TX1 }}>{label}</span>
      <button
        type="button"
        onClick={onChange}
        aria-pressed={on}
        style={{
          position: 'relative',
          display: 'inline-flex',
          height: 20,
          width: 36,
          alignItems: 'center',
          borderRadius: 10,
          border: 'none',
          cursor: 'pointer',
          background: on ? ACC : BORDER,
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
      >
        <span style={{
          display: 'inline-block',
          height: 14,
          width: 14,
          borderRadius: '50%',
          background: 'var(--s1, #fff)',
          transform: on ? 'translateX(18px)' : 'translateX(3px)',
          transition: 'transform 0.15s',
        }} />
      </button>
    </div>
  );
}

function LabelInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);

  // Profile
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [profileMsg, setProfileMsg] = useState<Msg>(null);

  // Prefs
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [prefsMsg, setPrefsMsg] = useState<Msg>(null);

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<Msg>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [me, pr] = await Promise.all([
          api.get('/auth/me'),
          api.get('/auth/preferences'),
        ]);
        if (!alive) return;
        if (me.data?.success) {
          setName(me.data.data?.name || '');
          setCompany(me.data.data?.company_name || '');
        }
        if (pr.data?.success) setPrefs(pr.data.data as Prefs);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function saveProfile() {
    setProfileMsg(null);
    try {
      const r = await api.put('/auth/profile', { name, company_name: company });
      if (r.data?.success) {
        setProfileMsg({ kind: 'ok', text: 'Profile saved' });
        if (refreshUser) await refreshUser();
      } else {
        setProfileMsg({ kind: 'err', text: r.data?.error || 'Failed to save' });
      }
    } catch (e: any) {
      setProfileMsg({ kind: 'err', text: e?.response?.data?.error || e.message });
    }
  }

  async function savePrefs() {
    if (!prefs) return;
    setPrefsMsg(null);
    try {
      const r = await api.put('/auth/preferences', prefs);
      if (r.data?.success) {
        setPrefsMsg({ kind: 'ok', text: 'Preferences saved' });
        setPrefs(r.data.data as Prefs);
      } else {
        setPrefsMsg({ kind: 'err', text: r.data?.error || 'Failed to save' });
      }
    } catch (e: any) {
      setPrefsMsg({ kind: 'err', text: e?.response?.data?.error || e.message });
    }
  }

  async function changePassword() {
    setPwMsg(null);
    if (!currentPw || !newPw) {
      setPwMsg({ kind: 'err', text: 'Enter current and new password' });
      return;
    }
    if (newPw.length < 8) {
      setPwMsg({ kind: 'err', text: 'New password must be at least 8 characters' });
      return;
    }
    try {
      const r = await api.post('/auth/change-password', { current_password: currentPw, new_password: newPw });
      if (r.data?.success) {
        setCurrentPw(''); setNewPw('');
        setPwMsg({ kind: 'ok', text: 'Password changed — other sessions revoked' });
      } else {
        setPwMsg({ kind: 'err', text: r.data?.error || 'Failed' });
      }
    } catch (e: any) {
      setPwMsg({ kind: 'err', text: e?.response?.data?.error || e.message });
    }
  }

  const toggle = (key: keyof Prefs) => {
    if (!prefs) return;
    setPrefs({ ...prefs, [key]: prefs[key] ? 0 : 1 });
  };

  if (loading) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const notifCount = prefs
    ? [prefs.notify_email_contracts, prefs.notify_email_settlement, prefs.notify_email_covenants, prefs.notify_email_lois, prefs.notify_in_app]
        .filter(Boolean).length
    : 0;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>
      {/* LEFT COLUMN */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>Settings</h1>
          <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>
            Profile, preferences and security for{' '}
            <span style={{ fontFamily: MONO, color: TX1 }}>{user?.email}</span>
          </p>
        </div>

        {/* Profile */}
        <SectionCard icon={User} title="Profile">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <FieldLabel>Full name</FieldLabel>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ ...inputStyle, maxWidth: 400 }}
              />
            </div>
            <div>
              <FieldLabel>Company</FieldLabel>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                style={{ ...inputStyle, maxWidth: 400 }}
              />
            </div>
            <div>
              <FieldLabel>Email (read-only)</FieldLabel>
              <input
                value={user?.email || ''}
                readOnly
                style={{ ...readonlyInputStyle, maxWidth: 400 }}
              />
            </div>
            <div>
              <FieldLabel>Role (read-only)</FieldLabel>
              <input
                value={user?.role || ''}
                readOnly
                style={{ ...readonlyInputStyle, maxWidth: 400, fontFamily: MONO }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
              <button
                type="button"
                onClick={saveProfile}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: ACC, color: '#fff', border: 'none',
                  padding: '8px 16px', borderRadius: 6, fontWeight: 600,
                  cursor: 'pointer', fontSize: 13,
                }}
              >
                <Save size={14} /> Save profile
              </button>
              <Msg msg={profileMsg} />
            </div>
          </div>
        </SectionCard>

        {/* Notification Preferences */}
        <SectionCard icon={Bell} title="Notification preferences">
          {prefs && (
            <div>
              <PrefRow
                label="Contract signed / countersigned"
                on={!!prefs.notify_email_contracts}
                onChange={() => toggle('notify_email_contracts')}
              />
              <PrefRow
                label="Settlement — invoice paid / dispute raised"
                on={!!prefs.notify_email_settlement}
                onChange={() => toggle('notify_email_settlement')}
              />
              <PrefRow
                label="Covenant breach / near-breach (lenders)"
                on={!!prefs.notify_email_covenants}
                onChange={() => toggle('notify_email_covenants')}
              />
              <PrefRow
                label="LOI received / accepted / declined"
                on={!!prefs.notify_email_lois}
                onChange={() => toggle('notify_email_lois')}
              />
              <PrefRow
                label="In-app toasts (all events)"
                on={!!prefs.notify_in_app}
                onChange={() => toggle('notify_in_app')}
              />

              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                margin: '16px 0 12px',
                fontSize: 11, color: TX3, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                <Globe size={12} /> Regional
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <LabelInput label="Locale" value={prefs.locale} onChange={(v) => setPrefs({ ...prefs, locale: v })} />
                <LabelInput label="Currency" value={prefs.currency} onChange={(v) => setPrefs({ ...prefs, currency: v })} />
                <LabelInput label="Timezone" value={prefs.timezone} onChange={(v) => setPrefs({ ...prefs, timezone: v })} />
                <LabelInput label="Date format" value={prefs.date_format} onChange={(v) => setPrefs({ ...prefs, date_format: v })} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={savePrefs}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: ACC, color: '#fff', border: 'none',
                    padding: '8px 16px', borderRadius: 6, fontWeight: 600,
                    cursor: 'pointer', fontSize: 13,
                  }}
                >
                  <Save size={14} /> Save preferences
                </button>
                <Msg msg={prefsMsg} />
              </div>
            </div>
          )}
        </SectionCard>

        {/* Password */}
        <SectionCard icon={Lock} title="Change password">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <FieldLabel>Current password</FieldLabel>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                style={{ ...inputStyle, maxWidth: 400 }}
              />
            </div>
            <div>
              <FieldLabel>New password</FieldLabel>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                style={{ ...inputStyle, maxWidth: 400 }}
              />
              <div style={{ fontSize: 11, color: TX3, marginTop: 4 }}>
                Changing your password revokes all other active sessions.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
              <button
                type="button"
                onClick={changePassword}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: ACC, color: '#fff', border: 'none',
                  padding: '8px 16px', borderRadius: 6, fontWeight: 600,
                  cursor: 'pointer', fontSize: 13,
                }}
              >
                <Save size={14} /> Change password
              </button>
              <Msg msg={pwMsg} />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* RIGHT COLUMN */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Account summary */}
        <div style={{
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
            Account
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: TX3, marginBottom: 2 }}>Email</div>
              <div style={{ fontSize: 13, color: TX1, fontFamily: MONO, wordBreak: 'break-all' }}>{user?.email}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: TX3, marginBottom: 2 }}>Role</div>
              <div style={{ fontSize: 13, color: TX1, fontFamily: MONO }}>{user?.role}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: TX3, marginBottom: 2 }}>Display name</div>
              <div style={{ fontSize: 13, color: name ? TX1 : TX3 }}>{name || '—'}</div>
            </div>
            {company && (
              <div>
                <div style={{ fontSize: 11, color: TX3, marginBottom: 2 }}>Company</div>
                <div style={{ fontSize: 13, color: TX1 }}>{company}</div>
              </div>
            )}
          </div>
        </div>

        {/* Notifications summary */}
        <div style={{
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
            Notifications
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: TX1, fontFamily: MONO }}>
            {notifCount}<span style={{ fontSize: 13, color: TX3, fontWeight: 400, marginLeft: 6 }}>/ 5 active</span>
          </div>
          <div style={{ fontSize: 12, color: TX3, marginTop: 4 }}>
            {notifCount === 0 ? 'All notifications off' : notifCount === 5 ? 'All channels enabled' : 'Some channels enabled'}
          </div>
          {prefs && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { key: 'notify_email_contracts' as const, label: 'Contracts' },
                { key: 'notify_email_settlement' as const, label: 'Settlement' },
                { key: 'notify_email_covenants' as const, label: 'Covenants' },
                { key: 'notify_email_lois' as const, label: 'LOIs' },
                { key: 'notify_in_app' as const, label: 'In-app' },
              ].map(({ key, label }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: TX2 }}>{label}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: prefs[key] ? GOOD : TX3,
                    background: prefs[key] ? GOOD_BG : BG2,
                    padding: '2px 7px', borderRadius: 10,
                  }}>
                    {prefs[key] ? 'ON' : 'OFF'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Regional summary */}
        {prefs && (
          <div style={{
            background: BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: '16px 20px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
              Regional
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Locale', value: prefs.locale },
                { label: 'Currency', value: prefs.currency },
                { label: 'Timezone', value: prefs.timezone },
                { label: 'Date format', value: prefs.date_format },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: TX3 }}>{label}</span>
                  <span style={{ fontSize: 12, color: TX1, fontFamily: MONO }}>{value || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security */}
        <div style={{
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '16px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <ShieldCheck size={14} style={{ color: TX2 }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Security
            </div>
          </div>
          <p style={{ fontSize: 12, color: TX2, margin: '0 0 12px', lineHeight: 1.5 }}>
            Two-factor authentication (TOTP), active sessions, and backup codes.
          </p>
          <button
            type="button"
            onClick={() => navigate('/settings/security')}
            style={{
              width: '100%',
              background: 'transparent',
              color: ACC,
              border: `1px solid ${ACC}`,
              padding: '8px 16px',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Open security settings
          </button>
        </div>
      </div>
    </div>
  );
}
