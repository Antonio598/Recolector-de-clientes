import Anthropic from "@anthropic-ai/sdk";
import type { Job } from "bullmq";
import { businessDaysBetween, isExplicitOptOut, mexicoClock, type ClassifyJobData } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { classifyReply, writeFollowUp } from "@growvibe/core/server";
import {
  applyClassification,
  followUpCandidates,
  getClassifyContext,
  getDb,
  getLead,
  getLeadCampaign,
  insertEvent,
  queueFollowUp,
  registerOptOut,
} from "@growvibe/db";
import { requireEnv } from "../lib";

/** Paso 9: Claude Haiku clasifica la respuesta; "baja" registra el opt-out; interesado/pregunta se asigna a un vendedor. */
export async function classifyProcessor(job: Job<ClassifyJobData>) {
  const db = getDb();
  const ctx = await getClassifyContext(db, job.data.messageId);
  if (!ctx) return { skipped: "mensaje no existe" };

  let result: { category: string; summary: string; suggested_reply: string };
  if (isExplicitOptOut(ctx.message.body)) {
    result = { category: "baja", summary: "Pidió la baja", suggested_reply: "" };
  } else {
    const claude = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
    result = await classifyReply(claude, serverEnv().CLAUDE_MODEL_CLASSIFY, {
      service: ctx.service,
      businessName: ctx.lead.name,
      history: ctx.history.map((h) => ({ direction: h.direction, channel: h.channel, body: h.body })),
    });
  }

  if (result.category === "baja") {
    await registerOptOut(
      db,
      ctx.message.channel === "whatsapp"
        ? { phone: ctx.lead.phoneE164 ?? undefined }
        : { email: ctx.lead.email ?? undefined },
      `Respondió: "${ctx.message.body.slice(0, 80)}"`,
    );
  }
  await applyClassification(db, ctx.message.id, ctx.lead.id, result);
  return result;
}

const FOLLOW_UP_BUSINESS_DAYS = 3;
const FOLLOW_UPS_PER_RUN = 20;

/** Paso 10: un solo seguimiento a los 3 días hábiles sin respuesta, por el mismo canal. Corre cada hora. */
export async function followUpProcessor() {
  const db = getDb();
  const today = mexicoClock().date;
  const candidates = (await followUpCandidates(db, FOLLOW_UPS_PER_RUN * 3))
    .filter((c) => businessDaysBetween(mexicoClock(new Date(c.sentAt)).date, today) >= FOLLOW_UP_BUSINESS_DAYS)
    .slice(0, FOLLOW_UPS_PER_RUN);
  if (candidates.length === 0) return { queued: 0 };

  const env = serverEnv();
  const claude = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  let queued = 0;
  for (const c of candidates) {
    try {
      const [lead, campaign] = await Promise.all([getLead(db, c.leadId), getLeadCampaign(db, c.leadId)]);
      if (!lead || !campaign) continue;
      const msg = await writeFollowUp(claude, env.CLAUDE_MODEL_GENERATE, {
        channel: c.channel,
        service: campaign.service,
        business: { name: lead.name, niche: lead.niche, address: lead.address },
        firstMessage: { subject: c.subject, body: c.body },
      });
      // Entra a la cola normal: el scheduler lo envía respetando horario y límites.
      await queueFollowUp(db, c.leadId, c.channel, msg.subject, msg.body);
      queued++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[followups] lead ${c.leadId}:`, message);
      await insertEvent(db, c.leadId, "error", { step: "seguimiento", message });
      if (e instanceof Anthropic.AuthenticationError) break;
    }
  }
  console.log(`[followups] ${queued} seguimientos en cola`);
  return { queued };
}
