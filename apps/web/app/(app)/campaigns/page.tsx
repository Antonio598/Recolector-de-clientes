import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb, listCampaigns } from "@growvibe/db";
import { CampaignStatus } from "@/components/campaign-status";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function CampaignsPage() {
  const campaigns = await listCampaigns(getDb());

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Campañas" description="Busca negocios por zona y servicio." />
        <Button asChild>
          <Link href="/campaigns/new">
            <Plus className="size-4" /> Nueva campaña
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-5">
          {campaigns.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Aún no hay campañas. Crea la primera con una zona y el servicio que vendes.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Servicio</TH>
                  <TH>Zona</TH>
                  <TH>Estado</TH>
                  <TH className="text-right">Leads</TH>
                  <TH>Creada</TH>
                </TR>
              </THead>
              <TBody>
                {campaigns.map((c) => (
                  <TR key={c.id} className="hover:bg-slate-50">
                    <TD>
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-brand-700 hover:underline">
                        {c.service}
                      </Link>
                    </TD>
                    <TD>{c.zone}</TD>
                    <TD>
                      <CampaignStatus status={c.status} />
                    </TD>
                    <TD className="text-right tabular-nums">{c.leadCount}</TD>
                    <TD className="text-slate-500">
                      {c.createdAt?.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
