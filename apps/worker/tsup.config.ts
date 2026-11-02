import { defineConfig } from "tsup";

// Empaqueta los paquetes del workspace (se publican como TS fuente).
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  noExternal: [/^@growvibe\//],
});
