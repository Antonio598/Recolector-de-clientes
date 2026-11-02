import { createServerClient as createSsrServerClient, type CookieOptions } from "@supabase/ssr";
import { publicEnv } from "@growvibe/core/env";
import type { Database } from "./types";

export interface CookieStore {
  getAll(): { name: string; value: string }[];
  set?(name: string, value: string, options: CookieOptions): void;
}

/**
 * Cliente para Server Components / Route Handlers / Server Actions.
 * Recibe el cookie store de Next (`await cookies()`) para no depender de Next aquí.
 */
export function createServerClient(cookieStore: CookieStore) {
  const env = publicEnv();
  return createSsrServerClient<Database, "growvibe">(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    db: { schema: "growvibe" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set?.(name, value, options);
        } catch {
          // En Server Components no se pueden escribir cookies; el middleware refresca la sesión.
        }
      },
    },
  });
}
