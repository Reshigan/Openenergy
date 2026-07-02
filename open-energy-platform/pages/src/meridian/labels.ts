// pages/src/meridian/labels.ts — display-label hygiene for Meridian surfaces.
// Registry labels and tab titles carry build-tracking "(W123)" codes and bare
// "W12 · W71" wave lists. Those are internal; strip them before showing an operator.
export function cleanLabel(label: string): string {
  // A bare snake_case identifier (e.g. "seed_proj_002" from seeded rows) is an
  // internal key leaking into the operator's view — humanize it: strip a seed_
  // prefix, break the underscores, title-case the first word.
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(label)) {
    const words = label.replace(/^seed_/, '').split('_');
    return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
  }
  return label
    .replace(/\s*\(W\d[^)]*\)/gi, '')            // "(W123)" / "(W12/24)" build code anywhere — incl. period-suffixed "(W143)."
    .replace(/\s*[—·-]\s*W\d[\dW\s·/,-]*\.?\s*$/i, '') // trailing " · W12 · W71" wave list (optional trailing period)
    .replace(/\s+([.,;:)])/g, '$1')              // tidy space stranded before punctuation by the strips
    .replace(/\s{2,}/g, ' ')                     // collapse double spaces left mid-string
    .trim() || label;
}
