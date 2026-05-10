import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../context/AuthContext';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialToken = params.get('token') || '';
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { token, new_password: password });
      if (res.data?.success) {
        setDone(true);
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError(res.data?.error || 'Reset failed');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f5f8fb' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border p-8" style={{ borderColor: '#dde4ec' }}>
        <h2 className="text-[24px] font-bold" style={{ color: '#0f1c2e' }}>Reset password</h2>
        <p className="mt-1 text-[13px]" style={{ color: '#6b7685' }}>Enter your new password below.</p>

        {done ? (
          <div className="mt-6 rounded-lg border px-3 py-3 text-[13px]" style={{ background: '#ebf7ef', borderColor: '#9ec9a8', color: '#0e6027' }}>
            Password reset. Redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg border px-3 py-2 text-[13px]" style={{ background: '#fde0db', borderColor: '#e8a59b', color: '#c0392b' }}>
                {error}
              </div>
            )}
            <div>
              <label className="label">Reset token</label>
              <input type="text" required value={token} onChange={(e) => setToken(e.target.value)} className="input font-mono text-[12px]" placeholder="Paste token from email" />
            </div>
            <div>
              <label className="label">New password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="label">Confirm password</label>
              <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
            <div className="text-center">
              <Link to="/login" className="text-[13px] font-semibold" style={{ color: '#3b82c4' }}>Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
