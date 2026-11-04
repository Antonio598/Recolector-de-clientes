import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "./client";
import { campaigns, events, leads, messages, optOuts } from "./schema";
import type { Lead } from "./campaigns";

export type Message = typeof messages.$inferSelect;
export type EventRow = typeof events.$inferSelect;

export async function getLead(db: Db, id: string): Promise<Lead | undefined> {
  const [row] = await db.select().from(leads).where(eq(leads.id, id));
  return row;
}

export async function updateLead(db: Db, id: string, data: Partial<Omit<Lead, "id" | "campaignId" | "placeId">>) {
  await db.update(leads).set(data).where(eq(leads.id, id));
}

/** Leads aún sin enriquecer (has_whatsapp sin definir), los de más reseñas primero. */
export async function leadsPendingEnrich(db: Db, campaignId: string): Promise<Lead[]> {
  return db
    .select()
    .from(leads)
    .where(and(eq(leads.campaignId, campaignId), isNull(leads.hasWhatsapp)))
    .orderBy(sql`${leads.reviewsCount} desc nulls last`, asc(leads.createdAt));
}

/** Teléfonos/emails de leads ya enriquecidos y vigentes de esta campaña (para reanudar sin duplicar). */
export async function activeContactsInCampaign(db: Db, campaignId: string): Promise<Set<string>> {
  const rows = await db
    .select({ phone: leads.phoneE164, email: leads.email })
    .from(leads)
    .where(and(eq(leads.campaignId, campaignId), isNotNull(leads.hasWhatsapp), ne(leads.status, "descartado")));
  const out = new Set<string>();
  for (const r of rows) {
    if (r.phone) out.add(r.phone);
    if (r.email) out.add(r.email.toLowerCase());
  }
  return out;
}

/**
 * Contactos (teléfonos/emails) que ya existen en OTRAS campañas o en la lista de bajas.
 * Se usa para no volver a contactar a nadie.
 */
export async function findKnownContacts(
  db: Db,
  campaignId: string,
  phones: string[],
  emails: string[],
): Promise<{ otherCampaign: Set<string>; optedOut: Set<string> }> {
  const otherCampaign = new Set<string>();
  const optedOut = new Set<string>();
  const lowerEmails = emails.map((e) => e.toLowerCase());
  if (phones.length === 0 && emails.length === 0) return { otherCampaign, optedOut };

  const phoneCond = phones.length ? inArray(leads.phoneE164, phones) : sql`false`;
  const emailCond = lowerEmails.length ? inArray(sql`lower(${leads.email})`, lowerEmails) : sql`false`;
  const rows = await db
    .select({ phone: leads.phoneE164, email: leads.email })
    .from(leads)
    .where(and(ne(leads.campaignId, campaignId), or(phoneCond, emailCond)));
  for (const r of rows) {
    if (r.phone && phones.includes(r.phone)) otherCampaign.add(r.phone);
    if (r.email && lowerEmails.includes(r.email.toLowerCase())) otherCampaign.add(r.email.toLowerCase());
  }

  const ooPhone = phones.length ? inArray(optOuts.phoneE164, phones) : sql`false`;
  const ooEmail = lowerEmails.length ? inArray(sql`lower(${optOuts.email})`, lowerEmails) : sql`false`;
  const oo = await db.select({ phone: optOuts.phoneE164, email: optOuts.email }).from(optOuts).where(or(ooPhone, ooEmail));
  for (const r of oo) {
    if (r.phone) optedOut.add(r.phone);
    if (r.email) optedOut.add(r.email.toLowerCase());
  }
  return { otherCampaign, optedOut };
}

/** Candidatos a calificar: enriquecidos, sin calificar, con algún canal de la campaña disponible. */
export function eligibleForQualifyWhere(campaignId: string, channels: ("whatsapp" | "email")[]) {
  const channelConds = [
    channels.includes("whatsapp") ? eq(leads.hasWhatsapp, true) : undefined,
    channels.includes("email") ? isNotNull(leads.email) : undefined,
  ].filter((c) => c !== undefined);
  return and(
    eq(leads.campaignId, campaignId),
    eq(leads.status, "nuevo"),
    isNotNull(leads.hasWhatsapp),
    channelConds.length ? or(...channelConds) : sql`false`,
  );
}

