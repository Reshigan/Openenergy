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
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-ionex-text-mute">Profile, preferences and security for {user?.email}</p>
      </div>

      {/* Profile */}
      <section className="bg-white border border-ionex-border-soft rounded-xl">
        <header className="px-5 py-4 border-b border-ionex-border-soft flex items-center gap-2">
          <User className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold">Profile</h2>
        </header>
        <div className="p-5 space-y-3 text-sm">
          <div>
            <label className="block text-xs text-ionex-text-mute mb-1">Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full max-w-md border border-ionex-border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-ionex-text-mute mb-1">Company</label>
            <input value={company} onChange={(e) => setCompany(e.target.value)}
              className="w-full max-w-md border border-ionex-border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-ionex-text-mute mb-1">Email (read-only)</label>
            <input value={user?.email || ''} readOnly
              className="w-full max-w-md border border-ionex-border-soft bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-600" />
          </div>
          <div>
            <label className="block text-xs text-ionex-text-mute mb-1">Role (read-only)</label>
            <input value={user?.role || ''} readOnly
              className="w-full max-w-md border border-ionex-border-soft bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-600" />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button onClick={saveProfile}
              className="flex items-center gap-1 px-4 py-2 bg-ionex-brand text-white rounded-lg text-sm hover:bg-ionex-brand-deep">
              <Save className="w-4 h-4" /> Save profile
            </button>
            {profileMsg && (
              <span className={profileMsg.kind === 'ok' ? 'text-green-700 text-xs' : 'text-red-700 text-xs'}>
                {profileMsg.text}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section className="bg-white border border-ionex-border-soft rounded-xl">
        <header className="px-5 py-4 border-b border-ionex-border-soft flex items-center gap-2">
          <Bell className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold">Notification preferences</h2>
        </header>
        <div className="p-5 space-y-3 text-sm">
          {prefs && (
            <>
              <PrefRow label="Contract signed / countersigned"
                on={!!prefs.notify_email_contracts} onChange={() => toggle('notify_email_contracts')} />
              <PrefRow label="Settlement — invoice paid / dispute raised"
                on={!!prefs.notify_email_settlement} onChange={() => toggle('notify_email_settlement')} />
              <PrefRow label="Covenant breach / near-breach (lenders)"
                on={!!prefs.notify_email_covenants} onChange={() => toggle('notify_email_covenants')} />
              <PrefRow label="LOI received / accepted / declined"
                on={!!prefs.notify_email_lois} onChange={() => toggle('notify_email_lois')} />
              <PrefRow label="In-app toasts (all events)"
                on={!!prefs.notify_in_app} onChange={() => toggle('notify_in_app')} />
              <hr className="my-2 border-ionex-border-soft" />
              <div className="flex items-center gap-2 text-xs text-ionex-text-mute">
                <Globe className="w-3.5 h-3.5" /> Regional
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <LabelInput label="Locale" value={prefs.locale} onChange={(v) => setPrefs({ ...prefs, locale: v })} />
                <LabelInput label="Currency" value={prefs.currency} onChange={(v) => setPrefs({ ...prefs, currency: v })} />
                <LabelInput label="Timezone" value={prefs.timezone} onChange={(v) => setPrefs({ ...prefs, timezone: v })} />
                <LabelInput label="Date format" value={prefs.date_format} onChange={(v) => setPrefs({ ...prefs, date_format: v })} />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button onClick={savePrefs}
                  className="flex items-center gap-1 px-4 py-2 bg-ionex-brand text-white rounded-lg text-sm hover:bg-ionex-brand-deep">
                  <Save className="w-4 h-4" /> Save preferences
                </button>
                {prefsMsg && (
                  <span className={prefsMsg.kind === 'ok' ? 'text-green-700 text-xs' : 'text-red-700 text-xs'}>
                    {prefsMsg.text}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Password */}
      <section className="bg-white border border-ionex-border-soft rounded-xl">
        <header className="px-5 py-4 border-b border-ionex-border-soft flex items-center gap-2">
          <Lock className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold">Change password</h2>
        </header>
        <div className="p-5 space-y-3 text-sm">
          <div>
            <label className="block text-xs text-ionex-text-mute mb-1">Current password</label>
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full max-w-md border border-ionex-border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-ionex-text-mute mb-1">New password</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
              className="w-full max-w-md border border-ionex-border rounded-md px-3 py-2 text-sm" />
            <p className="text-[11px] text-ionex-text-mute mt-1">
              Changing your password revokes all other active sessions.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button onClick={changePassword}
              className="flex items-center gap-1 px-4 py-2 bg-ionex-brand text-white rounded-lg text-sm hover:bg-ionex-brand-deep">
              <Save className="w-4 h-4" /> Change password
            </button>
            {pwMsg && (
              <span className={pwMsg.kind === 'ok' ? 'text-green-700 text-xs' : 'text-red-700 text-xs'}>
                {pwMsg.text}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Security link */}
      <section className="bg-white border border-ionex-border-soft rounded-xl">
        <header className="px-5 py-4 border-b border-ionex-border-soft flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold">Security</h2>
        </header>
        <div className="p-5 text-sm">
          <p className="mb-3 text-ionex-text-sub">
            Two-factor authentication (TOTP), active sessions, and backup codes live on the security page.
          </p>
          <button onClick={() => navigate('/settings/security')}
            className="px-4 py-2 border border-ionex-brand text-ionex-brand rounded-lg text-sm hover:bg-ionex-brand hover:text-white">
            Open security settings
          </button>
        </div>
      </section>
    </div>
  );
}

function PrefRow({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
      <span className="text-sm text-gray-800">{label}</span>
      <button
        type="button"
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-ionex-brand' : 'bg-gray-300'}`}
        aria-pressed={on}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </label>
  );
}

function LabelInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-ionex-text-mute mb-1">{label}</label>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-ionex-border rounded-md px-3 py-2 text-sm" />
    </div>
  );
}
