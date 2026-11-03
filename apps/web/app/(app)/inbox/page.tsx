import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { getDb, getLead, listInbox } from "@growvibe/db";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { ReplyBox } from "@/components/reply-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { takeLeadAction } from "./actions";

const CATEGORY: Record<string, { label: string; className: string }> = {
  interesado: { label: "Interesado", className: "bg-brand-100 text-brand-700" },
  pregunta: { label: "Pregunta", className: "bg-sky-100 text-sky-800" },
  no_interesado: { label: "No interesado", className: "bg-slate-100 text-slate-600" },
  baja: { label: "Baja", className: "bg-red-100 text-red-700" },
  otro: { label: "Otro", className: "bg-slate-100 text-slate-600" },
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const me = await requireUser();
  const { ver } = await searchParams;
  const mine = ver === "mios";
  const db = getDb();
  const items = await listInbox(db, mine ? { assignedTo: me.id } : {});
  const leads = new Map(
    (await Promise.all(items.map((i) => getLead(db, i.leadId)))).filter(Boolean).map((l) => [l!.id, l!]),
  );

  return (
    <>
      <PageHeader title="Bandeja" description="Respuestas de WhatsApp y email, más recientes primero. Se actualiza sola." />
      <div className="mb-4 flex gap-2">
        {[
          ["todos", "Todas", !mine],
          ["mios", "Mis leads", mine],
        ].map(([v, label, active]) => (
          <Link
            key={v as string}
            href={v === "todos" ? "/inbox" : "/inbox?ver=mios"}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600 hover:bg-slate-100",
            )}
          >
            {label as string}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            Aún no hay respuestas{mine ? " de tus leads" : ""}.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((i) => {
            const lead = leads.get(i.leadId);
            const cat = i.classification ? CATEGORY[i.classification] : null;
            const canReply = me.role === "admin" || i.assignedTo === me.id;
            const channels = [
              ...(lead?.hasWhatsapp ? (["whatsapp"] as const) : []),
              ...(lead?.email ? (["email"] as const) : []),
            ];
            return (
              <Card key={i.messageId}>
                <CardContent className="flex flex-col gap-3 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {i.channel === "whatsapp" ? (
                        <MessageCircle className="size-4 text-brand-600" />
                      ) : (
                        <Mail className="size-4 text-sky-600" />
                      )}
                      <Link href={`/leads/${i.leadId}`} className="font-medium text-brand-700 hover:underline">
                        {i.leadName}
                      </Link>
                      {cat ? <Badge className={cat.className}>{cat.label}</Badge> : <Badge>Clasificando…</Badge>}
                    </div>
                    <span className="text-xs text-slate-500">
                      {i.receivedAt?.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City" })}
                      {" · "}
                      {i.assignedName ? `Asignado a ${i.assignedName}` : "Sin asignar"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{i.body}</p>
                  {i.summary && <p className="text-xs text-slate-500">Resumen IA: {i.summary}</p>}
                  {i.classification !== "baja" && lead?.status !== "baja" && (
                    canReply ? (
                      <ReplyBox leadId={i.leadId} defaultChannel={i.channel} channels={[...channels]} suggested={i.suggestedReply} />
                    ) : (
                      !i.assignedTo && (
                        <form action={takeLeadAction.bind(null, i.leadId)}>
                          <Button size="sm" variant="outline">
                            Tomar lead
                          </Button>
                        </form>
                      )
                    )
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <AutoRefresh ms={5000} />
    </>
  );
}
