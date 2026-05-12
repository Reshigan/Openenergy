import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../context/AuthContext';

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
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f5f8fb' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border p-8" style={{ borderColor: '#dde4ec' }}>
        <h2 className="text-[24px] font-bold" style={{ color: '#0f1c2e' }}>Forgot password</h2>
        <p className="mt-1 text-[13px]" style={{ color: '#525a66' }}>
          Enter your account email. We'll send a reset link.
        </p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border px-3 py-2 text-[13px]" style={{ background: '#ebf7ef', borderColor: '#9ec9a8', color: '#0e6027' }}>
              If that email exists, a reset link has been dispatched.
            </div>
            <div className="rounded-lg border px-3 py-3 text-[12px]" style={{ background: '#fff7e0', borderColor: '#e8c66c', color: '#6a4e00' }}>
              Until a mail provider is wired, an administrator can issue you a one-time reset link via
              <span className="font-mono"> POST /api/auth/admin/reset-link</span> (admin-authenticated).
            </div>
            <Link to="/login" className="btn btn-secondary w-full">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg border px-3 py-2 text-[13px]" style={{ background: '#fde0db', borderColor: '#e8a59b', color: '#c0392b' }}>
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
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <div className="text-center">
              <Link to="/login" className="text-[13px] font-semibold inline-block px-2 py-1" style={{ color: '#1a3a5c' }}>Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
