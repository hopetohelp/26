import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// האתר מתפרסם בנתיב יחסי, כדי שיעבוד גם בתת-תיקייה (GitHub Pages) וגם בשורש (Cloudflare)
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2020", sourcemap: false },
  test: { environment: "node", include: ["src/**/*.test.ts", "worker/**/*.test.js"] },
});
