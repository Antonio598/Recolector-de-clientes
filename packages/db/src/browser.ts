import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/** Cliente para componentes de cliente (navegador). Usa la anon key + sesión. */
export function createBrowserClient() {
  return createSsrBrowserClient<Database, "growvibe">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "growvibe" } },
  );
}
