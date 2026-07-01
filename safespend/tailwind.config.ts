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
          DEFAULT: '#101418',
          soft: '#3d4650',
          faint: '#8b949e',
        },
        surface: {
          DEFAULT: '#ffffff',
          raised: '#f6f8fa',
          dark: '#0d1117',
          'dark-raised': '#161b22',
        },
        accent: {
          DEFAULT: '#2f6f4f',
          soft: '#e7f2ec',
        },
        state: {
          tight: '#b8860b',
          hold: '#b3402e',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
