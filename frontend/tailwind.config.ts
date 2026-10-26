import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:    '#050505',
        sb:    '#0a0a0a',
        card:  '#0e0e0e',
        card2: '#151515',
        bdr:   '#1c1c1c',
        bdr2:  '#272727',
        bdrg:  '#383838',
        txt:   '#ededed',
        txt2:  '#8b8b8b',
        txt3:  '#565656',
        gold:  '#8b5cf6',
        gold2: '#a78bfa',
        gold3: '#d4c4ff',
        navy:  '#1f1235',
        navy2: '#2d1a4d',
        green: '#2ecc71',
        red:   '#d0453a',
        blue:  '#8b5cf6',
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        mono:     ['Geist Mono', 'monospace'],
        body:     ['Geist', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
