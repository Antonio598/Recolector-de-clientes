"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assignLead, getDb, getLead, insertEvent, insertManualReply, listMessages } from "@growvibe/db";
import { requireUser } from "@/lib/auth";
import { getQueue } from "@/lib/queue";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const replySchema = z.object({
  channel: z.enum(["whatsapp", "email"]),
  body: z.string().trim().min(1, "Escribe la respuesta").max(2000, "Máximo 2000 caracteres"),
});

export type ReplyState = { ok?: boolean; error?: string } | undefined;

/** Responde desde la app por el mismo canal. Admin, o el vendedor asignado al lead. */
export async function sendReplyAction(leadId: string, _prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const me = await requireUser();
  const db = getDb();
  const lead = await getLead(db, leadId);
  if (!lead) return { error: "El lead no existe" };
  if (me.role !== "admin" && lead.assignedTo !== me.id) return { error: "Toma el lead antes de responder" };
  if (lead.status === "baja") return { error: "Este contacto se dio de baja: no se le puede escribir" };

  const parsed = replySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { channel, body } = parsed.data;
  if (channel === "whatsapp" && !lead.hasWhatsapp) return { error: "El lead no tiene WhatsApp" };
  if (channel === "email" && !lead.email) return { error: "El lead no tiene email" };

  let subject: string | null = null;
  let content = body;
  if (channel === "email") {
    const history = await listMessages(db, leadId);
    const lastSubject = [...history].reverse().find((m) => m.channel === "email" && m.subject)?.subject ?? "Seguimiento";
    subject = lastSubject.startsWith("Re:") ? lastSubject : `Re: ${lastSubject}`;
    content = body
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  const messageId = await insertManualReply(db, leadId, channel, content, subject);
  await insertEvent(db, leadId, "respuesta_enviada", { channel, by: me.email });
  if (!lead.assignedTo) await assignLead(db, leadId, me.id);
  // Respuesta conversacional: sale de inmediato (no pasa por el scheduler de prospección). Un intento.
  await getQueue(channel === "whatsapp" ? "send-whatsapp" : "send-email").add(
    "reply",
    { messageId },
    { jobId: `reply-${messageId}`, attempts: 1 },
  );
  revalidatePath("/inbox");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

/** El vendedor toma un lead sin asignar (el admin puede tomar cualquiera). */
export async function takeLeadAction(leadId: string) {
  const me = await requireUser();
  const db = getDb();
  const lead = await getLead(db, leadId);
  if (!lead) return;
  if (lead.assignedTo && me.role !== "admin") return;
  await assignLead(db, leadId, me.id);
  revalidatePath("/inbox");
  revalidatePath(`/leads/${leadId}`);
}
