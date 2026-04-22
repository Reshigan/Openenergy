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
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f5f6f7' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border p-8" style={{ borderColor: '#e5e5e5' }}>
        <h2 className="text-[24px] font-bold" style={{ color: '#32363a' }}>Forgot password</h2>
        <p className="mt-1 text-[13px]" style={{ color: '#6a6d70' }}>
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
              <div className="rounded-lg border px-3 py-2 text-[13px]" style={{ background: '#ffebeb', borderColor: '#e9a2a2', color: '#bb0000' }}>
                {error}
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoFocus />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <div className="text-center">
              <Link to="/login" className="text-[13px] font-semibold" style={{ color: '#0a6ed1' }}>Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
