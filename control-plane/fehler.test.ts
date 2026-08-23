import { describe, expect, it } from "vitest";

import { Auftrag, type Auftrag as AuftragTyp } from "./v1.js";
import { aktionEndgueltigFehlschlagen, aktionZurWiederholungPlanen } from "./fehler.js";

function laufenderAuftrag(): AuftragTyp {
  return Auftrag.parse({
    version: 1,
    id: "auftrag-fehler",
    projekt_id: "projekt-1",
    nutzer_id: "nutzer-1",
    ziel: "BYB soll eine begrenzte Worker-Wiederholung nachvollziehbar verarbeiten.",
    zustand: "laeuft",
    credit_deckel: 20,
    credits_verbraucht: 0,
    aktionen: [
      {
        id: "repo",
        typ: "repo",
        titel: "Arbeitsbranch vorbereiten",
        beschreibung: "Ein isolierter Arbeitsbranch wird für den Auftrag vorbereitet.",
        zustand: "laeuft",
        abhaengigkeiten: [],
        verbindung_ids: ["github-1"],
        freigabe: { klasse: "intern", status: "nicht_erforderlich" },
        credits_geschaetzt: 2,
        credits_verbraucht: 0,
      },
    ],
    ereignisse: [],
  });
}

describe("Worker-Fehlerzustände", () => {
  it("plant einen frühen Fehlversuch erneut und dokumentiert die Grenze", () => {
    const nachher = aktionZurWiederholungPlanen(
      laufenderAuftrag(),
      "repo",
      "GitHub antwortete mit einem vorübergehenden Provider-Fehler.",
      1,
      3,
      1000,
    );

    expect(nachher.zustand).toBe("laeuft");
    expect(nachher.aktionen[0]?.zustand).toBe("geplant");
    expect(nachher.ereignisse[0]?.typ).toBe("plan_geaendert");
    expect(nachher.ereignisse[0]?.klartext).toContain("1/3");
  });

  it("setzt nach ausgeschöpften Versuchen Auftrag und Aktion terminal auf fehlgeschlagen", () => {
    const nachher = aktionEndgueltigFehlschlagen(
      laufenderAuftrag(),
      "repo",
      "Provider-Fehler blieb nach Wiederholungen bestehen.",
      3,
      3,
      1000,
    );

    expect(nachher.zustand).toBe("fehlgeschlagen");
    expect(nachher.aktionen[0]?.zustand).toBe("fehlgeschlagen");
    expect(nachher.aktionen[0]?.ergebnis).toContain("Provider-Fehler");
    expect(nachher.ereignisse[0]?.typ).toBe("aktion_fehlgeschlagen");
  });

  it("verhindert unbegrenzte Wiederholung nach Erreichen des Limits", () => {
    expect(() =>
      aktionZurWiederholungPlanen(
        laufenderAuftrag(),
        "repo",
        "Provider bleibt nicht erreichbar.",
        3,
        3,
        1000,
      ),
    ).toThrow(/ausgeschöpfter Fehlversuch/);
  });
});
