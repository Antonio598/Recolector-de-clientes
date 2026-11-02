"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { Settings } from "@growvibe/db";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSettings } from "./actions";

const DAYS = [
  [1, "Lun"],
  [2, "Mar"],
  [3, "Mié"],
  [4, "Jue"],
  [5, "Vie"],
  [6, "Sáb"],
  [0, "Dom"],
] as const;

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function SettingsForm({ settings: s }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveSettings, undefined);

  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <Field label="Límite diario de WhatsApp">
        <Input name="whatsapp_daily_limit" type="number" min={0} defaultValue={s.whatsappDailyLimit} required />
      </Field>
      <Field label="Límite diario de email">
        <Input name="email_daily_limit" type="number" min={0} defaultValue={s.emailDailyLimit} required />
      </Field>
      <Field label="Inicio de ventana">
        <Input name="send_window_start" type="time" defaultValue={s.sendWindowStart.slice(0, 5)} required />
      </Field>
      <Field label="Fin de ventana">
        <Input name="send_window_end" type="time" defaultValue={s.sendWindowEnd.slice(0, 5)} required />
      </Field>
      <Field label="Retraso mínimo entre mensajes (s)">
        <Input name="min_delay_seconds" type="number" min={0} defaultValue={s.minDelaySeconds} required />
      </Field>
      <Field label="Retraso máximo entre mensajes (s)">
        <Input name="max_delay_seconds" type="number" min={0} defaultValue={s.maxDelaySeconds} required />
      </Field>

      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium text-slate-700">Días de envío</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm has-checked:border-brand-600 has-checked:bg-brand-50"
            >
              <input
                type="checkbox"
                name="send_days"
                value={value}
                defaultChecked={s.sendDays.includes(value)}
                className="accent-brand-600"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="warmup_enabled" defaultChecked={s.warmupEnabled} className="mt-0.5 accent-brand-600" />
        <span>
          <span className="font-medium">Calentamiento de WhatsApp</span>
          <span className="block text-slate-500">10 mensajes el día 1 y +5 por día hábil hasta el límite.</span>
        </span>
      </label>

      <div className="sm:col-span-2">
        <Field label="Firma del remitente">
          <Textarea name="sender_signature" rows={3} defaultValue={s.senderSignature ?? ""} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="URL del aviso de privacidad (LFPDPPP)" hint="Se incluye en los emails y en la página de baja.">
          <Input name="privacy_url" type="url" placeholder="https://…" defaultValue={s.privacyUrl ?? ""} />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar ajustes"}
        </Button>
      </div>
    </form>
  );
}
