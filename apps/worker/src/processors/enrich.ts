import type { Job } from "bullmq";
import { toE164, type EnrichProgress, type SearchJobData } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { checkWhatsappNumbers, connectionState, findWebsiteEmail, type EvolutionConfig } from "@growvibe/core/server";
import {
  activeContactsInCampaign,
  findKnownContacts,
  getCampaign,
  getDb,
  insertEvent,
  leadsPendingEnrich,
  updateCampaign,
  updateLead,
  type Lead,
} from "@growvibe/db";
import { mapLimit, requireEnv, sleep } from "../lib";

const CHUNK = 25; // leads por lote (una llamada a Evolution por lote)
const SCRAPE_CONCURRENCY = 8;
const PAUSE_BETWEEN_WA_CHECKS_MS = 1_500; // no saturar la verificación de WhatsApp

/**
 * Paso 5: normaliza teléfonos a E.164, verifica WhatsApp con Evolution, busca email en el sitio web
 * y descarta duplicados (otras campañas, misma campaña) y bajas. Idempotente: solo toca leads con has_whatsapp null.
 */
export async function enrichProcessor(job: Job<SearchJobData>) {
  const db = getDb();
  const campaign = await getCampaign(db, job.data.campaignId);
  if (!campaign) return { skipped: "campaña no existe" };

  const env = serverEnv();
  const evo: EvolutionConfig = {
    url: env.EVOLUTION_API_URL,
    apiKey: requireEnv("EVOLUTION_API_KEY"),
    instance: env.EVOLUTION_INSTANCE,
  };
  const state = await connectionState(evo);
  if (state !== "open") throw new Error(`WhatsApp no está conectado en Evolution (estado: ${state})`);

  const channels = campaign.channels;
  const pending = await leadsPendingEnrich(db, campaign.id);
  const progress: EnrichProgress = { done: 0, total: pending.length, whatsapp: 0, emails: 0, discarded: 0 };

  // Contactos ya vistos en esta campaña (por si el job se reanuda a medias).
  const seen = await activeContactsInCampaign(db, campaign.id);

  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);

    const enriched = await mapLimit(chunk, SCRAPE_CONCURRENCY, async (lead: Lead) => ({
      lead,
      phone: toE164(lead.phoneE164),
      email: lead.email ?? (lead.website ? await findWebsiteEmail(lead.website) : null),
    }));

    const phones = [...new Set(enriched.map((e) => e.phone).filter((p): p is string => !!p))];
    const emails = [...new Set(enriched.map((e) => e.email).filter((m): m is string => !!m))];
    const wa = await checkWhatsappNumbers(evo, phones);
    const known = await findKnownContacts(db, campaign.id, phones, emails);

    for (const { lead, phone, email } of enriched) {
      const waInfo = phone ? wa.get(phone) : undefined;
      const hasWhatsapp = waInfo?.exists ?? false;
      const keys = [phone, email?.toLowerCase()].filter((k): k is string => !!k);

      let discard: string | null = null;
      if (keys.some((k) => known.optedOut.has(k))) discard = "Está en la lista de bajas";
      else if (keys.some((k) => known.otherCampaign.has(k))) discard = "Ya está en otra campaña";
      else if (keys.some((k) => seen.has(k))) discard = "Contacto repetido en esta campaña";
      else if (!(channels.includes("whatsapp") && hasWhatsapp) && !(channels.includes("email") && email)) {
        discard = "Sin WhatsApp ni email para los canales de la campaña";
      }
      if (!discard) keys.forEach((k) => seen.add(k));

      await updateLead(db, lead.id, {
        phoneE164: phone,
        hasWhatsapp,
        whatsappJid: waInfo?.jid ?? null,
        email,
        ...(discard ? { status: "descartado" as const, scoreReason: discard } : {}),
      });
      if (discard) await insertEvent(db, lead.id, "descartado", { reason: discard });

      if (hasWhatsapp) progress.whatsapp++;
      if (email) progress.emails++;
      if (discard) progress.discarded++;
      progress.done++;
    }
    await job.updateProgress(progress);
    if (phones.length) await sleep(PAUSE_BETWEEN_WA_CHECKS_MS);
  }

  await updateCampaign(db, campaign.id, { status: "lista" });
  return progress;
}
