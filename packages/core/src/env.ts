import { z } from "zod";

/**
 * Variables de servidor (web + worker). Las integraciones que llegan en fases
 * posteriores son opcionales por ahora; se vuelven obligatorias en su fase.
 */
export const serverEnvSchema = z.object({
  // Postgres directo (esquema "growvibe"), igual que la otra app del servidor.
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),

  // Fase 2
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL_GENERATE: z.string().default("claude-sonnet-5-5"),
  CLAUDE_MODEL_CLASSIFY: z.string().default("claude-haiku-5-5"),

  // Fase 3-5
  EVOLUTION_API_URL: z.string().url().default("http://evolution-api:8080"),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE: z.string().default("growvibe"),
  EVOLUTION_WEBHOOK_SECRET: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email().optional().or(z.literal("")),
  BREVO_SENDER_NAME: z.string().default("GrowVibe"),
  BREVO_WEBHOOK_SECRET: z.string().optional(),

  APP_URL: z.string().url().default("http://localhost:3000"),
  UNSUBSCRIBE_SECRET: z.string().optional(),
  TZ: z.string().default("America/Mexico_City"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Valida y devuelve el entorno de servidor. Lanza un error claro si falta algo. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
