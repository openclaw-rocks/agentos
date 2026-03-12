/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          0: "rgb(var(--color-surface-0) / <alpha-value>)",
          1: "rgb(var(--color-surface-1) / <alpha-value>)",
          2: "rgb(var(--color-surface-2) / <alpha-value>)",
          3: "rgb(var(--color-surface-3) / <alpha-value>)",
          4: "rgb(var(--color-surface-4) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          hover: "rgb(var(--color-accent-hover) / <alpha-value>)",
          muted: "rgb(var(--color-accent-muted) / <alpha-value>)",
        },
        status: {
          success: "rgb(var(--color-status-success) / <alpha-value>)",
          warning: "rgb(var(--color-status-warning) / <alpha-value>)",
          error: "rgb(var(--color-status-error) / <alpha-value>)",
          info: "rgb(var(--color-status-info) / <alpha-value>)",
          pending: "rgb(var(--color-status-pending) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--color-border) / <alpha-value>)",
          focus: "rgb(var(--color-border-focus) / <alpha-value>)",
        },
        siri: {
          teal: "rgb(var(--siri-teal) / <alpha-value>)",
          pink: "rgb(var(--siri-pink) / <alpha-value>)",
          purple: "rgb(var(--siri-purple) / <alpha-value>)",
          blue: "rgb(var(--siri-blue) / <alpha-value>)",
          orange: "rgb(var(--siri-orange) / <alpha-value>)",
        },
      },
      textColor: {
        primary: "rgb(var(--color-text-primary) / <alpha-value>)",
        secondary: "rgb(var(--color-text-secondary) / <alpha-value>)",
        muted: "rgb(var(--color-text-muted) / <alpha-value>)",
        faint: "rgb(var(--color-text-faint) / <alpha-value>)",
        inverse: "rgb(var(--color-text-inverse) / <alpha-value>)",
      },
      placeholderColor: {
        muted: "rgb(var(--color-placeholder) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      keyframes: {
        "float-up": {
          "0%": { opacity: "1", transform: "translateX(-50%) translateY(0)" },
          "100%": { opacity: "0", transform: "translateX(-50%) translateY(-80px)" },
        },
      },
      animation: {
        "float-up": "float-up 3s ease-out forwards",
      },
    },
  },
  plugins: [],
};
