import { AlertTriangle } from "lucide-react";
import type { SendChannel } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { connectionState } from "@growvibe/core/server";
import { getDb, getSettings, listOptOuts, listUsers } from "@growvibe/db";
import { Button } from "@/components/ui/button";
import { channelRuntime } from "@/lib/queue";
import { resumeChannelAction } from "./channel-actions";
import { OptOutForm } from "./opt-out-form";
import { WhatsappQr } from "./whatsapp-qr";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { SettingsForm } from "./settings-form";
import { UsersSection } from "./users-section";

export default async function SettingsPage() {
  const me = await requireRole("admin");
  const db = getDb();
  const env = serverEnv();
  const [settings, users, optOuts, waRt, emailRt, waState] = await Promise.all([
    getSettings(db),
    listUsers(db),
    listOptOuts(db),
    channelRuntime("whatsapp"),
    channelRuntime("email"),
    env.EVOLUTION_API_KEY
      ? connectionState({ url: env.EVOLUTION_API_URL, apiKey: env.EVOLUTION_API_KEY, instance: env.EVOLUTION_INSTANCE }).catch(
          (e: Error) => `error: ${e.message}`,
        )
      : Promise.resolve("sin configurar"),
  ]);
  const brevoOk = !!(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL && env.UNSUBSCRIBE_SECRET);

  return (
    <>
      <PageHeader title="Ajustes" description="Conexiones, límites de envío, firma y usuarios." />

      <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-medium">Antes de enviar, ten en cuenta:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>Evolution API no es una API oficial de WhatsApp: el número puede ser bloqueado.</li>
            <li>Las políticas de Brevo restringen el email no solicitado; usa un dominio secundario con SPF, DKIM y DMARC.</li>
          </ul>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp</CardTitle>
            <CardDescription>
              Evolution API · instancia <strong>{env.EVOLUTION_INSTANCE}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              Estado:{" "}
              <span className={waState === "open" ? "font-medium text-brand-700" : "font-medium text-red-700"}>
                {waState === "open" ? "Conectado" : waState}
              </span>
            </p>
            <PauseBanner channel="whatsapp" reason={waRt.pausedReason} />
            <WhatsappQr />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Email (Brevo)</CardTitle>
            <CardDescription>Remitente configurado en el servidor.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              {env.BREVO_SENDER_NAME}{" "}
              <span className="text-slate-500">&lt;{env.BREVO_SENDER_EMAIL || "sin configurar"}&gt;</span>
            </p>
            {!brevoOk && (
              <p className="text-amber-700">
                Para enviar emails faltan variables: BREVO_API_KEY, BREVO_SENDER_EMAIL y UNSUBSCRIBE_SECRET.
              </p>
            )}
            <PauseBanner channel="email" reason={emailRt.pausedReason} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Límites y horario de envío</CardTitle>
          <CardDescription>El scheduler los aplica siempre, en hora de México.</CardDescription>
        </CardHeader>
        <CardContent>{settings ? <SettingsForm settings={settings} /> : <p>No se encontró la fila de ajustes.</p>}</CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Usuarios</CardTitle>
          <CardDescription>Admins y vendedores del equipo.</CardDescription>
        </CardHeader>
        <CardContent>
          <UsersSection users={users} meId={me.id} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Lista de bajas</CardTitle>
          <CardDescription>Teléfonos y emails que no se vuelven a contactar ({optOuts.length} más recientes).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <OptOutForm />
          {optOuts.length === 0 ? (
            <p className="text-slate-500">Nadie se ha dado de baja.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {optOuts.map((o) => (
                <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-medium">{o.phoneE164 ?? o.email}</span>
                  <span className="text-slate-500">
                    {o.reason} · {o.createdAt?.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function PauseBanner({ channel, reason }: { channel: SendChannel; reason: string | null }) {
  if (!reason) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-red-800">
      <span>Envíos pausados: {reason}</span>
      <form action={resumeChannelAction.bind(null, channel)}>
        <Button size="sm" variant="outline">
          Reanudar
        </Button>
      </form>
    </div>
  );
}
