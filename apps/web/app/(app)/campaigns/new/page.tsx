"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createCampaignAction } from "../actions";

export default function NewCampaignPage() {
  const [state, action, pending] = useActionState(createCampaignAction, undefined);

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nueva campaña</CardTitle>
          <CardDescription>
            Claude te propondrá los giros de negocio que necesitan tu servicio; los revisas antes de buscar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="zone">Zona</Label>
              <Input id="zone" name="zone" placeholder="Ej.: Boca del Río, Veracruz" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="service">Servicio que vendo</Label>
              <Input id="service" name="service" placeholder="Ej.: chatbots de WhatsApp" required />
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-slate-700">Canales de contacto</legend>
              <div className="flex gap-2">
                {[
                  ["whatsapp", "WhatsApp"],
                  ["email", "Email"],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm has-checked:border-brand-600 has-checked:bg-brand-50"
                  >
                    <input type="checkbox" name="channels" value={value} defaultChecked className="accent-brand-600" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Proponer giros con IA"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
