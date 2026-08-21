/**
 * Die Modelle. Drei Endpunkte bei NVIDIA, drei getrennte Schlüssel.
 *
 * Warum getrennt und nicht ein Schlüssel für alle: sie sind es in den Secrets
 * auch, und ein abgelaufener Schlüssel lässt dann genau ein Modell ausfallen
 * statt aller drei. Das ist der Unterschied zwischen „ein Angreifer läuft
 * heute nicht" und „der ganze Lauf fällt aus".
 *
 * Die Rollen sind bewusst vergeben, nicht beliebig:
 *
 * * **schwer** — das große Modell. Für Aufgaben, bei denen ein Fehler teuer
 *   ist: einen Fund beurteilen, einen Fix schreiben.
 * * **mittel** — der Alltag.
 * * **schnell** — Aufgaben, bei denen Tempo mehr zählt als Tiefe: eine
 *   Zusammenfassung, eine Einordnung.
 *
 * Der Aufrufer wählt eine **Rolle**, kein Modell. Sonst steht der Modellname
 * verstreut im Code, und ein Wechsel wird zur Suche.
 */

import { zugang, zugangVorhanden, type ZugangsName } from "../config/zugaenge.js";

export type Rolle = "schwer" | "mittel" | "schnell";

interface Modell {
  readonly rolle: Rolle;
  /** Modellkennung beim Anbieter. */
  readonly kennung: string;
  /** Welcher Zugang dazugehört. */
  readonly zugang: ZugangsName;
}

/**
 * Die Kennung ist `<herausgeber>/<modell>` — und der Herausgeber ist **nicht**
 * immer `nvidia`. NVIDIA betreibt den Endpunkt, die Modelle stammen von
 * verschiedenen Häusern.
 *
 * Ich hatte hier zunächst überall `nvidia/` stehen, abgeleitet aus dem ersten
 * Modell. Der Rauchtest hat zwei davon als nicht vorhanden gemeldet, und das
 * Verzeichnis des Anbieters hat die richtigen Namen geliefert. Wer eine
 * Kennung ändert, prüft sie mit `npm run rauchtest` nach — geraten wird sie
 * nicht noch einmal.
 */
export const MODELLE: readonly Modell[] = [
  { rolle: "schwer", kennung: "nvidia/nemotron-3-ultra-550b-a55b", zugang: "nvApiKey1" },
  { rolle: "mittel", kennung: "poolside/laguna-xs-2.1", zugang: "nvApiKey2" },
  { rolle: "schnell", kennung: "stepfun-ai/step-3.7-flash", zugang: "nvApiKey3" },
];

const NACH_ROLLE = new Map(MODELLE.map((m) => [m.rolle, m]));

/**
 * Wie lange auf eine Antwort gewartet wird.
 *
 * Ohne Grenze hängt ein Lauf an einem Modell, das nicht antwortet — und der
 * Kostendeckel der Schleife greift nicht, weil er Tokens und Laufzeit erst
 * **nach** der Runde bucht.
 */
export const ZEITGRENZE_MS = 120_000;

export class ModellFehler extends Error {
  readonly rolle: Rolle;
  readonly status: number;

  constructor(rolle: Rolle, status: number, text: string) {
    super(text);
    this.name = "ModellFehler";
    this.rolle = rolle;
    this.status = status;
  }
}

export interface Antwort {
  readonly text: string;
  readonly tokensEin: number;
  readonly tokensAus: number;
  readonly modell: string;
}

export function modellFuer(rolle: Rolle): Modell {
  const modell = NACH_ROLLE.get(rolle);
  if (modell === undefined) throw new Error(`Unbekannte Rolle: ${rolle}`);
  return modell;
}

/** Ist der Zugang für diese Rolle hinterlegt? Ohne ihn zu lesen. */
export function rolleVerfuegbar(
  rolle: Rolle,
  umgebung: Record<string, string | undefined> = process.env,
): boolean {
  return zugangVorhanden(modellFuer(rolle).zugang, umgebung);
}

