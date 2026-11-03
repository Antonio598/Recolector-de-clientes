import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Compara el secreto de la URL del webhook en tiempo constante. */
export function validSecret(given: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
