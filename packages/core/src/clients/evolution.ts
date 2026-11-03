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
