import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Globe, Mail, MapPin, MessageCircle, Phone, Star } from "lucide-react";
import { getDb, getLead, getLeadCampaign, listEvents, listMessages } from "@growvibe/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { MessageEditor } from "./message-editor";

const EVENT_LABELS: Record<string, string> = {
  creado: "Lead creado",
  calificado: "Calificado por IA",
  descartado: "Descartado",
  mensaje_editado: "Mensaje editado",
  enviado: "Mensaje enviado",
  respuesta: "Respondió",
  asignado: "Asignado",
  baja: "Se dio de baja",
  error: "Error",
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const db = getDb();
  const lead = await getLead(db, id);
  if (!lead) notFound();
  const [campaign, messages, events] = await Promise.all([getLeadCampaign(db, id), listMessages(db, id), listEvents(db, id)]);

  return (
    <>
      {campaign && (
        <Link href={`/campaigns/${campaign.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
          <ArrowLeft className="size-4" /> {campaign.service} · {campaign.zone}
        </Link>
      )}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{lead.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{lead.niche}</p>
        </div>
        <div className="flex items-center gap-2">
          {lead.score != null && <Badge className="bg-brand-100 text-brand-700">Score {lead.score}</Badge>}
          <Badge className="capitalize">{lead.status.replace("_", " ")}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              {lead.scoreReason && <p className="rounded-md bg-slate-50 p-2 text-slate-600">{lead.scoreReason}</p>}
              <Row icon={MapPin}>{lead.address ?? "—"}</Row>
              <Row icon={Phone}>
                {lead.phoneE164 ?? "—"}
                {lead.hasWhatsapp && <Badge className="ml-2 bg-brand-50 text-brand-700"><MessageCircle className="mr-1 size-3" />WhatsApp</Badge>}
              </Row>
              <Row icon={Mail}>{lead.email ?? "—"}</Row>
              <Row icon={Globe}>
                {lead.website ? (
                  <a href={lead.website} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    {lead.website.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                ) : (
                  "—"
                )}
              </Row>
              <Row icon={Star}>
                {lead.rating ? `${Number(lead.rating).toFixed(1)} (${lead.reviewsCount ?? 0} reseñas)` : "Sin reseñas"}
              </Row>
              {lead.mapsUrl && (
                <a href={lead.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                  Ver en Google Maps <ExternalLink className="size-3.5" />
                </a>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-slate-500">Sin eventos.</p>
              ) : (
                <ol className="flex flex-col gap-3 border-l border-slate-200 pl-4 text-sm">
                  {events.map((e) => (
                    <li key={e.id}>
                      <p className="font-medium">{EVENT_LABELS[e.type] ?? e.type}</p>
                      {typeof (e.data as { reason?: string; message?: string } | null)?.reason === "string" && (
                        <p className="text-slate-500">{(e.data as { reason: string }).reason}</p>
                      )}
                      {typeof (e.data as { message?: string } | null)?.message === "string" && (
                        <p className="text-red-600">{(e.data as { message: string }).message}</p>
                      )}
                      <p className="text-xs text-slate-400">
                        {e.createdAt?.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" })}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Mensajes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {messages.length === 0 && (
              <p className="text-sm text-slate-500">
                {lead.status === "nuevo" ? "Aún no se califica: los mensajes se generan al calificar con IA." : "Sin mensajes."}
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{m.channel === "whatsapp" ? "WhatsApp" : "Email"}</span>
                  <Badge>{m.direction === "out" ? m.status.replace("_", " ") : "recibido"}</Badge>
                </div>
                <MessageEditor message={m} canEdit={me.role === "admin"} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
