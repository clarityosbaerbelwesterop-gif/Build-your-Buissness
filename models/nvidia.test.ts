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

    const gedrosselt = await fragen("mittel", { prompt: "x" }, {
      umgebung: UMGEBUNG, fetchImpl: antwortMit({}, 429), pauseGrundMs: 1,
    }).catch((e: unknown) => (e as Error).message);
    expect(gedrosselt).toContain("Kontingent");
  });

  it("nennt den Schlüssel in keiner Fehlermeldung", async () => {
    // Fehlermeldungen landen im Protokoll eines CI-Laufs, das jeder mit
    // Repo-Zugriff lesen kann.
    for (const status of [401, 404, 429, 500]) {
      const text = await fragen("schwer", { prompt: "x" }, {
        umgebung: UMGEBUNG, fetchImpl: antwortMit({}, status), pauseGrundMs: 1,
      }).catch((e: unknown) => (e as Error).message);
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

describe("Wiederholung bei vorübergehendem Fehlschlag", () => {
  /** Antwortet der Reihe nach mit den angegebenen Status. */
  function nacheinander(...status: number[]) {
    let i = 0;
    return vi.fn(() => {
      const jetzt = status[i] ?? 500;
      i++;
      return Promise.resolve(
        jetzt === 200
          ? new Response(JSON.stringify(GUT), {
              status: 200, headers: { "Content-Type": "application/json" },
            })
          : new Response("", { status: jetzt }),
      );
    });
  }

  it("versucht es nach einem 503 erneut und liefert die Antwort", async () => {
    // Der gemessene Anlass: dasselbe Modell antwortete um 10:15 in 1550 ms und
    // gab um 10:21 ein 503. Ohne Wiederholung entscheidet eine Sekunde
    // Fremdausfall über einen ganzen Lauf.
    const hole = nacheinander(503, 200);
    const antwort = await fragen("schwer", { prompt: "hallo" }, {
      umgebung: UMGEBUNG, fetchImpl: hole as unknown as typeof fetch,
      zeitgrenzeMs: 5_000, pauseGrundMs: 1,
    });
    expect(antwort.text).toBe("Ein Satz.");
    expect(hole).toHaveBeenCalledTimes(2);
  });

  it.each([429, 500, 502, 503, 504])("wiederholt bei %i", async (status) => {
    const hole = nacheinander(status, 200);
    await fragen("schwer", { prompt: "x" }, {
      umgebung: UMGEBUNG, fetchImpl: hole as unknown as typeof fetch,
      zeitgrenzeMs: 5_000, pauseGrundMs: 1,
    });
    expect(hole).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404])("wiederholt NICHT bei %i", async (status) => {
    // Ein falscher Schlüssel bleibt falsch, und ein Modellname, den es nicht
    // gibt, entsteht nicht durch Warten. Wiederholen kostet hier nur Zeit und
    // verschleiert im Protokoll, was wirklich los war.
    const hole = nacheinander(status, 200);
    await expect(
      fragen("schwer", { prompt: "x" }, {
        umgebung: UMGEBUNG, fetchImpl: hole as unknown as typeof fetch,
        zeitgrenzeMs: 5_000, pauseGrundMs: 1,
      }),
    ).rejects.toBeInstanceOf(ModellFehler);
    expect(hole).toHaveBeenCalledTimes(1);
  });

  it("gibt nach drei Versuchen auf", async () => {
    const hole = nacheinander(503, 503, 503, 200);
    await expect(
      fragen("schwer", { prompt: "x" }, {
        umgebung: UMGEBUNG, fetchImpl: hole as unknown as typeof fetch,
        zeitgrenzeMs: 10_000, pauseGrundMs: 1,
      }),
    ).rejects.toThrow(/nicht verfügbar/);
    expect(hole).toHaveBeenCalledTimes(3);
  });

  it("nennt beim Aufgeben den Anbieter, nicht die eigene Anfrage", async () => {
    // „abgelehnt" klingt nach unserem Fehler, „nicht verfügbar" ist einer beim
    // Anbieter. Wer das liest, soll nicht an der eigenen Konfiguration suchen.
    const hole = nacheinander(503, 503, 503);
    let meldung = "";
    try {
      await fragen("schwer", { prompt: "x" }, {
        umgebung: UMGEBUNG, fetchImpl: hole as unknown as typeof fetch,
        zeitgrenzeMs: 10_000, pauseGrundMs: 1,
      });
    } catch (fehler) {
      meldung = (fehler as Error).message;
    }
    expect(meldung).toContain("Anbieter nicht verfügbar");
    expect(meldung).toContain("3 Versuche");
    expect(meldung).not.toContain("abgelehnt");
  });

  it("achtet auf Retry-After statt auf die eigene Pause", async () => {
    let i = 0;
    const hole = vi.fn(() => {
      i++;
      return Promise.resolve(
        i === 1
          ? new Response("", { status: 429, headers: { "Retry-After": "0.05" } })
          : new Response(JSON.stringify(GUT), {
              status: 200, headers: { "Content-Type": "application/json" },
            }),
      );
    });
    const begonnen = Date.now();
    await fragen("schwer", { prompt: "x" }, {
      // Grundpause 1000 ms: der Test zeigt nur dann etwas, wenn Retry-After
      // (50 ms) sie tatsächlich verdrängt.
      umgebung: UMGEBUNG, fetchImpl: hole as unknown as typeof fetch,
      zeitgrenzeMs: 5_000, pauseGrundMs: 1_000,
    });
    // Bei 429 weiß der Anbieter besser als wir, wann sein Kontingent greift.
    // 50 ms statt der eigenen 1000 ms Grundpause.
    expect(Date.now() - begonnen).toBeLessThan(800);
  });

  it("lässt eine unsinnige Retry-After-Angabe nicht den Lauf anhalten", async () => {
    // „3600" wäre eine Stunde. Die Gesamtfrist deckelt das.
    const hole = vi.fn(() =>
      Promise.resolve(new Response("", {
        status: 503, headers: { "Retry-After": "3600" },
      })),
    );
    const begonnen = Date.now();
    await expect(
      fragen("schwer", { prompt: "x" }, {
        umgebung: UMGEBUNG, fetchImpl: hole as unknown as typeof fetch,
        zeitgrenzeMs: 300,
      }),
    ).rejects.toBeInstanceOf(ModellFehler);
    expect(Date.now() - begonnen).toBeLessThan(2_000);
  });

  it("die Zeitgrenze gilt für den ganzen Vorgang, nicht je Versuch", async () => {
    // Sonst verdreifacht die Wiederholung still die Wartezeit — und der
    // Kostendeckel der Schleife greift erst nach der Runde.
    const hole = vi.fn(() =>
      Promise.resolve(new Response("", { status: 503 })),
    );
    const begonnen = Date.now();
    await expect(
      fragen("schwer", { prompt: "x" }, {
        umgebung: UMGEBUNG, fetchImpl: hole as unknown as typeof fetch,
        zeitgrenzeMs: 400,
      }),
    ).rejects.toBeInstanceOf(ModellFehler);
    const gedauert = Date.now() - begonnen;
    expect(gedauert).toBeLessThan(1_500);
  });
});
