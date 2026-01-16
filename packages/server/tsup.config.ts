import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/app.ts",
    "src/context.ts",
    "src/module-loader.ts",
    "src/rls.ts",
    "src/rbac.ts",
    "src/health.ts",
    "src/middleware/index.ts",
    "src/validation/index.ts",
    "src/utils/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  target: "es2022",
  outDir: "dist",
  external: ["hono", "arktype"],
});
