// ════════════════════════════════════════════════════════════════════════
// GuidedTour — first-run inline anchored intro card per Meridian surface.
//
// NOT a modal, NOT an overlay, NOT an AI popup. One small card that sits in
// normal document flow at the top of the surface content, explaining what the
// surface does plus the single next action. Two buttons: "Got it" (dismiss
// just this surface) and "Skip tour" (suppress all remaining surfaces).
//
// Seen-state is persisted per device via useTourState (the shared localStorage
// ledger). The card is deterministic: it does NOT gate on wizard completion or
// any network state. The only suppressors are seen(surface), which already
// folds in the __skip sentinel and the oe.onboarding.skipped automation switch.
// ════════════════════════════════════════════════════════════════════════

import { Sparkles } from 'lucide-react';
import { useTourState } from './useTourState';

type TourCopy = { title: string; body: string; next: string };

const COPY: Record<string, TourCopy> = {
  horizon: {
    title: 'This is Horizon',
    body: 'Your live workspace. Each lane is a transaction waiting on you, sorted by how soon it bites. Open one to act.',
    next: 'Open a lane to see what is waiting.',
  },
  atlas: {
    title: 'This is Atlas',
    body: 'The function library for your role. Every chain, surface and tool you can reach lives here.',
    next: 'Press Cmd-K anywhere to search it.',
  },
  ledger: {
    title: 'This is a Ledger',
    body: 'Every case of one chain in one list. Start a new one, or open a row to see its full transaction.',
    next: 'Use +New to initiate a case.',
  },
  thread: {
    title: 'This is a Thread',
    body: 'The two-sided record of a single transaction. Both roles act here and every step is audited.',
    next: 'Use the action bar to take the next step.',
  },
  deals: {
    title: 'This is the Deal Desk',
    body: 'Author and track deals here. New opens the transaction picker so you can pick what to initiate.',
    next: 'Click New to start a deal.',
  },
};

export function GuidedTour({ surface }: { surface: string }) {
  const { seen, markSeen, skipTour } = useTourState();
  const copy = COPY[surface];

  if (!copy || seen(surface)) return null;

  return (
    <div className="mer-tour" role="status" aria-live="polite" data-testid="mer-tour">
      <div className="mer-tour-eyebrow">
        <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
        Quick tour
      </div>
      <div className="mer-tour-title">{copy.title}</div>
      <div className="mer-tour-body">{copy.body}</div>
      <div className="mer-tour-next">{copy.next}</div>
      <div className="mer-tour-acts">
        <button type="button" className="mer-tour-skip" data-testid="mer-tour-skip" onClick={skipTour}>
          Skip tour
        </button>
        <button type="button" className="mer-tour-gotit" data-testid="mer-tour-gotit" onClick={() => markSeen(surface)}>
          Got it
        </button>
      </div>
    </div>
  );
}
