/**
 * Die Zugänge zu den Diensten — eine Stelle, an der sie gelesen werden.
 *
 * CLAUDE.md §2.4: „Keys kommen aus GitHub Secrets (CI) bzw. den
 * Vercel-Umgebungsvariablen (Laufzeit). Ein Key im Diff ist ein Abbruchgrund."
 *
 * Warum überhaupt eine Datei dafür, wo `process.env.X` doch kürzer ist:
 *
 * * **Ein fehlender Zugang muss zur Startzeit auffallen, nicht mitten im
 *   Lauf.** Ein `undefined`, das in eine Anfrage wandert, führt zu einem 401
 *   von einem fremden Dienst — und diese Fehlermeldung erklärt niemandem, dass
 *   ein Secret fehlt.
 * * **Der Wert darf nie in einer Meldung landen.** Wer `process.env` über den
 *   Code verstreut, hat irgendwann ein `console.error(config)` — und damit den
 *   Schlüssel im Protokoll eines öffentlichen CI-Laufs. Hier gibt es genau
 *   eine Stelle, an der das passieren könnte, und sie tut es nicht.
 * * **Die Namen stehen an einer Stelle.** Was in den Secrets liegen muss, ist
 *   damit ablesbar statt zusammensuchbar.
 *
 * Diese Datei kennt **keine** Vorgabewerte für Schlüssel. Ein eingebauter
 * Standardwert wäre entweder ein echter Schlüssel im Quelltext oder ein
 * Platzhalter, der einen Fehlschlag in einen unverständlichen verwandelt.
 */

/** Ein Zugang, den ein Dienst braucht. */
export interface Zugang {
  /** Name der Umgebungsvariable — identisch zum Namen des GitHub Secrets. */
  readonly name: string;
  /** Wofür, in einem Satz. Erscheint in der Fehlermeldung. */
  readonly wofuer: string;
  /** Ab wann gebraucht — damit man sieht, was jetzt fehlen darf. */
  readonly abStufe: "M0" | "M1" | "später";
}

/**
 * Was BYB an Zugängen kennt.
 *
 * `NVIDIA_BASE_URL` und `NVIDIA_MODEL` sind **keine** Geheimnisse; sie stehen
 * hier trotzdem, damit die Modellwahl an einer Stelle liegt und nicht in einer
 * Anfrage vergraben ist.
 */
export const ZUGAENGE = {
  // Drei Modelle, drei Schluessel. Getrennt, weil sie es in den Secrets auch
  // sind — und weil ein abgelaufener Schluessel dann genau ein Modell
  // ausfallen laesst statt alle drei.
  nvApiKey1: {
    name: "NV_API_KEY_1",
    wofuer: "Zugang zu nemotron-3-ultra-550b-a55b",
    abStufe: "M1",
  },
  nvApiKey2: {
    name: "NV_API_KEY_2",
    wofuer: "Zugang zu laguna-xs-2.1",
    abStufe: "M1",
  },
  nvApiKey3: {
    name: "NV_API_KEY_3",
    wofuer: "Zugang zu step-3.7-flash",
    abStufe: "M1",
  },
  nvidiaBaseUrl: {
    name: "NVIDIA_BASE_URL",
    wofuer: "Endpunkt der Modelle",
    abStufe: "M1",
  },
  neonApiKey: {
    name: "NEON_API_KEY",
    wofuer: "Datenbank je Lauf anlegen (Branching)",
    abStufe: "M1",
  },
  datenbankUrl: {
    name: "DATABASE_URL",
    wofuer: "Verbindung zur Datenbank des Backends",
    abStufe: "M1",
  },
} as const satisfies Record<string, Zugang>;

export type ZugangsName = keyof typeof ZUGAENGE;

/** Werte ohne Geheimnischarakter dürfen einen Vorgabewert haben. */
const VORGABEN: Partial<Record<ZugangsName, string>> = {
  // Aus dem bisherigen Aufbau übernommen — der Endpunkt ist öffentlich
  // dokumentiert und kein Geheimnis.
  nvidiaBaseUrl: "https://integrate.api.nvidia.com/v1",
};

export class ZugangFehlt extends Error {
  readonly zugang: Zugang;

  constructor(zugang: Zugang) {
    super(
      `${zugang.name} ist nicht gesetzt (${zugang.wofuer}). `
      + `Der Wert gehört in die GitHub Secrets des Repositorys, nicht in den `
      + `Quelltext.`,
    );
    this.name = "ZugangFehlt";
    this.zugang = zugang;
  }
}

/**
 * Einen Zugang lesen. Wirft, wenn er fehlt.
 *
 * `umgebung` ist einsetzbar, damit Tests nicht am globalen `process.env`
 * herumschrauben müssen — ein Test, der das tut, beeinflusst die Tests, die
 * nach ihm laufen.
 */
export function zugang(
  name: ZugangsName,
  umgebung: Record<string, string | undefined> = process.env,
): string {
  const eintrag: Zugang = ZUGAENGE[name];
  const wert = umgebung[eintrag.name]?.trim();
  if (wert !== undefined && wert.length > 0) return wert;
  const vorgabe = VORGABEN[name];
  if (vorgabe !== undefined) return vorgabe;
  throw new ZugangFehlt(eintrag);
}

/** Ist ein Zugang gesetzt — ohne ihn zu lesen. */
export function zugangVorhanden(
  name: ZugangsName,
  umgebung: Record<string, string | undefined> = process.env,
): boolean {
  const wert = umgebung[ZUGAENGE[name].name]?.trim();
  return wert !== undefined && wert.length > 0;
}

/**
 * Übersicht, welche Zugänge gesetzt sind — **ohne Werte**.
 *
 * Das ist die Antwort auf „liegen die Schlüssel richtig?", die sich
 * beantworten lässt, ohne einen davon anzuzeigen. Genau diese Auskunft gibt
 * der CI-Lauf aus.
 */
export function zugangsUebersicht(
  umgebung: Record<string, string | undefined> = process.env,
): { readonly name: string; readonly gesetzt: boolean; readonly abStufe: string }[] {
  return (Object.keys(ZUGAENGE) as ZugangsName[]).map((schluessel) => ({
    name: ZUGAENGE[schluessel].name,
    gesetzt: zugangVorhanden(schluessel, umgebung),
    abStufe: ZUGAENGE[schluessel].abStufe,
  }));
}
