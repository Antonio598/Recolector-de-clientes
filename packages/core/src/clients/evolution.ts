import { z } from "zod";

export type EvolutionConfig = { url: string; apiKey: string; instance: string };

const numbersResponse = z.array(
  z.object({ exists: z.boolean(), jid: z.string().nullable().optional(), number: z.string() }),
);

async function call(cfg: EvolutionConfig, method: "GET" | "POST", path: string, body?: unknown) {
  const res = await fetch(`${cfg.url.replace(/\/$/, "")}${path}`, {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: { apikey: cfg.apiKey, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Evolution ${method} ${path} falló (${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export async function connectionState(cfg: EvolutionConfig): Promise<string> {
  const data = await call(cfg, "GET", `/instance/connectionState/${encodeURIComponent(cfg.instance)}`);
  return z.object({ instance: z.object({ state: z.string() }) }).parse(data).instance.state;
}

/**
 * Verifica en lote qué números tienen WhatsApp.
 * Entrada: E.164 ("+522291234567"). Devuelve un mapa E.164 → { exists, jid }.
 */
export async function checkWhatsappNumbers(
  cfg: EvolutionConfig,
  e164: string[],
): Promise<Map<string, { exists: boolean; jid: string | null }>> {
  const out = new Map<string, { exists: boolean; jid: string | null }>();
  if (e164.length === 0) return out;
  const data = await call(cfg, "POST", `/chat/whatsappNumbers/${encodeURIComponent(cfg.instance)}`, {
    numbers: e164.map((n) => n.replace(/^\+/, "")),
  });
  for (const r of numbersResponse.parse(data)) {
    out.set(`+${r.number.replace(/\D/g, "")}`, { exists: r.exists, jid: r.exists ? (r.jid ?? null) : null });
  }
  return out;
}

/** Envía un texto. `number` en dígitos internacionales (sin +). `delayMs` simula escritura. Devuelve el id del mensaje. */
export async function sendWhatsappText(
  cfg: EvolutionConfig,
  number: string,
  text: string,
  delayMs: number,
): Promise<string | null> {
  const data = await call(cfg, "POST", `/message/sendText/${encodeURIComponent(cfg.instance)}`, {
    number,
    text,
    delay: delayMs,
  });
  const parsed = z.object({ key: z.object({ id: z.string() }).partial().optional() }).passthrough().safeParse(data);
  return parsed.success ? (parsed.data.key?.id ?? null) : null;
}

/** QR para vincular el número (base64 data URL) o null si ya está conectado. */
export async function connectInstance(cfg: EvolutionConfig): Promise<{ qr: string | null; state?: string }> {
  const data = await call(cfg, "GET", `/instance/connect/${encodeURIComponent(cfg.instance)}`);
  const qr = z.object({ base64: z.string() }).safeParse(data);
  if (qr.success) return { qr: qr.data.base64 };
  const st = z.object({ instance: z.object({ state: z.string() }) }).safeParse(data);
  return { qr: null, state: st.success ? st.data.instance.state : undefined };
}
