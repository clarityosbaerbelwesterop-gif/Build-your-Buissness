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
 * Eine Anfrage an ein Modell.
 *
 * `fetchImpl` ist einsetzbar, damit Tests ohne Netz auskommen — ein Test, der
 * ein echtes Modell anruft, ist langsam, kostet Geld und schlägt fehl, wenn
 * gerade jemand anderes das Kontingent aufbraucht.
 */
export async function fragen(
  rolle: Rolle,
  auftrag: { readonly system?: string; readonly prompt: string },
  optionen: {
    readonly umgebung?: Record<string, string | undefined>;
    readonly fetchImpl?: typeof fetch;
    readonly zeitgrenzeMs?: number;
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

  const abbruch = new AbortController();
  const wecker = setTimeout(
    () => { abbruch.abort(); },
    optionen.zeitgrenzeMs ?? ZEITGRENZE_MS,
  );

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
      ? `Keine Antwort innerhalb von ${(optionen.zeitgrenzeMs ?? ZEITGRENZE_MS) / 1000} s`
      : "Endpunkt nicht erreichbar";
    throw new ModellFehler(rolle, 0, `${modell.kennung}: ${grund}`);
  } finally {
    clearTimeout(wecker);
  }

  if (!antwort.ok) {
    throw new ModellFehler(rolle, antwort.status, erklaerung(modell, antwort.status));
  }

  const koerper: unknown = await antwort.json();
  return auslesen(modell, koerper);
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
    return `${modell.kennung}: Kontingent erschöpft oder gedrosselt.`;
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
