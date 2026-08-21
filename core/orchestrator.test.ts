/**
 * Die Schleife selbst, mit Attrappen statt echter Angreifer.
 *
 * Geprüft wird nicht, ob ein Angreifer etwas findet — das ist Sache der
 * Angreifer-Tests. Hier geht es um die vier Eigenschaften, an denen die
 * Schleife scheitern könnte, ohne dass es jemand merkt:
 *
 * 1. sie hört auf,
 * 2. sie hört aus dem **richtigen** Grund auf,
 * 3. sie hält einen versuchten Fix nicht für einen Erfolg,
 * 4. sie sieht es, wenn ein Fix einen früheren Fix zerstört.
 */

import { describe, expect, it } from "vitest";

import { Protokoll } from "../protocol/v1.js";
import { STANDARD_GRENZEN, schleifeLaufen } from "./orchestrator.js";
import type {
  Angreifer,
  Datei,
  Fixer,
  FixVersuch,
  Kostenzaehler,
  RoherBefund,
  Ziel,
} from "./schnittstellen.js";
import type { Kosten } from "../protocol/v1.js";

const ZIEL: Ziel = { lauf_id: "lauf-1", dateien: [{ pfad: "a.ts", inhalt: "" }] };

function fund(nachweis: string): RoherBefund {
  return {
    schweregrad: "hoch",
    klartext: "Ein Zugangsschlüssel liegt offen im Quelltext und ist für jeden lesbar.",
    nachweis,
  };
}

/** Ein Angreifer, dessen Funde je Runde vorgegeben sind. */
function angreiferMit(
  klasse: string,
  jeRunde: readonly (readonly string[])[],
  brauchtLaufzeit = false,
): Angreifer {
  return {
    klasse,
    kategorie: "zugangsdaten",
    brauchtLaufzeit,
    angreifen: (_ziel, kontext) =>
      Promise.resolve((jeRunde[kontext.runde - 1] ?? []).map(fund)),
  };
}

const FIXT_IMMER: Fixer = {
  fixen: () =>
    Promise.resolve<FixVersuch>({
      geaendert: true,
      beschreibung: "Schlüssel in eine Umgebungsvariable verschoben.",
      dateien: [],
    }),
};

const FIXT_NIE: Fixer = {
  fixen: () =>
    Promise.resolve<FixVersuch>({
      geaendert: false,
      beschreibung: "Kein bekanntes Vorgehen für diesen Fund.",
      dateien: [],
    }),
};

/** Ein Zähler, der je Runde feste Kosten meldet. */
function zaehlerMit(proRunde: Kosten): Kostenzaehler {
  return { beginnen: () => {}, beenden: () => proRunde };
}

describe("Terminierung", () => {
  it("hört auf, wenn nichts mehr offen ist — und sagt das als Grund", () => {
    return schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [[], []])],
      fixer: FIXT_IMMER,
    }).then((p) => {
      expect(p.abbruchgrund).toBe("keine_offenen_befunde");
      expect(p.endzustand).toBe("sauber");
      expect(p.runden).toHaveLength(1);
    });
  });

  it("hört beim Rundenlimit auf, wenn der Fixer nichts kann", async () => {
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"], ["a.ts:1"], ["a.ts:1"]])],
      fixer: FIXT_NIE,
    });
    expect(p.abbruchgrund).toBe("rundenlimit");
    expect(p.runden).toHaveLength(STANDARD_GRENZEN.maxRunden);
    expect(p.endzustand).toBe("offene_punkte");
  });

  it("bricht beim Kostendeckel ab und nennt ihn", async () => {
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"], ["a.ts:1"], ["a.ts:1"]])],
      fixer: FIXT_NIE,
      grenzen: { maxRunden: 10, maxTokens: 100 },
      kostenzaehler: zaehlerMit({ tokens_ein: 60, tokens_aus: 0, laufzeit_ms: 1 }),
    });
    expect(p.abbruchgrund).toBe("kostendeckel");
    expect(p.runden).toHaveLength(2);
    expect(p.kosten_gesamt.tokens_ein).toBe(120);
  });

  it("bricht auch beim Laufzeitdeckel ab", async () => {
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"], ["a.ts:1"]])],
      fixer: FIXT_NIE,
      grenzen: { maxRunden: 10, maxLaufzeitMs: 500 },
      kostenzaehler: zaehlerMit({ tokens_ein: 0, tokens_aus: 0, laufzeit_ms: 500 }),
    });
    expect(p.abbruchgrund).toBe("kostendeckel");
    expect(p.runden).toHaveLength(1);
  });

  it("nennt null Runden nicht Erfolg", async () => {
    // maxRunden 0 heißt: es wurde nichts geprüft. Das darf nicht als
    // „keine offenen Befunde" durchgehen — das wäre die bequeme Lesart.
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"]])],
      fixer: FIXT_NIE,
      grenzen: { maxRunden: 0 },
    });
    expect(p.abbruchgrund).toBe("rundenlimit");
    expect(p.gelaufene_klassen).toEqual([]);
  });
});

