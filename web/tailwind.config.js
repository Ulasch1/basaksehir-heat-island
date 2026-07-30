/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        page: 'oklch(0.99 0.003 260)',
        panel: 'oklch(0.97 0.006 260)',
        contur: 'oklch(0.85 0.01 260)',
        muted: 'oklch(0.45 0.01 260)',
        ink: 'oklch(0.2 0.01 260)',
        accent: 'oklch(0.6 0.14 150)',
        'risk-dusuk': 'oklch(0.62 0.12 225)',
        'risk-orta': 'oklch(0.78 0.15 90)',
        'risk-yuksek': 'oklch(0.63 0.19 25)',
      },
    },
  },
  plugins: [],
};
