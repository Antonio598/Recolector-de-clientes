import { classifyJobId, isExplicitOptOut, parseEvolutionWebhook } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { findLeadByPhoneDigits, getDb, getLead, insertIncomingMessage, registerOptOut, updateOutStatusByProvider } from "@growvibe/db";
import { getQueue, pauseChannel } from "@/lib/queue";
import { validSecret } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";

/** Webhook de Evolution: mensajes entrantes, estados (entregado/leído) y conexión. */
export async function POST(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (!validSecret(secret, serverEnv().EVOLUTION_WEBHOOK_SECRET)) return new Response("No autorizado", { status: 401 });

  const body = await req.json().catch(() => null);
  const db = getDb();
  for (const ev of parseEvolutionWebhook(body)) {
    try {
      if (ev.type === "incoming") {
        const leadId = await findLeadByPhoneDigits(db, ev.phoneDigits);
        if (!leadId) continue; // no es un prospecto
        const messageId = await insertIncomingMessage(db, { leadId, channel: "whatsapp", body: ev.text, providerId: ev.providerId });
        if (!messageId) continue; // duplicado
        if (isExplicitOptOut(ev.text)) {
          // "BAJA": se registra al instante; la clasificación lo confirma después.
          const lead = await getLead(db, leadId);
          if (lead?.phoneE164) await registerOptOut(db, { phone: lead.phoneE164 }, `Respondió: "${ev.text.slice(0, 60)}"`);
        }
        await getQueue("classify-reply").add("classify", { messageId }, { jobId: classifyJobId(messageId) });
      } else if (ev.type === "status") {
        await updateOutStatusByProvider(db, ev.providerId, ev.status);
      } else if (ev.type === "connection" && ev.state !== "open" && ev.state !== "connecting") {
        await pauseChannel("whatsapp", `WhatsApp desconectado (${ev.state})`);
      }
    } catch (e) {
      console.error("[webhook evolution]", e);
    }
  }
  return Response.json({ ok: true });
}