describe("Ein Fix ist kein Erfolg", () => {
  it("markiert nach dem Fix erst fix_versucht, nicht behoben", async () => {
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"]])],
      fixer: FIXT_IMMER,
      grenzen: { maxRunden: 1 },
    });
    // Nach einer Runde ist der Fix geschrieben, aber nicht nachgeprüft.
    expect(p.befunde[0]?.zustand).toBe("fix_versucht");
    expect(p.endzustand).toBe("offene_punkte");
  });

  it("nennt einen Fund erst behoben, wenn ihn niemand mehr findet", async () => {
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"], []])],
      fixer: FIXT_IMMER,
    });
    expect(p.befunde[0]?.zustand).toBe("behoben");
    expect(p.endzustand).toBe("sauber");
  });

  it("lässt einen Fund offen, wenn der Fixer nichts geändert hat", async () => {
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"], ["a.ts:1"]])],
      fixer: FIXT_NIE,
      grenzen: { maxRunden: 2 },
    });
    expect(p.befunde[0]?.zustand).toBe("offen");
  });
});

describe("Wiederholte Prüfung", () => {
  it("prüft alle bisherigen Befunde erneut, nicht nur die neuen", async () => {
    // Runde 1 findet A, Runde 2 findet B, Runde 3 findet A wieder: A ist in
    // Runde 2 verschwunden (also behoben) und danach zurück. Genau das ist der
    // Fall, den eine Schleife ohne Nachprüfung übersieht.
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"], ["b.ts:9"], ["a.ts:1"]])],
      fixer: FIXT_IMMER,
    });
    const a = p.befunde.find((b) => b.nachweis === "a.ts:1");
    expect(a?.zustand).toBe("wieder_aufgetreten");
  });

  it("erkennt, wenn ein Fix einen früheren Fix bricht", async () => {
    // Der teure Fall: der Fix für B macht A wieder kaputt. Ohne eigenen
    // Zustand dafür sähe der Lauf aus wie ein erfolgreicher.
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [
        angreiferMit("secret", [["a.ts:1"], [], ["a.ts:1"]]),
        angreiferMit("rls", [[], ["b.ts:9"], []]),
      ],
      fixer: FIXT_IMMER,
    });
    const a = p.befunde.find((b) => b.nachweis === "a.ts:1");
    expect(a?.zustand).toBe("wieder_aufgetreten");
    expect(p.endzustand).toBe("offene_punkte");
    expect(p.abbruchgrund).toBe("rundenlimit");
  });

  it("hält zwei Funde derselben Klasse an verschiedenen Stellen auseinander", async () => {
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1", "b.ts:2"]])],
      fixer: FIXT_NIE,
      grenzen: { maxRunden: 1 },
    });
    expect(p.befunde).toHaveLength(2);
    expect(new Set(p.befunde.map((b) => b.id)).size).toBe(2);
  });
});

describe("Das Protokoll", () => {
  it("entsteht auch ohne jeden Fund und ist gültig", async () => {
    // CLAUDE.md §2.1: „Ein leeres Protokoll ist ein gültiges Ergebnis, ein
    // fehlendes ist ein Fehler."
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [[]])],
      fixer: FIXT_NIE,
    });
    expect(() => Protokoll.parse(p)).not.toThrow();
    expect(p.befunde).toEqual([]);
    expect(p.gelaufene_klassen).toEqual(["secret"]);
  });

  it("hält immer den Datenvertrag ein", async () => {
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"], ["a.ts:1"], ["a.ts:1"]])],
      fixer: FIXT_IMMER,
    });
    expect(() => Protokoll.parse(p)).not.toThrow();
  });

  it("nennt jede gelaufene Klasse, auch die ohne Fund", async () => {
    // Sonst wäre „nichts gefunden" nicht von „nicht geprüft" zu unterscheiden.
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"]]), angreiferMit("rls", [[]])],
      fixer: FIXT_NIE,
      grenzen: { maxRunden: 1 },
    });
    expect(new Set(p.gelaufene_klassen)).toEqual(new Set(["secret", "rls"]));
  });

  it("protokolliert die Kosten je Runde und in der Summe", async () => {
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"], ["a.ts:1"]])],
      fixer: FIXT_NIE,
      grenzen: { maxRunden: 2 },
      kostenzaehler: zaehlerMit({ tokens_ein: 7, tokens_aus: 3, laufzeit_ms: 40 }),
    });
    expect(p.runden.map((r) => r.kosten.tokens_ein)).toEqual([7, 7]);
    expect(p.kosten_gesamt).toEqual({ tokens_ein: 14, tokens_aus: 6, laufzeit_ms: 80 });
  });
});

