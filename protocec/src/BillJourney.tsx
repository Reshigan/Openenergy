import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api, type BillProfile, type MixItem, type LoiDraft } from './api';
import { GhostButton, Pill, PrimaryButton, Spinner, Stat, num, zar } from './ui';

// The guided spine for "my bill is too high → cleaner, cheaper supply".
// One decision per screen. Language PROPOSES (the AI mix, the draft letter);
// the human CONFIRMS; the backend state machine DISPOSES. The LOI step is the
// one sensitive action and is gated behind an explicit confirm.

type Phase = 'profiling' | 'profile' | 'optimizing' | 'options' | 'preview' | 'sending' | 'done' | 'error';

const step = (p: Phase): 0 | 1 | 2 | 3 => {
  if (p === 'profiling' || p === 'profile') return 0;
  if (p === 'optimizing' || p === 'options') return 1;
  if (p === 'preview' || p === 'sending') return 2;
  return 3;
};

function Steps({ phase }: { phase: Phase }) {
  const labels = ['Your bill', 'Cleaner options', 'Confirm', 'Done'];
  const at = step(phase);
  return (
    <div className="mb-8 flex items-center gap-2">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-2">
          <span
            className={
              'flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ' +
              (i < at ? 'bg-accent text-white' : i === at ? 'bg-accent-soft text-accent-ink' : 'bg-ink/5 text-muted')
            }
          >
            {i < at ? '✓' : i + 1}
          </span>
          <span className={'text-[13px] ' + (i === at ? 'font-semibold text-ink' : 'text-muted')}>{l}</span>
          {i < labels.length - 1 && <span className="mx-1 h-px w-6 bg-line" />}
        </div>
      ))}
    </div>
  );
}

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.22 },
};

