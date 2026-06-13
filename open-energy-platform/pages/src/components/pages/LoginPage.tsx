import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/useAuth';
import { api } from '../../lib/api';
import { LogoMark } from '../Logo';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  // Dark brand panel
  brandBg:     'oklch(0.11 0.014 250)',
  brandBg2:    'oklch(0.14 0.015 250)',
  brandText:   'oklch(0.98 0.002 250)',
  brandSubtle: 'oklch(0.65 0.008 250)',
  brandAccent: 'oklch(0.75 0.13 55)',   // platform amber, lifted for dark bg
  brandAmber:  'oklch(0.72 0.14 55)',
  // Form panel
  panelBg:  'oklch(0.99 0.002 80)',
  text1:    'oklch(0.17 0.010 250)',
  text2:    'oklch(0.40 0.009 250)',
  text3:    'oklch(0.60 0.008 250)',
  border:   'oklch(0.88 0.006 250)',
  accent:   'oklch(0.46 0.16 55)',
  inputBg:  'oklch(0.97 0.003 250)',
  errorBg:  'oklch(0.97 0.04 20)',
  errorFg:  'oklch(0.45 0.20 20)',
  errorBd:  'oklch(0.75 0.12 20)',
} as const;

// ─── Persona data (compact, 11 roles + IPP variant) ──────────────────────────
interface Persona {
  email: string;
  label: string;
  short: string;  // 2-letter initials
  accent: string;
  group: string;
}

const PERSONAS: Persona[] = [
  { email: 'ipp@openenergy.co.za',       label: 'Solar IPP',      short: 'SI', accent: 'oklch(0.46 0.16 55)',  group: 'Producers' },
  { email: 'wind@openenergy.co.za',      label: 'Wind IPP',       short: 'WI', accent: 'oklch(0.46 0.16 55)',  group: 'Producers' },
  { email: 'esco@openenergy.co.za',      label: 'ESCO / O&M',     short: 'OM', accent: 'oklch(0.46 0.14 160)', group: 'Producers' },
  { email: 'epc@openenergy.co.za',       label: 'EPC Contractor', short: 'EP', accent: 'oklch(0.48 0.14 40)',  group: 'Producers' },
  { email: 'trader@openenergy.co.za',    label: 'Trader',         short: 'TR', accent: 'oklch(0.46 0.16 250)', group: 'Markets' },
  { email: 'carbon@openenergy.co.za',    label: 'Carbon',         short: 'CF', accent: 'oklch(0.46 0.16 145)', group: 'Markets' },
  { email: 'offtaker@openenergy.co.za',  label: 'Offtaker',       short: 'OT', accent: 'oklch(0.46 0.14 200)', group: 'Markets' },
  { email: 'lender@openenergy.co.za',    label: 'Lender',         short: 'LN', accent: 'oklch(0.46 0.16 280)', group: 'Capital' },
  { email: 'grid@openenergy.co.za',      label: 'Grid Operator',  short: 'GO', accent: 'oklch(0.46 0.14 220)', group: 'Grid' },
  { email: 'regulator@openenergy.co.za', label: 'Regulator',      short: 'RG', accent: 'oklch(0.40 0.12 5)',   group: 'Oversight' },
  { email: 'admin@openenergy.co.za',     label: 'Admin',          short: 'AD', accent: 'oklch(0.30 0.015 250)', group: 'Oversight' },
];

// ─── Animated energy node (pure CSS — no JS animation) ────────────────────────
function EnergyNode({ cx, cy, r, delay, color }: { cx: number; cy: number; r: number; delay: number; color: string }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={color}
      opacity={0.18}
      style={{
        animation: `oe-pulse 4s ease-in-out infinite`,
        animationDelay: `${delay}s`,
      }}
    />
  );
}

