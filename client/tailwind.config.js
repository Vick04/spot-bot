/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00d4ff',
        dark: '#0f0f1e',
        darkalt: '#1a1a2e',
      },
    },
  },
  plugins: [],
}
