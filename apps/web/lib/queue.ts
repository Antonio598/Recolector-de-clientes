import "server-only";
import { Queue, type JobsOptions } from "bullmq";
import {
  defaultJobOptions,
  redisConnection,
  redisKeys,
  type QueueName,
  type SchedulerHeartbeat,
  type SendChannel,
} from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";

// La web nunca llama a Places/Claude/Evolution/Brevo: solo encola y lee el estado de los jobs.
const g = globalThis as unknown as { __growvibeQueues?: Map<QueueName, Queue> };

export function getQueue(name: QueueName): Queue {
  g.__growvibeQueues ??= new Map();
  let q = g.__growvibeQueues.get(name);
  if (!q) {
    q = new Queue(name, { connection: redisConnection(serverEnv().REDIS_URL), defaultJobOptions });
    g.__growvibeQueues.set(name, q);
  }
  return q;
}

/** Encola un job con id fijo. Si ya hay uno en curso no hace nada; si terminó o falló, lo reemplaza. */
export async function enqueueUnique(
  queue: QueueName,
  name: string,
  data: object,
  jobId: string,
  opts: JobsOptions = {},
) {
  const q = getQueue(queue);
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting" || state === "delayed" || state === "prioritized") return;
    await existing.remove();
  }
  await q.add(name, data, { ...opts, jobId });
}

export type JobInfo = {
  state: string;
  progress: unknown;
  failedReason?: string;
  attemptsMade: number;
  maxAttempts: number;
};

export async function getJobInfo(queue: QueueName, jobId: string): Promise<JobInfo | null> {
  try {
    const job = await getQueue(queue).getJob(jobId);
    if (!job) return null;
    return {
      state: await job.getState(),
      progress: job.progress,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
    };
  } catch (e) {
    console.error("[queue] no se pudo leer el job:", e);
    return { state: "redis-error", progress: null, attemptsMade: 0, maxAttempts: 0, failedReason: "No hay conexión con Redis" };
  }
}

// ───────────── estado de los canales de envío (Redis, compartido con el worker) ─────────────
export async function channelRuntime(channel: SendChannel): Promise<{ pausedReason: string | null; nextAt: number | null }> {
  try {
    const r = await getQueue("scheduler").client;
    const [paused, next] = await Promise.all([r.get(redisKeys.pause(channel)), r.get(redisKeys.nextAt(channel))]);
    return { pausedReason: paused, nextAt: next ? Number(next) : null };
  } catch {
    return { pausedReason: "Sin conexión con Redis", nextAt: null };
  }
}

/** Último latido del scheduler del worker, o null si nunca ha corrido esta versión. */
export async function schedulerHeartbeat(): Promise<SchedulerHeartbeat | null> {
  try {
    const r = await getQueue("scheduler").client;
    const raw = await r.get(redisKeys.heartbeat);
    return raw ? (JSON.parse(raw) as SchedulerHeartbeat) : null;
  } catch {
    return null;
  }
}

export async function resumeChannel(channel: SendChannel) {
  const r = await getQueue("scheduler").client;
  await r.del(redisKeys.pause(channel));
}

export async function pauseChannel(channel: SendChannel, reason: string) {
  const r = await getQueue("scheduler").client;
  if (!(await r.get(redisKeys.pause(channel)))) {
    await r.set(redisKeys.pause(channel), `${reason} (${new Date().toISOString()})`);
  }
}