// ─── Brand panel ──────────────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div
      style={{
        position: 'relative',
        background: `radial-gradient(ellipse at 20% 20%, oklch(0.20 0.05 250) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, oklch(0.18 0.04 55) 0%, transparent 50%), ${T.brandBg}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '40px 48px',
        overflow: 'hidden',
        color: T.brandText,
      }}
    >
      {/* Animated energy mesh */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 600 800"
      >
        <style>{`
          @keyframes oe-pulse {
            0%, 100% { opacity: 0.06; r: var(--r-start, 40); }
            50% { opacity: 0.22; r: var(--r-end, 55); }
          }
          @keyframes oe-drift {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(12px, -8px); }
            66% { transform: translate(-8px, 14px); }
          }
        `}</style>
        <g style={{ animation: 'oe-drift 14s ease-in-out infinite' }}>
          <EnergyNode cx={120} cy={180} r={60} delay={0}   color={T.brandAccent} />
          <EnergyNode cx={480} cy={120} r={45} delay={1.2} color={T.brandAmber} />
          <EnergyNode cx={300} cy={400} r={80} delay={0.6} color={T.brandAccent} />
          <EnergyNode cx={80}  cy={600} r={40} delay={2.1} color={T.brandAmber} />
          <EnergyNode cx={520} cy={650} r={55} delay={1.7} color={T.brandAccent} />
          <line x1="120" y1="180" x2="480" y2="120" stroke={T.brandAccent} strokeWidth="0.5" opacity="0.15" />
          <line x1="480" y1="120" x2="300" y2="400" stroke={T.brandAccent} strokeWidth="0.5" opacity="0.10" />
          <line x1="120" y1="180" x2="300" y2="400" stroke={T.brandAmber}   strokeWidth="0.5" opacity="0.10" />
          <line x1="300" y1="400" x2="80"  y2="600" stroke={T.brandAccent} strokeWidth="0.5" opacity="0.10" />
          <line x1="300" y1="400" x2="520" y2="650" stroke={T.brandAmber}   strokeWidth="0.5" opacity="0.08" />
        </g>
      </svg>

      {/* Logo + wordmark */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              background: 'rgba(255,255,255,0.95)',
              borderRadius: 10,
              padding: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.30)',
            }}
          >
            <LogoMark size={36} variant="colour" />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.brandText, letterSpacing: '0.06em', lineHeight: 1.1, fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }}>
              CEC<span style={{ color: T.brandAccent }}>/</span>
            </div>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', color: T.brandSubtle, textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace' }}>
              Consolidated Energy Cockpit · Vanta X
            </div>
          </div>
        </div>
      </div>

      {/* Main headline */}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 460 }}>
        <h1
          style={{
            fontSize: 'clamp(32px, 3.5vw, 50px)',
            fontWeight: 800,
            lineHeight: 1.06,
            letterSpacing: '-0.03em',
            margin: 0,
            color: T.brandText,
          }}
        >
          South Africa's{' '}
          <em style={{ fontStyle: 'normal', color: T.brandAccent }}>
            unified energy exchange
          </em>
          .
        </h1>
        <p style={{ marginTop: 16, color: T.brandSubtle, fontSize: 15, lineHeight: 1.6, maxWidth: 380 }}>
          Trade power, carbon and RECs, originate IPP projects, run procurement, and settle — all on one platform.
        </p>

        {/* Platform stats */}
        <div style={{ display: 'flex', gap: 32, marginTop: 24, flexWrap: 'wrap' }}>
          {[
            { value: '76', label: 'Workflow chains' },
            { value: '9', label: 'Roles' },
            { value: 'NERSA', label: 'Grid Code aligned' },
            { value: 'POPIA', label: 'Compliant' },
          ].map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.brandText, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 10.5, color: T.brandSubtle, marginTop: 2, letterSpacing: '0.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Live event strip */}
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: 'COD gate · Karoo Wind 1',        note: '2 sign-offs pending',        dot: T.brandAmber },
            { label: 'DSCR covenant breach',            note: 'Lender notification sent',   dot: '#c97a14' },
            { label: 'W64 PTW live-electrical issued',  note: '4h 20m remaining',           dot: T.brandAccent },
          ].map((ev) => (
            <div
              key={ev.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: ev.dot, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.88)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</span>
                <span style={{ fontSize: 10, color: T.brandSubtle, fontFamily: 'ui-monospace, monospace' }}>{ev.note}</span>
              </div>
            </div>
          ))}
          <p style={{ fontSize: 10, color: 'oklch(0.38 0.006 250)', fontFamily: 'ui-monospace, monospace', marginTop: 4, paddingLeft: 4 }}>
            Activity feed · 11 roles · national scale
          </p>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', zIndex: 1, fontSize: 11, color: 'oklch(0.38 0.006 250)' }}>
        © {new Date().getFullYear()} Consolidated Energy Cockpit · Vanta X Holdings
      </div>
    </div>
  );
}

// ─── Persona chip ─────────────────────────────────────────────────────────────
function PersonaChip({ persona, onPick }: { persona: Persona; onPick: (email: string) => void }) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => onPick(persona.email)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      aria-label={`Sign in as ${persona.label} demo`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${hov ? persona.accent : T.border}`,
        background: hov ? `${persona.accent}12` : T.panelBg,
        cursor: 'pointer',
        transition: 'border-color 130ms, background 130ms',
        flex: '1 1 150px',
        minWidth: 0,
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 9,
          background: `${persona.accent}22`,
          color: persona.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 700,
          fontFamily: 'ui-monospace, monospace',
          flexShrink: 0,
        }}
      >
        {persona.short}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text1, textAlign: 'left', lineHeight: 1.25 }}>
        {persona.label}
      </span>
    </button>
  );
}

