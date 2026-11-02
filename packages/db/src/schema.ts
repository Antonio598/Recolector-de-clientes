// Espejo en Drizzle del esquema "growvibe". La fuente de verdad son los SQL de supabase/migrations;
// Drizzle solo se usa para consultas tipadas, no para migrar.
import {
  bigserial,
  boolean,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const growvibe = pgSchema("growvibe");

export const leadStatus = growvibe.enum("lead_status", [
  "nuevo",
  "calificado",
  "descartado",
  "contactado",
  "respondio",
  "interesado",
  "no_interesado",
  "baja",
]);
export const channel = growvibe.enum("channel", ["whatsapp", "email"]);

export const profiles = growvibe.table("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name"),
  role: text("role", { enum: ["admin", "vendedor"] }).notNull().default("vendedor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = growvibe.table("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaigns = growvibe.table("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  zone: text("zone").notNull(),
  service: text("service").notNull(),
  zoneBounds: jsonb("zone_bounds"),
  niches: jsonb("niches"),
  queries: jsonb("queries"),
  channels: channel("channels").array().notNull(),
  status: text("status").notNull().default("borrador"),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const leads = growvibe.table(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    placeId: text("place_id").notNull(),
    name: text("name").notNull(),
    niche: text("niche"),
    address: text("address"),
    phoneE164: text("phone_e164"),
    hasWhatsapp: boolean("has_whatsapp"),
    whatsappJid: text("whatsapp_jid"),
    email: text("email"),
    website: text("website"),
    rating: numeric("rating"),
    reviewsCount: integer("reviews_count"),
    mapsUrl: text("maps_url"),
    score: integer("score"),
    scoreReason: text("score_reason"),
    status: leadStatus("status").notNull().default("nuevo"),
    assignedTo: uuid("assigned_to").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique().on(t.campaignId, t.placeId)],
);

export const messages = growvibe.table("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  channel: channel("channel").notNull(),
  direction: text("direction", { enum: ["out", "in"] }).notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status").notNull().default("en_cola"),
  providerId: text("provider_id"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  classification: text("classification"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const optOuts = growvibe.table("opt_outs", {
  id: uuid("id").primaryKey().defaultRandom(),
  phoneE164: text("phone_e164"),
  email: text("email"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const settings = growvibe.table("settings", {
  id: integer("id").primaryKey().default(1),
  whatsappDailyLimit: integer("whatsapp_daily_limit").notNull(),
  emailDailyLimit: integer("email_daily_limit").notNull(),
  sendWindowStart: time("send_window_start").notNull(),
  sendWindowEnd: time("send_window_end").notNull(),
  sendDays: integer("send_days").array().notNull(),
  minDelaySeconds: integer("min_delay_seconds").notNull(),
  maxDelaySeconds: integer("max_delay_seconds").notNull(),
  warmupEnabled: boolean("warmup_enabled").notNull(),
  senderSignature: text("sender_signature"),
  privacyUrl: text("privacy_url"),
});

export const events = growvibe.table("events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type Settings = typeof settings.$inferSelect;
