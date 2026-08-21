/**
 * Der Katalog läuft nur, wenn schon etwas schiefgegangen ist. Genau deshalb
 * muss er robuster sein als der Normalfall: eine Hilfestellung, die selbst
 * abstürzt, nimmt dem Leser auch noch die ursprüngliche Fehlermeldung weg.
 */

import { describe, expect, it, vi } from "vitest";

import { aehnlichste, katalog, kennungenAus } from "./katalog.js";

const UMGEBUNG = {
  NV_API_KEY_1: "nvapi-beispielwert-fuer-den-test-0000",
  NVIDIA_BASE_URL: "https://beispiel.test/v1",
};

function antwortMit(koerper: unknown, ok = true, status = 200): typeof fetch {
  return vi.fn(() =>
    Promise.resolve({
      ok, status,
      json: () => Promise.resolve(koerper),
    }),
  ) as unknown as typeof fetch;
}

describe("kennungenAus", () => {
  it("liest die Kennungen und sortiert sie", () => {
    expect(kennungenAus({ data: [{ id: "z/b" }, { id: "a/x" }] }))
      .toEqual(["a/x", "z/b"]);
  });

  it.each([
    ["null", null],
    ["kein Objekt", "text"],
    ["ohne data", { modelle: [] }],
    ["data ist kein Array", { data: { id: "a" } }],
    ["Eintrag ohne id", { data: [{ name: "a" }] }],
    ["id ist keine Zeichenkette", { data: [{ id: 7 }] }],
    ["id ist leer", { data: [{ id: "" }] }],
  ])("gibt bei %s eine leere Liste statt zu werfen", (_fall, koerper) => {
    expect(kennungenAus(koerper)).toEqual([]);
  });

  it("überspringt kaputte Einträge, behält die guten", () => {
    // Ein Anbieter darf sein Format ändern. Ein einziger unbrauchbarer Eintrag
    // darf nicht die ganze Liste kosten — sonst steht wieder nichts da.
    expect(kennungenAus({ data: [{ id: "gut/eins" }, null, { id: 3 }, { id: "gut/zwei" }] }))
      .toEqual(["gut/eins", "gut/zwei"]);
  });
});

describe("aehnlichste", () => {
  const vorhanden = [
    "meta/llama-4-70b",
    "moonshot/laguna-xs-2.1",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "stepfun/step-3.7-flash",
  ];

  it("findet dasselbe Modell bei anderem Herausgeber", () => {
    // Der eigentliche Anlass für dieses Modul: der Name stimmt, das Präfix
    // nicht. Zeichenabstand würde das schlecht finden — die halbe Zeichenkette
    // ist verschoben, obwohl sich kein Wort geändert hat.
    expect(aehnlichste("nvidia/laguna-xs-2.1", vorhanden)[0])
      .toBe("moonshot/laguna-xs-2.1");
    expect(aehnlichste("nvidia/step-3.7-flash", vorhanden)[0])
      .toBe("stepfun/step-3.7-flash");
  });

  it("gibt nichts zurück, wenn nichts passt", () => {
    expect(aehnlichste("völlig/anderes", vorhanden)).toEqual([]);
  });

  it("hält sich an die Anzahl", () => {
    expect(aehnlichste("nvidia/x", ["nvidia/a", "nvidia/b", "nvidia/c"], 2))
      .toHaveLength(2);
  });
});

describe("katalog", () => {
  it("fragt das Verzeichnis und gibt die Kennungen zurück", async () => {
    const hole = antwortMit({ data: [{ id: "b/2" }, { id: "a/1" }] });
    const namen = await katalog("nvApiKey1", { umgebung: UMGEBUNG, fetchImpl: hole });
    expect(namen).toEqual(["a/1", "b/2"]);
    expect(hole).toHaveBeenCalledWith(
      "https://beispiel.test/v1/models",
      expect.objectContaining({
        headers: { Authorization: `Bearer ${UMGEBUNG.NV_API_KEY_1}` },
      }),
    );
  });

  it("gibt eine leere Liste zurück, wenn der Zugang fehlt", async () => {
    const hole = antwortMit({ data: [{ id: "a/1" }] });
    expect(await katalog("nvApiKey1", { umgebung: {}, fetchImpl: hole })).toEqual([]);
    // Und fragt gar nicht erst — ein Aufruf ohne Schlüssel ist ein garantierter
    // 401 und verschleiert im Protokoll, was wirklich fehlt.
    expect(hole).not.toHaveBeenCalled();
  });

  it("gibt eine leere Liste zurück, wenn der Anbieter ablehnt", async () => {
    const hole = antwortMit({}, false, 403);
    expect(await katalog("nvApiKey1", { umgebung: UMGEBUNG, fetchImpl: hole })).toEqual([]);
  });

  it("reicht keine Netzausnahme durch", async () => {
    // Dieselbe Regel wie in nvidia.ts: eine Ausnahme kann die Anfrage samt
    // Kopfzeilen tragen — und damit den Schlüssel. Hier steht er im Text.
    const hole = vi.fn(() =>
      Promise.reject(new Error(`connect failed: Bearer ${UMGEBUNG.NV_API_KEY_1}`)),
    ) as unknown as typeof fetch;
    const namen = await katalog("nvApiKey1", { umgebung: UMGEBUNG, fetchImpl: hole });
    expect(namen).toEqual([]);
    expect(JSON.stringify(namen)).not.toContain("nvapi-");
  });

  it("wirft auch bei kaputtem JSON nicht", async () => {
    const hole = vi.fn(() =>
      Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.reject(new Error("kein JSON")),
      } as unknown as Response),
    ) as unknown as typeof fetch;
    expect(await katalog("nvApiKey1", { umgebung: UMGEBUNG, fetchImpl: hole })).toEqual([]);
  });
});
