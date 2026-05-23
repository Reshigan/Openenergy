/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ═════════════════════════════════════════════════════════════
         * Open Energy — Industrial-Fintech (Navy / Blue / Teal / Sky)
         * Palette pulled directly from the OE logomark:
         *   Navy   #1a3a5c  outer ring + "OPEN" wordmark
         *   Blue   #3b82c4  left ring + "ENERGY" wordmark
         *   Teal   #1f9b95  right ring (sustainability / growth)
         *   Sky    #5fa8e8  centre dot (live / kinetic accent)
         * ════════════════════════════════════════════════════════════ */

        /* Brand */
        primary: '#1a3a5c',
        'primary-deep': '#0f2540',
        'primary-container': '#d6e3ef',
        'on-primary': '#ffffff',
        'on-primary-container': '#0a1c30',
        'primary-fixed-dim': '#7faac9',

        secondary: '#3b82c4',
        'secondary-deep': '#1a5d97',
        'secondary-container': '#d4e7f6',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#062842',

        tertiary: '#1f9b95',
        'tertiary-deep': '#0e6d68',
        'tertiary-container': '#b8eae6',
        'on-tertiary': '#ffffff',
        'on-tertiary-container': '#003634',

        accent: '#5fa8e8',
        'accent-deep': '#3082c8',
        'accent-container': '#dbecfb',
        'on-accent': '#06294a',

        /* Surfaces — clean white tiered */
        surface: '#f5f8fb',                /* Global background — cool off-white */
        'surface-bright': '#ffffff',
        'surface-dim': '#d8dfe7',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#eef2f7',
        'surface-container': '#e5ebf2',
        'surface-container-high': '#dde4ec',
        'surface-container-highest': '#d3dce6',
        'on-surface': '#0f1c2e',
        'on-surface-variant': '#3d4756',
        'inverse-surface': '#1a2a3e',
        'inverse-on-surface': '#eef2f7',
        'inverse-primary': '#7faac9',

        /* Borders / outlines */
        outline: '#6b7685',
        'outline-variant': '#c5cdd6',
        'outline-strong': '#3d4756',

        background: '#f5f8fb',
        'on-background': '#0f1c2e',

        /* Status — kept legible against navy/blue UI */
        error: '#c0392b',
        'error-container': '#fde0db',
        'on-error': '#ffffff',
        'on-error-container': '#410e08',

        warning: '#c97a14',
        'warning-container': '#fce5c4',
        'on-warning': '#ffffff',
        'on-warning-container': '#3a1f00',

        success: '#1a8a5b',
        'success-container': '#cdf0dd',
        'on-success': '#ffffff',
        'on-success-container': '#002112',

        info: '#3b82c4',
        'info-container': '#d4e7f6',
        'on-info': '#ffffff',
        'on-info-container': '#062842',

        /* Data viz palette */
        'data-solar': '#f5b800',
        'data-wind': '#1f9b95',
        'data-hybrid': '#3b82c4',
        'data-storage': '#7e57c2',
        'data-carbon': '#1a8a5b',
        'data-thermal': '#c97a14',
        'data-grid': '#1a3a5c',

        /* ═════════════════════════════════════════════════════════════
         * Legacy aliases — now mapped to OE palette so existing pages
         * pick up the brand without per-file rewrites.
         * ════════════════════════════════════════════════════════════ */

        /* fiori-* aliases */
        'fiori-shell': '#0f2540',
        'fiori-shell-hover': '#0a1c30',
        'fiori-brand': '#1a3a5c',
        'fiori-brand-hover': '#0f2540',
        'fiori-brand-light': '#3b82c4',
        'fiori-action': '#3b82c4',
        'fiori-canvas': '#f5f8fb',
        'fiori-surface': '#ffffff',
        'fiori-surface-alt': '#eef2f7',
        'fiori-header': '#e5ebf2',
        'fiori-border': '#c5cdd6',
        'fiori-border-strong': '#6b7685',
        'fiori-border-soft': '#dde4ec',
        'fiori-text': '#0f1c2e',
        'fiori-text-sub': '#3d4756',
        'fiori-text-mute': '#6b7685',
        'fiori-text-faint': '#9ba6b3',
        'fiori-success': '#1a8a5b',
        'fiori-success-bg': '#cdf0dd',
        'fiori-warning': '#c97a14',
        'fiori-warning-bg': '#fce5c4',
        'fiori-error': '#c0392b',
        'fiori-error-bg': '#fde0db',
        'fiori-info': '#3b82c4',
        'fiori-info-bg': '#d4e7f6',
        'fiori-neutral': '#6b7685',
        'fiori-neutral-bg': '#e5ebf2',
        'fiori-accent-indigo': '#7e57c2',
        'fiori-accent-teal': '#1f9b95',
        'fiori-accent-pink': '#c2417e',
        'fiori-accent-plum': '#5d3a7e',

        /* ionex-* aliases */
        'ionex-brand': '#1a3a5c',
        'ionex-brand-light': '#3b82c4',
        'ionex-brand-deep': '#0f2540',
        'ionex-accent': '#1f9b95',
        'ionex-accent-deep': '#0e6d68',
        'ionex-mint': '#1a8a5b',
        'ionex-shell': '#0f2540',
        'ionex-shell-bg': '#0f2540',
        'ionex-shell-fg': '#ffffff',
        'ionex-canvas': '#f5f8fb',
        'ionex-surface': '#ffffff',
        'ionex-surface-alt': '#eef2f7',
        'ionex-border': '#c5cdd6',
        'ionex-border-soft': '#dde4ec',
        'ionex-text': '#0f1c2e',
        'ionex-text-sub': '#3d4756',
        'ionex-text-mute': '#6b7685',
        'ionex-success': '#1a8a5b',
        'ionex-success-bg': '#cdf0dd',
        'ionex-warning': '#c97a14',
        'ionex-warning-bg': '#fce5c4',
        'ionex-error': '#c0392b',
        'ionex-error-bg': '#fde0db',

        /* Open Energy namespace (canonical) */
        oe: {
          navy: '#1a3a5c',
          'navy-deep': '#0f2540',
          'navy-light': '#2d5586',
          blue: '#3b82c4',
          'blue-deep': '#1a5d97',
          'blue-light': '#7faac9',
          teal: '#1f9b95',
          'teal-deep': '#0e6d68',
          'teal-light': '#69c2bc',
          sky: '#5fa8e8',
          'sky-light': '#9bc8ee',
          slate: '#3d4756',

          /* Compat aliases for the old `forest`/`accent` names */
          forest: '#1a3a5c',
          'forest-deep': '#0f2540',
          'forest-light': '#3b82c4',
          accent: '#5fa8e8',
          'accent-deep': '#3082c8',
          cream: '#f5f8fb',
          'cream-dark': '#e5ebf2',
          gold: '#5fa8e8',
          sage: '#1f9b95',
          plum: '#5d3a7e',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', '"IBM Plex Sans"', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Arial', 'sans-serif'],
        body: ['"Inter Variable"', '"IBM Plex Sans"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight Variable"', 'Metropolis', '"IBM Plex Sans"', 'Inter', 'system-ui', 'sans-serif'],
        headline: ['"Inter Tight Variable"', 'Metropolis', '"IBM Plex Sans"', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['"Newsreader Variable"', 'ui-serif', 'Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', '"IBM Plex Mono"', 'Consolas', 'monospace'],
        data: ['"JetBrains Mono Variable"', '"JetBrains Mono"', '"IBM Plex Mono"', 'Consolas', 'monospace'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'headline-sm': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'body-lg':    ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md':    ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-sm':    ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'data-mono':  ['14px', { lineHeight: '20px', letterSpacing: '0.02em', fontWeight: '500' }],
        'label-caps': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '700' }],
      },
      spacing: {
        'space-xs': '4px', 'space-sm': '8px', 'space-md': '16px', 'space-lg': '24px',
        'space-xl': '32px', 'space-2xl': '48px',
        gutter: '24px', margin: '32px',
        'space-1': '4px', 'space-2': '8px', 'space-3': '12px', 'space-4': '16px',
        'space-5': '20px', 'space-6': '24px', 'space-8': '32px', 'space-10': '40px',
        'space-12': '48px', 'space-16': '64px',
        'shell-height': '56px',
        sidebar: '256px', 'sidebar-collapsed': '56px',
        'tile-std': '176px', 'tile-compact': '88px',
      },
      borderRadius: {
        none: '0', sm: '2px', DEFAULT: '4px', md: '6px', lg: '8px', xl: '12px',
        '2xl': '16px', full: '9999px', pill: '9999px',
      },
      boxShadow: {
        'level-1': '0 0 0 1px rgba(15,28,46,0.05), 0 4px 12px rgba(15,28,46,0.04)',
        'level-2': '0 0 0 1px rgba(15,28,46,0.05), 0 8px 24px rgba(15,28,46,0.07)',
        'level-3': '0 0 0 1px rgba(15,28,46,0.07), 0 16px 36px rgba(15,28,46,0.12)',
        focus: '0 0 0 2px rgba(59,130,196,0.45)',
        'focus-teal': '0 0 0 2px rgba(31,155,149,0.45)',
        'shadow-sm': '0 0 1px 0 rgba(15,28,46,0.20), 0 1px 2px 0 rgba(15,28,46,0.08)',
        'shadow-md': '0 0 1px 0 rgba(15,28,46,0.20), 0 2px 8px 0 rgba(15,28,46,0.10)',
        'shadow-lg': '0 0 2px 0 rgba(15,28,46,0.20), 0 8px 24px 0 rgba(15,28,46,0.12)',
        'shadow-focus': '0 0 0 2px rgba(59,130,196,0.45)',
        'fiori-tile': '0 0 1px 0 rgba(15,28,46,0.12), 0 1px 2px 0 rgba(15,28,46,0.04)',
        'fiori-tile-hover': '0 0 1px 0 rgba(15,28,46,0.20), 0 4px 12px 0 rgba(15,28,46,0.10)',
      },
      maxWidth: { 'max-content': '1440px', container: '1440px' },
      transitionTimingFunction: {
        'ease-out-soft': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-ionex': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-fiori': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      width: { sidebar: '256px', 'sidebar-collapsed': '56px', 'tile-std': '176px', 'tile-compact': '88px' },
      height: { shell: '56px', 'tile-std': '176px' },
      zIndex: { shell: '50', sidebar: '40', modal: '60', toast: '70' },
    },
  },
  plugins: [],
};
