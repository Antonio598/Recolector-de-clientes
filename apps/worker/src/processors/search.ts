import Anthropic from "@anthropic-ai/sdk";
import type { Job } from "bullmq";
import {
  splitRect,
  type QueryItem,
  type Rect,
  type SearchJobData,
  type SearchProgress,
} from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { geocodeZone, planSearch, searchText, type Place } from "@growvibe/core/server";
import { getCampaign, getDb, insertLeads, updateCampaign, type NewLead } from "@growvibe/db";

/** Tope de llamadas a Places por campaña (costo). ~$0.035 c/u con este field mask. */
const MAX_REQUESTS_PER_CAMPAIGN = 300;
const MAX_PAGES = 3;
const MAX_CELL_KM = 10;
const MAX_CELLS = 16;

function requireKey(name: "GOOGLE_MAPS_API_KEY" | "ANTHROPIC_API_KEY") {
  const value = serverEnv()[name];
  if (!value) throw new Error(`Falta la variable ${name} en el worker`);
  return value;
}

/** Paso 2 + 3: Claude propone giros/búsquedas y Geocoding fija la zona. Queda en borrador para revisión. */
async function plan(job: Job<SearchJobData>) {
  const db = getDb();
  const campaign = await getCampaign(db, job.data.campaignId);
  if (!campaign) return { skipped: "campaña no existe" };

  const env = serverEnv();
  const claude = new Anthropic({ apiKey: requireKey("ANTHROPIC_API_KEY") });
  const [niches, geo] = await Promise.all([
    planSearch(claude, env.CLAUDE_MODEL_GENERATE, { service: campaign.service, zone: campaign.zone }),
    geocodeZone(requireKey("GOOGLE_MAPS_API_KEY"), campaign.zone),
  ]);

  await updateCampaign(db, campaign.id, {
    niches,
    zoneBounds: { ...geo.rect, formattedAddress: geo.formattedAddress },
  });
  return { niches: niches.length, zone: geo.formattedAddress };
}

/** "+52 229 123 4567" → "+522291234567". La normalización E.164 completa llega en la Fase 3. */
function roughE164(place: Place): string | null {
  const raw = place.internationalPhoneNumber ?? place.nationalPhoneNumber;
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return digits.length === 10 ? `+52${digits}` : null;
}

function toLead(campaignId: string, niche: string, p: Place): NewLead {
  return {
    campaignId,
    placeId: p.id,
    name: p.displayName?.text ?? "(sin nombre)",
    niche,
    address: p.formattedAddress ?? null,
    phoneE164: roughE164(p),
    website: p.websiteUri ?? null,
    rating: p.rating != null ? String(p.rating) : null,
    reviewsCount: p.userRatingCount ?? null,
    mapsUrl: p.googleMapsUri ?? null,
  };
}

/** Paso 4: cada consulta × subzona, hasta 3 páginas, solo negocios operando, sin duplicados. */
async function run(job: Job<SearchJobData>) {
  const db = getDb();
  const campaign = await getCampaign(db, job.data.campaignId);
  if (!campaign) return { skipped: "campaña no existe" };

  const apiKey = requireKey("GOOGLE_MAPS_API_KEY");
  const queries = (campaign.queries ?? []) as QueryItem[];
  const bounds = campaign.zoneBounds as Rect | null;
  if (!bounds || queries.length === 0) throw new Error("La campaña no tiene zona o búsquedas confirmadas");

  const cells = splitRect(bounds, MAX_CELL_KM, MAX_CELLS);
  const tasks = queries.flatMap((q) => cells.map((rect) => ({ ...q, rect })));
  const progress: SearchProgress = { done: 0, total: tasks.length, requests: 0, found: 0 };
  const seen = new Set<string>();

  for (const task of tasks) {
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      if (progress.requests >= MAX_REQUESTS_PER_CAMPAIGN) {
        progress.truncated = true;
        break;
      }
      const res = await searchText(apiKey, { textQuery: task.query, rect: task.rect, pageToken });
      progress.requests++;

      const fresh = res.places.filter(
        (p) => (!p.businessStatus || p.businessStatus === "OPERATIONAL") && !seen.has(p.id),
      );
      fresh.forEach((p) => seen.add(p.id));
      progress.found += await insertLeads(db, fresh.map((p) => toLead(campaign.id, task.niche, p)));

      pageToken = res.nextPageToken;
      if (!pageToken || res.places.length < 20) break;
    }
    progress.done++;
    await job.updateProgress(progress);
    if (progress.truncated) break;
  }

  await updateCampaign(db, campaign.id, { status: "lista" });
  return progress;
}

export async function searchProcessor(job: Job<SearchJobData>) {
  if (job.name === "plan") return plan(job);
  if (job.name === "run") return run(job);
  throw new Error(`Job desconocido en la cola search: ${job.name}`);
}
