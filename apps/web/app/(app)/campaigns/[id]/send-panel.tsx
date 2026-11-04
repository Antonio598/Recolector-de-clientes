import { Pause, Play, Send } from "lucide-react";
import {
  BURST_LIMIT,
  BURST_WINDOW_MIN,
  describeNextWindow,
  effectiveWhatsappLimit,
  HEARTBEAT_STALE_MS,
  isInSendWindow,
  mexicoClock,
  type SendChannel,
} from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { campaignSendStats, channelCounters, getDb, getSettings, type Campaign } from "@growvibe/db";
import { AutoRefresh } from "@/components/auto-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { channelRuntime, schedulerHeartbeat } from "@/lib/queue";
import { launchAction, pauseAction } from "../actions";

const DAY = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const LABEL: Record<SendChannel, string> = { whatsapp: "WhatsApp", email: "Email" };

function configured(channel: SendChannel) {
  const env = serverEnv();
  return channel === "whatsapp"
    ? !!env.EVOLUTION_API_KEY
    : !!(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL && env.UNSUBSCRIBE_SECRET);
}

export async function SendPanel({ campaign }: { campaign: Campaign }) {
  const db = getDb();
  const [stats, settings] = await Promise.all([campaignSendStats(db, campaign.id), getSettings(db)]);
  if (!settings) return null;
  const channels = campaign.channels as SendChannel[];
  const queued = channels.reduce((n, ch) => n + (stats[ch].en_cola ?? 0), 0);
  const sent = channels.reduce((n, ch) => n + (stats[ch].enviado ?? 0) + (stats[ch].entregado ?? 0) + (stats[ch].leido ?? 0), 0);
  if (queued === 0 && sent === 0 && campaign.status !== "enviando") return null;

  const sending = campaign.status === "enviando";
  const inWindow = isInSendWindow(settings);
  const today = mexicoClock().date;
  const beat = await schedulerHeartbeat();
  const workerAlive = !!beat && Date.now() - beat.at < HEARTBEAT_STALE_MS;

  const rows = await Promise.all(
    channels.map(async (ch) => {
      const [c, rt] = await Promise.all([channelCounters(db, ch, BURST_WINDOW_MIN), channelRuntime(ch)]);
      const limit =
        ch === "whatsapp"
          ? effectiveWhatsappLimit(settings.whatsappDailyLimit, settings.warmupEnabled, c.firstSentDate, today)
          : settings.emailDailyLimit;
      let state: string;
      if (!configured(ch)) state = ch === "email" ? "Brevo no configurado" : "Evolution no configurado";
      else if (rt.pausedReason) state = `Pausado: ${rt.pausedReason}`;
      else if (!inWindow) state = `Fuera de horario: empieza ${describeNextWindow(settings)}`;
      else if (c.today >= limit) state = "Límite de hoy alcanzado";
      else if (c.burst >= BURST_LIMIT) state = `Tope de ${BURST_LIMIT} cada ${BURST_WINDOW_MIN} min, esperando`;
      else if (rt.nextAt && rt.nextAt > Date.now()) state = `Siguiente en ~${Math.ceil((rt.nextAt - Date.now()) / 1000)} s`;
      else state = "Listo para enviar";
      return { ch, c, limit, state, s: stats[ch] };
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4" /> Envíos
        </CardTitle>
        <CardDescription>
          Máximo {BURST_LIMIT} por canal cada {BURST_WINDOW_MIN} min, con {settings.minDelaySeconds}–
          {settings.maxDelaySeconds} s aleatorios entre mensajes · {settings.sendWindowStart.slice(0, 5)}–
          {settings.sendWindowEnd.slice(0, 5)} ({settings.sendDays.map((d) => DAY[d]).join(", ")}). Sigue enviando
          aunque cierres la app.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sending && !workerAlive && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <strong>El worker no está enviando.</strong>{" "}
            {beat
              ? `Su último latido fue hace ${Math.round((Date.now() - beat.at) / 60_000)} min.`
              : "No hay señal de esta versión del worker."}{" "}
            Revisa en Easypanel que la app con <code>APP=worker</code> esté desplegada con la última versión y corriendo.
          </p>
        )}
        {sending && !inWindow && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Ahora estás fuera del horario de envío. Los mensajes saldrán solos {describeNextWindow(settings)} (hora de
            México).
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map(({ ch, c, limit, state, s }) => (
            <div key={ch} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">{LABEL[ch]}</span>
                <span className="tabular-nums text-slate-500">
                  Hoy {c.today}/{limit}
                  {ch === "whatsapp" && settings.warmupEnabled && limit < settings.whatsappDailyLimit && " (calentamiento)"}
                </span>
              </div>
              <p className="text-slate-600">
                {s.en_cola ?? 0} en cola · {(s.enviado ?? 0) + (s.entregado ?? 0) + (s.leido ?? 0)} enviados
                {s.fallido ? ` · ${s.fallido} fallidos` : ""}
                {s.cancelado ? ` · ${s.cancelado} cancelados` : ""}
              </p>
              {sending && <p className="mt-1 text-xs text-slate-500">{state}</p>}
              {sending && workerAlive && beat && <p className="mt-0.5 text-xs text-slate-400">Worker: {beat[ch]}</p>}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {sending ? (
            <form action={pauseAction.bind(null, campaign.id)}>
              <Button variant="outline">
                <Pause className="size-4" /> Pausar envíos
              </Button>
            </form>
          ) : (
            queued > 0 && (
              <form action={launchAction.bind(null, campaign.id)}>
                <Button>
                  <Play className="size-4" />
                  {campaign.status === "pausada" ? "Reanudar envíos" : `Enviar a calificados (${queued} mensajes)`}
                </Button>
              </form>
            )
          )}
          <p className="text-xs text-slate-500">
            Solo se envía a leads calificados. Los que califiques después entran solos a la cola mientras la campaña
            esté enviando.
          </p>
        </div>
        {sending && <AutoRefresh ms={10_000} />}
      </CardContent>
    </Card>
  );
}
