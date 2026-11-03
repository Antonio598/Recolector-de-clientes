import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "./client";
import { campaigns, events, leads, messages, optOuts } from "./schema";

type Channel = "whatsapp" | "email";
const SENT = ["enviado", "entregado", "leido"] as const;

/**
 * Siguiente mensaje a enviar del canal: campaña "enviando", lead calificado, mensaje en cola sin programar
 * (o programado hace más de 30 min y nunca enviado: el job se perdió). Primero los de mejor score.
 */
export async function nextQueuedMessage(db: Db, channel: Channel) {
  const [row] = await db
    .select({ messageId: messages.id, leadId: leads.id, campaignId: campaigns.id })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .innerJoin(campaigns, eq(campaigns.id, leads.campaignId))
    .where(
      and(
        eq(campaigns.status, "enviando"),
        eq(messages.channel, channel),
        eq(messages.direction, "out"),
        eq(messages.status, "en_cola"),
        inArray(leads.status, ["calificado", "contactado"]),
        channel === "whatsapp" ? eq(leads.hasWhatsapp, true) : sql`${leads.email} is not null`,
        or(isNull(messages.scheduledFor), lt(messages.scheduledFor, sql`now() - interval '30 minutes'`)),
      ),
    )
    .orderBy(sql`${leads.score} desc nulls last`, messages.createdAt)
    .limit(1);
  return row;
}

/** Contadores del canal para aplicar límites: hoy (hora MX), últimos N minutos (enviados + programados) y fallos de la última hora. */
export async function channelCounters(db: Db, channel: Channel, burstMinutes: number) {
  const [row] = await db
    .select({
      // Enviados hoy (hora MX) + programados que aún no salen (para no pasarse del límite).
      today: sql<number>`count(*) filter (where ((${messages.sentAt} at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date) or (${messages.status} = 'en_cola' and ${messages.scheduledFor} > now() - interval '30 minutes'))::int`,
      burst: sql<number>`count(*) filter (where coalesce(${messages.sentAt}, ${messages.scheduledFor}) > now() - make_interval(mins => ${burstMinutes}))::int`,
      sentLastHour: sql<number>`count(*) filter (where ${messages.sentAt} > now() - interval '1 hour')::int`,
      failedLastHour: sql<number>`count(*) filter (where ${messages.status} = 'fallido' and ${messages.scheduledFor} > now() - interval '1 hour')::int`,
      firstSentDate: sql<string | null>`to_char(min(${messages.sentAt}) at time zone 'America/Mexico_City', 'YYYY-MM-DD')`,
    })
    .from(messages)
    .where(and(eq(messages.channel, channel), eq(messages.direction, "out")));
  return row!;
}

export async function markMessageScheduled(db: Db, id: string) {
  await db.update(messages).set({ scheduledFor: new Date() }).where(eq(messages.id, id));
}

/** Devuelve el mensaje a la cola sin programar (p. ej. la campaña se pausó mientras esperaba). */
export async function unscheduleMessage(db: Db, id: string) {
  await db.update(messages).set({ scheduledFor: null }).where(eq(messages.id, id));
}

/** Datos completos para enviar un mensaje. */
export async function getSendContext(db: Db, messageId: string) {
  const [row] = await db
    .select({ message: messages, lead: leads, campaign: { id: campaigns.id, status: campaigns.status } })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .innerJoin(campaigns, eq(campaigns.id, leads.campaignId))
    .where(eq(messages.id, messageId));
  return row;
}

/** ¿El contacto está en bajas o ya recibió un mensaje desde OTRO lead (otra campaña)? */
export async function contactBlockReason(
  db: Db,
  leadId: string,
  phone: string | null,
  email: string | null,
  opts: { onlyOptOut?: boolean } = {},
): Promise<string | null> {
  const lowerEmail = email?.toLowerCase() ?? null;
  const oo = await db
    .select({ id: optOuts.id })
    .from(optOuts)
    .where(
      or(
        phone ? eq(optOuts.phoneE164, phone) : sql`false`,
        lowerEmail ? eq(sql`lower(${optOuts.email})`, lowerEmail) : sql`false`,
      ),
    )
    .limit(1);
  if (oo.length) return "Está en la lista de bajas";
  if (opts.onlyOptOut) return null;

  const other = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .where(
      and(
        sql`${leads.id} <> ${leadId}`,
        eq(messages.direction, "out"),
        inArray(messages.status, [...SENT]),
        or(
          phone ? eq(leads.phoneE164, phone) : sql`false`,
          lowerEmail ? eq(sql`lower(${leads.email})`, lowerEmail) : sql`false`,
        ),
      ),
    )
    .limit(1);
  return other.length ? "Ya fue contactado desde otra campaña" : null;
}