// ─── Main login page ─────────────────────────────────────────────────────────
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [mfaCode, setMfaCode]       = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    api.get('/auth/sso/config').then((r) => {
      if (r.data?.success && r.data?.data?.enabled) setSsoEnabled(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ssoError = params.get('sso_error');
    if (!ssoError) return;
    const msgMap: Record<string, string> = {
      missing_code:     'Microsoft sign-in was cancelled.',
      expired_state:    'Microsoft sign-in session expired. Please try again.',
      token_exchange:   'Could not exchange Microsoft authorization code.',
      bad_issuer:       'Microsoft token failed issuer check.',
      bad_audience:     'Microsoft token was issued for a different application.',
      nonce_mismatch:   'Microsoft sign-in anti-replay check failed.',
      bad_signature:    'Microsoft token signature invalid.',
      expired_id_token: 'Microsoft token has expired.',
      no_email:         'Microsoft account did not return an email.',
      account_suspended:'Your account is suspended. Contact support.',
      account_rejected: 'Your account has been rejected. Contact support.',
    };
    setError(msgMap[ssoError] || `Microsoft sign-in failed (${ssoError}).`);
  }, [location.search]);

  const handleMicrosoftSso = async () => {
    setError('');
    setSsoLoading(true);
    try {
      const r = await api.post('/auth/sso/microsoft/start', { return_to: '/feed' });
      if (r.data?.success && r.data?.data?.redirect_url) {
        window.location.href = r.data.data.redirect_url;
        return;
      }
      setError('Could not start Microsoft sign-in.');
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { error?: string } }; message?: string };
      setError(anyErr?.response?.data?.error || anyErr?.message || 'Microsoft sign-in unavailable');
    } finally {
      setSsoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, mfaRequired ? mfaCode : undefined);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/feed';
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const anyErr = err as { name?: string; message?: string };
      if (anyErr?.name === 'MfaRequiredError') {
        setMfaRequired(true);
        setError('Enter the 6-digit code from your authenticator app.');
      } else {
        setError(anyErr?.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Demo@2024!');
    setMfaRequired(false);
    setError('');
  };

  // Group personas
  const groups = [
    { label: 'Producers', items: PERSONAS.filter((p) => p.group === 'Producers') },
    { label: 'Markets',   items: PERSONAS.filter((p) => p.group === 'Markets')   },
    { label: 'Capital',   items: PERSONAS.filter((p) => p.group === 'Capital')   },
    { label: 'Grid',      items: PERSONAS.filter((p) => p.group === 'Grid')      },
    { label: 'Oversight', items: PERSONAS.filter((p) => p.group === 'Oversight') },
  ].filter((g) => g.items.length > 0);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
      }}
    >
      <style>{`
        @media (min-width: 1024px) {
          .oe-login-grid { grid-template-columns: 1.15fr 0.85fr !important; }
        }
        @keyframes oe-pulse {
          0%, 100% { opacity: 0.06; }
          50% { opacity: 0.22; }
        }
      `}</style>
      <div
        className="oe-login-grid"
        style={{
          minHeight: '100dvh',
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr)',
          background: T.panelBg,
        }}
      >
        {/* Brand panel — only on lg+ */}
        <div className="oe-brand-panel" style={{ display: 'none' }}>
          <style>{`@media (min-width: 1024px) { .oe-brand-panel { display: block !important; } }`}</style>
          <BrandPanel />
        </div>

        {/* Form panel */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 24px',
            background: T.panelBg,
            minHeight: '100dvh',
          }}
        >
          <div style={{ width: '100%', maxWidth: 420 }}>
            {/* Mobile logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
              <LogoMark size={32} variant="colour" />
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text1, letterSpacing: '-0.02em' }}>
                Consolidated Energy Cockpit
              </div>
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                color: T.text1,
                lineHeight: 1.1,
              }}
            >
              Sign in
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: T.text2, lineHeight: 1.5 }}>
              Welcome back to the Consolidated Energy Cockpit.
            </p>

            {/* Error */}
            {error && (
              <div
                role="alert"
                aria-live="polite"
                style={{
                  marginTop: 16,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: T.errorBg,
                  border: `1px solid ${T.errorBd}`,
                  color: T.errorFg,
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
              >
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ marginTop: 20 }} noValidate>
              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label
                  htmlFor="lp-email"
                  style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.text2, marginBottom: 5, letterSpacing: '0.02em' }}
                >
                  Email
                </label>
                <input
                  ref={emailRef}
                  id="lp-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@openenergy.co.za"
                  required
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${T.border}`,
                    background: T.inputBg,
                    color: T.text1,
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 150ms',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = T.accent)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = T.border)}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <label
                    htmlFor="lp-password"
                    style={{ fontSize: 12, fontWeight: 600, color: T.text2, letterSpacing: '0.02em' }}
                  >
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    style={{ fontSize: 12, fontWeight: 600, color: T.accent, textDecoration: 'none' }}
                  >
                    Forgot?
                  </Link>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    id="lp-password"
                    name="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '10px 40px 10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${T.border}`,
                      background: T.inputBg,
                      color: T.text1,
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 150ms',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = T.accent)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = T.border)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: T.text3,
                      padding: 4,
                      lineHeight: 1,
                      fontSize: 12,
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  >
                    {showPw ? 'hide' : 'show'}
                  </button>
                </div>
              </div>

              {/* MFA */}
              {mfaRequired && (
                <div style={{ marginBottom: 20 }}>
                  <label
                    htmlFor="lp-mfa"
                    style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.text2, marginBottom: 5 }}
                  >
                    Authenticator code
                  </label>
                  <input
                    id="lp-mfa"
                    name="mfa_code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="123456"
                    autoFocus
                    required
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${T.border}`,
                      background: T.inputBg,
                      color: T.text1,
                      fontSize: 20,
                      letterSpacing: '0.4em',
                      textAlign: 'center',
                      fontFamily: 'ui-monospace, monospace',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = T.accent)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = T.border)}
                  />
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '11px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: loading ? 'oklch(0.35 0.010 250)' : T.text1,
                  color: T.panelBg,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background 150ms, transform 100ms',
                  letterSpacing: '-0.01em',
                }}
                onMouseDown={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)'; }}
                onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
              >
                {loading ? (
                  <>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#ffffff',
                        borderRadius: '50%',
                        animation: 'spin 0.7s linear infinite',
                        display: 'inline-block',
                      }}
                    />
                    Signing in…
                  </>
                ) : (
                  'Sign in →'
                )}
              </button>
            </form>

            {/* SSO */}
            {ssoEnabled && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
                  <div style={{ flex: 1, height: 1, background: T.border }} />
                  <span style={{ fontSize: 11, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace, monospace' }}>or</span>
                  <div style={{ flex: 1, height: 1, background: T.border }} />
                </div>
                <button
                  type="button"
                  onClick={handleMicrosoftSso}
                  disabled={ssoLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: `1px solid ${T.border}`,
                    background: T.panelBg,
                    color: T.text1,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: ssoLoading ? 'not-allowed' : 'pointer',
                    transition: 'background 140ms',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.inputBg; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.panelBg; }}
                >
                  <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
                    <rect x="1"  y="1"  width="9" height="9" fill="#f25022" />
                    <rect x="11" y="1"  width="9" height="9" fill="#7fba00" />
                    <rect x="1"  y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                  </svg>
                  {ssoLoading ? 'Opening Microsoft…' : 'Sign in with Microsoft'}
                </button>
              </>
            )}

            {/* Demo personas */}
            <div style={{ margin: '22px 0 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 1, background: T.border }} />
                <span style={{ fontSize: 10.5, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>
                  demo personas
                </span>
                <div style={{ flex: 1, height: 1, background: T.border }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {groups.map((g) => (
                  <div key={g.label}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{g.label}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {g.items.map((p) => (
                        <PersonaChip key={p.email} persona={p} onPick={fillDemo} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: 10, fontSize: 11, color: T.text3, textAlign: 'center', fontFamily: 'ui-monospace, monospace' }}>
                All demo accounts · <span style={{ color: T.accent }}>Demo@2024!</span>
              </p>
            </div>

            {/* Register link */}
            <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: T.text2 }}>
              No account?{' '}
              <Link to="/register" style={{ color: T.accent, fontWeight: 600, textDecoration: 'none' }}>
                Request access
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Keyframe for button spinner */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
