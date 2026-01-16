import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/define.ts",
    "src/client.ts",
    "src/rpc/index.ts",
    "src/events/index.ts",
    "src/resilience/index.ts",
    "src/tracing/index.ts",
    "src/serialization/index.ts",
    "src/transports/cloudflare/index.ts",
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