export async function leadsEligibleForQualify(
  db: Db,
  campaignId: string,
  channels: ("whatsapp" | "email")[],
  limit: number,
): Promise<Lead[]> {
  return db
    .select()
    .from(leads)
    .where(eligibleForQualifyWhere(campaignId, channels))
    .orderBy(sql`${leads.reviewsCount} desc nulls last`, desc(leads.rating))
    .limit(limit);
}

/** Resumen del embudo de una campaña para la UI. */
export async function campaignFunnel(db: Db, campaignId: string, channels: ("whatsapp" | "email")[]) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pendingEnrich: sql<number>`count(*) filter (where ${leads.hasWhatsapp} is null)::int`,
      withWhatsapp: sql<number>`count(*) filter (where ${leads.hasWhatsapp})::int`,
      withEmail: sql<number>`count(${leads.email})::int`,
      qualified: sql<number>`count(*) filter (where ${leads.status} = 'calificado')::int`,
      discarded: sql<number>`count(*) filter (where ${leads.status} = 'descartado')::int`,
    })
    .from(leads)
    .where(eq(leads.campaignId, campaignId));
  const [eligible] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(eligibleForQualifyWhere(campaignId, channels));
  return { ...row!, eligible: eligible?.n ?? 0 };
}

// ───────────── mensajes ─────────────

/** Reemplaza los mensajes salientes en cola de un lead (idempotente al recalificar). */
export async function replaceQueuedMessages(
  db: Db,
  leadId: string,
  rows: { channel: "whatsapp" | "email"; subject: string | null; body: string }[],
) {
  await db.transaction(async (tx) => {
    await tx
      .delete(messages)
      .where(and(eq(messages.leadId, leadId), eq(messages.direction, "out"), eq(messages.status, "en_cola")));
    if (rows.length) {
      await tx.insert(messages).values(rows.map((r) => ({ ...r, leadId, direction: "out" as const, status: "en_cola" })));
    }
  });
}

export async function listMessages(db: Db, leadId: string): Promise<Message[]> {
  return db.select().from(messages).where(eq(messages.leadId, leadId)).orderBy(asc(messages.createdAt));
}

export async function getMessage(db: Db, id: string): Promise<Message | undefined> {
  const [row] = await db.select().from(messages).where(eq(messages.id, id));
  return row;
}

export async function updateMessageContent(db: Db, id: string, data: { subject: string | null; body: string }) {
  await db.update(messages).set(data).where(eq(messages.id, id));
}

/** Primer mensaje en cola por canal para varios leads (vista previa en la tabla). */
export async function queuedMessagesForLeads(db: Db, leadIds: string[]): Promise<Message[]> {
  if (leadIds.length === 0) return [];
  return db
    .select()
    .from(messages)
    .where(and(inArray(messages.leadId, leadIds), eq(messages.direction, "out"), eq(messages.status, "en_cola")));
}

// ───────────── eventos ─────────────

/** Errores registrados en leads (envío, calificación, seguimiento), más recientes primero. */
export async function listRecentErrors(db: Db, limit = 100) {
  return db
    .select({ id: events.id, createdAt: events.createdAt, data: events.data, leadId: leads.id, leadName: leads.name })
    .from(events)
    .innerJoin(leads, eq(leads.id, events.leadId))
    .where(eq(events.type, "error"))
    .orderBy(desc(events.createdAt))
    .limit(limit);
}

export async function insertEvent(db: Db, leadId: string, type: string, data?: Record<string, unknown>) {
  await db.insert(events).values({ leadId, type, data: data ?? null });
}

export async function listEvents(db: Db, leadId: string): Promise<EventRow[]> {
  return db.select().from(events).where(eq(events.leadId, leadId)).orderBy(desc(events.createdAt));
}

export async function getLeadCampaign(db: Db, leadId: string) {
  const [row] = await db
    .select({ id: campaigns.id, service: campaigns.service, zone: campaigns.zone, channels: campaigns.channels })
    .from(leads)
    .innerJoin(campaigns, eq(campaigns.id, leads.campaignId))
    .where(eq(leads.id, leadId));
  return row;
}
