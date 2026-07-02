import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        ink: {
          DEFAULT: '#0f1613',
          soft: '#414b46',
          faint: '#8a938c',
        },
        surface: {
          DEFAULT: '#ffffff',
          raised: '#f2f5f2',
          dark: '#0b110e',
          'dark-raised': '#141b17',
        },
        // Calm, trustworthy money-green — the brand's one hero color.
        accent: {
          DEFAULT: '#1f7a53',
          strong: '#12603f',
          soft: '#e4f1ea',
        },
        state: {
          tight: '#b47612',
          'tight-soft': '#faf1e0',
          hold: '#c0392b',
          'hold-soft': '#fbeae7',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 22, 19, 0.04), 0 4px 16px rgba(15, 22, 19, 0.05)',
        hero: '0 2px 4px rgba(15, 22, 19, 0.04), 0 12px 32px rgba(15, 22, 19, 0.08)',
      },
      borderRadius: {
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