/**
 * Zustände, bei denen ein zweiter Versuch etwas ändern kann.
 *
 * Der Anlass ist gemessen, nicht gedacht: derselbe Rauchtest, der ein Modell
 * um 10:15 in 1550 ms beantwortet bekam, bekam um 10:21 für dasselbe Modell
 * ein **503**. Nichts an der Anfrage war anders — der Anbieter war kurz nicht
 * verfügbar.
 *
 * Ohne Wiederholung entscheidet damit eine Sekunde Fremdausfall über einen
 * ganzen Lauf. Bei einem Produkt, dessen Zusage „die KI macht es und du
 * schaust zu" lautet, ist das die falsche Sorte Fehlschlag: der Nutzer sieht
 * einen abgebrochenen Auftrag und kann nichts tun.
 *
 * Bewusst **nicht** dabei: 400, 401, 403, 404. Die ändern sich beim zweiten
 * Versuch nicht — ein falscher Schlüssel bleibt falsch, ein Modellname, den es
 * nicht gibt, entsteht nicht durch Warten. Sie zu wiederholen kostet nur Zeit
 * und verschleiert im Protokoll, was wirklich los war.
 */
const WIEDERHOLBAR: ReadonlySet<number> = new Set([429, 500, 502, 503, 504]);

/** Wie oft insgesamt versucht wird. Drei Versuche, zwei Pausen. */
const VERSUCHE = 3;

/** Grundpause; verdoppelt sich je Versuch (1 s, 2 s). */
const PAUSE_MS = 1_000;

function warten(ms: number): Promise<void> {
  return new Promise((fertig) => setTimeout(fertig, ms));
}

/**
 * Wie lange bis zum nächsten Versuch.
 *
 * `Retry-After` des Anbieters geht vor: bei 429 weiß er besser als wir, wann
 * das Kontingent wieder greift. Gedeckelt, damit eine unsinnige Angabe
 * („3600") den Lauf nicht stillstehen lässt.
 */
function pauseAus(
  antwort: Response,
  versuch: number,
  deckelMs: number,
  grundMs: number,
): number {
  const angabe = antwort.headers.get("retry-after");
  if (angabe !== null) {
    const sekunden = Number(angabe);
    if (Number.isFinite(sekunden) && sekunden > 0) {
      return Math.min(sekunden * 1000, deckelMs);
    }
  }
  return Math.min(grundMs * 2 ** (versuch - 1), deckelMs);
}

/**
 * Eine Anfrage an ein Modell.
 *
 * `fetchImpl` ist einsetzbar, damit Tests ohne Netz auskommen — ein Test, der
 * ein echtes Modell anruft, ist langsam, kostet Geld und schlägt fehl, wenn
 * gerade jemand anderes das Kontingent aufbraucht.
 *
 * Bei einem vorübergehenden Fehlschlag wird bis zu dreimal versucht (siehe
 * `WIEDERHOLBAR`). `zeitgrenzeMs` gilt dabei für den **ganzen** Vorgang, nicht
 * je Versuch — sonst verdreifacht die Wiederholung still die Wartezeit, und
 * der Kostendeckel der Schleife greift erst nach der Runde.
 */
