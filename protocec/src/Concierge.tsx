import { useState } from 'react';
import { motion } from 'motion/react';
import { INTENTS, resolveIntent, type Intent } from './intents';
import { session } from './api';
import { BillJourney } from './BillJourney';
import { GhostButton } from './ui';

// The home. One big plain-language box. Type anything → we resolve it to one
// KNOWN intent (never an open-ended action). A bill intent opens the guided
// journey; an escape intent hands off to the full Meridian workspace.

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const firstName = (full?: string | null) => (full || 'there').trim().split(/\s+/)[0];

export function Concierge() {
  const [text, setText] = useState('');
  const [inJourney, setInJourney] = useState(false);
  const [miss, setMiss] = useState(false);

  function go(intent: Intent | null) {
    if (!intent) { setMiss(true); return; }
    setMiss(false);
    if (intent.kind === 'escape' && intent.href) {
      window.open(intent.href, '_blank', 'noreferrer');
      return;
    }
    setInJourney(true);
  }

  if (inJourney) return <BillJourney onExit={() => { setInJourney(false); setText(''); }} />;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-[30px] font-semibold tracking-tight">
          {greeting()}, {firstName(session.name())}.
        </h1>
        <p className="mt-2 text-[16px] text-muted">What would you like to sort out today?</p>

        <form
          className="mt-7"
          onSubmit={(e) => { e.preventDefault(); go(resolveIntent(text)); }}
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => { setText(e.target.value); setMiss(false); }}
            placeholder="e.g. my electricity bill is too high"
            className="field w-full px-5 py-4 text-[17px]"
          />
          {miss && (
            <p className="mt-3 text-[14px] text-amber">
              I'm not sure about that one yet — try one of these:
            </p>
          )}
        </form>

        <div className="mt-5 flex flex-col gap-2">
          {INTENTS.map((it) => (
            <button
              key={it.id}
              onClick={() => go(it)}
              className="card flex items-center justify-between px-5 py-4 text-left transition hover:border-accent/40"
            >
              <span>
                <span className="block text-[15px] font-semibold">{it.label}</span>
                <span className="block text-[13px] text-muted">{it.hint}</span>
              </span>
              <span className="text-muted">→</span>
            </button>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
          <a href="https://cec.vantax.co.za/horizon" target="_blank" rel="noreferrer">
            <GhostButton>Open my full workspace</GhostButton>
          </a>
          <GhostButton onClick={() => { session.clear(); location.reload(); }}>Sign out</GhostButton>
        </div>
      </motion.div>
    </div>
  );
}
