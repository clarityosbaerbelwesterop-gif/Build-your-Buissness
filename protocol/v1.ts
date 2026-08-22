/**
 * Der Datenvertrag für einen Debug-/Security-Prüflauf.
 *
 * BYB ist der autonome Business-Operator; dieses Protokoll ist seine Audit- und
 * Vertrauensschicht für Prüfungen. Es muss deshalb exakt festhalten, was
 * tatsächlich geprüft, gefunden, behoben oder offengelassen wurde, ohne daraus
 * eine allgemeine Sicherheitsbehauptung abzuleiten.
 *
 * Warum Zod und nicht nur Typen: Typen verschwinden beim Übersetzen. Ein
 * Befund kommt später aus einem Sprachmodell, und ein Modell hält sich nicht
 * an Typen. Die Prüfung muss zur Laufzeit stattfinden, sonst landet ein
 * halbgares Objekt im Protokoll und der Fehler zeigt sich erst im Browser des
 * Kunden.
 *
 * Warum ab v1 versioniert: das Protokoll wird gespeichert und Monate später
 * wieder angezeigt. Ein gespeichertes Protokoll ohne Versionsangabe lässt sich
 * nach der ersten Schemaänderung nicht mehr zuverlässig lesen — man rät dann,
 * welche Fassung gemeint war.
 */

import { z } from "zod";

export const PROTOKOLL_VERSION = 1 as const;

/**
 * Der Zustand eines Befunds.
 *
 * `wieder_aufgetreten` ist der Grund, warum es die Schleife überhaupt gibt.
 * Ein Fix kann einen früheren Fix zerstören; ohne eigenen Zustand dafür sähe
 * ein solcher Lauf aus wie ein erfolgreicher.
 */
export const Zustand = z.enum([
  "gefunden",
  "fix_versucht",
  "behoben",
  "offen",
  "wieder_aufgetreten",
]);
export type Zustand = z.infer<typeof Zustand>;

/**
 * Wie schwer wiegt ein Fund.
 *
 * Vier Stufen, nicht zehn. Wer zehn hat, streitet über die Grenze zwischen 6
 * und 7 statt den Fund zu beheben.
 */
export const Schweregrad = z.enum(["kritisch", "hoch", "mittel", "niedrig"]);
export type Schweregrad = z.infer<typeof Schweregrad>;

/**
 * Die Kategorie ist die Zeile im Protokoll, die der Nutzer sieht
 * (DESIGN-UI.md, „Prüfzeile"). Die Angriffsklasse ist der konkrete Versuch
 * darunter.
 *
 * Beides getrennt, weil eine Kategorie mehrere Klassen enthält: „Zugangsdaten"
 * umfasst den Fund im Quelltext und den im ausgelieferten Bündel — für den
 * Nutzer ist es eine Zeile, für den Angreifer sind es zwei Prüfungen.
 */
export const Kategorie = z.enum([
  "zugangsdaten",
  "datenzugriff",
  "authentifizierung",
]);
export type Kategorie = z.infer<typeof Kategorie>;

/**
 * Eine Angriffsklasse ist eine benennbare Prüfung. Freier Text und keine
 * Aufzählung: die Liste wächst mit jedem neuen Angreifer, und eine Aufzählung
 * hier zwänge jeden neuen Angreifer zu einer Änderung am Datenvertrag.
 * Die Kategorie darüber bleibt geschlossen — sie steuert die Anzeige.
 */
export const Angriffsklasse = z.string().min(3).max(80);

