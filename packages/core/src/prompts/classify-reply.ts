import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { z as z3 } from "zod";

export const REPLY_CATEGORIES = ["interesado", "no_interesado", "pregunta", "baja", "otro"] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

const Output = z.object({
  category: z.enum(REPLY_CATEGORIES),
  summary: z.string().describe("Resumen de la respuesta en una frase"),
  suggested_reply: z.string().describe("Respuesta sugerida para el vendedor; vacía si la categoría es baja"),
});

const resultSchema = z3.object({
  category: z3.enum(REPLY_CATEGORIES),
  summary: z3.string().trim().min(2).max(300),
  suggested_reply: z3.string().trim().max(1200),
});
export type ClassifyResult = z3.infer<typeof resultSchema>;

const SYSTEM = `Clasificas respuestas de negocios mexicanos a un primer mensaje de prospección comercial (WhatsApp o email).

Categorías:
- interesado: quiere saber más, pide precio, propone hablar o agendar, o responde positivamente.
- pregunta: hace una pregunta concreta (quién es, de dónde sacó su número, cómo funciona) sin mostrar interés claro.
- no_interesado: dice que no le interesa, que ya tiene el servicio o que no es buen momento, sin pedir que no le escriban.
- baja: pide no volver a recibir mensajes ("BAJA", "no me escriban", "quítenme de su lista", "dejen de mandar"), o se molesta y lo pide.
- otro: respuestas automáticas, saludos sin contenido, mensajes que no tienen que ver.

Para "suggested_reply": respuesta breve, cordial, en español de México y de usted, que avance la conversación (si hay interés, proponer una llamada corta o pedir el mejor horario). Usa solo lo que está en el historial: nunca inventes precios, cifras ni datos. Para "baja", deja suggested_reply vacío.`;

/** Prompt classify_reply (Haiku). */
export async function classifyReply(
  client: Anthropic,
  model: string,
  input: { service: string; businessName: string; history: { direction: "in" | "out"; channel: string; body: string }[] },
): Promise<ClassifyResult> {
  const history = input.history
    .map((m) => `${m.direction === "out" ? "Nosotros" : "Negocio"} (${m.channel}): ${m.body.replace(/<[^>]+>/g, " ").trim()}`)
    .join("\n\n");
  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Output) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Servicio que ofrecemos: ${input.service}\nNegocio: ${input.businessName}\n\nConversación (la última es la respuesta a clasificar):\n\n${history}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    return { category: "otro", summary: "No se pudo clasificar automáticamente", suggested_reply: "" };
  }
  return resultSchema.parse(response.parsed_output);
}
