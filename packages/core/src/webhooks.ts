import { z } from "zod";

// Parsers tolerantes de los webhooks. Devuelven null para lo que se ignora.

// ───────────── Evolution API v2 ─────────────

const evoKey = z.object({
  remoteJid: z.string().optional(),
  remoteJidAlt: z.string().optional(),
  senderPn: z.string().optional(),
  fromMe: z.boolean().optional(),
  id: z.string().optional(),
});

export type EvolutionEvent =
  | { type: "incoming"; providerId: string; phoneDigits: string; text: string; pushName?: string }
  | { type: "status"; providerId: string; status: "entregado" | "leido" }
  | { type: "connection"; state: string };

function messageText(m: unknown): string | null {
  if (!m || typeof m !== "object") return null;
  const msg = m as Record<string, any>;
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    msg.buttonsResponseMessage?.selectedDisplayText ??
    msg.listResponseMessage?.title ??
    (msg.audioMessage ? "[Nota de voz]" : null) ??
    (msg.imageMessage ? "[Imagen]" : null) ??
    (msg.documentMessage ? "[Documento]" : null) ??
    (msg.stickerMessage ? "[Sticker]" : null)
  );
}

/** Teléfono real del remitente: remoteJid, o remoteJidAlt/senderPn si WhatsApp manda un "@lid" anónimo. */
function senderDigits(key: z.infer<typeof evoKey>): string | null {
  const candidates = [key.remoteJid, key.remoteJidAlt, key.senderPn].filter(Boolean) as string[];
  const phoneJid = candidates.find((j) => j.endsWith("@s.whatsapp.net")) ?? candidates.find((j) => /^\d+$/.test(j));
  return phoneJid ? phoneJid.split("@")[0]!.replace(/\D/g, "") : null;
}

export function parseEvolutionWebhook(body: unknown): EvolutionEvent[] {
  const b = body as { event?: string; data?: unknown };
  const event = (b?.event ?? "").toLowerCase().replace(/_/g, ".");
  const items = Array.isArray(b?.data) ? b.data : [b?.data];
  const out: EvolutionEvent[] = [];

  for (const d of items as Record<string, any>[]) {
    if (!d) continue;
    if (event === "messages.upsert") {
      const key = evoKey.safeParse(d.key);
      if (!key.success || key.data.fromMe || !key.data.id) continue;
      if (key.data.remoteJid?.endsWith("@g.us") || key.data.remoteJid === "status@broadcast") continue; // grupos/estados
      const phoneDigits = senderDigits(key.data);
      const text = messageText(d.message);
      if (!phoneDigits || !text) continue;
      out.push({ type: "incoming", providerId: key.data.id, phoneDigits, text, pushName: d.pushName });
    } else if (event === "messages.update") {
      const providerId = d.keyId ?? d.key?.id;
      const status = String(d.status ?? d.update?.status ?? "").toUpperCase();
      if (!providerId) continue;
      if (status === "READ" || status === "PLAYED") out.push({ type: "status", providerId, status: "leido" });
      else if (status === "DELIVERY_ACK") out.push({ type: "status", providerId, status: "entregado" });
    } else if (event === "connection.update") {
      if (d.state) out.push({ type: "connection", state: String(d.state) });
    }
  }
  return out;
}

// ───────────── Brevo ─────────────

export type BrevoEvent =
  | { type: "status"; providerId: string; email: string; status: "entregado" | "leido" | "fallido"; optOut?: string; hardBounce?: boolean }
  | { type: "incoming"; fromEmail: string; subject: string | null; text: string; providerId: string };

const BREVO_STATUS: Record<string, { status: "entregado" | "leido" | "fallido"; optOut?: string; hardBounce?: boolean }> = {
  delivered: { status: "entregado" },
  opened: { status: "leido" },
  unique_opened: { status: "leido" },
  click: { status: "leido" },
  hard_bounce: { status: "fallido", optOut: "Rebote duro de email", hardBounce: true },
  soft_bounce: { status: "fallido" },
  blocked: { status: "fallido" },
  spam: { status: "fallido", optOut: "Marcó el email como spam" },
  unsubscribed: { status: "entregado", optOut: "Se dio de baja desde el email" },
};

export function parseBrevoWebhook(body: unknown): BrevoEvent[] {
  const out: BrevoEvent[] = [];
  const b = body as Record<string, any>;

  // Inbound parsing: { items: [{ From: { Address }, Subject, RawTextBody, ExtractedMarkdownMessage, MessageId }] }
  if (Array.isArray(b?.items)) {
    for (const it of b.items) {
      const from = it?.From?.Address ?? it?.Sender?.Address;
      const text = it?.ExtractedMarkdownMessage ?? it?.RawTextBody ?? it?.ExtractedMarkdownSignature ?? "";
      if (from && text) {
        out.push({
          type: "incoming",
          fromEmail: String(from).toLowerCase(),
          subject: it.Subject ?? null,
          text: String(text).slice(0, 5000),
          providerId: it.MessageId ?? it.Uuid?.[0] ?? `${from}-${Date.now()}`,
        });
      }
    }
    return out;
  }

  // Eventos transaccionales: { event, email, "message-id" }
  // Brevo manda "hard_bounce"; se acepta también "hardBounce".
  const ev = String(b?.event ?? "").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  const map = BREVO_STATUS[ev];
  const providerId = b?.["message-id"] ?? b?.messageId;
  if (map && providerId && b?.email) out.push({ type: "status", providerId, email: String(b.email).toLowerCase(), ...map });
  return out;
}

/** "BAJA" y variantes obvias: se registra la baja al instante sin esperar a la IA. */
export function isExplicitOptOut(text: string): boolean {
  const t = text.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /^(baja|darme de baja|dar de baja|stop|alto|no me escriban|no me escribas|no molesten|quitenme de su lista)[.!]*$/.test(t);
}
