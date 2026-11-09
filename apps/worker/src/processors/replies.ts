import Anthropic from "@anthropic-ai/sdk";
import type { Job } from "bullmq";
import { isExplicitOptOut, type ClassifyJobData } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { classifyReply } from "@growvibe/core/server";
import {
  applyClassification,
  getClassifyContext,
  getDb,
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
