import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../context/AuthContext';

const BG      = 'var(--s0, oklch(0.96 0.003 250))';
const BG1     = 'var(--s1, oklch(0.99 0.002 80))';
const BORDER  = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1     = 'var(--ink, oklch(0.17 0.010 250))';
const TX2     = 'var(--ink-2, oklch(0.40 0.009 250))';
const ACC     = 'var(--accent, oklch(0.46 0.16 55))';
const BAD     = 'var(--bad, oklch(0.48 0.20 20))';
const BAD_BG  = 'color-mix(in oklab, var(--bad) 15%, var(--s1))';
const BAD_BDR = 'oklch(0.85 0.08 20)';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      if (res.data?.success) {
        setSent(true);
      } else {
        setError(res.data?.error || 'Request failed');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: BG }}>
      <div className="w-full max-w-md rounded-2xl shadow-sm border p-8" style={{ background: BG1, borderColor: BORDER }}>
        <h2 className="text-[24px] font-bold" style={{ color: TX1 }}>Forgot password</h2>
        <p className="mt-1 text-[13px]" style={{ color: TX2 }}>
          Enter your account email. We'll send a reset link.
        </p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border px-3 py-2 text-[13px]" style={{ background: 'color-mix(in oklab, var(--good) 15%, var(--s1))', borderColor: 'oklch(0.75 0.10 150)', color: 'oklch(0.30 0.12 150)' }}>
              If that email exists, a reset link has been dispatched.
            </div>
            <div className="rounded-lg border px-3 py-3 text-[12px]" style={{ background: 'oklch(0.97 0.04 80)', borderColor: 'oklch(0.82 0.10 70)', color: 'oklch(0.35 0.10 60)' }}>
              Until a mail provider is wired, an administrator can issue you a one-time reset link via
              <span className="font-mono"> POST /api/auth/admin/reset-link</span> (admin-authenticated).
            </div>
            <Link to="/login" className="btn btn-secondary w-full">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg border px-3 py-2 text-[13px]" style={{ background: BAD_BG, borderColor: BAD_BDR, color: BAD }}>
                {error}
              </div>
            )}
            <div>
              <label className="label" htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="w-full h-10 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: ACC }}
              disabled={loading}
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <div className="text-center">
              <Link to="/login" className="text-[13px] font-semibold inline-block px-2 py-1" style={{ color: ACC }}>Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
