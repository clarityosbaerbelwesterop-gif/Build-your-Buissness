/**
 * Welche Modelle kennt der Anbieter unter einem Schlüssel?
 *
 * Gebaut aus einem konkreten Anlass: der Rauchtest meldete für zwei von drei
 * Modellen „Dieses Modell gibt es unter dieser Kennung nicht" — richtig, aber
 * eine Sackgasse. Wer das liest, weiß nicht, ob der Name falsch geschrieben
 * ist, ob das Modell woanders liegt oder ob der Schlüssel es nicht darf.
 *
 * Ein Fehler, der nur sagt „geht nicht", kostet den nächsten Menschen eine
 * Stunde Suchen. Ein Fehler, der die vorhandenen Kennungen daneben legt,
 * kostet ihn eine Zeile Vergleich. Das ist derselbe Anspruch, den BYB an seine
 * eigenen Prüfprotokolle stellt (CLAUDE.md §2.2: geprüft auf X, gefunden Y).
 *
 * Ausgegeben werden nur Modellkennungen — nie der Schlüssel, mit dem gefragt
 * wurde. Das Protokoll eines CI-Laufs ist für jeden lesbar, der Zugriff auf
 * das Repository hat.
 */

import { zugang, type ZugangsName } from "../config/zugaenge.js";

/** Wie lange auf die Liste gewartet wird. Kürzer als bei einer Anfrage: das
 *  ist ein Verzeichnis, kein Modelllauf. */
const ZEITGRENZE_MS = 30_000;

/**
 * Die Modellkennungen, die unter diesem Zugang erreichbar sind.
 *
 * Wirft nicht. Ein Katalog, der beim Scheitern die Ausgabe abbricht, macht aus
 * einer Hilfestellung ein zweites Problem — der eigentliche Fehler stünde dann
 * gar nicht mehr da.
 */
export async function katalog(
  zugangsName: ZugangsName,
  optionen: {
    readonly umgebung?: Record<string, string | undefined>;
    readonly fetchImpl?: typeof fetch;
  } = {},
): Promise<readonly string[]> {
  const umgebung = optionen.umgebung ?? process.env;
  const hole = optionen.fetchImpl ?? fetch;

  let schluessel: string;
  let basis: string;
  try {
    schluessel = zugang(zugangsName, umgebung);
    basis = zugang("nvidiaBaseUrl", umgebung).replace(/\/+$/, "");
  } catch {
    return [];
  }

  const abbruch = new AbortController();
  const wecker = setTimeout(() => { abbruch.abort(); }, ZEITGRENZE_MS);
  try {
    const antwort = await hole(`${basis}/models`, {
      headers: { Authorization: `Bearer ${schluessel}` },
      signal: abbruch.signal,
    });
    if (!antwort.ok) return [];
    const koerper: unknown = await antwort.json();
    return kennungenAus(koerper);
  } catch {
    // Die Ausnahme wird bewusst nicht angesehen: sie kann die Anfrage samt
    // Kopfzeilen enthalten und damit den Schlüssel.
    return [];
  } finally {
    clearTimeout(wecker);
  }
}

/** Kennungen aus der Antwort ziehen, ohne dem Format zu vertrauen. */
export function kennungenAus(koerper: unknown): readonly string[] {
  if (typeof koerper !== "object" || koerper === null) return [];
  const daten = (koerper as { data?: unknown }).data;
  if (!Array.isArray(daten)) return [];
  const namen: string[] = [];
  for (const eintrag of daten) {
    if (typeof eintrag !== "object" || eintrag === null) continue;
    const kennung = (eintrag as { id?: unknown }).id;
    if (typeof kennung === "string" && kennung.length > 0) namen.push(kennung);
  }
  return namen.sort();
}

/**
 * Die Kennungen, die einer gesuchten am ähnlichsten sind.
 *
 * Bewusst grob: es geht darum, `nvidia/laguna-xs-2.1` neben
 * `moonshot/laguna-xs-2.1` zu legen, damit der Unterschied ins Auge springt.
 * Verglichen wird auf den Wortbestandteilen, nicht auf Zeichenabstand — ein
 * Herausgeberwechsel verschiebt den halben String, ändert aber kein Wort.
 */
export function aehnlichste(
  gesucht: string,
  vorhanden: readonly string[],
  anzahl = 5,
): readonly string[] {
  const teile = (s: string): string[] =>
    s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
  const soll = new Set(teile(gesucht));
  return [...vorhanden]
    .map((kennung) => {
      const ist = teile(kennung);
      const treffer = ist.filter((t) => soll.has(t)).length;
      return { kennung, treffer };
    })
    .filter((e) => e.treffer > 0)
    .sort((a, b) => b.treffer - a.treffer || a.kennung.localeCompare(b.kennung))
    .slice(0, anzahl)
    .map((e) => e.kennung);
}
