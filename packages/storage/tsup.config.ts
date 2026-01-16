import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/adapters/s3.ts",
    "src/adapters/r2.ts",
    "src/adapters/memory.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  target: "es2022",
  outDir: "dist",
  external: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
});
