import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Formato HH:MM");

export const settingsSchema = z
  .object({
    whatsapp_daily_limit: z.coerce.number().int().min(0).max(1000),
    email_daily_limit: z.coerce.number().int().min(0).max(10000),
    send_window_start: time,
    send_window_end: time,
    send_days: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Elige al menos un día"),
    min_delay_seconds: z.coerce.number().int().min(0),
    max_delay_seconds: z.coerce.number().int().min(0),
    warmup_enabled: z.boolean(),
    sender_signature: z.string().max(2000).nullable(),
    privacy_url: z.string().url("URL inválida").nullable().or(z.literal("").transform(() => null)),
  })
  .refine((s) => s.max_delay_seconds >= s.min_delay_seconds, {
    message: "El retraso máximo debe ser mayor o igual al mínimo",
    path: ["max_delay_seconds"],
  })
  .refine((s) => s.send_window_end.slice(0, 5) > s.send_window_start.slice(0, 5), {
    message: "La hora de fin debe ser posterior a la de inicio",
    path: ["send_window_end"],
  });

export type SettingsInput = z.infer<typeof settingsSchema>;

export const roleSchema = z.enum(["admin", "vendedor"]);
export type Role = z.infer<typeof roleSchema>;
