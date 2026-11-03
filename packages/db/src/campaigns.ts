import { asc, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { campaigns, leads } from "./schema";

export type Campaign = typeof campaigns.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type CampaignStatus = "borrador" | "buscando" | "lista" | "enviando" | "pausada" | "terminada";

export async function createCampaign(
  db: Db,
  data: { zone: string; service: string; channels: ("whatsapp" | "email")[]; createdBy: string },
): Promise<Campaign> {
  const [row] = await db.insert(campaigns).values(data).returning();
  return row!;
}

export async function getCampaign(db: Db, id: string): Promise<Campaign | undefined> {
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  return row;
}

export async function updateCampaign(
  db: Db,
  id: string,
  data: Partial<Pick<Campaign, "status" | "niches" | "queries" | "zoneBounds">>,
) {
  await db.update(campaigns).set(data).where(eq(campaigns.id, id));
}

export async function listCampaigns(db: Db) {
  return db
    .select({
      id: campaigns.id,
      zone: campaigns.zone,
      service: campaigns.service,
      status: campaigns.status,
      createdAt: campaigns.createdAt,
      leadCount: sql<number>`(select count(*)::int from ${leads} where ${leads.campaignId} = ${campaigns.id})`,
    })
    .from(campaigns)
    .orderBy(desc(campaigns.createdAt));
}

/** Inserta leads ignorando los place_id que ya existen en la campaña. Devuelve cuántos eran nuevos. */
export async function insertLeads(db: Db, rows: NewLead[]): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(leads)
    .values(rows)
    .onConflictDoNothing({ target: [leads.campaignId, leads.placeId] })
    .returning({ id: leads.id });
  return inserted.length;
}

export async function countLeads(db: Db, campaignId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(leads).where(eq(leads.campaignId, campaignId));
  return row?.n ?? 0;
}

export async function listLeads(db: Db, campaignId: string): Promise<Lead[]> {
  return db
    .select()
    .from(leads)
    .where(eq(leads.campaignId, campaignId))
    .orderBy(asc(leads.niche), desc(leads.reviewsCount));
}
