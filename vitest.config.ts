import { defineConfig } from "vitest/config";

// Config dedicado ao Vitest (tem precedência sobre vite.config.ts, que é da UI).
export default defineConfig({
  root: ".",
  test: {
    include: ["src/**/*.test.ts"],
  },
});
