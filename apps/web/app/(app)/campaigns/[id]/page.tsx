import { notFound } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { planJobId, runJobId, type Niche, type Rect, type SearchProgress } from "@growvibe/core";
import { getCampaign, getDb, listLeads } from "@growvibe/db";
import { AutoRefresh } from "@/components/auto-refresh";
import { CampaignStatus } from "@/components/campaign-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getJobInfo, type JobInfo } from "@/lib/queue";
import { replanAction, retryRunAction } from "../actions";
import { LeadsTable } from "./leads-table";
import { NichesEditor } from "./niches-editor";

const isFinalFailure = (j: JobInfo | null) => j?.state === "failed" || j?.state === "redis-error";

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ giro?: string }>;
}) {
  const { id } = await params;
  const { giro } = await searchParams;
  const db = getDb();
  const campaign = await getCampaign(db, id);
  if (!campaign) notFound();

  const bounds = campaign.zoneBounds as (Rect & { formattedAddress?: string }) | null;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{campaign.service}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {bounds?.formattedAddress ?? campaign.zone} · {campaign.channels.join(" + ")}
          </p>
        </div>
        <CampaignStatus status={campaign.status} />
      </div>

      {campaign.status === "borrador" ? (
        <PlanSection campaignId={id} niches={campaign.niches as Niche[] | null} bounds={bounds} />
      ) : (
        <SearchSection campaignId={id} status={campaign.status} giro={giro} />
      )}
    </>
  );
}

async function PlanSection({
  campaignId,
  niches,
  bounds,
}: {
  campaignId: string;
  niches: Niche[] | null;
  bounds: Rect | null;
}) {
  if (niches) {
    return (
      <>
        <p className="mb-4 text-sm text-slate-600">
          Revisa los giros y las búsquedas que propuso Claude. Puedes editarlos, quitarlos o agregar otros.
        </p>
        <NichesEditor campaignId={campaignId} initial={niches} bounds={bounds} />
      </>
    );
  }

  const job = await getJobInfo("search", planJobId(campaignId));
  if (isFinalFailure(job)) {
    return (
      <ErrorCard
        message={job?.failedReason ?? "No se pudo generar el plan"}
        action={replanAction.bind(null, campaignId)}
        actionLabel="Reintentar"
      />
    );
  }
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5 text-sm text-slate-600">
        <Loader2 className="size-5 animate-spin text-brand-600" />
        Claude está proponiendo giros de negocio y ubicando la zona…
        {job && job.attemptsMade > 0 && (
          <span className="text-amber-700">(reintento {job.attemptsMade} de {job.maxAttempts - 1})</span>
        )}
        <AutoRefresh />
      </CardContent>
    </Card>
  );
}

async function SearchSection({ campaignId, status, giro }: { campaignId: string; status: string; giro?: string }) {
  const leads = await listLeads(getDb(), campaignId);
  const searching = status === "buscando";
  const job = searching ? await getJobInfo("search", runJobId(campaignId)) : null;
  const p = (job?.progress ?? null) as SearchProgress | null;
  const pct = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {searching && isFinalFailure(job) && (
        <ErrorCard
          message={`La búsqueda se detuvo: ${job?.failedReason ?? "error desconocido"}. Los ${leads.length} leads ya guardados se conservan.`}
          action={retryRunAction.bind(null, campaignId)}
          actionLabel="Continuar búsqueda"
        />
      )}
      {searching && !isFinalFailure(job) && (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                <Loader2 className="size-4 animate-spin text-brand-600" />
                Buscando en Google Maps… {p ? `${p.done} de ${p.total} búsquedas` : "en cola"}
              </span>
              <span className="font-medium tabular-nums">{leads.length} negocios</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <AutoRefresh />
          </CardContent>
        </Card>
      )}
      {!searching && (
        <p className="text-sm text-slate-600">
          <span className="font-medium text-ink">{leads.length} negocios únicos</span> encontrados. El enriquecimiento
          (WhatsApp, emails) y la calificación con IA llegan en la Fase 3.
        </p>
      )}
      {leads.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <LeadsTable leads={leads} campaignId={campaignId} niche={giro} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ErrorCard({ message, action, actionLabel }: { message: string; action: () => Promise<void>; actionLabel: string }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
        <p className="flex items-start gap-2 text-sm text-red-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {message}
        </p>
        <form action={action}>
          <Button variant="outline" size="sm">
            {actionLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
