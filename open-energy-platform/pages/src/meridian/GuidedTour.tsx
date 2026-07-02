// ════════════════════════════════════════════════════════════════════════
// GuidedTour - first-run inline anchored intro strip per Meridian surface.
//
// NOT a modal, NOT an overlay, NOT an AI popup. One compact single-row strip
// that sits in normal document flow at the top of the surface content,
// explaining what the surface does plus the single next action — without
// pushing the real content below the fold. Two buttons: "Got it" (dismiss
// just this surface) and "Skip tips" (suppress all remaining surfaces).
// Dismissed tips can be replayed any time from the header ? menu.
//
// Seen-state is persisted per device via useTourState (the shared localStorage
// ledger). The strip is deterministic: it does NOT gate on wizard completion or
// any network state. The only suppressors are seen(surface), which already
// folds in the __skip sentinel and the oe.onboarding.skipped automation switch.
// ════════════════════════════════════════════════════════════════════════

import { Sparkles } from 'lucide-react';
import { useTourState } from './useTourState';

type TourCopy = { title: string; body: string; next: string };

const COPY: Record<string, TourCopy> = {
  cockpit: {
    title: 'This is your cockpit',
    body: 'Today ranks everything waiting on you across every journey, most costly first. The tabs group your work by journey.',
    next: 'Open the top item to act on it.',
  },
  horizon: {
    title: 'This is Horizon',
    body: 'Your live workspace. Each lane is a transaction waiting on you, sorted by how soon it bites.',
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
      <span className="mer-tour-ico" aria-hidden="true">
        <Sparkles size={14} strokeWidth={2} />
      </span>
      <div className="mer-tour-text">
        <b className="mer-tour-title">{copy.title}.</b> <span className="mer-tour-body">{copy.body}</span>{' '}
        <span className="mer-tour-next">{copy.next}</span>
      </div>
      <div className="mer-tour-acts">
        <button type="button" className="mer-tour-skip" data-testid="mer-tour-skip" onClick={skipTour}>
          Skip tips
        </button>
        <button type="button" className="mer-tour-gotit" data-testid="mer-tour-gotit" onClick={() => markSeen(surface)}>
          Got it
        </button>
      </div>
    </div>
  );
}
