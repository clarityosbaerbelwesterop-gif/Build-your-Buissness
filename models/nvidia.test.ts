/**
 * Die Modellanbindung, ohne Netz.
 *
 * Ein Test, der ein echtes Modell anruft, ist langsam, kostet Geld und schlägt
 * fehl, wenn gerade jemand anderes das Kontingent aufbraucht. Ob die Schlüssel
 * wirklich gelten, beantwortet der Rauchtest in der CI — hier geht es darum,
 * was die Anbindung mit den Antworten macht, die sie bekommt.
 */

import { describe, expect, it, vi } from "vitest";

import { ZugangFehlt } from "../config/zugaenge.js";
import { MODELLE, ModellFehler, fragen, modellFuer, rolleVerfuegbar } from "./nvidia.js";

const UMGEBUNG = {
  NV_API_KEY_1: "nvapi-eins",
  NV_API_KEY_2: "nvapi-zwei",
  NV_API_KEY_3: "nvapi-drei",
};

function antwortMit(koerper: unknown, status = 200) {
  return vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(koerper), {
      status,
      headers: { "Content-Type": "application/json" },
    })),
  );
}

const GUT = {
  choices: [{ message: { content: "Ein Satz." } }],
  usage: { prompt_tokens: 12, completion_tokens: 4 },
};

describe("Die Zuordnung Rolle → Modell", () => {
  it("kennt drei Rollen mit je eigenem Schlüssel", () => {
    // Getrennte Schlüssel sind der Punkt: ein abgelaufener lässt genau ein
    // Modell ausfallen statt aller drei.
    expect(MODELLE).toHaveLength(3);
    const zugaenge = MODELLE.map((m) => m.zugang);
    expect(new Set(zugaenge).size).toBe(3);
  });

  it("bildet die Rollen auf die vereinbarten Modelle ab", () => {
    // Ganze Kennung, nicht nur der Modellname: der Herausgeber davor war der
    // Fehler, den der Rauchtest gefunden hat, und ein toContain auf dem
    // Modellnamen wäre auch mit dem falschen Präfix grün gewesen.
    expect(modellFuer("schwer").kennung).toBe("nvidia/nemotron-3-ultra-550b-a55b");
    expect(modellFuer("mittel").kennung).toBe("poolside/laguna-xs-2.1");
    expect(modellFuer("schnell").kennung).toBe("stepfun-ai/step-3.7-flash");
  });

  it("sagt, ob eine Rolle verfügbar ist, ohne den Schlüssel zu lesen", () => {
    expect(rolleVerfuegbar("schwer", UMGEBUNG)).toBe(true);
    expect(rolleVerfuegbar("schwer", {})).toBe(false);
  });
});

