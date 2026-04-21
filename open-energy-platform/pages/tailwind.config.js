/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ═══ IonEx v2 Brand Tokens ═══ */
        'ionex-brand': '#0A3D62',
        'ionex-brand-light': '#1E5A8E',
        'ionex-brand-deep': '#062640',
        'ionex-accent': '#00C896',
        'ionex-accent-deep': '#009973',
        'ionex-mint': '#00C896',
        
        /* Neutrals */
        'ionex-shell': '#062640',
        'ionex-shell-bg': '#062640',
        'ionex-shell-fg': '#FFFFFF',
        'ionex-canvas': '#F5F7F9',
        'ionex-surface': '#FFFFFF',
        'ionex-surface-alt': '#F8F9FA',
        'ionex-border': '#D5DADF',
        'ionex-border-soft': '#E5E9ED',
        'ionex-text': '#0A3D62',
        'ionex-text-sub': '#5B738B',
        'ionex-text-mute': '#89919A',
        
        /* Semantic */
        'ionex-success': '#107E3E',
        'ionex-success-bg': '#EBF5F0',
        'ionex-warning': '#E9730C',
        'ionex-warning-bg': '#FEF7E6',
        'ionex-error': '#BB0000',
        'ionex-error-bg': '#FEEBEB',
        
        /* Legacy Open Energy (fallback) */
        oe: {
          forest: '#1a3d2e',
          'forest-dark': '#0f261d',
          'forest-light': '#2d5a44',
          accent: '#c9a227',
          'accent-dark': '#a68620',
          cream: '#f5f1e8',
          'cream-dark': '#e8e2d3',
          gold: '#d4af37',
          sage: '#8fbc8f',
          slate: '#2c3e50',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      spacing: {
        'space-1': '4px',
        'space-2': '8px',
        'space-3': '12px',
        'space-4': '16px',
        'space-5': '20px',
        'space-6': '24px',
        'space-8': '32px',
        'space-10': '40px',
        'space-12': '48px',
        'space-16': '64px',
        'shell-height': '48px',
        'sidebar': '240px',
        'sidebar-collapsed': '56px',
        'tile-std': '176px',
        'tile-compact': '88px',
      },
      borderRadius: {
        'radius-xs': '2px',
        'radius-sm': '4px',
        'radius-md': '6px',
        'radius-lg': '8px',
        'radius-pill': '9999px',
      },
      boxShadow: {
        'shadow-sm': '0 1px 2px rgba(10,61,98,0.04)',
        'shadow-md': '0 2px 8px rgba(10,61,98,0.08)',
        'shadow-lg': '0 8px 24px rgba(10,61,98,0.12)',
        'shadow-focus': '0 0 0 2px rgba(0,200,150,0.4)',
      },
      maxWidth: {
        'max-content': '1440px',
      },
      transitionTimingFunction: {
        'ease-ionex': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      width: {
        'sidebar': '240px',
        'sidebar-collapsed': '56px',
        'tile-std': '176px',
        'tile-compact': '88px',
      },
      height: {
        'shell': '48px',
        'tile-std': '160px',
      },
    },
  },
  plugins: [],
};