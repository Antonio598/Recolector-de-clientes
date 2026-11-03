import { classifyJobId, parseBrevoWebhook } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { emailHardBounceRate, findLeadByEmail, getDb, insertIncomingMessage, registerOptOut, updateOutStatusByProvider } from "@growvibe/db";
import { getQueue, pauseChannel } from "@/lib/queue";
import { validSecret } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";

const MAX_HARD_BOUNCE = 0.05;

/** Webhook de Brevo: eventos transaccionales e inbound parsing (respuestas). */
export async function POST(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (!validSecret(secret, serverEnv().BREVO_WEBHOOK_SECRET)) return new Response("No autorizado", { status: 401 });

  const body = await req.json().catch(() => null);
  const db = getDb();
  for (const ev of parseBrevoWebhook(body)) {
    try {
      if (ev.type === "status") {
        await updateOutStatusByProvider(db, ev.providerId, ev.status);
        if (ev.optOut) await registerOptOut(db, { email: ev.email }, ev.optOut);
        if (ev.hardBounce) {
          const rate = await emailHardBounceRate(db);
          if (rate !== null && rate > MAX_HARD_BOUNCE) {
            await pauseChannel("email", `Rebotes duros de email al ${(rate * 100).toFixed(1)} % (máx. 5 %)`);
          }
        }
      } else {
        const leadId = await findLeadByEmail(db, ev.fromEmail);
        if (!leadId) continue;
        const messageId = await insertIncomingMessage(db, {
          leadId,
          channel: "email",
          body: ev.text,
          subject: ev.subject,
          providerId: ev.providerId,
        });
        if (messageId) await getQueue("classify-reply").add("classify", { messageId }, { jobId: classifyJobId(messageId) });
      }
    } catch (e) {
      console.error("[webhook brevo]", e);
    }
  }
  return Response.json({ ok: true });
}
