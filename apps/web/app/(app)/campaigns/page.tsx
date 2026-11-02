import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export default async function CampaignsPage() {
  await requireRole("admin");
  return (
    <>
      <PageHeader title="Campañas" description="Busca negocios por zona y servicio." />
      <Card>
        <CardContent className="pt-5 text-sm text-slate-500">La creación de campañas llega en la Fase 2.</CardContent>
      </Card>
    </>
  );
}
