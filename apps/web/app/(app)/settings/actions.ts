"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { roleSchema, settingsSchema } from "@growvibe/core";
import { createUser as insertUser, findUserByEmail, getDb, setUserRole, updateSettings } from "@growvibe/db";
import { hashPassword, requireRole } from "@/lib/auth";

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

  const s = parsed.data;
  await updateSettings(getDb(), {
    whatsappDailyLimit: s.whatsapp_daily_limit,
    emailDailyLimit: s.email_daily_limit,
    sendWindowStart: s.send_window_start,
    sendWindowEnd: s.send_window_end,
    sendDays: s.send_days,
    minDelaySeconds: s.min_delay_seconds,
    maxDelaySeconds: s.max_delay_seconds,
    warmupEnabled: s.warmup_enabled,
    senderSignature: s.sender_signature,
    privacyUrl: s.privacy_url,
  });
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

  const db = getDb();
  if (await findUserByEmail(db, parsed.data.email)) {
    return { ok: false, error: "Ya existe un usuario con ese email" };
  }
  await insertUser(db, {
    email: parsed.data.email.toLowerCase(),
    fullName: parsed.data.full_name,
    role: parsed.data.role,
    passwordHash: await hashPassword(parsed.data.password),
  });
  revalidatePath("/settings");
  return { ok: true, message: `Usuario ${parsed.data.email} creado` };
}

export async function setRole(userId: string, role: string): Promise<ActionResult> {
  const me = await requireRole("admin");
  const parsedRole = roleSchema.safeParse(role);
  if (!parsedRole.success) return { ok: false, error: "Rol inválido" };
  if (userId === me.id) return { ok: false, error: "No puedes cambiar tu propio rol" };

  await setUserRole(getDb(), userId, parsedRole.data);
  revalidatePath("/settings");
  return { ok: true, message: "Rol actualizado" };
}
