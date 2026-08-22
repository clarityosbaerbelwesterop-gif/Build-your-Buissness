/**
 * Die eine Regel: leer zählt als nicht gesetzt.
 *
 * Der Test ist ausführlicher, als die Funktionen lang sind — weil genau diese
 * Regel schon einmal an vier Stellen anders gehandhabt wurde und der
 * Fehlschlag dann bei einem fremden Dienst als „unknown error" ankam.
 */

import { describe, expect, it } from "vitest";

import { UmgebungFehlt, gesetzt, optional, pflicht, pruefeStart } from "./umgebung.js";

describe("gesetzt", () => {
  it("liefert den Wert", () => {
    expect(gesetzt("X", { X: "wert" })).toBe("wert");
  });

  it.each([
    ["leere Zeichenkette", ""],
    ["nur Leerzeichen", "   "],
    ["nur Zeilenumbruch", "\n"],
  ])("behandelt %s wie nicht gesetzt", (_fall, wert) => {
    expect(gesetzt("X", { X: wert })).toBeUndefined();
  });

  it("liefert undefined, wenn der Name nicht vorkommt", () => {
    expect(gesetzt("X", {})).toBeUndefined();
  });

  it("schneidet Leerraum ab", () => {
    expect(gesetzt("X", { X: " wert\n" })).toBe("wert");
  });
});

describe("pflicht", () => {
  it("liefert den Wert", () => {
    expect(pflicht("X", "wofür", { X: "wert" })).toBe("wert");
  });

  it("wirft und nennt den Namen der Variable", () => {
    // Eine Fehlermeldung, die nicht sagt, welche Variable fehlt, schickt den
    // Leser in die Suche — und das ist genau der Moment, in dem jemand
    // anfängt, an der falschen Stelle zu drehen.
    expect(() => pflicht("NEON_API_KEY", "Datenbank", {}))
      .toThrow(/NEON_API_KEY/);
  });

  it("wirft auch bei leerem Wert, nicht nur bei fehlendem", () => {
    expect(() => pflicht("X", "wofür", { X: "" })).toThrow(UmgebungFehlt);
  });

  it("nennt in der Meldung, wofür die Variable da ist", () => {
    expect(() => pflicht("X", "Zugang zur Datenbank", {}))
      .toThrow(/Zugang zur Datenbank/);
  });

  it("nennt nie den Wert einer anderen Variable", () => {
    // Die Meldung landet im Protokoll eines CI-Laufs.
    const versuch = () => pflicht("X", "wofür", { GEHEIM: "nvapi-streng-geheim" });
    expect(versuch).toThrow();
    try {
      versuch();
    } catch (fehler) {
      expect((fehler as Error).message).not.toContain("nvapi-");
    }
  });
});

describe("optional", () => {
  it("liefert den Wert, wenn er da ist", () => {
    expect(optional("X", "vorgabe", { X: "wert" })).toBe("wert");
  });

  it("liefert die Vorgabe, wenn die Variable leer ist", () => {
    // Der Fall, der es in die Produktion geschafft hat: `?? "neondb"` lieferte
    // "" statt "neondb", weil GitHub ein fehlendes Secret als leeren String
    // setzt.
    expect(optional("NEON_DATABASE", "neondb", { NEON_DATABASE: "" }))
      .toBe("neondb");
  });

  it("liefert die Vorgabe, wenn die Variable gar nicht da ist", () => {
    expect(optional("X", "vorgabe", {})).toBe("vorgabe");
  });
});

describe("pruefeStart", () => {
  const noetig = [
    { name: "EINS", wofuer: "a" },
    { name: "ZWEI", wofuer: "b" },
    { name: "DREI", wofuer: "c" },
  ];

  it("lässt durch, wenn alles gesetzt ist", () => {
    expect(() => pruefeStart(noetig, { EINS: "1", ZWEI: "2", DREI: "3" }))
      .not.toThrow();
  });

  it("nennt ALLE fehlenden auf einmal, nicht die erste", () => {
    // Wer sie einzeln erfährt, hinterlegt ein Secret, startet neu, wartet auf
    // die CI, erfährt die nächste. Drei Namen, drei Runden.
    try {
      pruefeStart(noetig, { ZWEI: "2" });
      expect.unreachable("hätte werfen müssen");
    } catch (fehler) {
      const meldung = (fehler as Error).message;
      expect(meldung).toContain("EINS");
      expect(meldung).toContain("DREI");
      expect(meldung).not.toContain("ZWEI");
    }
  });

  it("zählt eine leere Variable als fehlend", () => {
    expect(() => pruefeStart(noetig, { EINS: "1", ZWEI: "", DREI: "3" }))
      .toThrow(/ZWEI/);
  });

  it("führt die fehlenden Namen auch maschinenlesbar mit", () => {
    try {
      pruefeStart(noetig, {});
      expect.unreachable("hätte werfen müssen");
    } catch (fehler) {
      expect((fehler as UmgebungFehlt).namen).toEqual(["EINS", "ZWEI", "DREI"]);
    }
  });

  it("wirft nicht bei einer leeren Liste", () => {
    expect(() => pruefeStart([], {})).not.toThrow();
  });
});
