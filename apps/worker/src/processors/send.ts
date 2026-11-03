import type { Job } from "bullmq";
import { sanitizeEmailHtml, type SendJobData } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { htmlToText, sendBrevoEmail, sendWhatsappText } from "@growvibe/core/server";
import { makeUnsubscribeToken } from "@growvibe/core/unsubscribe";
import {
  cancelMessage,
  contactBlockReason,
  getDb,
  getSendContext,
  getSettings,
  markMessageFailed,
  markMessageSent,
  unscheduleMessage,
} from "@growvibe/db";
import { requireEnv } from "../lib";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Comprobaciones comunes. Devuelve el contexto o null si el mensaje ya no debe enviarse. */
async function prepare(job: Job<SendJobData>) {
  const db = getDb();
  const ctx = await getSendContext(db, job.data.messageId);
  if (!ctx || ctx.message.status !== "en_cola") return null;
  // "reply" = respuesta manual del vendedor: no depende del estado de la campaña, solo de las bajas.
  const isReply = job.name === "reply";
  if (!isReply && ctx.campaign.status !== "enviando") {
    // La campaña se pausó mientras esperaba: vuelve a la cola sin programar.
    await unscheduleMessage(db, job.data.messageId);
    return null;
  }
  const block = await contactBlockReason(db, ctx.lead.id, ctx.lead.phoneE164, ctx.lead.email, { onlyOptOut: isReply });
  if (block) {
    await cancelMessage(db, ctx.message.id, ctx.lead.id, block);
    return null;
  }
  return ctx;
}

async function onError(job: Job<SendJobData>, leadId: string | undefined, e: unknown): Promise<never> {
  const msg = e instanceof Error ? e.message : String(e);
  const last = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  if (last && leadId) await markMessageFailed(getDb(), job.data.messageId, leadId, msg);
  throw e;
}

export async function sendWhatsappProcessor(job: Job<SendJobData>) {
  const ctx = await prepare(job);
  if (!ctx) return { skipped: true };
  const env = serverEnv();
  const number = ctx.lead.whatsappJid?.split("@")[0] ?? ctx.lead.phoneE164?.replace(/\D/g, "");
  if (!number) return onError(job, ctx.lead.id, new Error("El lead no tiene número"));
  try {
    const providerId = await sendWhatsappText(
      { url: env.EVOLUTION_API_URL, apiKey: requireEnv("EVOLUTION_API_KEY"), instance: env.EVOLUTION_INSTANCE },
      number,
      ctx.message.body,
      1500 + Math.round(Math.random() * 2500),
    );
    await markMessageSent(getDb(), ctx.message.id, ctx.lead.id, providerId, "whatsapp");
    return { sent: true, providerId };
  } catch (e) {
    return onError(job, ctx.lead.id, e);
  }
}

export async function sendEmailProcessor(job: Job<SendJobData>) {
  const ctx = await prepare(job);
  if (!ctx) return { skipped: true };
  const env = serverEnv();
  const secret = env.UNSUBSCRIBE_SECRET;
  if (!ctx.lead.email) return onError(job, ctx.lead.id, new Error("El lead no tiene email"));
  if (!secret) return onError(job, ctx.lead.id, new Error("Falta UNSUBSCRIBE_SECRET"));
  try {
    const settings = await getSettings(getDb());
    const token = makeUnsubscribeToken(secret, { email: ctx.lead.email });
    const unsubscribeUrl = `${env.APP_URL}/u/${token}`;
    const oneClickUrl = `${env.APP_URL}/api/unsubscribe/${token}`;

    const signature = settings?.senderSignature
      ? `<p>${escapeHtml(settings.senderSignature).replace(/\n/g, "<br>")}</p>`
      : "";
    const privacy = settings?.privacyUrl
      ? ` · <a href="${escapeHtml(settings.privacyUrl)}">Aviso de privacidad</a>`
      : "";
    const footer = `<p style="font-size:12px;color:#64748b">Si no desea recibir más correos, <a href="${unsubscribeUrl}">dése de baja aquí</a>${privacy}.</p>`;
    const html = `${sanitizeEmailHtml(ctx.message.body)}${signature}${footer}`;
    const text = `${htmlToText(ctx.message.body)}\n\n${settings?.senderSignature ?? ""}\n\nDarse de baja: ${unsubscribeUrl}${
      settings?.privacyUrl ? `\nAviso de privacidad: ${settings.privacyUrl}` : ""
    }`;

    const providerId = await sendBrevoEmail(
      {
        apiKey: requireEnvBrevo(env.BREVO_API_KEY),
        senderEmail: env.BREVO_SENDER_EMAIL!,
        senderName: env.BREVO_SENDER_NAME,
        replyTo: env.BREVO_REPLY_TO || undefined,
      },
      {
        to: { email: ctx.lead.email, name: ctx.lead.name },
        subject: ctx.message.subject ?? "",
        html,
        text,
        tags: [`campaign:${ctx.campaign.id}`],
        unsubscribeUrl,
        oneClickUrl,
      },
    );
    await markMessageSent(getDb(), ctx.message.id, ctx.lead.id, providerId, "email");
    return { sent: true, providerId };
  } catch (e) {
    return onError(job, ctx.lead.id, e);
  }
}

function requireEnvBrevo(key: string | undefined) {
  if (!key) throw new Error("Falta BREVO_API_KEY");
  return key;
}
