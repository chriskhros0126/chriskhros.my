/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        primary: ['Syne', 'sans-serif'],
        secondary: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
        'brand-primary': '#fcffd7',
        'brand-accent': 'rgb(196, 198, 168)',
        'brand-vibrant-purple': '#a855f7',
        'brand-vibrant-blue': '#3b82f6',
        'brand-vibrant-teal': '#2dd4bf',
        'brand-vibrant-pink': '#ec4899',
        'neutral-background': '#fcffd7',
        'text-dark': 'rgb(26, 26, 26)',
        hub: {
          dark: '#0c0f17',
          surface: '#121722',
          surfaceHover: '#181f2e',
          border: '#232b3d',
          accent: '#2dd4bf',
        }
      },
      borderRadius: {
        'xl': '24px',
        '2xl': '36px',
        '3xl': '50px',
      },
      keyframes: {
        'blob-float': {
          '0%': { transform: 'translate(0px, 0px) rotate(0deg) scale(1)' },
          '33%': { transform: 'translate(100px, -150px) rotate(120deg) scale(1.2)' },
          '66%': { transform: 'translate(-100px, 100px) rotate(240deg) scale(0.8)' },
          '100%': { transform: 'translate(0px, 0px) rotate(360deg) scale(1)' },
        },
      },
      animation: {
        'blob': 'blob-float 20s linear infinite',
      }
    },
  },
  plugins: [],
};
