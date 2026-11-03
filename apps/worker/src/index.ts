import { Worker, type Job } from "bullmq";
import { QUEUES, redisConnection, type QueueName } from "@growvibe/core";
import { serverEnv } from "@growvibe/core/env";
import { enrichProcessor } from "./processors/enrich";
import { qualifyProcessor } from "./processors/qualify";
import { schedulerProcessor } from "./processors/scheduler";
import { searchProcessor } from "./processors/search";
import { sendEmailProcessor, sendWhatsappProcessor } from "./processors/send";
import { getQueue } from "./lib";

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
  "send-whatsapp": sendWhatsappProcessor,
  "send-email": sendEmailProcessor,
  "classify-reply": pending,
  scheduler: schedulerProcessor,
};

const workers = QUEUES.map((name) => {
  const w = new Worker(name, processors[name], { connection, concurrency: name === "search" || name === "enrich" ? 2 : 1 });
  if (name !== "scheduler") w.on("completed", (job) => console.log(`[${name}] ${job.name} ${job.id} listo`));
  w.on("failed", (job, err) =>
    console.error(`[${name}] ${job?.name} ${job?.id} falló (intento ${job?.attemptsMade}):`, err.message),
  );
  w.on("error", (err) => console.error(`[${name}] error:`, err.message));
  return w;
});

await Promise.all(workers.map((w) => w.waitUntilReady()));

// Scheduler de envíos: un tick cada 20 s, guardado en Redis (sigue aunque nadie tenga la app abierta).
await getQueue("scheduler").upsertJobScheduler(
  "send-tick",
  { every: 20_000 },
  { name: "tick", data: {}, opts: { attempts: 1, removeOnComplete: true, removeOnFail: 50 } },
);
console.log(`[worker] conectado a Redis (${connection.host}:${connection.port}); colas: ${QUEUES.join(", ")}`);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} recibido, cerrando...`);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
