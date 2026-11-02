import { Worker, type Job } from "bullmq";
import { QUEUES, redisConnection, type QueueName } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";

const env = serverEnv();
const connection = redisConnection(env.REDIS_URL);

/** Procesadores por cola. En Fase 1 solo registran el job; se implementan en las fases 2-5. */
const processors: Record<QueueName, (job: Job) => Promise<unknown>> = Object.fromEntries(
  QUEUES.map((name) => [
    name,
    async (job: Job) => {
      console.log(`[${name}] job ${job.id} recibido (sin procesador aún)`, job.data);
      return { skipped: true };
    },
  ]),
) as Record<QueueName, (job: Job) => Promise<unknown>>;

const workers = QUEUES.map((name) => {
  const w = new Worker(name, processors[name], { connection, concurrency: 1 });
  w.on("failed", (job, err) => console.error(`[${name}] job ${job?.id} falló:`, err.message));
  w.on("error", (err) => console.error(`[${name}] error:`, err.message));
  return w;
});

await Promise.all(workers.map((w) => w.waitUntilReady()));
console.log(`[worker] conectado a Redis (${connection.host}:${connection.port}); colas: ${QUEUES.join(", ")}`);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} recibido, cerrando...`);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
