import { serverEnv } from "@growvibe/core/env";
import { verifyUnsubscribeToken } from "@growvibe/core/unsubscribe";
import { getDb, registerOptOut } from "@growvibe/db";

export const dynamic = "force-dynamic";

/** Baja en un clic (RFC 8058): el cliente de correo hace POST a la URL del header List-Unsubscribe. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = serverEnv().UNSUBSCRIBE_SECRET;
  const target = secret ? verifyUnsubscribeToken(secret, token) : null;
  if (!target) return new Response("Token inválido", { status: 400 });
  await registerOptOut(getDb(), "email" in target ? { email: target.email } : { phone: target.phone }, "List-Unsubscribe");
  return new Response("OK");
}

/** Si alguien abre la URL en el navegador, lo manda a la página de confirmación. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return Response.redirect(new URL(`/u/${token}`, req.url), 302);
}
