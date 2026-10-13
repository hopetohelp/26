import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// נתיבים יחסיים שומרים על בנייה תקינה בתצוגה מקדימה ובדומיין הפרטי.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2020", sourcemap: false },
  test: { environment: "node", include: ["src/**/*.test.ts", "worker/**/*.test.js"], setupFiles: ["worker/crowd/test/setup.js"] },
});
