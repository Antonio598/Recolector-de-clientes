import Link from "next/link";
import { getDb, listRecentErrors } from "@growvibe/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { recentFailedJobs, type FailedJob } from "@/lib/queue";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) =>
  d?.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Mexico_City" }) ?? "—";

export default async function LogsPage() {
  await requireRole("admin");
  const errors = await listRecentErrors(getDb());
  let jobs: FailedJob[] = [];
  let redisDown = false;
  try {
    jobs = await recentFailedJobs();
  } catch (e) {
    console.error("[logs] no se pudieron leer los jobs:", e);
    redisDown = true;
  }

  return (
    <>
      <PageHeader title="Errores" description="Lo que falló en el worker y en cada lead, más reciente primero." />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Procesos fallidos ({jobs.length})</CardTitle>
            <CardDescription>Búsquedas, enriquecimiento, calificación, envíos y programador.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {redisDown ? (
              <p className="text-red-700">No hay conexión con Redis: revisa REDIS_URL.</p>
            ) : jobs.length === 0 ? (
              <p className="text-slate-500">Sin procesos fallidos.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {jobs.map((j) => (
                  <li key={`${j.queue}-${j.id}`} className="flex flex-col gap-1 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{j.queue}</Badge>
                      <span className="font-medium">{j.name}</span>
                      <span className="text-xs text-slate-400">
                        {fmt(j.at)} · {j.attempts} {j.attempts === 1 ? "intento" : "intentos"}
                      </span>
                    </div>
                    <p className="break-words text-red-700">{j.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Errores por lead ({errors.length})</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {errors.length === 0 ? (
              <p className="text-slate-500">Sin errores registrados.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {errors.map((e) => {
                  const d = (e.data ?? {}) as { step?: string; message?: string };
                  return (
                    <li key={e.id} className="flex flex-col gap-1 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/leads/${e.leadId}`} className="font-medium text-brand-700 hover:underline">
                          {e.leadName}
                        </Link>
                        {d.step && <Badge>{d.step}</Badge>}
                        <span className="text-xs text-slate-400">{fmt(e.createdAt)}</span>
                      </div>
                      <p className="break-words text-red-700">{d.message}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
