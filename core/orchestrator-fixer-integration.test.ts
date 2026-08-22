import { describe, expect, it } from "vitest";

import type { Angreifer, Fixer, Ziel } from "./schnittstellen.js";
import { schleifeLaufen } from "./orchestrator.js";

const angreifer: Angreifer = {
  klasse: "datei-kaputt",
  kategorie: "zugangsdaten",
  brauchtLaufzeit: false,
  angreifen(ziel) {
    const kaputt = ziel.dateien.some((datei) => datei.inhalt.includes("KAPUTT"));
    return Promise.resolve(
      kaputt
        ? [{
            schweregrad: "hoch" as const,
            klartext: "Die Testdatei enthält absichtlich einen reparierbaren Fehler im Inhalt.",
            nachweis: "a.ts:1  KAPUTT",
          }]
        : [],
    );
  },
};

const fixer: Fixer = {
  fixen(_befund, ziel) {
    const datei = ziel.dateien.find((d) => d.pfad === "a.ts");
    if (datei === undefined) {
      return Promise.resolve({ geaendert: false, beschreibung: "Datei fehlt.", dateien: [] });
    }
    return Promise.resolve({
      geaendert: true,
      beschreibung: "Testfehler ersetzt.",
      dateien: [{ ...datei, inhalt: datei.inhalt.replace("KAPUTT", "OK") }],
    });
  },
};

describe("Orchestrator übernimmt Fix-Dateien", () => {
  it("prüft in Runde 2 den geänderten Inhalt und markiert den Fund erst dann als behoben", async () => {
    const ziel: Ziel = {
      lauf_id: "integration-fix",
      dateien: [{ pfad: "a.ts", inhalt: "export const x = 'KAPUTT';" }],
    };

    const protokoll = await schleifeLaufen({ ziel, angreifer: [angreifer], fixer });

    expect(protokoll.runden).toHaveLength(2);
    expect(protokoll.befunde[0]?.zustand).toBe("behoben");
    expect(protokoll.endzustand).toBe("sauber");
    expect(protokoll.abbruchgrund).toBe("keine_offenen_befunde");
  });
});
