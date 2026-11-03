import { Queue } from "bullmq";
import { defaultJobOptions, redisConnection, type QueueName } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: redisConnection(serverEnv().REDIS_URL), defaultJobOptions });
    queues.set(name, q);
  }
  return q;
}

/** Encola con id fijo; si existe uno terminado/fallido lo reemplaza, si está en curso no hace nada. */
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

/** Ejecuta `fn` sobre `items` con máximo `limit` en paralelo. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function requireEnv<K extends "GOOGLE_MAPS_API_KEY" | "ANTHROPIC_API_KEY" | "EVOLUTION_API_KEY">(name: K) {
  const value = serverEnv()[name];
  if (!value) throw new Error(`Falta la variable ${name} en el worker`);
  return value;
}
