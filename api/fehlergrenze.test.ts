import { describe, expect, it } from "vitest";

import { authUndDienst } from "./fehlergrenze.js";

describe("HTTP Auth-/Dienst-Fehlergrenze", () => {
  it("ordnet einen Authfehler ausschließlich der Auth-Grenze zu", async () => {
    let dienstAufgerufen = false;
    const ergebnis = await authUndDienst(
      () => Promise.reject(new Error("ungültiges Token")),
      () => {
        dienstAufgerufen = true;
        return Promise.resolve("nie");
      },
    );

    expect(ergebnis).toEqual({ status: "auth_fehler" });
    expect(dienstAufgerufen).toBe(false);
  });

  it("maskiert einen Dienst-/DB-Fehler nach erfolgreicher Auth nicht als Authfehler", async () => {
    const ergebnis = await authUndDienst(
      () => Promise.resolve({ nutzerId: "nutzer-1" }),
      () => Promise.reject(new Error("Datenbank nicht erreichbar")),
    );

    expect(ergebnis).toEqual({ status: "dienst_fehler" });
  });

  it("gibt einen erfolgreichen Dienstwert unverändert zurück", async () => {
    const ergebnis = await authUndDienst(
      () => Promise.resolve({ nutzerId: "nutzer-1" }),
      (identitaet) => Promise.resolve({ fuer: identitaet.nutzerId }),
    );

    expect(ergebnis).toEqual({ status: "ok", wert: { fuer: "nutzer-1" } });
  });
});
