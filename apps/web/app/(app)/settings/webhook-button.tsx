"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setWebhookAction } from "./channel-actions";

export function WebhookButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setWebhookAction();
            if (r.ok) toast.success("Webhook configurado: las respuestas llegarán a la Bandeja");
            setError(r.error ?? null);
          })
        }
      >
        {pending ? "Configurando…" : "Recibir respuestas en GrowVibe"}
      </Button>
      <p className="text-xs text-slate-500">Reemplaza el webhook actual de la instancia (por ejemplo, el de n8n).</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
