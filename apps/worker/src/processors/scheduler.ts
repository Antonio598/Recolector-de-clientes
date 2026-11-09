import {
  BURST_LIMIT,
  BURST_WINDOW_MIN,
  effectiveWhatsappLimit,
  isInSendWindow,
  mexicoClock,
  randomDelayMs,
  redisKeys,
  shouldPauseForFailures,
  type SchedulerHeartbeat,
  type SendChannel,
} from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { connectionState } from "@growvibe/core/server";
import { channelCounters, getDb, getSettings, markMessageScheduled, nextQueuedMessage, type Settings } from "@growvibe/db";
import { getQueue } from "../lib";

async function redis() {
  return getQueue("scheduler").client;
}

export async function pauseChannel(channel: SendChannel, reason: string) {
  const r = await redis();
  const already = await r.get(redisKeys.pause(channel));
  if (!already) {
    await r.set(redisKeys.pause(channel), `${reason} (${new Date().toISOString()})`);
    console.warn(`[scheduler] canal ${channel} PAUSADO: ${reason}`);
  }
}

function channelConfigured(channel: SendChannel) {
  const env = serverEnv();
  if (channel === "whatsapp") return !!env.EVOLUTION_API_KEY;
  return !!(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL && env.UNSUBSCRIBE_SECRET);
}

/** Decide si toca enviar un mensaje del canal y, si sí, lo encola. Máximo uno por tick y canal. */
async function tickChannel(channel: SendChannel, settings: Settings): Promise<string> {
  const r = await redis();
  if (!channelConfigured(channel)) return "sin configurar";
  if (await r.get(redisKeys.pause(channel))) return "pausado";
  if (!isInSendWindow(settings)) return "fuera de horario";
  if (Date.now() < Number((await r.get(redisKeys.nextAt(channel))) ?? 0)) return "esperando retraso";

  const db = getDb();
  const c = await channelCounters(db, channel, BURST_WINDOW_MIN);

  if (shouldPauseForFailures(c.sentLastHour, c.failedLastHour)) {
    const attempts = c.sentLastHour + c.failedLastHour;
    await pauseChannel(channel, `Más de 10 % de envíos fallidos en la última hora (${c.failedLastHour}/${attempts})`);
    return "pausado por fallos";
  }

  const limit =
    channel === "whatsapp"
      ? effectiveWhatsappLimit(settings.whatsappDailyLimit, settings.warmupEnabled, c.firstSentDate, mexicoClock().date)
      : settings.emailDailyLimit;
  if (c.today >= limit) return `límite diario (${c.today}/${limit})`;
  if (c.burst >= BURST_LIMIT) return `tope de ${BURST_LIMIT} cada ${BURST_WINDOW_MIN} min`;

  const next = await nextQueuedMessage(db, channel);
  if (!next) return "sin mensajes";

  if (channel === "whatsapp") {
    const env = serverEnv();
    const state = await connectionState({
      url: env.EVOLUTION_API_URL,
      apiKey: env.EVOLUTION_API_KEY!,
      instance: env.EVOLUTION_INSTANCE,
    }).catch((e: Error) => `error: ${e.message}`);
    if (state !== "open") {
      await pauseChannel("whatsapp", `WhatsApp desconectado en Evolution (${state})`);
      return "pausado: WhatsApp desconectado";
    }
  }

  await markMessageScheduled(db, next.messageId);
  await getQueue(channel === "whatsapp" ? "send-whatsapp" : "send-email").add(
    "send",
    { messageId: next.messageId },
    // Un solo intento: reintentar podría duplicar un mensaje que sí salió pero cuya respuesta se perdió.
    { jobId: `send-${next.messageId}-${Date.now()}`, attempts: 1 },
  );
  await r.set(redisKeys.nextAt(channel), String(Date.now() + randomDelayMs(settings.minDelaySeconds, settings.maxDelaySeconds)));
  return `encolado ${next.messageId}`;
}

let lastLog = "";

/** Corre cada 20 s (job scheduler de BullMQ): sobrevive a reinicios y no depende de que alguien tenga la app abierta. */
export async function schedulerProcessor() {
  const r = await redis();
  const beat = (whatsapp: string, email: string) =>
    r.set(redisKeys.heartbeat, JSON.stringify({ at: Date.now(), whatsapp, email } satisfies SchedulerHeartbeat));

  let result: { whatsapp: string; email: string };
  try {
    const settings = await getSettings(getDb());
    if (!settings) {
      await beat("sin ajustes", "sin ajustes");
      return { skipped: "sin ajustes" };
    }
    result = {
      whatsapp: await tickChannel("whatsapp", settings),
      email: await tickChannel("email", settings),
    };
  } catch (e) {
    // Drizzle envuelve el error de Postgres: la causa (conexión cortada, timeout…) es lo útil.
    const cause = e instanceof Error && e.cause instanceof Error ? ` → ${e.cause.message}` : "";
    const message = `error: ${e instanceof Error ? e.message.split("\n")[0]!.slice(0, 120) : String(e)}${cause}`;
    await beat(message, message);
    throw e;
  }
  await beat(result.whatsapp, result.email);
  const log = JSON.stringify(result);
  if (log !== lastLog || log.includes("encolado")) console.log(`[scheduler] ${log}`);
  lastLog = log;
  return result;
}
