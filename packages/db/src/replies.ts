import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./client";
import { campaigns, events, leads, messages, profiles } from "./schema";

type Channel = "whatsapp" | "email";
const ORDER: Record<string, number> = { en_cola: 0, enviado: 1, entregado: 2, leido: 3 };

/** Lead más reciente con ese teléfono (compara los últimos 10 dígitos: tolera 52 / 521 / +52). */
export async function findLeadByPhoneDigits(db: Db, digits: string) {
  const last10 = digits.slice(-10);
  const [row] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(sql`right(regexp_replace(coalesce(${leads.phoneE164}, ''), '\\D', '', 'g'), 10) = ${last10}`)
    .orderBy(
      sql`exists (select 1 from ${messages} m where m.lead_id = ${leads.id} and m.direction = 'out' and m.status in ('enviado','entregado','leido')) desc`,
      desc(leads.createdAt),
    )
    .limit(1);
  return row?.id ?? null;
}

export async function findLeadByEmail(db: Db, email: string) {
  const [row] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(sql`lower(${leads.email})`, email.toLowerCase()))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/** Guarda un mensaje entrante (idempotente por provider_id). Devuelve su id o null si ya existía. */
export async function insertIncomingMessage(
  db: Db,
  data: { leadId: string; channel: Channel; body: string; subject?: string | null; providerId: string },
): Promise<string | null> {
  const dup = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.providerId, data.providerId), eq(messages.direction, "in")))
    .limit(1);
  if (dup.length) return null;
  const [row] = await db
    .insert(messages)
    .values({
      leadId: data.leadId,
      channel: data.channel,
      direction: "in",
      subject: data.subject ?? null,
      body: data.body,
      status: "recibido",
      providerId: data.providerId,
      sentAt: new Date(),
    })
    .returning({ id: messages.id });
  await db.insert(events).values({ leadId: data.leadId, type: "respuesta", data: { channel: data.channel, messageId: row!.id } });
  // Cualquier respuesta detiene los envíos automáticos pendientes (seguimientos, otro canal).
  await db
    .update(messages)
    .set({ status: "cancelado" })
    .where(and(eq(messages.leadId, data.leadId), eq(messages.direction, "out"), eq(messages.status, "en_cola")));
  await db
    .update(leads)
    .set({ status: "respondio" })
    .where(and(eq(leads.id, data.leadId), inArray(leads.status, ["calificado", "contactado"])));
  return row!.id;
}

/** Actualiza entregado/leído/fallido de un saliente sin retroceder de estado. */
export async function updateOutStatusByProvider(db: Db, providerId: string, status: "entregado" | "leido" | "fallido") {
  const [msg] = await db
    .select({ id: messages.id, status: messages.status })
    .from(messages)
    .where(and(eq(messages.providerId, providerId), eq(messages.direction, "out")))
    .limit(1);
  if (!msg) return;
  if (status !== "fallido" && (ORDER[msg.status] ?? 9) >= ORDER[status]!) return;
  await db.update(messages).set({ status }).where(eq(messages.id, msg.id));
}

/** Vendedor con menos leads abiertos (respondio/interesado asignados). Si no hay vendedores, el admin con menos. */
export async function leastBusySeller(db: Db): Promise<string | null> {
  const rows = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      open: sql<number>`(select count(*)::int from ${leads} l where l.assigned_to = ${profiles.id} and l.status in ('respondio','interesado'))`,
    })
    .from(profiles);
  const pick = (role: string) => rows.filter((r) => r.role === role).sort((a, b) => a.open - b.open)[0]?.id;
  return pick("vendedor") ?? pick("admin") ?? null;
}

/** Aplica la clasificación de Claude a la respuesta y al lead. */
export async function applyClassification(
  db: Db,
  messageId: string,
  leadId: string,
  r: { category: string; summary: string; suggested_reply: string },
) {
  await db.update(messages).set({ classification: r.category }).where(eq(messages.id, messageId));
  await db.insert(events).values({
    leadId,
    type: "clasificado",
    data: { messageId, category: r.category, summary: r.summary, suggestedReply: r.suggested_reply },
  });

  const [lead] = await db.select({ status: leads.status, assignedTo: leads.assignedTo }).from(leads).where(eq(leads.id, leadId));
  if (!lead || lead.status === "baja") return;

  if (r.category === "interesado" || r.category === "pregunta") {
    const assignTo = lead.assignedTo ?? (await leastBusySeller(db));
    await db
      .update(leads)
      .set({ status: r.category === "interesado" ? "interesado" : "respondio", assignedTo: assignTo })
      .where(eq(leads.id, leadId));
    if (assignTo && !lead.assignedTo) {
      await db.insert(events).values({ leadId, type: "asignado", data: { to: assignTo } });
    }
  } else if (r.category === "no_interesado") {
    await db.update(leads).set({ status: "no_interesado" }).where(eq(leads.id, leadId));
  }
}

/** Contexto para clasificar: el mensaje, el lead, el servicio y el historial. */
export async function getClassifyContext(db: Db, messageId: string) {
  const [row] = await db
    .select({ message: messages, lead: leads, service: campaigns.service })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .innerJoin(campaigns, eq(campaigns.id, leads.campaignId))
    .where(eq(messages.id, messageId));
  if (!row) return null;
  const history = await db
    .select({ direction: messages.direction, channel: messages.channel, body: messages.body })
    .from(messages)
    .where(and(eq(messages.leadId, row.lead.id), sql`${messages.status} <> 'en_cola' and ${messages.status} <> 'cancelado'`))
    .orderBy(messages.createdAt);
  return { ...row, history };
}