export const Befund = z.object({
  id: z.string().min(1),
  kategorie: Kategorie,
  angriffsklasse: Angriffsklasse,
  schweregrad: Schweregrad,

  /**
   * CHATHUB.md: ein Satz pro Fund, für Nicht-Techniker verständlich.
   *
   * Die Mindestlänge ist Absicht. „SQL-Injection" erfüllt kein Feld, das
   * erklären soll, was möglich war — und genau solche Halbsätze entstehen,
   * wenn ein Modell ein Pflichtfeld füllen muss.
   */
  klartext: z.string().min(20).max(400),

  /** Der technische Nachweis: Datei, Zeile, Auszug, Anfrage — was es belegt. */
  nachweis: z.string().min(1),

  zustand: Zustand,

  /** In welcher Runde der Fund entstand. Zählung ab 1, wie im Protokoll. */
  runde: z.number().int().min(1),

  /** Millisekunden seit Epoche. Zahl statt Zeichenkette: sortierbar ohne Parsen. */
  zeitstempel: z.number().int().min(0),
});
export type Befund = z.infer<typeof Befund>;

/** Was eine Runde gekostet hat. Ohne Messung gibt es keinen Kostendeckel. */
export const Kosten = z.object({
  tokens_ein: z.number().int().min(0),
  tokens_aus: z.number().int().min(0),
  laufzeit_ms: z.number().int().min(0),
});
export type Kosten = z.infer<typeof Kosten>;

export const Runde = z.object({
  nummer: z.number().int().min(1),
  /** Welche Angriffsklassen in dieser Runde tatsächlich liefen. */
  gelaufene_klassen: z.array(Angriffsklasse),
  /** Die Befunde nach dieser Runde — neue und erneut geprüfte. */
  befunde: z.array(Befund),
  kosten: Kosten,
});
export type Runde = z.infer<typeof Runde>;

/**
 * Warum die Schleife aufgehört hat.
 *
 * Der Grund steht im Protokoll, weil „fertig" und „Geld alle" für den Nutzer
 * völlig verschiedene Dinge bedeuten. Ein Protokoll ohne Abbruchgrund lässt
 * beides gleich aussehen.
 */
export const Abbruchgrund = z.enum([
  "keine_offenen_befunde",
  "rundenlimit",
  "kostendeckel",
]);
export type Abbruchgrund = z.infer<typeof Abbruchgrund>;

export const Endzustand = z.enum(["sauber", "offene_punkte"]);
export type Endzustand = z.infer<typeof Endzustand>;

export const Protokoll = z.object({
  version: z.literal(PROTOKOLL_VERSION),
  lauf_id: z.string().min(1),
  begonnen: z.number().int().min(0),
  beendet: z.number().int().min(0),

  /**
   * Alle Angriffsklassen, die in diesem Lauf gelaufen sind — auch die ohne
   * Fund.
   *
   * CHATHUB.md verlangt „geprüft auf X, gefunden Y". Ohne diese Liste fehlt
   * das X: ein leeres Protokoll wäre nicht von einem Lauf zu unterscheiden,
   * bei dem gar nicht geprüft wurde.
   */
  gelaufene_klassen: z.array(Angriffsklasse),

  runden: z.array(Runde),
  befunde: z.array(Befund),
  endzustand: Endzustand,
  abbruchgrund: Abbruchgrund,
  kosten_gesamt: Kosten,
});
export type Protokoll = z.infer<typeof Protokoll>;

/**
 * Ein Protokoll aus unbekannter Quelle einlesen.
 *
 * Wirft bei Verstoß, statt ein halb gültiges Objekt zurückzugeben — ein
 * Protokoll, dem man nicht trauen kann, ist schlimmer als keins.
 */
export function protokollLesen(roh: unknown): Protokoll {
  return Protokoll.parse(roh);
}

/**
 * Endzustand aus den Befunden ableiten statt ihn mitzuführen.
 *
 * Zwei Quellen für dieselbe Aussage laufen auseinander. Diese hier ist die
 * einzige.
 */
export function endzustandAus(befunde: readonly Befund[]): Endzustand {
  return befunde.some((b) => b.zustand !== "behoben") ? "offene_punkte" : "sauber";
}

/** Ein Befund gilt als offen, solange er nicht nachweislich behoben ist. */
export function istOffen(befund: Befund): boolean {
  return befund.zustand !== "behoben";
}
