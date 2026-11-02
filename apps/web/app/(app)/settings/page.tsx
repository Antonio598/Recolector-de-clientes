import { AlertTriangle } from "lucide-react";
import { getSettings, listProfiles } from "@growvibe/db";
import { createServiceClient } from "@growvibe/db/service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { SettingsForm } from "./settings-form";
import { UsersSection } from "./users-section";

export default async function SettingsPage() {
  const me = await requireRole("admin");
  const db = await supabaseServer();
  const [settings, profiles] = await Promise.all([getSettings(db), listProfiles(db)]);

  // Los emails viven en auth.users: solo se leen con service role.
  const { data: authUsers } = await createServiceClient().auth.admin.listUsers({ perPage: 200 });
  const emails = new Map(authUsers?.users.map((u) => [u.id, u.email ?? ""]) ?? []);
  const users = profiles.map((p) => ({ ...p, email: emails.get(p.id) ?? "" }));

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
            <CardDescription>Conexión por QR con Evolution API.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-500">Disponible en la Fase 4.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Email (Brevo)</CardTitle>
            <CardDescription>Remitente configurado en el servidor.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              {process.env.BREVO_SENDER_NAME ?? "GrowVibe"}{" "}
              <span className="text-slate-500">&lt;{process.env.BREVO_SENDER_EMAIL || "sin configurar"}&gt;</span>
            </p>
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
          <CardDescription>Teléfonos y emails que no se vuelven a contactar.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">Disponible en la Fase 4.</CardContent>
      </Card>
    </>
  );
}
