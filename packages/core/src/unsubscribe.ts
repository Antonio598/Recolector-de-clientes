import { createHmac, timingSafeEqual } from "node:crypto";

// Token de baja: base64url("e:<email>" | "p:<telefono>") + "." + HMAC-SHA256 truncado.
// No requiere login ni base de datos para verificarse.

export type UnsubTarget = { email: string } | { phone: string };

function sign(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 32);
}

export function makeUnsubscribeToken(secret: string, target: UnsubTarget): string {
  const payload = "email" in target ? `e:${target.email.toLowerCase()}` : `p:${target.phone}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(secret, payload)}`;
}

export function verifyUnsubscribeToken(secret: string, token: string): UnsubTarget | null {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, "base64url").toString("utf8");
  const expected = sign(secret, payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (payload.startsWith("e:")) return { email: payload.slice(2) };
  if (payload.startsWith("p:")) return { phone: payload.slice(2) };
  return null;
}