export async function fragen(
  rolle: Rolle,
  auftrag: { readonly system?: string; readonly prompt: string },
  optionen: {
    readonly umgebung?: Record<string, string | undefined>;
    readonly fetchImpl?: typeof fetch;
    readonly zeitgrenzeMs?: number;
    /**
     * Grundpause zwischen zwei Versuchen. Nur für Tests da — aus demselben
     * Grund wie `fetchImpl`: eine Testreihe, die echte Sekunden verwartet,
     * wird irgendwann übersprungen, und ein übersprungener Test prüft nichts.
     */
    readonly pauseGrundMs?: number;
  } = {},
): Promise<Antwort> {
  const modell = modellFuer(rolle);
  const umgebung = optionen.umgebung ?? process.env;
  const schluessel = zugang(modell.zugang, umgebung);   // wirft, wenn er fehlt
  const basis = zugang("nvidiaBaseUrl", umgebung).replace(/\/+$/, "");
  const hole = optionen.fetchImpl ?? fetch;

  const nachrichten: { role: string; content: string }[] = [];
  if (auftrag.system !== undefined) {
    nachrichten.push({ role: "system", content: auftrag.system });
  }
  nachrichten.push({ role: "user", content: auftrag.prompt });

  const gesamtMs = optionen.zeitgrenzeMs ?? ZEITGRENZE_MS;
  const frist = Date.now() + gesamtMs;

  for (let versuch = 1; ; versuch++) {
    // Der verbleibende Rest der Gesamtfrist, nicht die volle Frist: sonst darf
    // Versuch 3 noch einmal so lange laufen wie Versuch 1, und aus einer
    // Zeitgrenze von 120 s werden im schlechtesten Fall 360 s.
    const restMs = frist - Date.now();
    if (restMs <= 0) {
      throw new ModellFehler(
        rolle, 0,
        `${modell.kennung}: Keine Antwort innerhalb von ${gesamtMs / 1000} s`,
      );
    }

    const abbruch = new AbortController();
    const wecker = setTimeout(() => { abbruch.abort(); }, restMs);

    let antwort: Response;
    try {
      antwort = await hole(`${basis}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${schluessel}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modell.kennung,
          messages: nachrichten,
          temperature: 0.2,
        }),
        signal: abbruch.signal,
      });
    } catch {
      // Die Ausnahme wird bewusst nicht angesehen und nicht durchgereicht: sie
      // kann alles Moegliche enthalten, im schlimmsten Fall die Anfrage samt
      // Kopfzeilen — und damit den Schluessel.
      const grund = abbruch.signal.aborted
        ? `Keine Antwort innerhalb von ${gesamtMs / 1000} s`
        : "Endpunkt nicht erreichbar";
      throw new ModellFehler(rolle, 0, `${modell.kennung}: ${grund}`);
    } finally {
      clearTimeout(wecker);
    }

    if (antwort.ok) {
      const koerper: unknown = await antwort.json();
      return auslesen(modell, koerper);
    }

    const letzter = versuch >= VERSUCHE;
    if (letzter || !WIEDERHOLBAR.has(antwort.status)) {
      throw new ModellFehler(rolle, antwort.status, erklaerung(modell, antwort.status));
    }

    const pause = pauseAus(
      antwort,
      versuch,
      Math.max(frist - Date.now(), 0),
      optionen.pauseGrundMs ?? PAUSE_MS,
    );
    if (pause <= 0) {
      throw new ModellFehler(rolle, antwort.status, erklaerung(modell, antwort.status));
    }
    await warten(pause);
  }
}

function erklaerung(modell: Modell, status: number): string {
  if (status === 401 || status === 403) {
    return `${modell.kennung}: Zugang abgelehnt. Der Schlüssel in `
      + `${modell.zugang} ist abgelaufen oder gilt nicht für dieses Modell.`;
  }
  if (status === 404) {
    return `${modell.kennung}: Dieses Modell gibt es unter dieser Kennung nicht.`;
  }
  if (status === 429) {
    return `${modell.kennung}: Kontingent erschöpft oder gedrosselt `
      + `(${VERSUCHE} Versuche).`;
  }
  if (WIEDERHOLBAR.has(status)) {
    // Der Unterschied ist wichtig: „abgelehnt" klingt nach unserem Fehler,
    // „nicht verfügbar" ist einer beim Anbieter. Wer das liest, soll nicht
    // anfangen, an der eigenen Konfiguration zu suchen.
    return `${modell.kennung}: Anbieter nicht verfügbar (HTTP ${status}, `
      + `${VERSUCHE} Versuche).`;
  }
  return `${modell.kennung}: Anfrage abgelehnt (HTTP ${status}).`;
}

/**
 * Die Antwort auslesen — mit Prüfung statt Vertrauen.
 *
 * Ein Modellanbieter darf sein Antwortformat ändern, und dann ist
 * `daten.choices[0].message.content` `undefined`. Ohne Prüfung wandert das als
 * leerer Text weiter und sieht aus wie eine Antwort ohne Inhalt.
 */
function auslesen(modell: Modell, koerper: unknown): Antwort {
  if (typeof koerper !== "object" || koerper === null) {
    throw new ModellFehler(modell.rolle, 200, `${modell.kennung}: Antwort ist kein Objekt.`);
  }
  const daten = koerper as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const inhalt = daten.choices?.[0]?.message?.content;
  if (typeof inhalt !== "string" || inhalt.length === 0) {
    throw new ModellFehler(
      modell.rolle,
      200,
      `${modell.kennung}: Antwort enthält keinen Text.`,
    );
  }
  return {
    text: inhalt,
    tokensEin: zahl(daten.usage?.prompt_tokens),
    tokensAus: zahl(daten.usage?.completion_tokens),
    modell: modell.kennung,
  };
}

function zahl(wert: unknown): number {
  return typeof wert === "number" && Number.isFinite(wert) ? Math.trunc(wert) : 0;
}
