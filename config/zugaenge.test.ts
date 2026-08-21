/**
 * Die Zugänge. Geprüft wird vor allem das, was **nicht** passieren darf:
 * ein Wert in einer Meldung, und ein stiller Vorgabewert für ein Geheimnis.
 */

import { describe, expect, it } from "vitest";

import {
  ZUGAENGE,
  ZugangFehlt,
  zugang,
  zugangVorhanden,
  zugangsUebersicht,
} from "./zugaenge.js";

const GEHEIM = "nvapi-abcdefghijklmnopqrstuvwxyz0123";

describe("Einen Zugang lesen", () => {
  it("liefert den gesetzten Wert", () => {
    expect(zugang("nvidiaApiKey", { NVIDIA_API_KEY: GEHEIM })).toBe(GEHEIM);
  });

  it("behandelt Leerraum als nicht gesetzt", () => {
    // Ein Secret, das versehentlich als Leerzeile angelegt wurde, ist kein
    // Zugang — es soll denselben klaren Fehler geben wie ein fehlendes.
    expect(() => zugang("nvidiaApiKey", { NVIDIA_API_KEY: "   " })).toThrow(ZugangFehlt);
  });

  it("wirft mit einer Meldung, die sagt was fehlt und wohin es gehört", () => {
    // Ein `undefined`, das in eine Anfrage wandert, liefert einen 401 von einem
    // fremden Dienst — und diese Meldung erklärt niemandem, dass ein Secret
    // fehlt.
    try {
      zugang("neonApiKey", {});
      expect.unreachable("hätte werfen müssen");
    } catch (fehler) {
      expect(fehler).toBeInstanceOf(ZugangFehlt);
      const text = (fehler as Error).message;
      expect(text).toContain("NEON_API_KEY");
      expect(text).toContain("GitHub Secrets");
    }
  });

  it("hat keinen Vorgabewert für ein Geheimnis", () => {
    // Ein eingebauter Standardwert wäre entweder ein echter Schlüssel im
    // Quelltext oder ein Platzhalter, der einen klaren Fehlschlag in einen
    // unverständlichen verwandelt.
    for (const name of ["nvidiaApiKey", "neonApiKey", "datenbankUrl"] as const) {
      expect(() => zugang(name, {})).toThrow(ZugangFehlt);
    }
  });

  it("hat einen Vorgabewert für das, was kein Geheimnis ist", () => {
    expect(zugang("nvidiaBaseUrl", {})).toBe("https://integrate.api.nvidia.com/v1");
    expect(zugang("nvidiaModell", {})).toContain("kimi");
  });

  it("lässt den Vorgabewert überschreiben", () => {
    expect(zugang("nvidiaModell", { NVIDIA_MODEL: "anderes/modell" })).toBe("anderes/modell");
  });
});

describe("Nichts verrät einen Wert", () => {
  it("nennt den Schlüssel nicht in der Fehlermeldung", () => {
    // Der Fall, der wehtut: der Wert ist da, aber ein anderer fehlt — und die
    // Meldung nimmt beim Aufräumen den ganzen Zusammenhang mit.
    try {
      zugang("neonApiKey", { NVIDIA_API_KEY: GEHEIM });
      expect.unreachable("hätte werfen müssen");
    } catch (fehler) {
      expect((fehler as Error).message).not.toContain(GEHEIM);
      expect(JSON.stringify(fehler)).not.toContain(GEHEIM);
    }
  });

  it("gibt in der Übersicht nur Wahrheitswerte aus", () => {
    const uebersicht = zugangsUebersicht({ NVIDIA_API_KEY: GEHEIM });
    expect(JSON.stringify(uebersicht)).not.toContain(GEHEIM);
    const nvidia = uebersicht.find((z) => z.name === "NVIDIA_API_KEY");
    expect(nvidia?.gesetzt).toBe(true);
    const neon = uebersicht.find((z) => z.name === "NEON_API_KEY");
    expect(neon?.gesetzt).toBe(false);
  });

  it("prüft Vorhandensein, ohne den Wert zu liefern", () => {
    expect(zugangVorhanden("nvidiaApiKey", { NVIDIA_API_KEY: GEHEIM })).toBe(true);
    expect(zugangVorhanden("nvidiaApiKey", {})).toBe(false);
  });
});

describe("Die Liste selbst", () => {
  it("nennt jeden Zugang mit Zweck und Stufe", () => {
    for (const eintrag of Object.values(ZUGAENGE)) {
      expect(eintrag.name).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(eintrag.wofuer.length).toBeGreaterThan(10);
      expect(["M0", "M1", "später"]).toContain(eintrag.abStufe);
    }
  });

  it("braucht in M0 keinen einzigen Zugang", () => {
    // Das ist die Eigenschaft, die M0 ohne Secrets lauffähig macht — und der
    // Grund, warum die Tests in einem frischen Klon durchlaufen.
    //
    // Über `zugangsUebersicht` statt direkt über ZUGAENGE: dort ist `abStufe`
    // ein `string`. Auf der Liste selbst kennt der Übersetzer die Werte genau
    // und lehnt den Vergleich als sinnlos ab — der Test würde nie anschlagen,
    // wenn jemand später einen Zugang auf M0 setzt.
    const inM0 = zugangsUebersicht({}).filter((z) => z.abStufe === "M0");
    expect(inM0).toEqual([]);
  });

  it("vergibt jeden Umgebungsnamen nur einmal", () => {
    const namen = Object.values(ZUGAENGE).map((z) => z.name);
    expect(new Set(namen).size).toBe(namen.length);
  });

  it("liest standardmäßig aus process.env", () => {
    // Gegenprobe: die Einsetzbarkeit für Tests darf den Normalfall nicht
    // aushebeln.
    expect(zugangsUebersicht().map((z) => z.name)).toEqual(
      Object.values(ZUGAENGE).map((z) => z.name),
    );
  });
});
