import { z } from "zod";

const URL_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|mx|net|org|io)\b/i;
const words = (html: string) => html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
/** Únicas etiquetas permitidas en el email, sin atributos. */
const ALLOWED_TAG = /^<\/?(p|strong|em|ul|li)>$|^<br\s*\/?>$/i;

/** Deja solo etiquetas permitidas y sin atributos (para mostrar HTML de forma segura). */
export function sanitizeEmailHtml(html: string): string {
  return html.replace(/<[^>]*>/g, (tag) => {
    const m = /^<(\/?)(p|strong|em|ul|li|br)\b/i.exec(tag);
    return m ? `<${m[1]}${m[2]!.toLowerCase()}>` : "";
  });
}

/** Reglas fijas del primer WhatsApp (sección 6 del plan técnico). */
export const whatsappMessageSchema = z
  .string()
  .trim()
  .min(40, "Mensaje de WhatsApp demasiado corto")
  .max(450, "El WhatsApp debe tener máximo 450 caracteres")
  .refine((s) => !URL_RE.test(s), "El primer WhatsApp no puede llevar links")
  .refine((s) => /\bBAJA\b/.test(s), 'Debe incluir la línea "Si no le interesa, responda BAJA"');

export const emailSubjectSchema = z
  .string()
  .trim()
  .min(5, "Asunto demasiado corto")
  .max(59, "El asunto debe tener menos de 60 caracteres");

export const emailBodySchema = z
  .string()
  .trim()
  .min(40, "Cuerpo del email demasiado corto")
  .refine((s) => words(s) < 120, "El email debe tener menos de 120 palabras")
  .refine((s) => !/<img\b/i.test(s), "El email no puede llevar imágenes")
  .refine(
    (s) => (s.match(/<[^>]*>/g) ?? []).every((tag) => ALLOWED_TAG.test(tag)),
    "Solo HTML simple sin atributos: <p>, <br>, <strong>, <em>, <ul>, <li>",
  );

export const qualifyResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  score_reason: z.string().trim().min(5).max(400),
  whatsapp_message: whatsappMessageSchema,
  email_subject: emailSubjectSchema,
  email_body_html: emailBodySchema,
});
export type QualifyResult = z.infer<typeof qualifyResultSchema>;

/** Leads con score menor se descartan. */
export const MIN_SCORE = 40;
