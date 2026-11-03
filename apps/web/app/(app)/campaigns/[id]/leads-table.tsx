import Link from "next/link";
import { Check, ExternalLink, Star } from "lucide-react";
import type { Lead } from "@growvibe/db";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type LeadFilter = "calificados" | "pendientes" | "descartados";
const MAX_ROWS = 300;

const FILTERS: Record<LeadFilter, { label: string; test: (l: Lead) => boolean }> = {
  calificados: { label: "Calificados", test: (l) => l.status === "calificado" },
  pendientes: { label: "Por calificar", test: (l) => l.status === "nuevo" },
  descartados: { label: "Descartados", test: (l) => l.status === "descartado" },
};

function href(campaignId: string, params: { giro?: string; estado?: string }) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  return `/campaigns/${campaignId}${q.size ? `?${q}` : ""}`;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-slate-400">—</span>;
  const color = score >= 70 ? "bg-brand-100 text-brand-700" : score >= 40 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500";
  return <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", color)}>{score}</span>;
}

export function LeadsTable({
  leads,
  campaignId,
  niche,
  filter,
}: {
  leads: Lead[];
  campaignId: string;
  niche?: string;
  filter?: LeadFilter;
}) {
  const byStatus = filter && FILTERS[filter] ? leads.filter(FILTERS[filter].test) : leads;
  const niches = [...new Set(leads.map((l) => l.niche ?? "Sin giro"))];
  const filtered = (niche ? byStatus.filter((l) => (l.niche ?? "Sin giro") === niche) : byStatus).sort(
    (a, b) => (b.score ?? -1) - (a.score ?? -1),
  );
  const shown = filtered.slice(0, MAX_ROWS);

  const chip = (label: string, to: string, active: boolean, n?: number) => (
    <Link
      key={label + to}
      href={to}
      scroll={false}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium",
        active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600 hover:bg-slate-100",
      )}
    >
      {label} {n !== undefined && <span className="text-slate-400">{n}</span>}
    </Link>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {chip("Todos", href(campaignId, { giro: niche }), !filter, leads.length)}
        {(Object.keys(FILTERS) as LeadFilter[]).map((f) =>
          chip(FILTERS[f].label, href(campaignId, { giro: niche, estado: f }), filter === f, leads.filter(FILTERS[f].test).length),
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {chip("Todos los giros", href(campaignId, { estado: filter }), !niche)}
        {niches.map((n) => chip(n, href(campaignId, { giro: n, estado: filter }), n === niche))}
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Score</TH>
            <TH>Negocio</TH>
            <TH>Giro</TH>
            <TH>Teléfono</TH>
            <TH>Email</TH>
            <TH>Reseñas</TH>
            <TH>Estado</TH>
          </TR>
        </THead>
        <TBody>
          {shown.map((l) => (
            <TR key={l.id} className={cn(l.status === "descartado" && "opacity-60")}>
              <TD>
                <ScoreBadge score={l.score} />
              </TD>
              <TD className="max-w-72">
                <div className="flex items-center gap-1.5">
                  <Link href={`/leads/${l.id}`} className="font-medium text-brand-700 hover:underline">
                    {l.name}
                  </Link>
                  {l.mapsUrl && (
                    <a href={l.mapsUrl} target="_blank" rel="noreferrer" aria-label="Ver en Google Maps">
                      <ExternalLink className="size-3.5 text-slate-400 hover:text-brand-700" />
                    </a>
                  )}
                </div>
                <div className="truncate text-xs text-slate-500">{l.scoreReason ?? l.address}</div>
              </TD>
              <TD className="text-slate-600">{l.niche}</TD>
              <TD className="whitespace-nowrap tabular-nums">
                {l.phoneE164 ?? <span className="text-slate-400">—</span>}
                {l.hasWhatsapp && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-brand-50 px-1 text-[10px] font-semibold text-brand-700">
                    <Check className="size-3" /> WA
                  </span>
                )}
              </TD>
              <TD className="max-w-48 truncate">{l.email ?? <span className="text-slate-400">—</span>}</TD>
              <TD className="whitespace-nowrap">
                {l.rating ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                    {Number(l.rating).toFixed(1)} <span className="text-slate-400">({l.reviewsCount ?? 0})</span>
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </TD>
              <TD className="capitalize text-slate-600">{l.status.replace("_", " ")}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {filtered.length > MAX_ROWS && (
        <p className="text-center text-xs text-slate-500">
          Mostrando {MAX_ROWS} de {filtered.length}. Filtra por estado o giro para ver el resto.
        </p>
      )}
    </div>
  );
}
