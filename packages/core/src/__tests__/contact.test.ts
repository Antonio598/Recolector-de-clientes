import { describe, expect, it } from "vitest";
import { extractEmails, toE164 } from "../contact";

describe("toE164", () => {
  it("normaliza formatos de México", () => {
    expect(toE164("229 123 4567")).toBe("+522291234567");
    expect(toE164("+52 229 123 4567")).toBe("+522291234567");
    expect(toE164("(229) 123-4567")).toBe("+522291234567");
  });
  it("conserva otros países con prefijo", () => {
    expect(toE164("+1 214 555 0142")).toBe("+12145550142");
  });
  it("rechaza lo inválido o vacío", () => {
    expect(toE164("123")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
  });
});

describe("extractEmails", () => {
  it("encuentra mailto y texto, en minúsculas y sin repetir", () => {
    expect(extractEmails('<a href="mailto:Ventas@Clinica.mx">x</a> ventas@clinica.mx')).toEqual(["ventas@clinica.mx"]);
  });
  it("decodifica @ ofuscadas", () => {
    expect(extractEmails("hola&#64;clinica.mx")).toEqual(["hola@clinica.mx"]);
    expect(extractEmails("hola%40clinica.mx")).toEqual(["hola@clinica.mx"]);
  });
  it("descarta terceros, imágenes e ids", () => {
    const html = "logo@2x.png soporte@wix.com a@sentry.io 0123456789abcdef0123@x.mx noreply@clinica.mx yo@ejemplo.com";
    expect(extractEmails(html)).toEqual([]);
  });
  it("prioriza el dominio del sitio, ignorando www", () => {
    expect(extractEmails("otro@gmail.com citas@clinica.mx", "www.clinica.mx")).toEqual(["citas@clinica.mx", "otro@gmail.com"]);
  });
});
