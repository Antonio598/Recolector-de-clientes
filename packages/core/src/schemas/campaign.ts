import { z } from "zod";

export const nicheSchema = z.object({
  name: z.string().trim().min(2, "Nombre de giro muy corto").max(80),
  why: z.string().trim().max(300).default(""),
  queries: z
    .array(z.string().trim().min(2).max(60))
    .min(1, "Cada giro necesita al menos una búsqueda")
    .max(3, "Máximo 3 búsquedas por giro"),
});
export type Niche = z.infer<typeof nicheSchema>;

/** Plan de Claude (5-10 giros). */
export const nichesSchema = z.array(nicheSchema).min(5, "Mínimo 5 giros").max(10, "Máximo 10 giros");

/** Plan editado por el admin: puede quitar giros (mínimo 1). */
export const editedNichesSchema = z.array(nicheSchema).min(1, "Deja al menos un giro").max(10);

export const newCampaignSchema = z.object({
  zone: z.string().trim().min(3, "Escribe la zona").max(120),
  service: z.string().trim().min(3, "Escribe el servicio").max(200),
  channels: z.array(z.enum(["whatsapp", "email"])).min(1, "Elige al menos un canal"),
});

export type QueryItem = { niche: string; query: string };

/** Aplana los giros en la lista de consultas que guarda campaigns.queries. */
export function nichesToQueries(niches: Niche[]): QueryItem[] {
  const seen = new Set<string>();
  const out: QueryItem[] = [];
  for (const n of niches) {
    for (const q of n.queries) {
      const key = q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ niche: n.name, query: q });
    }
  }
  return out;
}

// ───────────── jobs de la cola "search" ─────────────
export type SearchJobData = { campaignId: string };
export type SearchProgress = { done: number; total: number; requests: number; found: number; truncated?: boolean };

export const planJobId = (campaignId: string) => `plan-${campaignId}`;
export const runJobId = (campaignId: string) => `run-${campaignId}`;

// ───────────── jobs de enriquecimiento y calificación ─────────────
export type EnrichProgress = { done: number; total: number; whatsapp: number; emails: number; discarded: number };
export type QualifyJobData = { campaignId: string; limit: number };
export type QualifyProgress = { done: number; total: number; qualified: number; discarded: number; failed: number };

export const enrichJobId = (campaignId: string) => `enrich-${campaignId}`;
export const qualifyJobId = (campaignId: string) => `qualify-${campaignId}`;

/** Costo aproximado por lead de qualify_and_write (Sonnet 5.5, effort medium). */
export const QUALIFY_USD_PER_LEAD = 0.01;
