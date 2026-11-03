export const QUEUES = [
  "search",
  "enrich",
  "ai-qualify",
  "send-whatsapp",
  "send-email",
  "classify-reply",
  "scheduler",
] as const;

export type QueueName = (typeof QUEUES)[number];

/** Todo job: idempotente, 3 intentos con backoff exponencial. */
export const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
} as const;

/** Parsea REDIS_URL a opciones de conexión para BullMQ/ioredis. */
export function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
