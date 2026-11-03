"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toE164, type SendChannel } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { connectInstance, setWebhook } from "@growvibe/core/server";
import { getDb, registerOptOut } from "@growvibe/db";
import { requireRole } from "@/lib/auth";
import { resumeChannel } from "@/lib/queue";

export async function resumeChannelAction(channel: SendChannel) {
  await requireRole("admin");
  await resumeChannel(channel);
  revalidatePath("/settings");
}

/** QR de vinculación (solo admin). Única llamada directa de la web a Evolution: es interactiva. */
export async function whatsappQrAction(): Promise<{ qr?: string; state?: string; error?: string }> {
  await requireRole("admin");
  const env = serverEnv();
  if (!env.EVOLUTION_API_KEY) return { error: "Falta EVOLUTION_API_KEY" };
  try {
    const r = await connectInstance({ url: env.EVOLUTION_API_URL, apiKey: env.EVOLUTION_API_KEY, instance: env.EVOLUTION_INSTANCE });
    return r.qr ? { qr: r.qr } : { state: r.state ?? "open" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo conectar con Evolution" };
  }
}

const manualOptOut = z.object({ contact: z.string().trim().min(5) });

export async function addOptOutAction(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  await requireRole("admin");
  const parsed = manualOptOut.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Escribe un teléfono o email" };
  const c = parsed.data.contact;
  const target = c.includes("@") ? { email: c.toLowerCase() } : { phone: toE164(c) ?? undefined };
  if (!target.email && !target.phone) return { error: "Teléfono inválido" };
  await registerOptOut(getDb(), target, "Agregado manualmente");
  revalidatePath("/settings");
  return { ok: true };
}

/** Apunta el webhook de la instancia de Evolution a GrowVibe (reemplaza el anterior). */
export async function setWebhookAction(): Promise<{ ok?: boolean; error?: string }> {
  await requireRole("admin");
  const env = serverEnv();
  if (!env.EVOLUTION_API_KEY) return { error: "Falta EVOLUTION_API_KEY" };
  if (!env.EVOLUTION_WEBHOOK_SECRET || env.EVOLUTION_WEBHOOK_SECRET.length < 16) {
    return { error: "Define EVOLUTION_WEBHOOK_SECRET (mínimo 16 caracteres aleatorios)" };
  }
  if (!env.APP_URL.startsWith("https://")) return { error: `APP_URL debe ser el dominio público https de la app (ahora: ${env.APP_URL})` };
  try {
    await setWebhook(
      { url: env.EVOLUTION_API_URL, apiKey: env.EVOLUTION_API_KEY, instance: env.EVOLUTION_INSTANCE },
      `${env.APP_URL.replace(/\/$/, "")}/api/webhooks/evolution/${env.EVOLUTION_WEBHOOK_SECRET}`,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo configurar" };
  }
  revalidatePath("/settings");
  return { ok: true };
}
