"use client";

import { useState, useTransition } from "react";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappQrAction } from "./channel-actions";

export function WhatsappQr() {
  const [res, setRes] = useState<{ qr?: string; state?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => setRes(await whatsappQrAction()))}>
        <QrCode className="size-4" /> {pending ? "Consultando…" : "Vincular / mostrar QR"}
      </Button>
      {res?.qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={res.qr} alt="QR de WhatsApp" className="size-56 self-center rounded-lg border" />
      )}
      {res?.qr && <p className="text-xs text-slate-500">Escanéalo en WhatsApp → Dispositivos vinculados. Caduca en ~40 s.</p>}
      {res?.state && <p className="text-sm text-brand-700">El número ya está conectado ({res.state}).</p>}
      {res?.error && <p className="text-sm text-red-600">{res.error}</p>}
    </div>
  );
}
