import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { nichesSchema, type Niche } from "../schemas/campaign";

// Esquema de salida para Claude (zod/v4, requerido por el helper del SDK).
// Los límites (5-10 giros, 1-3 consultas) se validan después con nichesSchema.
const PlanOutput = z.object({
  niches: z.array(
    z.object({
      name: z.string().describe("Giro de negocio, en plural. Ej.: 'Clínicas dentales'"),
      why: z.string().describe("Una frase: por qué este giro necesita el servicio"),
      queries: z.array(z.string()).describe("1 a 3 búsquedas para Google Maps"),
    }),
  ),
});

const SYSTEM = `Eres estratega de prospección B2B para pequeñas y medianas empresas en México.
Recibes un servicio que vende el usuario y una zona. Devuelves los giros de negocio locales que más probablemente necesitan y pueden pagar ese servicio, con las búsquedas para encontrarlos en Google Maps.

Reglas:
- Entre 5 y 10 giros, ordenados del más prometedor al menos prometedor.
- Giros concretos de negocios locales con local físico (no "empresas en general", no cadenas nacionales ni franquicias, no gobierno).
- Para cada giro, de 1 a 3 búsquedas cortas (2 a 4 palabras) en español, como la gente busca en Google Maps en México. Ej.: "clínica dental", "consultorio dental", "dentista".
- No incluyas la zona ni la ciudad en las búsquedas: la búsqueda ya se limita al área geográfica.
- Las búsquedas no deben repetirse entre giros.
- "why" es una sola frase concreta sobre el problema que el servicio les resuelve.`;

export class PlanSearchError extends Error {}

/** Prompt plan_search: servicio + zona → giros y búsquedas. Reintenta una vez si la salida no es válida. */
export async function planSearch(
  client: Anthropic,
  model: string,
  input: { service: string; zone: string },
): Promise<Niche[]> {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(PlanOutput) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Servicio que vendo: ${input.service}\nZona: ${input.zone}${
            lastError ? `\n\nTu respuesta anterior no fue válida: ${lastError}. Corrígela.` : ""
          }`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new PlanSearchError("Claude se negó a generar el plan para este servicio.");
    }
    const parsed = nichesSchema.safeParse(response.parsed_output?.niches);
    if (parsed.success) return parsed.data;
    lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  throw new PlanSearchError(`Claude devolvió un plan inválido dos veces: ${lastError}`);
}
