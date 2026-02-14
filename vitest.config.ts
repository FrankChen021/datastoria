import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      "**/external/**",
      "**/worktrees/**",
    ],
  },
});
