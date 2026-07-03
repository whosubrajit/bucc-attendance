import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // BUCC brand: deep navy + electric blue
        navy: {
          50: "#eef3fb",
          100: "#d9e4f6",
          200: "#b3c9ed",
          300: "#7fa4df",
          400: "#4a7bce",
          500: "#2b5cb8",
          600: "#1f4694",
          700: "#193774",
          800: "#152c5b",
          900: "#0e1e3f",
          950: "#081226",
        },
        electric: {
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
        },
      },
      keyframes: {
        "pulse-dot": { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.4" } },
      },
      animation: { "pulse-dot": "pulse-dot 1.5s ease-in-out infinite" },
    },
  },
  plugins: [],
};
export default config;
