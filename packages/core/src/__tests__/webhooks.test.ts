import { describe, expect, it } from "vitest";
import { isExplicitOptOut, parseBrevoWebhook, parseEvolutionWebhook } from "../webhooks";

const upsert = (key: object, message: object = { conversation: "hola" }) => ({
  event: "messages.upsert",
  data: { key, message, pushName: "Ana" },
});

describe("parseEvolutionWebhook", () => {
  it("lee un mensaje entrante", () => {
    expect(parseEvolutionWebhook(upsert({ remoteJid: "5212291234567@s.whatsapp.net", fromMe: false, id: "A" }))).toEqual([
      { type: "incoming", providerId: "A", phoneDigits: "5212291234567", text: "hola", pushName: "Ana" },
    ]);
  });
  it("acepta el nombre de evento en mayúsculas", () => {
    const body = { ...upsert({ remoteJid: "521@s.whatsapp.net", id: "A" }), event: "MESSAGES_UPSERT" };
    expect(parseEvolutionWebhook(body)).toHaveLength(1);
  });
  it("lee texto extendido y marca multimedia sin texto", () => {
    const key = { remoteJid: "521@s.whatsapp.net", id: "A" };
    expect(parseEvolutionWebhook(upsert(key, { extendedTextMessage: { text: "largo" } }))[0]).toMatchObject({ text: "largo" });
    expect(parseEvolutionWebhook(upsert(key, { audioMessage: {} }))[0]).toMatchObject({ text: "[Nota de voz]" });
  });
  it("con @lid usa el teléfono real", () => {
    const ev = parseEvolutionWebhook(upsert({ remoteJid: "999@lid", remoteJidAlt: "5212291234567@s.whatsapp.net", id: "A" }));
    expect(ev[0]).toMatchObject({ phoneDigits: "5212291234567" });
  });
  it("ignora mensajes propios, grupos, estados y @lid sin teléfono", () => {
    expect(parseEvolutionWebhook(upsert({ remoteJid: "521@s.whatsapp.net", fromMe: true, id: "A" }))).toEqual([]);
    expect(parseEvolutionWebhook(upsert({ remoteJid: "123@g.us", id: "A" }))).toEqual([]);
    expect(parseEvolutionWebhook(upsert({ remoteJid: "status@broadcast", id: "A" }))).toEqual([]);
    expect(parseEvolutionWebhook(upsert({ remoteJid: "999@lid", id: "A" }))).toEqual([]);
  });
  it("traduce estados y descarta los intermedios", () => {
    const up = (status: string) => ({ event: "messages.update", data: { keyId: "X", status } });
    expect(parseEvolutionWebhook(up("READ"))).toEqual([{ type: "status", providerId: "X", status: "leido" }]);
    expect(parseEvolutionWebhook(up("DELIVERY_ACK"))).toEqual([{ type: "status", providerId: "X", status: "entregado" }]);
    expect(parseEvolutionWebhook(up("SERVER_ACK"))).toEqual([]);
  });
  it("lee la conexión y tolera basura", () => {
    expect(parseEvolutionWebhook({ event: "connection.update", data: { state: "close" } })).toEqual([
      { type: "connection", state: "close" },
    ]);
    expect(parseEvolutionWebhook(null)).toEqual([]);
    expect(parseEvolutionWebhook({ event: "otro", data: {} })).toEqual([]);
  });
});

describe("parseBrevoWebhook", () => {
  it("rebote duro: fallido y baja, con email en minúsculas", () => {
    expect(parseBrevoWebhook({ event: "hard_bounce", email: "A@b.mx", "message-id": "<1>" })).toEqual([
      { type: "status", providerId: "<1>", email: "a@b.mx", status: "fallido", optOut: "Rebote duro de email", hardBounce: true },
    ]);
    expect(parseBrevoWebhook({ event: "hardBounce", email: "a@b.mx", "message-id": "<1>" })[0]).toMatchObject({ hardBounce: true });
  });
  it("spam y baja registran opt-out; rebote suave no", () => {
    expect(parseBrevoWebhook({ event: "spam", email: "a@b.mx", "message-id": "<1>" })[0]).toHaveProperty("optOut");
    expect(parseBrevoWebhook({ event: "unsubscribed", email: "a@b.mx", "message-id": "<1>" })[0]).toHaveProperty("optOut");
    expect(parseBrevoWebhook({ event: "soft_bounce", email: "a@b.mx", "message-id": "<1>" })[0]).not.toHaveProperty("optOut");
  });
  it("lee respuestas entrantes", () => {
    const ev = parseBrevoWebhook({ items: [{ From: { Address: "Ana@Neg.mx" }, Subject: "Re", RawTextBody: "Me interesa", MessageId: "<m>" }] });
    expect(ev).toEqual([{ type: "incoming", fromEmail: "ana@neg.mx", subject: "Re", text: "Me interesa", providerId: "<m>" }]);
  });
  it("ignora eventos desconocidos o incompletos", () => {
    expect(parseBrevoWebhook({ event: "request", email: "a@b.mx", "message-id": "<1>" })).toEqual([]);
    expect(parseBrevoWebhook({ event: "delivered" })).toEqual([]);
    expect(parseBrevoWebhook(null)).toEqual([]);
  });
});

describe("isExplicitOptOut", () => {
  it("reconoce la baja y sus variantes", () => {
    for (const t of ["BAJA", " baja. ", "No me escriban", "quítenme de su lista", "STOP"]) expect(isExplicitOptOut(t), t).toBe(true);
  });
  it("no confunde frases que solo contienen la palabra", () => {
    for (const t of ["baja el precio?", "¿Cuál es la temporada baja?", "me interesa"]) expect(isExplicitOptOut(t), t).toBe(false);
  });
});
