import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@number-flow/react": path.resolve(
        __dirname,
        "src/test/mocks/number-flow-react.tsx",
      ),
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
