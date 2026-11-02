import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@growvibe/db/server";

/** Cliente Supabase con la sesión del usuario (respeta RLS). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(store);
}
