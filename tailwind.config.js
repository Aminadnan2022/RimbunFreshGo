/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          50: '#f0faf4',
          100: '#dcf5e7',
          200: '#bbebd2',
          300: '#89d9b3',
          400: '#52c08e',
          500: '#2ea36e',
          600: '#1e8458',
          700: '#196848',
          800: '#16533b',
          900: '#134530',
          950: '#0a2a1e',
        },
        jade: {
          50: '#f0fdf6',
          100: '#dcfce9',
          200: '#bbf7d3',
          300: '#86efb5',
          400: '#4ade8a',
          500: '#22c564',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        cream: {
          50: '#fdfcf8',
          100: '#faf8f2',
          200: '#f5f1e8',
          300: '#ede7d6',
          400: '#ddd4be',
          500: '#c9bda3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        'soft': '0 2px 16px 0 rgba(0,0,0,0.06)',
        'card': '0 4px 24px 0 rgba(0,0,0,0.08)',
        'card-hover': '0 8px 32px 0 rgba(0,0,0,0.12)',
        'green': '0 4px 20px 0 rgba(22,101,72,0.2)',
      },
    },
  },
  plugins: [],
};
