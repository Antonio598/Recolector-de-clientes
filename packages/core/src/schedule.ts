// Reglas del scheduler (sección 8). Funciones puras: se prueban sin base de datos.

export const SEND_TZ = "America/Mexico_City";
/** Tope duro anti-baneo: máximo N envíos por canal en cualquier ventana de M minutos. */
export const BURST_LIMIT = 10;
export const BURST_WINDOW_MIN = 10;
/** Calentamiento de WhatsApp: 10 el primer día, +5 por día hábil. */
export const WARMUP_START = 10;
export const WARMUP_STEP = 5;

export type SendChannel = "whatsapp" | "email";

/** Fecha/hora "de pared" en México: día de la semana (0=domingo), minutos desde medianoche y fecha YYYY-MM-DD. */
export function mexicoClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SEND_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday!);
  return {
    weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

const toMinutes = (t: string) => {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
};

/** ¿Estamos dentro de la ventana de envío (hora y día de México)? */
export function isInSendWindow(
  s: { sendWindowStart: string; sendWindowEnd: string; sendDays: number[] },
  now = new Date(),
): boolean {
  const c = mexicoClock(now);
  if (!s.sendDays.includes(c.weekday)) return false;
  return c.minutes >= toMinutes(s.sendWindowStart) && c.minutes < toMinutes(s.sendWindowEnd);
}

/** Días hábiles (lun-vie) transcurridos desde `from` hasta `to` (fechas YYYY-MM-DD), sin contar `from`. */
export function businessDaysBetween(from: string, to: string): number {
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  let n = 0;
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/** Límite diario efectivo de WhatsApp con calentamiento. `firstSendDate` = fecha MX del primer WhatsApp enviado. */
export function effectiveWhatsappLimit(
  configured: number,
  warmupEnabled: boolean,
  firstSendDate: string | null,
  today: string,
): number {
  if (!warmupEnabled) return configured;
  const days = firstSendDate ? businessDaysBetween(firstSendDate, today) : 0;
  return Math.min(configured, WARMUP_START + WARMUP_STEP * days);
}

/** Retraso aleatorio entre mensajes del mismo canal, en ms. */
export function randomDelayMs(minSeconds: number, maxSeconds: number): number {
  const lo = Math.max(0, Math.min(minSeconds, maxSeconds));
  const hi = Math.max(minSeconds, maxSeconds);
  return Math.round((lo + Math.random() * (hi - lo)) * 1000);
}

// ───────────── claves de Redis compartidas entre web y worker ─────────────
export const redisKeys = {
  /** Motivo de pausa automática/manual del canal (si existe, el canal no envía). */
  pause: (ch: SendChannel) => `gv:pause:${ch}`,
  /** Timestamp (ms) a partir del cual se puede enviar el siguiente mensaje del canal. */
  nextAt: (ch: SendChannel) => `gv:next:${ch}`,
};

export type SendJobData = { messageId: string };
