/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
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
      },
    },
  },
  plugins: [],
};