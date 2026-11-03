import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { qualifyResultSchema, type QualifyResult } from "../schemas/messages";

const Output = z.object({
  score: z.number().describe("0 a 100: qué tan buen prospecto es para el servicio"),
  score_reason: z.string().describe("Una o dos frases con la razón del score"),
  whatsapp_message: z.string().describe("Primer mensaje de WhatsApp"),
  email_subject: z.string().describe("Asunto del email"),
  email_body_html: z.string().describe("Cuerpo del email en HTML simple"),
});

// System fijo (sin datos variables) para que pueda reutilizarse en caché entre leads.
const SYSTEM = `Eres el equipo comercial de una agencia mexicana que hace prospección en frío a negocios locales.
Para cada negocio recibes sus datos públicos de Google Maps y el servicio que vendemos. Haces dos cosas:

1. Calificas al negocio de 0 a 100 según qué tan probable es que necesite y pueda pagar el servicio:
   - Encaje del giro con el servicio (lo más importante).
   - Señales de actividad: número de reseñas y calificación (muchas reseñas = negocio con flujo de clientes).
   - Presencia digital: tener sitio web indica que invierte en su imagen; no tenerlo puede ser una oportunidad si el servicio es digital.
   - Menos de 40 = no vale la pena contactarlo.

2. Redactas el primer contacto, personalizado para ese negocio.

Reglas obligatorias:
- Usa solo los datos proporcionados. Nunca inventes cifras, reseñas, premios, nombres de personas ni detalles que no estén en los datos.
- Trato de usted. Español de México, natural y breve, sin sonar a plantilla ni a vendedor insistente.
- Cada mensaje debe sentirse escrito para ese negocio: menciona algo concreto de sus datos (su giro, su zona, sus reseñas o su calificación, que tenga o no sitio web).

WhatsApp (whatsapp_message):
- Máximo 450 caracteres en total.
- Sin links, sin URLs, sin dominios.
- Una referencia concreta al negocio, el beneficio del servicio en una frase y un cierre con pregunta abierta.
- Termina con la línea exacta: "Si no le interesa, responda BAJA".

Email:
- email_subject: menos de 60 caracteres, sin mayúsculas sostenidas ni signos de exclamación.
- email_body_html: menos de 120 palabras, HTML simple (solo <p>, <br>, <strong>, <em>), sin imágenes ni links.
- No incluyas firma ni enlace de baja: se agregan automáticamente al enviar.`;

export type QualifyInput = {
  service: string;
  signature: string | null;
  business: {
    name: string;
    niche: string | null;
    address: string | null;
    rating: string | number | null;
    reviewsCount: number | null;
    website: string | null;
    hasWhatsapp: boolean | null;
    hasEmail: boolean;
  };
};

export class QualifyError extends Error {}

/** Prompt qualify_and_write. Valida las reglas con Zod y reintenta una vez con el error. */
export async function qualifyAndWrite(client: Anthropic, model: string, input: QualifyInput): Promise<QualifyResult> {
  const b = input.business;
  const data = [
    `Servicio que vendemos: ${input.service}`,
    input.signature ? `Quién firma: ${input.signature}` : null,
    "",
    "Negocio:",
    `- Nombre: ${b.name}`,
    `- Giro: ${b.niche ?? "desconocido"}`,
    `- Dirección: ${b.address ?? "desconocida"}`,
    `- Calificación en Google: ${b.rating ?? "sin calificación"} (${b.reviewsCount ?? 0} reseñas)`,
    `- Sitio web: ${b.website ?? "no tiene"}`,
    `- Tiene WhatsApp: ${b.hasWhatsapp ? "sí" : "no"}`,
    `- Tiene email público: ${b.hasEmail ? "sí" : "no"}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(Output) },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: feedback ? `${data}\n\nTu respuesta anterior no cumplió las reglas: ${feedback}. Corrígela.` : data,
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new QualifyError("Claude se negó a redactar para este negocio");

    const parsed = qualifyResultSchema.safeParse({
      ...response.parsed_output,
      score: Math.round(response.parsed_output?.score ?? -1),
    });
    if (parsed.success) return parsed.data;
    feedback = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  throw new QualifyError(`Mensajes inválidos dos veces: ${feedback}`);
}
