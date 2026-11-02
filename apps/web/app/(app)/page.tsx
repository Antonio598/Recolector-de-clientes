import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;

  // Las métricas reales llegan en la Fase 6.
  const stats = [
    { label: "Campañas activas", value: "—" },
    { label: "Enviados hoy", value: "—" },
    { label: "Respuestas nuevas", value: "—" },
    { label: "Interesados", value: "—" },
  ];

  return (
    <>
      <PageHeader title={`Hola, ${user.fullName ?? "equipo"}`} description="Resumen de la actividad de hoy." />
      {denied && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No tienes permiso para ver esa sección.
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardContent className="pt-5 text-sm text-slate-500">
          Las métricas se conectan en la Fase 6, cuando ya haya campañas y envíos.
        </CardContent>
      </Card>
    </>
  );
}
