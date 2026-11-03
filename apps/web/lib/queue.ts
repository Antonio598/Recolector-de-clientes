import "server-only";
import { Queue } from "bullmq";
import { defaultJobOptions, redisConnection, type QueueName } from "@growvibe/core";
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
export async function enqueueUnique(queue: QueueName, name: string, data: object, jobId: string) {
  const q = getQueue(queue);
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting" || state === "delayed" || state === "prioritized") return;
    await existing.remove();
  }
  await q.add(name, data, { jobId });
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
