import { useState } from 'react';
import { motion } from 'motion/react';
import { api, session } from './api';
import { Concierge } from './Concierge';
import { PrimaryButton, Spinner } from './ui';

// Login gate → Concierge. Prefilled with the worked persona (Thabo / Goldrush)
// so the demo lands in one keystroke; password stays empty.

export function App() {
  const [ready, setReady] = useState(!!session.token());
  const [email, setEmail] = useState('demo@goldrush.co.za');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.login(email.trim(), password);
      session.set(r.token, r.participant?.name || 'there');
      setReady(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (ready) return <Concierge />;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="mb-7">
          <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">CEC · Concierge</div>
          <h1 className="mt-2 text-[26px] font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-[15px] text-muted">Sign in to sort out your energy in a few clicks.</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.co.za"
            className="field w-full px-4 py-3 text-[15px]"
            autoComplete="username"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="field w-full px-4 py-3 text-[15px]"
            autoComplete="current-password"
          />
          {error && <p className="text-[14px] text-amber">{error}</p>}
          <PrimaryButton type="submit" disabled={busy || !password} className="mt-1 w-full">
            {busy ? <Spinner label="Signing in…" /> : 'Sign in'}
          </PrimaryButton>
        </form>
      </motion.div>
    </div>
  );
}
