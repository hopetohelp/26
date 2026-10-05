/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Heebo", "system-ui", "Arial", "sans-serif"] },
      colors: {
        ink: { DEFAULT: "#1d2433", soft: "#4b5568", faint: "#7a8496" },
        paper: { DEFAULT: "#f7f6f2", card: "#ffffff", line: "#e3e1da" },
        accent: { DEFAULT: "#1f5f8b", soft: "#e6f0f6" },
        warn: { DEFAULT: "#8a4b00", soft: "#fff3e0" },
      },
    },
  },
  plugins: [],
};
