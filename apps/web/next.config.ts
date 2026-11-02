import path from "node:path";
import type { NextConfig } from "next";

// En desarrollo, web y worker comparten el .env de la raíz del monorepo.
try {
  process.loadEnvFile(path.resolve(__dirname, "../../.env"));
} catch {
  // En Docker no hay .env: las variables llegan por env_file / build args.
}

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  transpilePackages: ["@growvibe/core", "@growvibe/db"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
