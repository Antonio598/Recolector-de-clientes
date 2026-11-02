import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, Tables } from "./types";

export type Db = SupabaseClient<Database, "growvibe">;
export type Profile = Tables<"profiles">;
export type Settings = Tables<"settings">;

/**
 * Sesión actual. `profile` es null si el usuario existe en Supabase Auth
 * (por ejemplo, es de otra app que comparte la base) pero no tiene acceso a GrowVibe.
 */
export async function getSession(
  db: Db,
): Promise<{ user: User; profile: (Profile & { email: string | null }) | null } | null> {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { user, profile: data ? { ...data, email: user.email ?? null } : null };
}

export async function getSettings(db: Db): Promise<Settings | null> {
  const { data } = await db.from("settings").select("*").eq("id", 1).single();
  return data;
}

export async function listProfiles(db: Db): Promise<Profile[]> {
  const { data } = await db.from("profiles").select("*").order("full_name");
  return data ?? [];
}
