import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', '"IBM Plex Sans"', 'ui-sans-serif', 'system-ui'],
        display: ['Sora', '"Space Grotesk"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular']
      },
      colors: {
        bg: '#08111e',
        panel: '#0e1a2d',
        panel2: '#122238',
        line: '#23344f',
        text: '#e5eefb',
        muted: '#8fa3c0',
        accent: '#62d6ff',
        accent2: '#36dfb4',
        good: '#47d18c',
        warn: '#ffb347',
        bad: '#ff6b7a'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(98,214,255,0.18), 0 16px 40px rgba(0,0,0,0.35)'
      }
    }
  },
  plugins: []
} satisfies Config;
