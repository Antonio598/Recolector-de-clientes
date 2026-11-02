"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { roleSchema, settingsSchema } from "@growvibe/core";
import { createServiceClient } from "@growvibe/db/service";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string } | undefined;

export async function saveSettings(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = settingsSchema.safeParse({
    whatsapp_daily_limit: formData.get("whatsapp_daily_limit"),
    email_daily_limit: formData.get("email_daily_limit"),
    send_window_start: formData.get("send_window_start"),
    send_window_end: formData.get("send_window_end"),
    send_days: formData.getAll("send_days"),
    min_delay_seconds: formData.get("min_delay_seconds"),
    max_delay_seconds: formData.get("max_delay_seconds"),
    warmup_enabled: formData.get("warmup_enabled") === "on",
    sender_signature: (formData.get("sender_signature") as string) || null,
    privacy_url: (formData.get("privacy_url") as string) ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  // Con la sesión del admin: RLS confirma el permiso también en la base.
  const db = await supabaseServer();
  const { error } = await db.from("settings").update(parsed.data).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true, message: "Ajustes guardados" };
}

const newUserSchema = z.object({
  email: z.string().email("Email inválido"),
  full_name: z.string().min(1, "Nombre requerido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  role: roleSchema,
});

export async function createUser(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = newUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });
  if (error || !data.user) {
    // auth.users es compartido con otra app: si el email ya existe ahí,
    // se le da acceso con el SQL de supabase/sql-editor/02_primer_admin.sql.
    return { ok: false, error: error?.message ?? "No se pudo crear el usuario" };
  }

  // Sin trigger: el perfil de GrowVibe se crea aquí de forma explícita.
  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: data.user.id, full_name: parsed.data.full_name, role: parsed.data.role });
  if (profileError) return { ok: false, error: profileError.message };

  revalidatePath("/settings");
  return { ok: true, message: `Usuario ${parsed.data.email} creado` };
}

export async function setRole(userId: string, role: string): Promise<ActionResult> {
  const me = await requireRole("admin");
  const parsedRole = roleSchema.safeParse(role);
  if (!parsedRole.success) return { ok: false, error: "Rol inválido" };
  if (userId === me.id) return { ok: false, error: "No puedes cambiar tu propio rol" };

  const db = await supabaseServer();
  const { error } = await db.from("profiles").update({ role: parsedRole.data }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true, message: "Rol actualizado" };
}
