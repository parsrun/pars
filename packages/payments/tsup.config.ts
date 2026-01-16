import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/types.ts",
    "src/providers/index.ts",
    "src/providers/stripe.ts",
    "src/providers/paddle.ts",
    "src/providers/iyzico.ts",
    "src/webhooks/index.ts",
    "src/billing/index.ts",
    "src/usage/index.ts",
    "src/dunning/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  target: "es2022",
  outDir: "dist",
  // Mark drizzle-orm as external (peer dependency)
  external: [
    "drizzle-orm",
    "drizzle-orm/pg-core",
    "drizzle-orm/postgres-js",
    "drizzle-orm/neon-http",
  ],
});
