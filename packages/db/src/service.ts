import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@growvibe/core/env";
import type { Database } from "./types";

/**
 * Cliente con service role: salta RLS. Solo para el worker y webhooks del servidor.
 * NUNCA importarlo desde código que llegue al navegador.
 */
export function createServiceClient() {
  const env = serverEnv();
  return createClient<Database, "growvibe">(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "growvibe" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
