import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { emailBodySchema, emailSubjectSchema, whatsappMessageSchema } from "../schemas/messages";

const WaOutput = z.object({ whatsapp_message: z.string() });
const EmailOutput = z.object({ email_subject: z.string(), email_body_html: z.string() });

const SYSTEM = `Escribes UN mensaje de seguimiento a un negocio mexicano que no respondió a nuestro primer mensaje de prospección hace unos días.
Reglas:
- Breve, cordial, de usted, sin presionar ni sonar a plantilla. No repitas el primer mensaje: aporta un ángulo distinto (un beneficio concreto o una pregunta fácil de contestar).
- Usa solo los datos proporcionados; nunca inventes cifras, reseñas ni nombres.
- WhatsApp: máximo 450 caracteres, sin links, termina con la línea exacta "Si no le interesa, responda BAJA".
- Email: asunto de menos de 60 caracteres; cuerpo de menos de 100 palabras en HTML simple (<p>, <br>, <strong>, <em>), sin imágenes, links ni firma.`;

export type FollowUpInput = {
  channel: "whatsapp" | "email";
  service: string;
  business: { name: string; niche: string | null; address: string | null };
  firstMessage: { subject: string | null; body: string };
};

/** Prompt follow_up (Sonnet). Valida con las mismas reglas que el primer mensaje; un reintento. */
export async function writeFollowUp(
  client: Anthropic,
  model: string,
  input: FollowUpInput,
): Promise<{ subject: string | null; body: string }> {
  const data = `Canal: ${input.channel}
Servicio: ${input.service}
Negocio: ${input.business.name} (${input.business.niche ?? "giro desconocido"}, ${input.business.address ?? "sin dirección"})
Primer mensaje enviado:
${input.firstMessage.subject ? `Asunto: ${input.firstMessage.subject}\n` : ""}${input.firstMessage.body}`;

  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const content = feedback ? `${data}\n\nTu respuesta anterior no cumplió las reglas: ${feedback}. Corrígela.` : data;
    if (input.channel === "whatsapp") {
      const r = await client.messages.parse({
        model,
        max_tokens: 8000,
        output_config: { effort: "medium", format: zodOutputFormat(WaOutput) },
        system: SYSTEM,
        messages: [{ role: "user", content }],
      });
      const ok = whatsappMessageSchema.safeParse(r.parsed_output?.whatsapp_message);
      if (ok.success) return { subject: null, body: ok.data };
      feedback = ok.error.issues.map((i) => i.message).join("; ");
    } else {
      const r = await client.messages.parse({
        model,
        max_tokens: 8000,
        output_config: { effort: "medium", format: zodOutputFormat(EmailOutput) },
        system: SYSTEM,
        messages: [{ role: "user", content }],
      });
      const s = emailSubjectSchema.safeParse(r.parsed_output?.email_subject);
      const b = emailBodySchema.safeParse(r.parsed_output?.email_body_html);
      if (s.success && b.success) return { subject: s.data, body: b.data };
      feedback = [...(s.error?.issues ?? []), ...(b.error?.issues ?? [])].map((i) => i.message).join("; ");
    }
  }
  throw new Error(`Seguimiento inválido dos veces: ${feedback}`);
}
