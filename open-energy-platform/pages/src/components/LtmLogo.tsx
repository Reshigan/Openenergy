// Fixed bottom-right LTM Energy Group logo. Rendered by both the
// authenticated shell (FioriShell) and the LoginPage so every screen carries
// the partner brand. Pointer-events disabled so it never blocks UI underneath.

import React from 'react';

export function LtmLogo() {
  return (
    <div
      aria-hidden="true"
      className="fixed bottom-3 right-3 z-40 pointer-events-none select-none"
      style={{ lineHeight: 0 }}
    >
      <img
        src="/ltm-energy-logo.png"
        alt=""
        width={140}
        height={90}
        className="opacity-80 hover:opacity-100 transition-opacity drop-shadow-md"
        style={{ width: 140, height: 'auto' }}
      />
    </div>
  );
}

export default LtmLogo;
