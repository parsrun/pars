import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/adapters/postgres.ts",
    "src/adapters/neon.ts",
    "src/adapters/d1.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  target: "es2022",
  outDir: "dist",
  external: ["postgres", "@neondatabase/serverless"],
});
