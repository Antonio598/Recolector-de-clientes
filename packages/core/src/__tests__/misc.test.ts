import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../csv";
import { rectSizeKm, splitRect } from "../geo";
import { nichesToQueries } from "../schemas/campaign";
import { emailBodySchema, emailSubjectSchema, sanitizeEmailHtml, whatsappMessageSchema } from "../schemas/messages";
import { makeUnsubscribeToken, verifyUnsubscribeToken } from "../unsubscribe";

describe("unsubscribe", () => {
  it("el token vuelve al contacto original", () => {
    expect(verifyUnsubscribeToken("s", makeUnsubscribeToken("s", { email: "Ana@Neg.mx" }))).toEqual({ email: "ana@neg.mx" });
    expect(verifyUnsubscribeToken("s", makeUnsubscribeToken("s", { phone: "+5229" }))).toEqual({ phone: "+5229" });
  });
  it("rechaza tokens alterados, de otro secreto o mal formados", () => {
    const t = makeUnsubscribeToken("s", { email: "a@b.mx" });
    expect(verifyUnsubscribeToken("otro", t)).toBeNull();
    expect(verifyUnsubscribeToken("s", `${Buffer.from("e:victima@b.mx").toString("base64url")}.${t.split(".")[1]}`)).toBeNull();
    expect(verifyUnsubscribeToken("s", "basura")).toBeNull();
    expect(verifyUnsubscribeToken("s", "")).toBeNull();
  });
});

describe("reglas de mensajes", () => {
  const ok = "Buenas tardes, vi su clínica en Boca del Río. ¿Cómo agendan sus citas hoy? Si no le interesa, responda BAJA";
  it("acepta un WhatsApp válido", () => expect(whatsappMessageSchema.safeParse(ok).success).toBe(true));
  it("rechaza sin BAJA, con links o demasiado largo", () => {
    expect(whatsappMessageSchema.safeParse("Buenas tardes, vi su clínica en Boca del Río. ¿Cómo agendan sus citas?").success).toBe(false);
    expect(whatsappMessageSchema.safeParse(`Visite www.sitio.com ${ok}`).success).toBe(false);
    expect(whatsappMessageSchema.safeParse(`Visite clinica.mx ${ok}`).success).toBe(false);
    expect(whatsappMessageSchema.safeParse(`${"a".repeat(450)} ${ok}`).success).toBe(false);
  });
  it("limita asunto y cuerpo del email", () => {
    expect(emailSubjectSchema.safeParse("a".repeat(59)).success).toBe(true);
    expect(emailSubjectSchema.safeParse("a".repeat(60)).success).toBe(false);
    const body = (n: number) => `<p>${Array(n).fill("palabra").join(" ")}</p>`;
    expect(emailBodySchema.safeParse(body(119)).success).toBe(true);
    expect(emailBodySchema.safeParse(body(120)).success).toBe(false);
  });
  it("solo admite HTML simple sin atributos", () => {
    const text = "Hola, le escribo porque su negocio tiene muy buenas reseñas.";
    expect(emailBodySchema.safeParse(`<p>${text}<br/></p>`).success).toBe(true);
    expect(emailBodySchema.safeParse(`<p class="x">${text}</p>`).success).toBe(false);
    expect(emailBodySchema.safeParse(`<p>${text}</p><img src=x>`).success).toBe(false);
    expect(emailBodySchema.safeParse(`<a href="x">${text}</a>`).success).toBe(false);
  });
  it("sanitizeEmailHtml quita atributos y etiquetas peligrosas", () => {
    expect(sanitizeEmailHtml('<p onclick="x()">Hola</p><script>a</script><br/><img src=x>')).toBe("<p>Hola</p>a<br>");
  });
});

describe("csv", () => {
  it("escapa comillas, comas y saltos", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
  });
  it("neutraliza fórmulas salvo en columnas confiables", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+5229")).toBe("'+5229");
    expect(toCsv(["n", "t"], [["=1", "+5229"]], [1])).toBe("﻿n,t\r\n'=1,+5229\r\n");
  });
});

describe("geo", () => {
  const boca = { low: { latitude: 19.03, longitude: -96.17 }, high: { latitude: 19.17, longitude: -96.08 } };
  it("mide y divide en subzonas de hasta 10 km", () => {
    expect(rectSizeKm(boca).heightKm).toBeCloseTo(15.58, 1);
    expect(splitRect(boca)).toHaveLength(2);
  });
  it("una zona chica queda igual y una enorme respeta el tope", () => {
    const chica = { low: { latitude: 19, longitude: -96 }, high: { latitude: 19.01, longitude: -95.99 } };
    expect(splitRect(chica)).toEqual([chica]);
    const enorme = { low: { latitude: 15, longitude: -100 }, high: { latitude: 25, longitude: -90 } };
    const cells = splitRect(enorme, 10, 16);
    expect(cells.length).toBeLessThanOrEqual(16);
    expect(cells[0]!.low).toEqual(enorme.low);
    expect(cells.at(-1)!.high.latitude).toBeCloseTo(25);
    expect(cells.at(-1)!.high.longitude).toBeCloseTo(-90);
  });
});

describe("nichesToQueries", () => {
  it("aplana y quita repetidas sin importar mayúsculas", () => {
    expect(
      nichesToQueries([
        { name: "A", why: "", queries: ["dentista", "Dentista"] },
        { name: "B", why: "", queries: ["dentista", "notaría"] },
      ]),
    ).toEqual([
      { niche: "A", query: "dentista" },
      { niche: "B", query: "notaría" },
    ]);
  });
});
