import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@vizlayer/core": path.resolve(__dirname, "external/vizlayer/packages/core/src/index.ts"),
      "@vizlayer/react": path.resolve(__dirname, "external/vizlayer/packages/react/src/index.ts"),
      "server-only": path.resolve(__dirname, "src/test/server-only.ts"),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "**/external/**", "**/worktrees/**"],
  },
});
