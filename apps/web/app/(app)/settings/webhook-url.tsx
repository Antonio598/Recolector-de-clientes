"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** URL del webhook para pegarla a mano en el manager de Evolution API. */
export function WebhookUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-600">URL del webhook (para Evolution API)</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all text-xs">{url}</code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copiada" : "Copiar"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        En el manager de Evolution: instancia → <strong>Webhook</strong> → activa, pega la URL, deja "Webhook by events" y
        "Base64" apagados, y marca los eventos <strong>MESSAGES_UPSERT</strong>, <strong>MESSAGES_UPDATE</strong> y{" "}
        <strong>CONNECTION_UPDATE</strong>. O usa el botón de arriba para que GrowVibe lo configure solo.
      </p>
      <p className="text-xs text-amber-700">Es privada: quien la tenga puede inyectar mensajes falsos. No la compartas.</p>
    </div>
  );
}
