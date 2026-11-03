"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { sanitizeEmailHtml } from "@growvibe/core";
import type { Message } from "@growvibe/db";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { saveMessageAction } from "./actions";

const words = (html: string) => html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;

export function MessageEditor({ message, canEdit }: { message: Message; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveMessageAction.bind(null, message.id), undefined);
  const [body, setBody] = useState(message.body);
  const [subject, setSubject] = useState(message.subject ?? "");
  const editable = canEdit && message.status === "en_cola";
  const isWa = message.channel === "whatsapp";

  useEffect(() => {
    if (state?.ok) toast.success("Mensaje guardado");
    else if (state?.error) toast.error(state.error);
  }, [state]);

  const counter = isWa
    ? `${body.length}/450 caracteres`
    : `${words(body)}/119 palabras · asunto ${subject.length}/59`;
  const over = isWa ? body.length > 450 : words(body) >= 120 || subject.length >= 60;

  return (
    <form action={action} className="flex flex-col gap-2">
      {!isWa && (
        <Input
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          readOnly={!editable}
          aria-label="Asunto"
          className="font-medium"
        />
      )}
      <Textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        readOnly={!editable}
        rows={isWa ? 6 : 8}
        className={isWa ? "" : "font-mono text-xs"}
        aria-label="Mensaje"
      />
      {!isWa && (
        <div
          className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm [&_p]:mb-2"
          // Vista previa: solo etiquetas simples sin atributos.
          dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(body) }}
        />
      )}
      <div className="flex items-center justify-between">
        <span className={`text-xs ${over ? "text-red-600" : "text-slate-500"}`}>{counter}</span>
        {editable && (
          <Button size="sm" type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        )}
      </div>
    </form>
  );
}
