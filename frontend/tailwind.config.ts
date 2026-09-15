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
        gold:  '#3a72c4',
        gold2: '#5b93de',
        gold3: '#9cc0f5',
        navy:  '#14213d',
        navy2: '#1c2e52',
        green: '#2ecc71',
        red:   '#d0453a',
        blue:  '#3a72c4',
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
