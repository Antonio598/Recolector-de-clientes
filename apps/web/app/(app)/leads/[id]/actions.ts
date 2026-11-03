"use server";

import { revalidatePath } from "next/cache";
import { emailBodySchema, emailSubjectSchema, whatsappMessageSchema } from "@growvibe/core";
import { getDb, getMessage, insertEvent, updateMessageContent } from "@growvibe/db";
import { requireRole } from "@/lib/auth";

export type SaveState = { ok?: boolean; error?: string } | undefined;

/** Edita un mensaje en cola. Aplica las mismas reglas que se le exigen a Claude. */
export async function saveMessageAction(messageId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const me = await requireRole("admin");
  const db = getDb();
  const msg = await getMessage(db, messageId);
  if (!msg) return { error: "El mensaje no existe" };
  if (msg.status !== "en_cola") return { error: "Solo se pueden editar mensajes que aún no se envían" };

  const body = String(formData.get("body") ?? "");
  let subject: string | null = null;
  const bodyCheck = (msg.channel === "whatsapp" ? whatsappMessageSchema : emailBodySchema).safeParse(body);
  if (!bodyCheck.success) return { error: bodyCheck.error.issues[0]?.message };
  if (msg.channel === "email") {
    const s = emailSubjectSchema.safeParse(String(formData.get("subject") ?? ""));
    if (!s.success) return { error: s.error.issues[0]?.message };
    subject = s.data;
  }

  await updateMessageContent(db, messageId, { subject, body: bodyCheck.data });
  if (msg.leadId) {
    await insertEvent(db, msg.leadId, "mensaje_editado", { channel: msg.channel, by: me.email });
    revalidatePath(`/leads/${msg.leadId}`);
  }
  return { ok: true };
}
