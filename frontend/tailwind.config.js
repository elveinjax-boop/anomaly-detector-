/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        app: {
          bg: "#050505",
          panel: "rgba(15, 15, 15, 0.6)",
          panelBorder: "rgba(255, 255, 255, 0.08)",
          accent: "#0ea5e9", // cyan-500
          danger: "#f43f5e", // rose-500
          success: "#10b981", // emerald-500
        }
      },
      boxShadow: {
        glow: "0 0 20px rgba(14, 165, 233, 0.5)",
        "glow-danger": "0 0 20px rgba(244, 63, 94, 0.5)",
        "glow-success": "0 0 20px rgba(16, 185, 129, 0.5)",
        glass: "0 4px 30px rgba(0, 0, 0, 0.5)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 3s ease-in-out infinite",
        "slide-up": "slide-up 0.3s ease-out",
        "slide-down": "slide-down 0.3s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      }
    }
  },
  plugins: []
};
