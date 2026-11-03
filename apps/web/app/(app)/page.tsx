import Link from "next/link";
import { effectiveWhatsappLimit, mexicoClock } from "@growvibe/core";
import { channelCounters, dashboardStats, getDb, getSettings, listInbox } from "@growvibe/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const db = getDb();
  const [stats, settings, wa, inbox] = await Promise.all([
    dashboardStats(db),
    getSettings(db),
    channelCounters(db, "whatsapp", 10),
    listInbox(db, { limit: 5, ...(user.role === "vendedor" ? { assignedTo: user.id } : {}) }),
  ]);
  const waLimit = settings
    ? effectiveWhatsappLimit(settings.whatsappDailyLimit, settings.warmupEnabled, wa.firstSentDate, mexicoClock().date)
    : 0;

  const tiles = [
    { label: "Campañas activas", value: stats.activeCampaigns, hint: `${stats.sendingCampaigns} enviando` },
    { label: "WhatsApp hoy", value: `${stats.waToday}/${waLimit}`, hint: settings?.warmupEnabled && waLimit < (settings?.whatsappDailyLimit ?? 0) ? "en calentamiento" : "enviados / límite" },
    { label: "Emails hoy", value: `${stats.emailToday}/${settings?.emailDailyLimit ?? 0}`, hint: "enviados / límite" },
    { label: "Respuestas (24 h)", value: stats.repliesToday, hint: "WhatsApp + email" },
    { label: "Interesados", value: stats.interested, hint: "por atender" },
  ];

  return (
    <>
      <PageHeader title={`Hola, ${user.fullName ?? "equipo"}`} description="Resumen de la actividad de hoy." />
      {denied && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No tienes permiso para ver esa sección.
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader>
              <CardDescription>{t.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{t.value}</CardTitle>
              <p className="text-xs text-slate-400">{t.hint}</p>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Últimas respuestas</CardTitle>
        </CardHeader>
        <CardContent>
          {inbox.length === 0 ? (
            <p className="text-sm text-slate-500">Sin respuestas todavía.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {inbox.map((i) => (
                <li key={i.messageId} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <Link href={`/leads/${i.leadId}`} className="font-medium text-brand-700 hover:underline">
                    {i.leadName}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-slate-600">{i.body}</span>
                  <span className="text-xs text-slate-400">{i.classification ?? "clasificando…"}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/inbox" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
            Ir a la bandeja →
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
