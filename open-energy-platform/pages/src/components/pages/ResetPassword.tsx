import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../context/AuthContext';

const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const BAD_BDR = 'oklch(0.85 0.08 20)';

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
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: BG }}>
      <div className="w-full max-w-md rounded-2xl shadow-sm border p-8" style={{ background: BG1, borderColor: BORDER }}>
        <h2 className="text-[24px] font-bold" style={{ color: TX1 }}>Reset password</h2>
        <p className="mt-1 text-[13px]" style={{ color: TX2 }}>Enter your new password below.</p>

        {done ? (
          <div className="mt-6 rounded-lg border px-3 py-3 text-[13px]" style={{ background: 'oklch(0.96 0.05 150)', borderColor: 'oklch(0.75 0.10 150)', color: 'oklch(0.30 0.12 150)' }}>
            Password reset. Redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg border px-3 py-2 text-[13px]" style={{ background: BAD_BG, borderColor: BAD_BDR, color: BAD }}>
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
            <button
              type="submit"
              className="w-full h-10 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: ACC }}
              disabled={loading}
            >
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
            <div className="text-center">
              <Link to="/login" className="text-[13px] font-semibold" style={{ color: ACC }}>Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
