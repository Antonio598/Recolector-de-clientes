import Anthropic from "@anthropic-ai/sdk";
import type { Job } from "bullmq";
import { MIN_SCORE, type QualifyJobData, type QualifyProgress } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { qualifyAndWrite } from "@growvibe/core/server";
import {
  getCampaign,
  getDb,
  getSettings,
  insertEvent,
  leadsEligibleForQualify,
  replaceQueuedMessages,
  updateLead,
  type Lead,
} from "@growvibe/db";
import { mapLimit, requireEnv } from "../lib";

const CONCURRENCY = 4;

/**
 * Paso 6: Claude califica y redacta. score < 40 → descartado; si no, calificado con sus mensajes en cola.
 * Se lanza desde la UI con un límite de leads (los de más reseñas primero). Idempotente: solo toma leads "nuevo".
 */
export async function qualifyProcessor(job: Job<QualifyJobData>) {
  const db = getDb();
  const campaign = await getCampaign(db, job.data.campaignId);
  if (!campaign) return { skipped: "campaña no existe" };

  const env = serverEnv();
  const claude = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const settings = await getSettings(db);
  const leads = await leadsEligibleForQualify(db, campaign.id, campaign.channels, job.data.limit);
  const progress: QualifyProgress = { done: 0, total: leads.length, qualified: 0, discarded: 0, failed: 0 };
  let lastError = "";

  await mapLimit(leads, CONCURRENCY, async (lead: Lead) => {
    try {
      const r = await qualifyAndWrite(claude, env.CLAUDE_MODEL_GENERATE, {
        service: campaign.service,
        signature: settings?.senderSignature ?? null,
        business: {
          name: lead.name,
          niche: lead.niche,
          address: lead.address,
          rating: lead.rating,
          reviewsCount: lead.reviewsCount,
          website: lead.website,
          hasWhatsapp: lead.hasWhatsapp,
          hasEmail: !!lead.email,
        },
      });

      if (r.score < MIN_SCORE) {
        await updateLead(db, lead.id, { status: "descartado", score: r.score, scoreReason: r.score_reason });
        await insertEvent(db, lead.id, "descartado", { score: r.score, reason: r.score_reason });
        progress.discarded++;
      } else {
        const msgs: { channel: "whatsapp" | "email"; subject: string | null; body: string }[] = [];
        if (campaign.channels.includes("whatsapp") && lead.hasWhatsapp) {
          msgs.push({ channel: "whatsapp", subject: null, body: r.whatsapp_message });
        }
        if (campaign.channels.includes("email") && lead.email) {
          msgs.push({ channel: "email", subject: r.email_subject, body: r.email_body_html });
        }
        await replaceQueuedMessages(db, lead.id, msgs);
        await updateLead(db, lead.id, { status: "calificado", score: r.score, scoreReason: r.score_reason });
        await insertEvent(db, lead.id, "calificado", { score: r.score });
        progress.qualified++;
      }
    } catch (e) {
      // Un lead que falla no detiene el lote: queda "nuevo" y se puede volver a calificar.
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[ai-qualify] lead ${lead.id} falló:`, lastError);
      await insertEvent(db, lead.id, "error", { step: "qualify", message: lastError });
      progress.failed++;
      if (e instanceof Anthropic.AuthenticationError) throw e; // llave inválida: no tiene caso seguir
    }
    progress.done++;
    if (progress.done % 2 === 0 || progress.done === progress.total) await job.updateProgress(progress);
  });

  if (progress.total > 0 && progress.failed === progress.total) {
    throw new Error(`Todos los leads fallaron. Último error: ${lastError}`);
  }
  return progress;
}
