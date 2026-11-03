"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { nichesToQueries, splitRect, type Niche, type Rect } from "@growvibe/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { confirmPlanAction, replanAction } from "../actions";

// Deben coincidir con el worker (apps/worker/src/processors/search.ts).
const MAX_REQUESTS = 300;
const MAX_PAGES = 3;
const USD_PER_REQUEST = 0.035;

export function NichesEditor({
  campaignId,
  initial,
  bounds,
}: {
  campaignId: string;
  initial: Niche[];
  bounds: Rect | null;
}) {
  const [niches, setNiches] = useState<Niche[]>(initial);
  const [pending, start] = useTransition();

  const update = (i: number, patch: Partial<Niche>) =>
    setNiches((ns) => ns.map((n, j) => (j === i ? { ...n, ...patch } : n)));

  const estimate = useMemo(() => {
    const cells = bounds ? splitRect(bounds, 10, 16).length : 1;
    const queries = nichesToQueries(niches.map((n) => ({ ...n, queries: n.queries.filter(Boolean) }))).length;
    const maxRequests = Math.min(MAX_REQUESTS, queries * cells * MAX_PAGES);
    return { cells, queries, maxRequests, maxUsd: maxRequests * USD_PER_REQUEST };
  }, [niches, bounds]);

  const confirm = () =>
    start(async () => {
      const clean = niches.map((n) => ({ ...n, queries: n.queries.map((q) => q.trim()).filter(Boolean) }));
      const res = await confirmPlanAction(campaignId, clean);
      if (res?.error) toast.error(res.error);
      else toast.success("Búsqueda lanzada");
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        {niches.map((n, i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-3 pt-5">
              <div className="flex items-start gap-2">
                <Input
                  value={n.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="font-medium"
                  aria-label="Giro"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Quitar giro"
                  onClick={() => setNiches((ns) => ns.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4 text-slate-500" />
                </Button>
              </div>
              {n.why && <p className="text-sm text-slate-500">{n.why}</p>}
              <div className="flex flex-col gap-2">
                {n.queries.map((q, qi) => (
                  <div key={qi} className="flex items-center gap-2">
                    <Search className="size-3.5 shrink-0 text-slate-400" />
                    <Input
                      value={q}
                      onChange={(e) =>
                        update(i, { queries: n.queries.map((x, k) => (k === qi ? e.target.value : x)) })
                      }
                      className="h-8"
                      aria-label="Búsqueda"
                    />
                    <button
                      aria-label="Quitar búsqueda"
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      disabled={n.queries.length <= 1}
                      onClick={() => update(i, { queries: n.queries.filter((_, k) => k !== qi) })}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                {n.queries.length < 3 && (
                  <button
                    className="self-start text-xs font-medium text-brand-700 hover:underline"
                    onClick={() => update(i, { queries: [...n.queries, ""] })}
                  >
                    + Agregar búsqueda
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {niches.length < 10 && (
          <button
            onClick={() => setNiches((ns) => [...ns, { name: "Nuevo giro", why: "", queries: [""] }])}
            className="flex min-h-32 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-500 hover:border-brand-500 hover:text-brand-700"
          >
            <Plus className="size-4" /> Agregar giro
          </button>
        )}
      </div>

      <Card className="sticky bottom-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <p className="text-sm text-slate-600">
            {niches.length} giros · {estimate.queries} búsquedas · {estimate.cells}{" "}
            {estimate.cells === 1 ? "zona" : "subzonas"}
            <span className="block text-xs text-slate-500">
              Máximo {estimate.maxRequests} consultas a Google (≈ ${estimate.maxUsd.toFixed(2)} USD como tope)
            </span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={pending} onClick={() => start(() => replanAction(campaignId))}>
              <RefreshCw className="size-4" /> Proponer otros
            </Button>
            <Button disabled={pending || niches.length === 0} onClick={confirm}>
              {pending ? "Lanzando…" : "Confirmar y buscar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
