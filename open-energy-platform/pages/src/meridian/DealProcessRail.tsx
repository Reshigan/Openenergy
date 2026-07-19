// pages/src/meridian/DealProcessRail.tsx — kind-aware 5-step process spine.
// Markup is the .drail / .step (.done|.now|.ahead) pattern styled in meridian.css.
// The canonical DealStage order drives done/now/ahead; the kind only swaps labels.
import type { DealKind, DealStage } from '../shared/lib';

// Canonical stage spine — index in this array decides done (before) / now / ahead (after).
const CANON: DealStage[] = ['offer', 'match', 'evaluate', 'accept', 'track'];

// Per-kind labels, positionally aligned to CANON (Track is always the 5th).
const LABELS: Record<DealKind, [string, string, string, string, string]> = {
  marketplace:  ['Offer',  'Match',     'Evaluate', 'Accept',   'Track'],
  auction:      ['Bid',    'Collect',   'Clear',    'Settle',   'Track'],
  syndication:  ['Open',   'Subscribe', 'Allocate', 'Close',    'Track'],
  negotiation:  ['Propose', 'Counter',  'Agree',    'Sign',     'Track'],
  obligation:   ['Notify', 'Assess',    'Cure',     'Settle',   'Track'],
  submission:   ['Submit', 'Screen',    'Review',   'Decide',   'Track'],
};

export function DealProcessRail({ kind, stage }: { kind: DealKind; stage: DealStage }) {
  const labels = LABELS[kind];
  const nowIdx = CANON.indexOf(stage);
  return (
    <div className="drail">
      {CANON.map((s, i) => {
        const state = i < nowIdx ? 'done' : i === nowIdx ? 'now' : 'ahead';
        return (
          <div
            key={s}
            className={`step ${state}`}
            aria-current={state === 'now' ? 'step' : undefined}
          >
            {labels[i]}
          </div>
        );
      })}
    </div>
  );
}
