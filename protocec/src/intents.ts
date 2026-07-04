// The closed allow-list. NL never executes anything — it only RESOLVES to one of
// these known intents (Raycast/Linear ⌘K pattern). Anything unmatched falls back
// to "here's what I can help with", never to an open-ended action.

export interface Intent {
  id: string;
  /** what the chip says */
  label: string;
  /** one-line plain explanation */
  hint: string;
  /** keywords that resolve free text to this intent */
  match: RegExp;
  /** 'bill' = the guided journey; 'escape' = hand off to the full workspace */
  kind: 'bill' | 'escape';
  /** for escape intents: where the full Meridian workspace opens */
  href?: string;
}

const WORKSPACE = 'https://cec.vantax.co.za';

export const INTENTS: Intent[] = [
  {
    id: 'bill',
    label: 'My electricity bill is too high',
    hint: 'Understand your bill, then find cleaner, cheaper supply',
    match: /\b(bill|expensive|high|cost|costs|cheap|cheaper|save|saving|tariff|eskom|electric|energy|power|supply|cleaner|greener|renewable|solar|wind|carbon)\b/i,
    kind: 'bill',
  },
  {
    id: 'contracts',
    label: 'Show my current contracts',
    hint: 'Open your PPA portfolio in the full workspace',
    match: /\b(contract|ppa|portfolio|agreement|offtake)\b/i,
    kind: 'escape',
    href: `${WORKSPACE}/horizon`,
  },
  {
    id: 'recs',
    label: 'My renewable certificates',
    hint: 'Open RECs / guarantees of origin in the full workspace',
    match: /\b(rec|recs|certificate|guarantee of origin|scope 2|scope-2)\b/i,
    kind: 'escape',
    href: `${WORKSPACE}/horizon`,
  },
];

export function resolveIntent(text: string): Intent | null {
  const t = text.trim();
  if (!t) return null;
  // score by number of keyword hits; first/highest wins
  let best: { intent: Intent; score: number } | null = null;
  for (const intent of INTENTS) {
    const hits = (t.match(new RegExp(intent.match, 'gi')) || []).length;
    if (hits > 0 && (!best || hits > best.score)) best = { intent, score: hits };
  }
  return best?.intent ?? null;
}
