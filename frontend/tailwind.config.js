/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--q-ink)',
        muted: 'var(--q-muted)',
        line: 'var(--q-line)',
        canvas: 'var(--q-canvas)',
        brand: 'var(--q-green)',
        'brand-dark': '#174b3d',
        mint: '#dff3eb',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 8px 28px rgba(16, 24, 40, 0.045)',
      },
    },
  },
  plugins: [],
};
