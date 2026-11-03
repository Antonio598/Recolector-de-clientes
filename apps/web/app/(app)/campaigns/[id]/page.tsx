import { notFound } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  enrichJobId,
  planJobId,
  qualifyJobId,
  runJobId,
  type EnrichProgress,
  type Niche,
  type QualifyProgress,
  type Rect,
  type SearchProgress,
} from "@growvibe/core";
import { campaignFunnel, getCampaign, getDb, listLeads, type Campaign } from "@growvibe/db";
import { AutoRefresh } from "@/components/auto-refresh";
import { CampaignStatus } from "@/components/campaign-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getJobInfo, type JobInfo } from "@/lib/queue";
import { enrichAction, replanAction, retryRunAction } from "../actions";
import { LeadsTable, type LeadFilter } from "./leads-table";
import { NichesEditor } from "./niches-editor";
import { QualifyPanel } from "./qualify-panel";

const isFailed = (j: JobInfo | null) => j?.state === "failed" || j?.state === "redis-error";
const isRunning = (j: JobInfo | null) =>
  !!j && ["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(j.state);

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ giro?: string; estado?: string }>;
}) {
  const { id } = await params;
  const { giro, estado } = await searchParams;
  const campaign = await getCampaign(getDb(), id);
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
        <LeadsSection campaign={campaign} giro={giro} estado={estado as LeadFilter | undefined} />
      )}
    </>
  );
}

async function PlanSection({ campaignId, niches, bounds }: { campaignId: string; niches: Niche[] | null; bounds: Rect | null }) {
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
  if (isFailed(job)) {
    return <ErrorCard message={job?.failedReason ?? "No se pudo generar el plan"} action={replanAction.bind(null, campaignId)} actionLabel="Reintentar" />;
  }
  return (
    <ProgressCard label="Claude está proponiendo giros de negocio y ubicando la zona…" retry={job?.attemptsMade} />
  );
}

async function LeadsSection({ campaign, giro, estado }: { campaign: Campaign; giro?: string; estado?: LeadFilter }) {
  const db = getDb();
  const [leads, funnel, runJob, enrichJob, qualifyJob] = await Promise.all([
    listLeads(db, campaign.id),
    campaignFunnel(db, campaign.id, campaign.channels),
    campaign.status === "buscando" ? getJobInfo("search", runJobId(campaign.id)) : null,
    getJobInfo("enrich", enrichJobId(campaign.id)),
    getJobInfo("ai-qualify", qualifyJobId(campaign.id)),
  ]);

  const searching = campaign.status === "buscando" && (isRunning(runJob) || isFailed(runJob));
  const enriching = isRunning(enrichJob);
  const qualifying = isRunning(qualifyJob);
  const sp = runJob?.progress as SearchProgress | null;
  const ep = enrichJob?.progress as EnrichProgress | null;
  const qp = qualifyJob?.progress as QualifyProgress | null;

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Búsqueda */}
      {searching && isFailed(runJob) && (
        <ErrorCard
          message={`La búsqueda se detuvo: ${runJob?.failedReason}. Los ${leads.length} leads ya guardados se conservan.`}
          action={retryRunAction.bind(null, campaign.id)}
          actionLabel="Continuar búsqueda"
        />
      )}
      {searching && !isFailed(runJob) && (
        <ProgressCard
          label={`Buscando en Google Maps… ${sp ? `${sp.done} de ${sp.total} búsquedas` : "en cola"}`}
          right={`${leads.length} negocios`}
          pct={sp && sp.total ? sp.done / sp.total : 0}
        />
      )}

      {/* 2. Enriquecimiento */}
      {enriching && (
        <ProgressCard
          label={`Verificando WhatsApp y buscando emails… ${ep ? `${ep.done} de ${ep.total}` : "en cola"}`}
          right={ep ? `${ep.whatsapp} con WhatsApp · ${ep.emails} con email` : undefined}
          pct={ep && ep.total ? ep.done / ep.total : 0}
        />
      )}
      {!enriching && isFailed(enrichJob) && funnel.pendingEnrich > 0 && (
        <ErrorCard
          message={`El enriquecimiento se detuvo: ${enrichJob?.failedReason}`}
          action={enrichAction.bind(null, campaign.id)}
          actionLabel="Reintentar"
        />
      )}
      {!searching && !enriching && !isFailed(enrichJob) && funnel.pendingEnrich > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-ink">{funnel.pendingEnrich} leads</span> sin enriquecer (WhatsApp,
              email y duplicados). No usa IA.
            </p>
            <form action={enrichAction.bind(null, campaign.id)}>
              <Button size="sm">Enriquecer leads</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Embudo */}
      {!searching && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Negocios" value={funnel.total} />
          <Stat label="Con WhatsApp" value={funnel.withWhatsapp} />
          <Stat label="Con email" value={funnel.withEmail} />
          <Stat label="Calificados" value={funnel.qualified} accent />
          <Stat label="Descartados" value={funnel.discarded} />
        </div>
      )}

      {/* 3. Calificación con IA */}
      {qualifying && (
        <ProgressCard
          label={`Claude está calificando y redactando… ${qp ? `${qp.done} de ${qp.total}` : "en cola"}`}
          right={qp ? `${qp.qualified} calificados · ${qp.discarded} descartados${qp.failed ? ` · ${qp.failed} con error` : ""}` : undefined}
          pct={qp && qp.total ? qp.done / qp.total : 0}
        />
      )}
      {!qualifying && isFailed(qualifyJob) && (
        <ErrorCard message={`La calificación se detuvo: ${qualifyJob?.failedReason}`} />
      )}
      {!qualifying && qualifyJob?.state === "completed" && qp && qp.failed > 0 && (
        <p className="text-sm text-amber-700">
          {qp.failed} leads no se pudieron calificar en la última corrida; siguen disponibles para calificar.
        </p>
      )}
      {!searching && !enriching && !qualifying && funnel.pendingEnrich === 0 && funnel.eligible > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Calificar y redactar con IA</CardTitle>
            <CardDescription>
              Claude puntúa cada negocio (0–100) y escribe su WhatsApp y su email personalizados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QualifyPanel campaignId={campaign.id} eligible={funnel.eligible} />
          </CardContent>
        </Card>
      )}

      {leads.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <LeadsTable leads={leads} campaignId={campaign.id} niche={giro} filter={estado} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`text-xl font-semibold tabular-nums ${accent ? "text-brand-700" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ProgressCard({ label, right, pct, retry }: { label: string; right?: string; pct?: number; retry?: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 text-slate-600">
            <Loader2 className="size-4 animate-spin text-brand-600" />
            {label}
            {!!retry && <span className="text-amber-700">(reintento {retry})</span>}
          </span>
          {right && <span className="font-medium tabular-nums">{right}</span>}
        </div>
        {pct !== undefined && (
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.round(pct * 100)}%` }} />
          </div>
        )}
        <AutoRefresh />
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message, action, actionLabel }: { message: string; action?: () => Promise<void>; actionLabel?: string }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
        <p className="flex items-start gap-2 text-sm text-red-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {message}
        </p>
        {action && (
          <form action={action}>
            <Button variant="outline" size="sm">
              {actionLabel}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