describe("Die Sandbox wird später eingehängt", () => {
  it("überspringt einen Angreifer, der eine Laufzeit braucht", async () => {
    const p = await schleifeLaufen({
      ziel: ZIEL, // ohne laufzeit
      angreifer: [angreiferMit("nur-mit-sandbox", [["x"]], true)],
      fixer: FIXT_NIE,
      grenzen: { maxRunden: 1 },
    });
    expect(p.befunde).toEqual([]);
  });

  it("nennt einen übersprungenen Angreifer nicht als geprüft", async () => {
    // Der Punkt: „geprüft auf X" ohne Prüfung wäre die Unwahrheit, die BYB
    // gerade nicht erzählen will.
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("statisch", [[]]), angreiferMit("mit-sandbox", [[]], true)],
      fixer: FIXT_NIE,
      grenzen: { maxRunden: 1 },
    });
    expect(p.gelaufene_klassen).toEqual(["statisch"]);
    expect(p.runden[0]?.gelaufene_klassen).toEqual(["statisch"]);
  });

  it("lässt denselben Angreifer laufen, sobald eine Laufzeit da ist", async () => {
    const mitLaufzeit: Ziel = {
      ...ZIEL,
      laufzeit: {
        basisUrl: "http://sandbox.local",
        anfragen: () => Promise.resolve(new Response("")),
      },
    };
    const p = await schleifeLaufen({
      ziel: mitLaufzeit,
      angreifer: [angreiferMit("mit-sandbox", [["y"]], true)],
      fixer: FIXT_NIE,
      grenzen: { maxRunden: 1 },
    });
    expect(p.gelaufene_klassen).toEqual(["mit-sandbox"]);
    expect(p.befunde).toHaveLength(1);
  });
});

describe("Der Angreifer bestimmt nicht die Buchführung", () => {
  it("vergibt IDs, Runde und Zeitstempel selbst", async () => {
    // Sonst hätte jeder Angreifer seine eigene Zählweise, und zwei könnten
    // dieselbe ID vergeben.
    let zeit = 1_700_000_000_000;
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1", "b.ts:2"]])],
      fixer: FIXT_NIE,
      grenzen: { maxRunden: 1 },
      jetzt: () => (zeit += 1000),
    });
    expect(p.befunde.map((b) => b.id)).toEqual(["lauf-1-1", "lauf-1-2"]);
    expect(p.befunde.every((b) => b.runde === 1)).toBe(true);
    expect(p.befunde.every((b) => b.zeitstempel > 1_700_000_000_000)).toBe(true);
  });

  it("bekommt die bisherigen Befunde zu sehen", async () => {
    const gesehen: number[] = [];
    const beobachter: Angreifer = {
      klasse: "beobachter",
      kategorie: "zugangsdaten",
      brauchtLaufzeit: false,
      angreifen: (_z, kontext) => {
        gesehen.push(kontext.bisherige.length);
        return Promise.resolve(kontext.runde === 1 ? [fund("a.ts:1")] : []);
      },
    };
    await schleifeLaufen({ ziel: ZIEL, angreifer: [beobachter], fixer: FIXT_NIE });
    // Drei Runden, weil der Fund offen bleibt: siehe den Test darunter.
    expect(gesehen).toEqual([0, 1, 1]);
  });
});

describe("Verschwinden ist kein Beleg", () => {
  it("nennt einen Fund nicht behoben, den nie jemand angefasst hat", async () => {
    // Runde 1 findet A, der Fixer kann nichts, Runde 2 findet A nicht mehr.
    // Verlockend wäre, A jetzt als behoben zu führen — aber niemand hat etwas
    // geändert. Wahrscheinlicher ist ein Angreifer, der nicht zuverlässig
    // findet. Ihn als behoben zu buchen hieße, ein Protokoll auszustellen,
    // das eine Behebung behauptet, die nicht stattgefunden hat.
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"], [], []])],
      fixer: FIXT_NIE,
    });
    expect(p.befunde[0]?.zustand).toBe("offen");
    expect(p.endzustand).toBe("offene_punkte");
    expect(p.abbruchgrund).toBe("rundenlimit");
  });

  it("nennt einen Fund behoben, wenn ein Fix davor lag", async () => {
    // Gegenprobe: mit Änderung ist das Verschwinden ein Beleg.
    const p = await schleifeLaufen({
      ziel: ZIEL,
      angreifer: [angreiferMit("secret", [["a.ts:1"], []])],
      fixer: FIXT_IMMER,
    });
    expect(p.befunde[0]?.zustand).toBe("behoben");
  });
});

describe("Nichts wird verändert, was nicht dem Lauf gehört", () => {
  it("lässt die übergebenen Dateien unangetastet", async () => {
    const dateien: Datei[] = [{ pfad: "a.ts", inhalt: "const x = 1;" }];
    const ziel: Ziel = { lauf_id: "l", dateien };
    await schleifeLaufen({
      ziel,
      angreifer: [angreiferMit("secret", [["a.ts:1"]])],
      fixer: FIXT_IMMER,
      grenzen: { maxRunden: 1 },
    });
    expect(dateien).toEqual([{ pfad: "a.ts", inhalt: "const x = 1;" }]);
  });
});
