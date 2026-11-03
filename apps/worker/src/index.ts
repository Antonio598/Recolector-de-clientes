import { Worker, type Job } from "bullmq";
import { QUEUES, redisConnection, type QueueName } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { enrichProcessor } from "./processors/enrich";
import { qualifyProcessor } from "./processors/qualify";
import { searchProcessor } from "./processors/search";

const env = serverEnv();
const connection = redisConnection(env.REDIS_URL);

const pending = async (job: Job) => {
  console.log(`[${job.queueName}] job ${job.id} recibido (sin procesador aún)`);
  return { skipped: true };
};

/** Procesador por cola. Las que faltan se implementan en las fases 3-5. */
const processors: Record<QueueName, (job: Job) => Promise<unknown>> = {
  search: searchProcessor,
  enrich: enrichProcessor,
  "ai-qualify": qualifyProcessor,
  "send-whatsapp": pending,
  "send-email": pending,
  "classify-reply": pending,
};

const workers = QUEUES.map((name) => {
  const w = new Worker(name, processors[name], { connection, concurrency: name === "search" || name === "enrich" ? 2 : 1 });
  w.on("completed", (job) => console.log(`[${name}] ${job.name} ${job.id} listo`));
  w.on("failed", (job, err) =>
    console.error(`[${name}] ${job?.name} ${job?.id} falló (intento ${job?.attemptsMade}):`, err.message),
  );
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
