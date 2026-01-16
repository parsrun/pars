import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/types.ts",
    "src/providers/index.ts",
    "src/providers/resend.ts",
    "src/providers/sendgrid.ts",
    "src/providers/postmark.ts",
    "src/providers/console.ts",
    "src/templates/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  target: "es2022",
  outDir: "dist",
  external: ["resend"],
});
