// pages/src/meridian/labels.ts — display-label hygiene for Meridian surfaces.
// Registry labels and tab titles carry build-tracking "(W123)" codes and bare
// "W12 · W71" wave lists. Those are internal; strip them before showing an operator.
export function cleanLabel(label: string): string {
  return label
    .replace(/\s*\(W\d[^)]*\)\s*$/i, '')   // trailing "(W123)" / "(W12/24)" build code
    .replace(/\s*[—·-]\s*W\d[\dW\s·/,-]*$/i, '') // trailing " · W12 · W71" wave list
    .trim() || label;
}
