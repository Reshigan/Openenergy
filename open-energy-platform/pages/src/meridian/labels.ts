// pages/src/meridian/labels.ts — display-label hygiene for Meridian surfaces.
// Registry labels and tab titles carry build-tracking "(W123)" codes and bare
// "W12 · W71" wave lists. Those are internal; strip them before showing an operator.
export function cleanLabel(label: string): string {
  return label
    .replace(/\s*\(W\d[^)]*\)/gi, '')            // "(W123)" / "(W12/24)" build code anywhere — incl. period-suffixed "(W143)."
    .replace(/\s*[—·-]\s*W\d[\dW\s·/,-]*\.?\s*$/i, '') // trailing " · W12 · W71" wave list (optional trailing period)
    .replace(/\s+([.,;:)])/g, '$1')              // tidy space stranded before punctuation by the strips
    .replace(/\s{2,}/g, ' ')                     // collapse double spaces left mid-string
    .trim() || label;
}
