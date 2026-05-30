/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand:  { DEFAULT: '#F25314', 50: '#FEF2EC', 600: '#D03E05' },
        coral:  { DEFAULT: '#FF5A36', dark: '#E04020' },
        teal:   { DEFAULT: '#0E3B43', light: '#1A5560' },
        ivory:  '#F7F3EC',
        sand:   '#EFE7DA',
        ink:    '#0E1A1F',
        muted:  '#6B6256',
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"DM Sans"', 'system-ui', 'sans-serif'],
        body:    ['"Inter"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
