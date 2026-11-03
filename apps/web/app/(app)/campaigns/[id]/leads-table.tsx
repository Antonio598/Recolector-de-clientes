import Link from "next/link";
import { ExternalLink, Star } from "lucide-react";
import type { Lead } from "@growvibe/db";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function LeadsTable({ leads, campaignId, niche }: { leads: Lead[]; campaignId: string; niche?: string }) {
  const niches = [...new Set(leads.map((l) => l.niche ?? "Sin giro"))];
  const shown = niche ? leads.filter((l) => (l.niche ?? "Sin giro") === niche) : leads;

  const chip = (label: string, href: string, active: boolean, n: number) => (
    <Link
      key={label}
      href={href}
      scroll={false}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium",
        active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600 hover:bg-slate-100",
      )}
    >
      {label} <span className="text-slate-400">{n}</span>
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {chip("Todos", `/campaigns/${campaignId}`, !niche, leads.length)}
        {niches.map((n) =>
          chip(
            n,
            `/campaigns/${campaignId}?giro=${encodeURIComponent(n)}`,
            n === niche,
            leads.filter((l) => (l.niche ?? "Sin giro") === n).length,
          ),
        )}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Negocio</TH>
            <TH>Giro</TH>
            <TH>Teléfono</TH>
            <TH>Sitio web</TH>
            <TH>Reseñas</TH>
            <TH>Estado</TH>
          </TR>
        </THead>
        <TBody>
          {shown.map((l) => (
            <TR key={l.id}>
              <TD className="max-w-72">
                <div className="flex items-center gap-1.5 font-medium">
                  {l.name}
                  {l.mapsUrl && (
                    <a href={l.mapsUrl} target="_blank" rel="noreferrer" aria-label="Ver en Google Maps">
                      <ExternalLink className="size-3.5 text-slate-400 hover:text-brand-700" />
                    </a>
                  )}
                </div>
                <div className="truncate text-xs text-slate-500">{l.address}</div>
              </TD>
              <TD className="text-slate-600">{l.niche}</TD>
              <TD className="whitespace-nowrap tabular-nums">{l.phoneE164 ?? <span className="text-slate-400">—</span>}</TD>
              <TD className="max-w-48 truncate">
                {l.website ? (
                  <a href={l.website} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    {l.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </TD>
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
    </div>
  );
}