export function BillJourney({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('profiling');
  const [error, setError] = useState('');
  const [billId, setBillId] = useState('');
  const [profile, setProfile] = useState<BillProfile>({});
  const [mix, setMix] = useState<MixItem[]>([]);
  const [savingsPct, setSavingsPct] = useState(0);
  const [carbon, setCarbon] = useState(0);
  const [draft, setDraft] = useState<LoiDraft | null>(null);

  // Step 0 — read the latest bill, or analyse one if there's none yet.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const bills = await api.getBills();
        if (bills.length > 0 && bills[0].profile) {
          if (!live) return;
          setBillId(bills[0].id);
          setProfile(bills[0].profile);
        } else {
          const a = await api.analyseBill();
          if (!live) return;
          setBillId(a.bill_id);
          setProfile(a.structured);
        }
        if (live) setPhase('profile');
      } catch (e) {
        if (live) { setError((e as Error).message); setPhase('error'); }
      }
    })();
    return () => { live = false; };
  }, []);

  async function loadOptions() {
    setPhase('optimizing');
    try {
      const r = await api.optimize(billId);
      setMix(r.structured.mix || []);
      setSavingsPct(r.structured.savings_pct || 0);
      setCarbon(r.structured.carbon_tco2e || 0);
      setPhase('options');
    } catch (e) {
      setError((e as Error).message); setPhase('error');
    }
  }

  async function sendLoi() {
    setPhase('sending');
    try {
      const r = await api.loi(
        mix.map((m) => ({ project_id: m.project_id, share_pct: m.share_pct, mwh_per_year: m.mwh_per_year, blended_price: m.blended_price })),
        'Submitted via CEC Concierge — Goldrush Operations is exploring cleaner supply.',
      );
      setDraft(r.drafts[0] ?? null);
      setPhase('done');
    } catch (e) {
      setError((e as Error).message); setPhase('error');
    }
  }

  const topMix = mix[0];

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Steps phase={phase} />

      <AnimatePresence mode="wait">
        {/* ---------------- Step 0 ---------------- */}
        {phase === 'profiling' && (
          <motion.div key="profiling" {...fade}>
            <Spinner label="Reading your latest bill…" />
          </motion.div>
        )}

        {phase === 'profile' && (
          <motion.div key="profile" {...fade} className="card p-7">
            <h2 className="text-[22px] font-semibold tracking-tight">Here's where your money goes</h2>
            <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
              You bought about <b className="text-ink">{num(profile.annual_kwh)} kWh</b> last year at a blended{' '}
              <b className="text-ink">{zar(profile.avg_tariff_zar_per_kwh, 2)}/kWh</b>.
              {profile.peak_pct != null && (
                <> Roughly <b className="text-ink">{num(profile.peak_pct)}%</b> falls in expensive peak hours — that's exactly where cleaner supply saves the most.</>
              )}
            </p>
            <div className="mt-6 grid grid-cols-3 gap-5">
              <Stat label="Annual use" value={`${num(profile.annual_kwh)}`} sub="kWh / year" />
              <Stat label="Blended tariff" value={zar(profile.avg_tariff_zar_per_kwh, 2)} sub="per kWh" />
              <Stat label="Peak exposure" value={profile.tou_risk ? profile.tou_risk.toUpperCase() : '—'} sub="time-of-use risk" />
            </div>
            <div className="mt-7 flex items-center gap-3">
              <PrimaryButton onClick={loadOptions}>Show me cleaner options →</PrimaryButton>
              <GhostButton onClick={onExit}>Not now</GhostButton>
            </div>
          </motion.div>
        )}

        {/* ---------------- Step 1 ---------------- */}
        {phase === 'optimizing' && (
          <motion.div key="optimizing" {...fade}>
            <Spinner label="Matching you to cleaner generators…" />
          </motion.div>
        )}

        {phase === 'options' && (
          <motion.div key="options" {...fade}>
            <div className="card overflow-hidden">
              <div className="bg-accent-soft px-7 py-6">
                <div className="flex items-center gap-3">
                  <Pill tone="good">Recommended</Pill>
                  <span className="text-[13px] text-accent-ink">A cleaner mix for Goldrush</span>
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-8">
                  <div>
                    <div className="text-[34px] font-bold leading-none text-accent-ink">~{num(savingsPct)}%</div>
                    <div className="text-[13px] text-accent-ink/80">estimated saving vs. today</div>
                  </div>
                  <div>
                    <div className="text-[34px] font-bold leading-none text-accent-ink">{num(carbon)}</div>
                    <div className="text-[13px] text-accent-ink/80">tCO₂e avoided / year</div>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-line">
                {mix.length === 0 && (
                  <div className="px-7 py-6 text-[14px] text-muted">No matching generators are available right now.</div>
                )}
                {mix.map((m) => (
                  <div key={m.project_id} className="flex items-center justify-between gap-4 px-7 py-4">
                    <div>
                      <div className="text-[15px] font-semibold">{m.project_name}</div>
                      <div className="text-[13px] text-muted">{m.rationale || `${num(m.mwh_per_year)} MWh/yr`}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[15px] font-semibold">{zar(m.blended_price, 2)}<span className="text-[12px] font-normal text-muted">/kWh</span></div>
                      <div className="text-[12px] text-muted">{num(m.share_pct)}% of your demand</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-7 flex items-center gap-3">
              <PrimaryButton disabled={!topMix} onClick={() => setPhase('preview')}>
                Reach out to these generators →
              </PrimaryButton>
              <GhostButton onClick={onExit}>Back</GhostButton>
            </div>
          </motion.div>
        )}

        {/* ---------------- Step 2 — sensitive action, explicit confirm ---------------- */}
        {phase === 'preview' && topMix && (
          <motion.div key="preview" {...fade} className="card p-7">
            <h2 className="text-[22px] font-semibold tracking-tight">One last look before you send</h2>
            <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
              We'll draft a <b className="text-ink">letter of intent</b> to each generator below and register your
              interest. Nothing is binding — it just opens the conversation.
            </p>
            <div className="mt-5 rounded-2xl border border-line bg-canvas p-5">
              {mix.map((m) => (
                <div key={m.project_id} className="flex items-center justify-between py-1.5 text-[14px]">
                  <span className="font-medium">{m.project_name}</span>
                  <span className="text-muted">{num(m.mwh_per_year)} MWh/yr · {zar(m.blended_price, 2)}/kWh</span>
                </div>
              ))}
            </div>
            <div className="mt-7 flex items-center gap-3">
              <PrimaryButton onClick={sendLoi}>Send my letter of intent</PrimaryButton>
              <GhostButton onClick={() => setPhase('options')}>Back</GhostButton>
            </div>
          </motion.div>
        )}

        {phase === 'sending' && (
          <motion.div key="sending" {...fade}>
            <Spinner label="Drafting and sending your letter of intent…" />
          </motion.div>
        )}

        {/* ---------------- Step 3 ---------------- */}
        {phase === 'done' && (
          <motion.div key="done" {...fade} className="card p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white">✓</span>
              <h2 className="text-[22px] font-semibold tracking-tight">Done — your interest is registered</h2>
            </div>
            {draft ? (
              <>
                <p className="mt-3 text-[14px] text-muted">
                  Letter of intent drafted for <b className="text-ink">{draft.project_name}</b>. The generator's team has been notified.
                </p>
                <pre className="mt-5 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-line bg-canvas p-5 text-[13px] leading-relaxed">
                  {draft.body_md}
                </pre>
              </>
            ) : (
              <p className="mt-3 max-w-[52ch] text-[14px] text-muted">
                Your interest has been registered with the generators' teams — they'll be in touch to take the
                conversation forward. You can track it any time in your full workspace.
              </p>
            )}
            <div className="mt-7 flex items-center gap-3">
              <PrimaryButton onClick={onExit}>Back to start</PrimaryButton>
              <a href="https://cec.vantax.co.za/horizon" target="_blank" rel="noreferrer">
                <GhostButton>Open full workspace</GhostButton>
              </a>
            </div>
          </motion.div>
        )}

        {phase === 'error' && (
          <motion.div key="error" {...fade} className="card p-7">
            <h2 className="text-[20px] font-semibold tracking-tight">Something went wrong</h2>
            <p className="mt-2 text-[14px] text-muted">{error}</p>
            <div className="mt-6"><GhostButton onClick={onExit}>Back to start</GhostButton></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
