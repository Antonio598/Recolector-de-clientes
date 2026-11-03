"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addOptOutAction } from "./channel-actions";

export function OptOutForm() {
  const [state, action, pending] = useActionState(addOptOutAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Input name="contact" placeholder="Teléfono o email" className="max-w-xs" required />
      <Button size="sm" variant="outline" disabled={pending}>
        Agregar baja
      </Button>
      {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
      {state?.ok && <span className="text-sm text-brand-700">Agregado</span>}
    </form>
  );
}
