"use server";

import { serverEnv } from "@growvibe/core/env";
import { verifyUnsubscribeToken } from "@growvibe/core/unsubscribe";
import { getDb, registerOptOut } from "@growvibe/db";

export async function confirmUnsubscribe(token: string): Promise<{ ok: boolean }> {
  const secret = serverEnv().UNSUBSCRIBE_SECRET;
  const target = secret ? verifyUnsubscribeToken(secret, token) : null;
  if (!target) return { ok: false };
  await registerOptOut(getDb(), "email" in target ? { email: target.email } : { phone: target.phone }, "Enlace de baja");
  return { ok: true };
}
