import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Teal clínico: calma, higiene, confianza
        clinical: {
          50: '#effcf9',
          100: '#d7f7ef',
          200: '#b1eedf',
          300: '#7ddfcb',
          400: '#47c8b1',
          500: '#22ad97',
          600: '#168b7b',
          700: '#156f64',
          800: '#155951',
          900: '#144a44',
          950: '#062b28',
        },
        ink: {
          50: '#f6f7f8',
          100: '#eceef1',
          200: '#d5dae1',
          300: '#b0b9c6',
          400: '#8592a5',
          500: '#66748a',
          600: '#515d72',
          700: '#434c5d',
          800: '#2b313d',
          900: '#1a1e26',
          950: '#0f1217',
        },
        caries: '#e5484d',
        restoration: '#3e63dd',
        endodontics: '#8e4ec6',
        implant: '#30a46c',
        sealant: '#e2a336',
        missing: '#9ca3af',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
        lift: '0 4px 12px -2px rgba(16,24,40,.08), 0 2px 4px -2px rgba(16,24,40,.04)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
      },
    },
  },
  plugins: [],
};
export default config;
