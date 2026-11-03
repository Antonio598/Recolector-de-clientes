"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { sendReplyAction } from "@/app/(app)/inbox/actions";

export function ReplyBox({
  leadId,
  defaultChannel,
  channels,
  suggested,
}: {
  leadId: string;
  defaultChannel: "whatsapp" | "email";
  channels: ("whatsapp" | "email")[];
  suggested?: string | null;
}) {
  const [state, action, pending] = useActionState(sendReplyAction.bind(null, leadId), undefined);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Respuesta enviada a la cola");
      form.current?.reset();
    } else if (state?.error) toast.error(state.error);
  }, [state]);

  if (channels.length === 0) return null;
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <Textarea name="body" rows={3} defaultValue={suggested ?? ""} placeholder="Escribe la respuesta…" />
      <div className="flex items-center justify-end gap-2">
        {channels.length > 1 ? (
          <Select name="channel" defaultValue={defaultChannel} aria-label="Canal">
            {channels.map((c) => (
              <option key={c} value={c}>
                {c === "whatsapp" ? "WhatsApp" : "Email"}
              </option>
            ))}
          </Select>
        ) : (
          <input type="hidden" name="channel" value={channels[0]} />
        )}
        <Button size="sm" disabled={pending}>
          <Send className="size-4" /> {pending ? "Enviando…" : "Responder"}
        </Button>
      </div>
    </form>
  );
}
