import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/types.ts",
    "src/adapters/index.ts",
    "src/adapters/memory.ts",
    "src/adapters/cloudflare.ts",
    "src/adapters/qstash.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  target: "es2022",
  outDir: "dist",
  external: ["@upstash/qstash"],
});