export async function markMessageSent(db: Db, id: string, leadId: string, providerId: string | null, channel: Channel) {
  await db.transaction(async (tx) => {
    await tx.update(messages).set({ status: "enviado", providerId, sentAt: new Date() }).where(eq(messages.id, id));
    await tx.update(leads).set({ status: "contactado" }).where(and(eq(leads.id, leadId), eq(leads.status, "calificado")));
    await tx.insert(events).values({ leadId, type: "enviado", data: { channel, messageId: id } });
  });
}

export async function markMessageFailed(db: Db, id: string, leadId: string, error: string) {
  await db.update(messages).set({ status: "fallido" }).where(eq(messages.id, id));
  await db.insert(events).values({ leadId, type: "error", data: { step: "envio", message: error } });
}

export async function cancelMessage(db: Db, id: string, leadId: string, reason: string) {
  await db.update(messages).set({ status: "cancelado" }).where(eq(messages.id, id));
  await db.insert(events).values({ leadId, type: "cancelado", data: { reason } });
}

/**
 * Registra una baja: opt_out, cancela mensajes pendientes de los leads con ese contacto
 * y los marca "baja". Idempotente.
 */
export async function registerOptOut(db: Db, target: { phone?: string; email?: string }, reason: string) {
  const phone = target.phone ?? null;
  const email = target.email?.toLowerCase() ?? null;
  if (!phone && !email) return 0;
  return db.transaction(async (tx) => {
    const exists = await tx
      .select({ id: optOuts.id })
      .from(optOuts)
      .where(or(phone ? eq(optOuts.phoneE164, phone) : sql`false`, email ? eq(sql`lower(${optOuts.email})`, email) : sql`false`))
      .limit(1);
    if (!exists.length) await tx.insert(optOuts).values({ phoneE164: phone, email, reason });

    const affected = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(or(phone ? eq(leads.phoneE164, phone) : sql`false`, email ? eq(sql`lower(${leads.email})`, email) : sql`false`));
    const ids = affected.map((l) => l.id);
    if (ids.length) {
      await tx
        .update(messages)
        .set({ status: "cancelado" })
        .where(and(inArray(messages.leadId, ids), eq(messages.direction, "out"), eq(messages.status, "en_cola")));
      await tx.update(leads).set({ status: "baja" }).where(inArray(leads.id, ids));
      await tx.insert(events).values(ids.map((leadId) => ({ leadId, type: "baja", data: { reason } })));
    }
    return ids.length;
  });
}

export async function setCampaignStatus(db: Db, id: string, status: "enviando" | "pausada" | "lista") {
  await db.update(campaigns).set({ status }).where(eq(campaigns.id, id));
}

/** Mensajes salientes de la campaña por canal y estado (para la UI). */
export async function campaignSendStats(db: Db, campaignId: string) {
  const rows = await db
    .select({ channel: messages.channel, status: messages.status, n: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .where(and(eq(leads.campaignId, campaignId), eq(messages.direction, "out")))
    .groupBy(messages.channel, messages.status);
  const out = { whatsapp: {} as Record<string, number>, email: {} as Record<string, number> };
  for (const r of rows) out[r.channel][r.status] = r.n;
  return out;
}

export async function listOptOuts(db: Db, limit = 100) {
  return db.select().from(optOuts).orderBy(desc(optOuts.createdAt)).limit(limit);
}

/** % de rebotes duros de email en los últimos 7 días (sobre enviados). null si hay menos de 20 envíos. */
export async function emailHardBounceRate(db: Db): Promise<number | null> {
  const [row] = await db
    .select({
      sent: sql<number>`(select count(*)::int from ${messages} where ${messages.channel} = 'email' and ${messages.direction} = 'out' and ${messages.sentAt} > now() - interval '7 days')`,
      bounced: sql<number>`(select count(*)::int from ${optOuts} where ${optOuts.reason} = 'Rebote duro de email' and ${optOuts.createdAt} > now() - interval '7 days')`,
    })
    .from(sql`(select 1) x`);
  if (!row || row.sent < 20) return null;
  return row.bounced / row.sent;
}
