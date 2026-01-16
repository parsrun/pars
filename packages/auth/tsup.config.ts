import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/storage/index.ts",
    "src/session/index.ts",
    "src/security/index.ts",
    "src/providers/index.ts",
    "src/providers/otp/index.ts",
    "src/adapters/index.ts",
    "src/adapters/hono.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: "es2022",
  external: ["hono", "ioredis", "@upstash/redis", "drizzle-orm"],
});
