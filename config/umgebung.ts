/**
 * Umgebungsvariablen lesen — an genau einer Stelle, mit einer Regel.
 *
 * Die Regel: **leer zählt als nicht gesetzt.**
 *
 * Sie steht hier, weil sie uns einen halben Nachmittag gekostet hat. GitHub
 * Actions schreibt ein Secret, das es nicht gibt, als **leere Zeichenkette**
 * in die Umgebung — nicht als „fehlt". Damit greift die naheliegende
 * Schreibweise nicht:
 *
 *     process.env["NEON_DATABASE"] ?? "neondb"   // liefert "", nicht "neondb"
 *
 * `""` ist nicht nullish, also gewinnt der leere Wert und die Vorgabe wird nie
 * benutzt. Die Anfrage ging raus als `?database_name=&role_name=` und der
 * Anbieter antwortete mit „unknown error" — verständlich, denn die Frage war
 * unsinnig.
 *
 * Deshalb gibt es in diesem Repo **kein `??` auf einer Umgebungsvariablen**.
 * Wer einen Wert braucht, nimmt `pflicht()`; wer eine Vorgabe hat, nimmt
 * `optional()`. Beide behandeln leer wie fehlend.
 */

/** Fehlt eine Variable, sagt die Meldung **welche**. */
export class UmgebungFehlt extends Error {
  readonly namen: readonly string[];

  constructor(namen: readonly string[], wofuer?: string) {
    const liste = namen.join(", ");
    super(
      namen.length === 1
        ? `${liste} ist nicht gesetzt${wofuer === undefined ? "" : ` (${wofuer})`}. `
          + `Der Wert gehört in die GitHub Secrets, nicht in den Quelltext.`
        : `Diese Umgebungsvariablen fehlen oder sind leer: ${liste}. `
          + `Sie gehören in die GitHub Secrets, nicht in den Quelltext.`,
    );
    this.name = "UmgebungFehlt";
    this.namen = namen;
  }
}

/**
 * Der rohe Zugriff. Leer und Leerraum zählen als nicht gesetzt.
 *
 * Schneidet Leerraum ab: ein Wert aus der Zwischenablage trägt gern ein
 * Zeilenende mit, und ein Schlüssel mit `\n` am Ende scheitert mit einer
 * Meldung, die nach einem Serverproblem aussieht.
 */
export function gesetzt(
  name: string,
  umgebung: Record<string, string | undefined> = process.env,
): string | undefined {
  const wert = umgebung[name]?.trim();
  return wert === undefined || wert.length === 0 ? undefined : wert;
}

/** Eine Variable, ohne die es nicht weitergeht. Wirft mit ihrem Namen. */
export function pflicht(
  name: string,
  wofuer: string,
  umgebung: Record<string, string | undefined> = process.env,
): string {
  const wert = gesetzt(name, umgebung);
  if (wert === undefined) throw new UmgebungFehlt([name], wofuer);
  return wert;
}

/**
 * Eine Variable mit Vorgabe.
 *
 * Die Vorgabe steht als Argument da, nicht hinter einem `??` — damit sie im
 * Aufruf sichtbar ist und nicht in einer Kette untergeht. Nur für Werte ohne
 * Geheimnischarakter: ein eingebauter Standardschlüssel wäre entweder echt
 * (und damit ein Schlüssel im Quelltext) oder ein Platzhalter, der einen
 * klaren Fehlschlag in einen unverständlichen verwandelt.
 */
export function optional(
  name: string,
  vorgabe: string,
  umgebung: Record<string, string | undefined> = process.env,
): string {
  return gesetzt(name, umgebung) ?? vorgabe;
}

/**
 * Alle auf einmal prüfen, bevor irgendetwas läuft.
 *
 * **Alle** fehlenden auf einmal melden, nicht die erste. Wer sie einzeln
 * erfährt, hinterlegt ein Secret, startet neu, wartet auf die CI, erfährt die
 * nächste — vier Runden für vier Namen. Diese Meldung nennt sie in einer.
 */
export function pruefeStart(
  erforderlich: readonly { readonly name: string; readonly wofuer: string }[],
  umgebung: Record<string, string | undefined> = process.env,
): void {
  const fehlend = erforderlich
    .filter((e) => gesetzt(e.name, umgebung) === undefined)
    .map((e) => e.name);
  if (fehlend.length > 0) throw new UmgebungFehlt(fehlend);
}
