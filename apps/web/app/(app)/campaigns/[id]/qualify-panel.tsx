"use client";

import { useActionState, useState } from "react";
import { Sparkles } from "lucide-react";
import { QUALIFY_USD_PER_LEAD } from "@growvibe/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { qualifyAction } from "../actions";

export function QualifyPanel({ campaignId, eligible }: { campaignId: string; eligible: number }) {
  const [limit, setLimit] = useState(Math.min(eligible, 100));
  const [state, action, pending] = useActionState(qualifyAction.bind(null, campaignId), undefined);
  const n = Math.max(0, Math.min(limit || 0, eligible));

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="limit" className="text-sm font-medium text-slate-700">
          Leads a calificar <span className="font-normal text-slate-500">(de {eligible} disponibles)</span>
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="limit"
            name="limit"
            type="number"
            min={1}
            max={eligible}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-28"
          />
          <button
            type="button"
            className="text-xs font-medium text-brand-700 hover:underline"
            onClick={() => setLimit(eligible)}
          >
            Todos
          </button>
        </div>
      </div>
      <Button type="submit" disabled={pending || n < 1}>
        <Sparkles className="size-4" />
        {pending ? "Encolando…" : `Calificar ${n} con IA (≈ $${(n * QUALIFY_USD_PER_LEAD).toFixed(2)} USD)`}
      </Button>
      <p className="w-full text-xs text-slate-500">
        Se califican primero los negocios con más reseñas. Los de score menor a 40 se descartan; el resto queda con
        sus mensajes listos para revisar.
      </p>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
