import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { serverEnv } from "@growvibe/core/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

// Un solo pool por proceso (también sobrevive al hot-reload de Next en desarrollo).
const g = globalThis as unknown as { __growvibeDb?: Db };

export function getDb(): Db {
  if (!g.__growvibeDb) {
    // keepAlive + idleTimeout: evita usar conexiones que el pooler del servidor ya cerró por inactividad.
    const pool = new pg.Pool({
      connectionString: serverEnv().DATABASE_URL,
      max: 10,
      keepAlive: true,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
    pool.on("error", (err) => console.error("[db] error del pool:", err.message));
    g.__growvibeDb = drizzle(pool, { schema });
  }
  return g.__growvibeDb;
}
