import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@growvibe/db";
import type { Role } from "@growvibe/core";
import { supabaseServer } from "./supabase";

export const currentSession = cache(async () => {
  const db = await supabaseServer();
  return getSession(db);
});

/**
 * Exige sesión Y perfil en GrowVibe.
 * Sin sesión → /login. Con sesión pero sin perfil (usuario de otra app) → /sin-acceso.
 */
export async function requireUser() {
  const session = await currentSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/sin-acceso");
  return session.profile;
}

/** Exige un rol; si no lo tiene, manda al inicio. */
export async function requireRole(role: Role) {
  const user = await requireUser();
  if (user.role !== role) redirect("/?denied=1");
  return user;
}
