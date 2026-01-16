import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/runtime.ts",
    "src/env.ts",
    "src/logger.ts",
    "src/decimal.ts",
    "src/errors.ts",
    "src/types.ts",
    "src/error-codes.ts",
    "src/transports/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  target: "es2022",
  outDir: "dist",
});
