/**
 * Der Datenvertrag ist die Grundlage für alles andere. Geprüft wird vor allem,
 * was er **ablehnt** — ein Schema, das alles durchlässt, ist keins.
 */

import { describe, expect, it } from "vitest";

import {
  Befund,
  PROTOKOLL_VERSION,
  Protokoll,
  endzustandAus,
  istOffen,
  protokollLesen,
} from "./v1.js";

const befund = {
  id: "b1",
  kategorie: "zugangsdaten",
  angriffsklasse: "secret-im-quelltext",
  schweregrad: "kritisch",
  klartext: "Ein Zugangsschlüssel steht im Quelltext und ist damit für jeden lesbar.",
  nachweis: "src/db.ts:12  const key = \"nvapi-…\"",
  zustand: "gefunden",
  runde: 1,
  zeitstempel: 1_700_000_000_000,
} as const;

const protokoll = {
  version: PROTOKOLL_VERSION,
  lauf_id: "lauf-1",
  begonnen: 1_700_000_000_000,
  beendet: 1_700_000_060_000,
  gelaufene_klassen: ["secret-im-quelltext"],
  runden: [
    {
      nummer: 1,
      gelaufene_klassen: ["secret-im-quelltext"],
      befunde: [befund],
      kosten: { tokens_ein: 10, tokens_aus: 5, laufzeit_ms: 120 },
    },
  ],
  befunde: [befund],
  endzustand: "offene_punkte",
  abbruchgrund: "rundenlimit",
  kosten_gesamt: { tokens_ein: 10, tokens_aus: 5, laufzeit_ms: 120 },
} as const;

describe("Befund", () => {
  it("nimmt einen vollständigen Fund an", () => {
    expect(Befund.parse(befund).id).toBe("b1");
  });

  it("weist einen Klartext ab, der nichts erklärt", () => {
    // „SQL-Injection" ist keine Erklärung dessen, was möglich war — und genau
    // solche Halbsätze entstehen, wenn ein Modell ein Pflichtfeld füllen muss.
    expect(() => Befund.parse({ ...befund, klartext: "SQL-Injection" })).toThrow();
  });

  it("weist einen Fund ohne Nachweis ab", () => {
    // Ein Fund ohne Beleg ist eine Behauptung. CHATHUB.md: „Beweise, keine
    // Beruhigung."
    expect(() => Befund.parse({ ...befund, nachweis: "" })).toThrow();
  });

  it("weist einen unbekannten Zustand ab", () => {
    expect(() => Befund.parse({ ...befund, zustand: "vielleicht" })).toThrow();
  });

  it("zählt Runden ab 1, nicht ab 0", () => {
    // Die Anzeige spricht von „Runde 1". Eine 0 im Datensatz wäre eine zweite
    // Zählweise für dieselbe Sache.
    expect(() => Befund.parse({ ...befund, runde: 0 })).toThrow();
  });
});

describe("Protokoll", () => {
  it("nimmt ein vollständiges Protokoll an", () => {
    expect(protokollLesen(protokoll).lauf_id).toBe("lauf-1");
  });

  it("ist gültig, wenn nichts gefunden wurde", () => {
    // CLAUDE.md §2.1: „Ein leeres Protokoll ist ein gültiges Ergebnis."
    const leer = {
      ...protokoll,
      runden: [{ ...protokoll.runden[0], befunde: [] }],
      befunde: [],
      endzustand: "sauber",
      abbruchgrund: "keine_offenen_befunde",
    };
    expect(protokollLesen(leer).befunde).toHaveLength(0);
  });

  it("verlangt die Liste der gelaufenen Klassen auch ohne Fund", () => {
    // Ohne sie wäre „nichts gefunden" nicht von „nicht geprüft" zu
    // unterscheiden — und das ist der Unterschied, den das Produkt verkauft.
    const { gelaufene_klassen: _weg, ...ohne } = protokoll;
    expect(() => protokollLesen(ohne)).toThrow();
  });

  it("verlangt einen Abbruchgrund", () => {
    const { abbruchgrund: _weg, ...ohne } = protokoll;
    expect(() => protokollLesen(ohne)).toThrow();
  });

  it("lehnt eine fremde Version ab, statt sie zu raten", () => {
    expect(() => protokollLesen({ ...protokoll, version: 2 })).toThrow();
  });

  it("wirft, statt ein halb gültiges Objekt zurückzugeben", () => {
    expect(() => protokollLesen({ lauf_id: "x" })).toThrow();
  });
});

describe("Ableitungen", () => {
  it("nennt einen Lauf nur sauber, wenn jeder Befund behoben ist", () => {
    expect(endzustandAus([])).toBe("sauber");
    expect(endzustandAus([{ ...befund, zustand: "behoben" }])).toBe("sauber");
    expect(endzustandAus([{ ...befund, zustand: "fix_versucht" }])).toBe("offene_punkte");
    expect(endzustandAus([{ ...befund, zustand: "wieder_aufgetreten" }])).toBe("offene_punkte");
  });

  it("hält einen versuchten Fix nicht für einen Erfolg", () => {
    // Der teuerste Denkfehler in dieser Schleife: „Fix geschrieben" ist nicht
    // „Fund behoben". Erst die erneute Prüfung entscheidet das.
    expect(istOffen({ ...befund, zustand: "fix_versucht" })).toBe(true);
    expect(istOffen({ ...befund, zustand: "behoben" })).toBe(false);
  });
});

describe("Struktur des Schemas", () => {
  it("hält die Angriffsklasse offen und die Kategorie geschlossen", () => {
    // Ein neuer Angreifer darf eine neue Klasse mitbringen, ohne den
    // Datenvertrag zu ändern. Die Kategorie steuert die Anzeige und bleibt zu.
    expect(Befund.parse({ ...befund, angriffsklasse: "ganz-neue-pruefung" })).toBeTruthy();
    expect(() => Befund.parse({ ...befund, kategorie: "erfunden" })).toThrow();
  });

  it("nimmt einen Protokolltext aus unbekannter Quelle nur geprüft an", () => {
    const roh: unknown = JSON.parse(JSON.stringify(protokoll));
    expect(protokollLesen(roh)).toEqual(Protokoll.parse(protokoll));
  });
});
