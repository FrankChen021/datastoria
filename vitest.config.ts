import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@number-flow/react": path.resolve(
        __dirname,
        "external/number-flow/packages/react/src/index.tsx"
      ),
      "@vizlayer/core": path.resolve(__dirname, "external/vizlayer/packages/core/src/index.ts"),
      "@vizlayer/react": path.resolve(__dirname, "external/vizlayer/packages/react/src/index.ts"),
      "number-flow": path.resolve(
        __dirname,
        "external/number-flow/packages/number-flow/src/index.ts"
      ),
      "number-flow/group": path.resolve(
        __dirname,
        "external/number-flow/packages/number-flow/src/group.ts"
      ),
      "number-flow/lite": path.resolve(
        __dirname,
        "external/number-flow/packages/number-flow/src/lite.ts"
      ),
      "number-flow/plugins": path.resolve(
        __dirname,
        "external/number-flow/packages/number-flow/src/plugins/index.ts"
      ),
      "server-only": path.resolve(__dirname, "src/test/server-only.ts"),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "**/external/**", "**/worktrees/**"],
  },
});
