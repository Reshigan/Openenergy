// pages/src/meridian/ease/statusLabel.ts — plain-language status for every surface.
// Replaces the 119+ `status.replace(/_/g,' ').toUpperCase()` render sites that show
// operators raw SHOUTING state codes. Two wins in one call:
//   1. comprehension — sentence case + curated phrasing for stems where snake→words
//      reads wrong ("held_for_review" → "Waiting on review", not "Held For Review").
//   2. polish — a tone, derived from the state's meaning, drives the chip colour so
//      a breach reads oxide and a settle reads good without per-call-site logic.
// Ponytail: small curated map for the stems that need it; generic transform handles
// the long tail. Not an enumeration of all 207 chains' states.

export type StatusTone = 'neutral' | 'good' | 'warn' | 'oxide';

// chip className per tone — matches meridian.css (.chip / .chip.ox) plus good/warn.
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'chip',
  good: 'chip good',
  warn: 'chip warn',
  oxide: 'chip ox',
};

// Curated phrasing — only where a literal snake→sentence reads wrong or cold.
// Keyed on the full lower-snake status. Keep small; the generic path covers the rest.
const PHRASE: Record<string, string> = {
  held_for_review: 'Waiting on review',
  pending_approval: 'Awaiting approval',
  pending_review: 'Awaiting review',
  awaiting_signature: 'Awaiting signature',
  in_om: 'In O&M',
  in_review: 'In review',
  in_progress: 'In progress',
  not_started: 'Not started',
  past_due: 'Past due',
  needs_info: 'Needs info',
  on_hold: 'On hold',
  sla_breached: 'SLA breached',
  cod_achieved: 'COD achieved',
  draft: 'Draft',
};

// Tone by semantic stem — first matching group wins. Substring match on the snake
// status so "loan_default" / "payment_overdue" / "forced_liquidation" all read oxide.
const OXIDE = /breach|default|reject|declin|cancel|revok|terminat|overdue|past_due|fail|forfeit|liquidat|suspend|void|lapsed|expired|dispute|escalat/;
const GOOD = /settl|approv|complet|active|closed_won|paid|issued|certified|accepted|signed|achiev|cleared|verified|resolved|granted|energ|operational|in_om|live|done/;
const WARN = /pend|review|await|submit|hold|provision|draft|propos|negotiat|queued|on_hold|not_started|needs_/;

export function statusTone(status: string): StatusTone {
  const s = (status || '').toLowerCase();
  if (OXIDE.test(s)) return 'oxide';
  if (GOOD.test(s)) return 'good';
  if (WARN.test(s)) return 'warn';
  return 'neutral';
}

// Sentence-case a snake/space code, preserving known acronyms uppercase.
const ACRONYM = /^(cod|ppa|mrv|ipp|epc|esco|hse|rfp|loi|rma|wo|kpi|sla|vat|cpi|itp|rfi|ncr|bess|soh|rec|goo|dscr|dsra|mra|sseg|gca|rez|fco|ecn|amc|evm|wbs|poa|cpa|erpa|itmo|ed|bee|bbbee)$/i;
function sentence(s: string): string {
  const words = s.toLowerCase().split(/[_\s]+/).filter(Boolean);
  return words
    .map((w, i) => {
      if (ACRONYM.test(w)) return w.toUpperCase();
      if (i === 0) return w.charAt(0).toUpperCase() + w.slice(1);
      return w;
    })
    .join(' ');
}

export function statusLabel(status: string | null | undefined): { text: string; tone: StatusTone } {
  const raw = (status || '').trim();
  if (!raw) return { text: '—', tone: 'neutral' };
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  const text = PHRASE[key] ?? sentence(raw);
  return { text, tone: statusTone(key) };
}

// One-call chip className, for the common `<span className={...}>{label}</span>` site.
export function statusChipClass(status: string | null | undefined): string {
  return STATUS_TONE_CLASS[statusLabel(status).tone];
}

// ponytail: self-check — runs only under `node --test`-style import in vitest.
export function __demo() {
  const cases: [string, string, StatusTone][] = [
    ['held_for_review', 'Waiting on review', 'warn'],
    ['sla_breached', 'SLA breached', 'oxide'],
    ['cod_achieved', 'COD achieved', 'good'],
    ['loan_default', 'Loan default', 'oxide'],
    ['settled', 'Settled', 'good'],
    ['in_om', 'In O&M', 'good'],
    ['some_new_state', 'Some new state', 'neutral'],
    ['', '—', 'neutral'],
  ];
  for (const [input, text, tone] of cases) {
    const r = statusLabel(input);
    if (r.text !== text) throw new Error(`text ${input}: ${r.text} !== ${text}`);
    if (r.tone !== tone) throw new Error(`tone ${input}: ${r.tone} !== ${tone}`);
  }
  return true;
}
