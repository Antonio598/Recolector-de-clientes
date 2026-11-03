import { serverEnv } from "@growvibe/core/env";
import { verifyUnsubscribeToken } from "@growvibe/core/unsubscribe";
import { getDb, getSettings } from "@growvibe/db";
import { Logo } from "@/components/logo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { UnsubscribeButton } from "./unsubscribe-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Darse de baja · GrowVibe", robots: { index: false } };

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = serverEnv().UNSUBSCRIBE_SECRET;
  const target = secret ? verifyUnsubscribeToken(secret, token) : null;
  const settings = await getSettings(getDb()).catch(() => undefined);

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Logo />
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {target ? (
            <>
              <p>
                ¿Desea dejar de recibir mensajes de nuestra parte en{" "}
                <strong>{"email" in target ? target.email : target.phone}</strong>?
              </p>
              <UnsubscribeButton token={token} />
            </>
          ) : (
            <p className="text-red-700">El enlace de baja no es válido o está incompleto.</p>
          )}
          {settings?.privacyUrl && (
            <a href={settings.privacyUrl} className="text-xs text-slate-500 underline" target="_blank" rel="noreferrer">
              Aviso de privacidad
            </a>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
