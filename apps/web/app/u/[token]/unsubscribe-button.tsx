"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { confirmUnsubscribe } from "./actions";

// La baja requiere un clic (no se registra solo con abrir el enlace: los escáneres de correo lo abren).
export function UnsubscribeButton({ token }: { token: string }) {
  const [done, setDone] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  if (done) return <p className="font-medium text-brand-700">Listo. No volverá a recibir mensajes nuestros.</p>;
  return (
    <>
      <Button onClick={() => start(async () => setDone((await confirmUnsubscribe(token)).ok))} disabled={pending}>
        {pending ? "Procesando…" : "Sí, darme de baja"}
      </Button>
      {done === false && <p className="text-red-700">No se pudo procesar la baja. Intente de nuevo.</p>}
    </>
  );
}