// ───────────── bandeja ─────────────

export type InboxItem = {
  messageId: string;
  leadId: string;
  leadName: string;
  leadStatus: string;
  assignedTo: string | null;
  assignedName: string | null;
  channel: Channel;
  body: string;
  subject: string | null;
  classification: string | null;
  receivedAt: Date | null;
  summary: string | null;
  suggestedReply: string | null;
};

/** Última respuesta de cada lead, más recientes primero. */
export async function listInbox(db: Db, opts: { assignedTo?: string; limit?: number } = {}): Promise<InboxItem[]> {
  const rows = await db.execute(sql`
    select distinct on (m.lead_id)
      m.id as "messageId", m.lead_id as "leadId", l.name as "leadName", l.status as "leadStatus",
      l.assigned_to as "assignedTo", p.full_name as "assignedName",
      m.channel, m.body, m.subject, m.classification, m.created_at as "receivedAt",
      (select e.data->>'summary' from growvibe.events e where e.type = 'clasificado' and e.data->>'messageId' = m.id::text order by e.created_at desc limit 1) as summary,
      (select e.data->>'suggestedReply' from growvibe.events e where e.type = 'clasificado' and e.data->>'messageId' = m.id::text order by e.created_at desc limit 1) as "suggestedReply"
    from growvibe.messages m
    join growvibe.leads l on l.id = m.lead_id
    left join growvibe.profiles p on p.id = l.assigned_to
    where m.direction = 'in' ${opts.assignedTo ? sql`and l.assigned_to = ${opts.assignedTo}` : sql``}
    order by m.lead_id, m.created_at desc
  `);
  const items = (rows.rows as unknown as InboxItem[]).map((r) => ({ ...r, receivedAt: r.receivedAt ? new Date(r.receivedAt) : null }));
  return items.sort((a, b) => (b.receivedAt?.getTime() ?? 0) - (a.receivedAt?.getTime() ?? 0)).slice(0, opts.limit ?? 200);
}

/** Mensaje saliente manual (respuesta del vendedor). */
export async function insertManualReply(db: Db, leadId: string, channel: Channel, body: string, subject: string | null) {
  const [row] = await db
    .insert(messages)
    .values({ leadId, channel, direction: "out", body, subject, status: "en_cola", scheduledFor: new Date() })
    .returning({ id: messages.id });
  return row!.id;
}

export async function assignLead(db: Db, leadId: string, to: string | null) {
  await db.update(leads).set({ assignedTo: to }).where(eq(leads.id, leadId));
  await db.insert(events).values({ leadId, type: "asignado", data: { to } });
}

// ───────────── seguimiento a 3 días hábiles ─────────────

/**
 * Leads contactados, sin ninguna respuesta, con exactamente un mensaje enviado en el canal
 * y nada en cola en ese canal. Se filtra después por días hábiles.
 */
export async function followUpCandidates(db: Db, limit: number) {
  const res = await db.execute(sql`
    select m.id as "messageId", m.lead_id as "leadId", m.channel, m.subject, m.body, m.sent_at as "sentAt"
    from growvibe.messages m
    join growvibe.leads l on l.id = m.lead_id
    join growvibe.campaigns c on c.id = l.campaign_id
    where m.direction = 'out' and m.status in ('enviado','entregado','leido')
      and l.status = 'contactado' and c.status = 'enviando'
      and m.sent_at < now() - interval '3 days'
      and not exists (select 1 from growvibe.messages i where i.lead_id = m.lead_id and i.direction = 'in')
      and (select count(*) from growvibe.messages o where o.lead_id = m.lead_id and o.channel = m.channel and o.direction = 'out'
           and o.status <> 'cancelado') = 1
    order by m.sent_at
    limit ${limit}
  `);
  return res.rows as unknown as {
    messageId: string;
    leadId: string;
    channel: Channel;
    subject: string | null;
    body: string;
    sentAt: Date;
  }[];
}

export async function queueFollowUp(db: Db, leadId: string, channel: Channel, subject: string | null, body: string) {
  await db.insert(messages).values({ leadId, channel, direction: "out", subject, body, status: "en_cola" });
  await db.insert(events).values({ leadId, type: "seguimiento", data: { channel } });
}

/** Resumen para el dashboard. */
export async function dashboardStats(db: Db) {
  const [row] = await db
    .select({
      activeCampaigns: sql<number>`(select count(*)::int from ${campaigns} where ${campaigns.status} in ('buscando','lista','enviando'))`,
      sendingCampaigns: sql<number>`(select count(*)::int from ${campaigns} where ${campaigns.status} = 'enviando')`,
      waToday: sql<number>`(select count(*)::int from ${messages} where ${messages.channel} = 'whatsapp' and ${messages.direction} = 'out' and (${messages.sentAt} at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date)`,
      emailToday: sql<number>`(select count(*)::int from ${messages} where ${messages.channel} = 'email' and ${messages.direction} = 'out' and (${messages.sentAt} at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date)`,
      repliesToday: sql<number>`(select count(*)::int from ${messages} where ${messages.direction} = 'in' and ${messages.createdAt} > now() - interval '24 hours')`,
      interested: sql<number>`(select count(*)::int from ${leads} where ${leads.status} = 'interesado')`,
    })
    .from(sql`(select 1) x`);
  return row!;
}
