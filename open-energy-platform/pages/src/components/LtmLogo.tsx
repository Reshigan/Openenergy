// Fixed bottom-right LTM Energy Group logo. Rendered by both the
// authenticated shell (FioriShell) and the LoginPage so every screen carries
// the partner brand. Pointer-events disabled so it never blocks UI underneath.

import React from 'react';

export function LtmLogo() {
  return (
    <div
      aria-hidden="true"
      className="fixed top-2 left-2 z-40 pointer-events-none select-none"
      style={{ lineHeight: 0 }}
    >
      <img
        src="/ltm-energy-logo.png"
        alt=""
        width={72}
        height={46}
        className="opacity-70 hover:opacity-90 transition-opacity drop-shadow-sm"
        style={{ width: 72, height: 'auto' }}
      />
    </div>
  );
}

export default LtmLogo;
