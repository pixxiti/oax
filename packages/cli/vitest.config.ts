import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", "tests/test-output/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/test.ts"],
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
