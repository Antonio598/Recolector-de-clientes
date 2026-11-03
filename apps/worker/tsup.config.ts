import { defineConfig } from "tsup";

// Empaqueta los paquetes del workspace (se publican como TS fuente) y drizzle-orm (lo usa @growvibe/db).
// El resto (pg, bullmq, @anthropic-ai/sdk, zod, libphonenumber-js) son dependencias directas del worker.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  noExternal: [/^@growvibe\//, /^drizzle-orm/],
});
