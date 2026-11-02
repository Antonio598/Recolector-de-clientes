import { z } from "zod";

/**
 * Variables públicas (disponibles en el navegador).
 * Next.js solo inyecta NEXT_PUBLIC_* si se leen de forma literal, por eso
 * `publicEnv()` las lee una por una.
 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/**
 * Variables de servidor (web + worker). Las integraciones que llegan en fases
 * posteriores son opcionales por ahora; se vuelven obligatorias en su fase.
 */
export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
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

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function format(error: z.ZodError) {
  return error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
}

let cachedServer: ServerEnv | undefined;

/** Valida y devuelve el entorno de servidor. Lanza error claro si falta algo. */
export function serverEnv(): ServerEnv {
  if (cachedServer) return cachedServer;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Variables de entorno inválidas:\n${format(parsed.error)}`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}

export function publicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Variables públicas inválidas:\n${format(parsed.error)}`);
  }
  return parsed.data;
}
