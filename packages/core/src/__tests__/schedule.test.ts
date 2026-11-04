import { describe, expect, it } from "vitest";
import {
  businessDaysBetween,
  describeNextWindow,
  effectiveWhatsappLimit,
  isInSendWindow,
  mexicoClock,
  randomDelayMs,
  shouldPauseForFailures,
} from "../schedule";

// México (UTC-6, sin horario de verano). 2026-11-02 es lunes.
const s = { sendWindowStart: "09:00:00", sendWindowEnd: "19:00:00", sendDays: [1, 2, 3, 4, 5] };
const mx = (date: string, time: string) => new Date(`${date}T${time}:00-06:00`);

describe("mexicoClock", () => {
  it("convierte a la hora de México aunque en UTC ya sea otro día", () => {
    expect(mexicoClock(new Date("2026-11-04T02:00:00Z"))).toEqual({ weekday: 2, minutes: 20 * 60, date: "2026-11-03" });
  });
});

describe("isInSendWindow", () => {
  it("incluye el inicio y excluye el fin", () => {
    expect(isInSendWindow(s, mx("2026-11-02", "08:59"))).toBe(false);
    expect(isInSendWindow(s, mx("2026-11-02", "09:00"))).toBe(true);
    expect(isInSendWindow(s, mx("2026-11-02", "18:59"))).toBe(true);
    expect(isInSendWindow(s, mx("2026-11-02", "19:00"))).toBe(false);
  });
  it("respeta los días de envío", () => {
    expect(isInSendWindow(s, mx("2026-11-07", "10:00"))).toBe(false); // sábado
    expect(isInSendWindow({ ...s, sendDays: [6] }, mx("2026-11-07", "10:00"))).toBe(true);
  });
});

describe("businessDaysBetween", () => {
  it("no cuenta el día inicial ni los fines de semana", () => {
    expect(businessDaysBetween("2026-11-02", "2026-11-02")).toBe(0);
    expect(businessDaysBetween("2026-11-02", "2026-11-03")).toBe(1);
    expect(businessDaysBetween("2026-11-06", "2026-11-09")).toBe(1); // viernes → lunes
    expect(businessDaysBetween("2026-11-02", "2026-11-09")).toBe(5);
  });
});

describe("effectiveWhatsappLimit", () => {
  it("empieza en 10 y sube 5 por día hábil hasta el límite", () => {
    expect(effectiveWhatsappLimit(50, true, null, "2026-11-02")).toBe(10);
    expect(effectiveWhatsappLimit(50, true, "2026-11-02", "2026-11-02")).toBe(10);
    expect(effectiveWhatsappLimit(50, true, "2026-11-02", "2026-11-03")).toBe(15);
    expect(effectiveWhatsappLimit(50, true, "2026-11-02", "2026-11-09")).toBe(35);
    expect(effectiveWhatsappLimit(20, true, "2026-11-02", "2026-11-30")).toBe(20);
  });
  it("un límite menor a 10 manda sobre el calentamiento", () => {
    expect(effectiveWhatsappLimit(5, true, null, "2026-11-02")).toBe(5);
  });
  it("sin calentamiento usa el límite configurado", () => {
    expect(effectiveWhatsappLimit(50, false, null, "2026-11-02")).toBe(50);
  });
});

describe("randomDelayMs", () => {
  it("queda dentro del rango, aunque venga invertido", () => {
    for (let i = 0; i < 200; i++) {
      for (const d of [randomDelayMs(50, 70), randomDelayMs(70, 50)]) {
        expect(d).toBeGreaterThanOrEqual(50_000);
        expect(d).toBeLessThanOrEqual(70_000);
      }
    }
  });
});

describe("shouldPauseForFailures", () => {
  it("pausa con más de 10 % de fallos", () => {
    expect(shouldPauseForFailures(8, 2)).toBe(true);
    expect(shouldPauseForFailures(9, 1)).toBe(false); // exactamente 10 %
  });
  it("no reacciona con menos de 5 intentos", () => {
    expect(shouldPauseForFailures(1, 3)).toBe(false);
    expect(shouldPauseForFailures(0, 5)).toBe(true);
  });
});

describe("describeNextWindow", () => {
  it("indica hoy, mañana o el siguiente día hábil", () => {
    expect(describeNextWindow(s, mx("2026-11-03", "08:00"))).toBe("hoy a las 09:00");
    expect(describeNextWindow(s, mx("2026-11-03", "23:55"))).toBe("mañana a las 09:00");
    expect(describeNextWindow(s, mx("2026-11-06", "20:00"))).toBe("el lunes a las 09:00");
  });
  it("avisa si no hay días configurados", () => {
    expect(describeNextWindow({ ...s, sendDays: [] })).toBe("sin días de envío configurados");
  });
});