describe("Eine Anfrage", () => {
  it("geht mit dem Schlüssel der gewählten Rolle raus", async () => {
    const hole = antwortMit(GUT);
    await fragen("mittel", { prompt: "Hallo" }, { umgebung: UMGEBUNG, fetchImpl: hole });

    const [url, init] = hole.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    const kopf = init.headers as Record<string, string>;
    expect(kopf["Authorization"]).toBe("Bearer nvapi-zwei");
    const koerper = JSON.parse(init.body as string) as { model: string };
    expect(koerper.model).toContain("laguna");
  });

  it("stellt einen Systemtext voran, wenn es einen gibt", async () => {
    const hole = antwortMit(GUT);
    await fragen("schnell", { system: "Sei knapp.", prompt: "Was ist das?" },
                 { umgebung: UMGEBUNG, fetchImpl: hole });
    const [, init] = hole.mock.calls[0] as unknown as [string, RequestInit];
    const koerper = JSON.parse(init.body as string) as { messages: { role: string }[] };
    expect(koerper.messages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("liefert Text und Tokenzahlen zurück", async () => {
    const a = await fragen("schwer", { prompt: "x" },
                           { umgebung: UMGEBUNG, fetchImpl: antwortMit(GUT) });
    expect(a.text).toBe("Ein Satz.");
    expect(a.tokensEin).toBe(12);
    expect(a.tokensAus).toBe(4);
  });

  it("fragt gar nicht erst, wenn der Schlüssel fehlt", async () => {
    // Ein Aufruf ohne Schlüssel liefert einen 401 von einem fremden Dienst —
    // und diese Meldung erklärt niemandem, dass ein Secret fehlt.
    const hole = antwortMit(GUT);
    await expect(fragen("schwer", { prompt: "x" }, { umgebung: {}, fetchImpl: hole }))
      .rejects.toBeInstanceOf(ZugangFehlt);
    expect(hole).not.toHaveBeenCalled();
  });
});

describe("Wenn etwas schiefgeht", () => {
  it("erklärt einen abgelehnten Zugang und nennt den Secret-Namen", async () => {
    const fehler = await fragen("schwer", { prompt: "x" },
                                { umgebung: UMGEBUNG, fetchImpl: antwortMit({}, 401) })
      .catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(ModellFehler);
    expect((fehler as Error).message).toContain("nvApiKey1");
    expect((fehler as Error).message).toContain("abgelaufen");
  });

  it("unterscheidet fehlendes Modell von erschöpftem Kontingent", async () => {
    const vierNullVier = await fragen("mittel", { prompt: "x" },
                                      { umgebung: UMGEBUNG, fetchImpl: antwortMit({}, 404) })
      .catch((e: unknown) => (e as Error).message);
    expect(vierNullVier).toContain("gibt es unter dieser Kennung nicht");

    const gedrosselt = await fragen("mittel", { prompt: "x" },
                                    { umgebung: UMGEBUNG, fetchImpl: antwortMit({}, 429) })
      .catch((e: unknown) => (e as Error).message);
    expect(gedrosselt).toContain("Kontingent");
  });

  it("nennt den Schlüssel in keiner Fehlermeldung", async () => {
    // Fehlermeldungen landen im Protokoll eines CI-Laufs, das jeder mit
    // Repo-Zugriff lesen kann.
    for (const status of [401, 404, 429, 500]) {
      const text = await fragen("schwer", { prompt: "x" },
                                { umgebung: UMGEBUNG, fetchImpl: antwortMit({}, status) })
        .catch((e: unknown) => (e as Error).message);
      expect(text).not.toContain("nvapi-eins");
    }
  });

  it("hält eine Antwort ohne Text nicht für eine Antwort", async () => {
    // Ein Anbieter darf sein Format ändern. Ohne Prüfung wandert `undefined`
    // als leerer Text weiter und sieht aus wie eine inhaltslose Antwort.
    for (const kaputt of [{}, { choices: [] }, { choices: [{ message: {} }] },
                          { choices: [{ message: { content: "" } }] }]) {
      await expect(fragen("schnell", { prompt: "x" },
                          { umgebung: UMGEBUNG, fetchImpl: antwortMit(kaputt) }))
        .rejects.toBeInstanceOf(ModellFehler);
    }
  });

  it("erfindet keine Tokenzahlen, wenn der Anbieter keine liefert", async () => {
    const a = await fragen("schnell", { prompt: "x" }, {
      umgebung: UMGEBUNG,
      fetchImpl: antwortMit({ choices: [{ message: { content: "Da." } }] }),
    });
    expect(a.tokensEin).toBe(0);
    expect(a.tokensAus).toBe(0);
  });

  it("gibt auf, statt ewig zu warten", async () => {
    // Ohne Zeitgrenze hängt ein Lauf an einem Modell, das nicht antwortet —
    // und der Kostendeckel der Schleife greift nicht, weil er erst nach der
    // Runde bucht.
    const haengt: typeof fetch = (_url, init) =>
      new Promise((_loesen, ablehnen) => {
        (init as RequestInit).signal?.addEventListener("abort", () => {
          ablehnen(new DOMException("aborted", "AbortError"));
        });
      });

    const fehler = await fragen("schwer", { prompt: "x" },
                                { umgebung: UMGEBUNG, fetchImpl: haengt, zeitgrenzeMs: 20 })
      .catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(ModellFehler);
    expect((fehler as Error).message).toContain("Keine Antwort innerhalb");
  });

  it("reicht eine Netzausnahme nicht durch, sondern ersetzt sie", async () => {
    // Eine weitergereichte Ausnahme kann alles Mögliche enthalten — im
    // schlimmsten Fall die Anfrage samt Kopfzeilen.
    const kaputt: typeof fetch = () =>
      Promise.reject(new Error("connect ECONNREFUSED nvapi-eins@host"));
    const text = await fragen("schwer", { prompt: "x" },
                              { umgebung: UMGEBUNG, fetchImpl: kaputt })
      .catch((e: unknown) => (e as Error).message);
    expect(text).not.toContain("nvapi-eins");
    expect(text).toContain("nicht erreichbar");
  });
});
