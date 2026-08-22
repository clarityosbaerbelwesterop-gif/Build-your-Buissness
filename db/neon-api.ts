/**
 * Die Neon-API — Projekte, Zweige, Verbindungen.
 *
 * Eigene Datei, weil `db/migrieren.ts` beim Laden eine Migration ausfuehrt.
 * Alles, was von dort importiert wuerde, loeste sie mit aus. Der RLS-Nachweis
 * braucht dieselben Aufrufe und darf dabei nicht nebenbei migrieren.
 *
 * Was hier drinsteckt, ist teuer erarbeitet: Neon kennt persoenliche,
 * organisationsgebundene und **projektgebundene** Schluessel, und die drei
 * verhalten sich an `/projects` verschieden. Der projektgebundene darf gar
 * keine Liste abrufen — er nennt sein Projekt dafuer in der Absage.
 */

import { gesetzt, optional } from "../config/umgebung.js";
import { entschaerfen, projektAusAbsage } from "./entschaerfen.js";

const API = "https://console.neon.tech/api/v2";

export interface Projekt {
  readonly id: string;
  readonly name: string;
}

interface Organisation {
  readonly id: string;
  readonly name: string;
}

export class NeonFehler extends Error {
  readonly status: number;
  constructor(status: number, pfad: string, hinweis: string) {
    super(`Neon: HTTP ${status} bei ${pfad}${hinweis}`);
    this.name = "NeonFehler";
    this.status = status;
  }
}

export async function neon(
  pfad: string,
  schluessel: string,
  init?: RequestInit,
): Promise<unknown> {
  const antwort = await fetch(`${API}${pfad}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${schluessel}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!antwort.ok) {
    // Frueher stand hier nur Status und Pfad. Das war zu wenig: ein „HTTP 404
    // bei /projects" liess offen, ob der Schluessel falsch ist, der Pfad, oder
    // ob schlicht ein Parameter fehlt. Die Meldung des Anbieters beantwortet
    // das meistens — gefiltert, damit kein Schluessel im CI-Protokoll landet.
    const roh = await antwort.text().catch(() => "");
    const hinweis = roh.length > 0 ? ` — ${entschaerfen(roh)}` : "";
    throw new NeonFehler(antwort.status, pfad, hinweis);
  }
  return antwort.json();
}

/**
 * Die Projekte, die dieser Schluessel sieht.
 *
 * Zwei Wege, weil Neon zwei Sorten Schluessel kennt:
 *
 * * Ein **Organisations**-Schluessel kennt seine Organisation selbst.
 * * Ein **persoenlicher** Schluessel nicht. Fuer ihn braucht `/projects` den
 *   Parameter `org_id` — und liegen die Projekte einer Organisation, ohne den
 *   Parameter, antwortet Neon mit 404 statt mit einer leeren Liste.
 *
 * Genau das ist beim ersten Trockenlauf passiert. Deshalb wird der zweite Weg
 * nicht geraten, sondern gegangen: erst ohne Parameter fragen, bei 404 die
 * Organisationen des Schluessels holen und je Organisation nachfragen.
 */
async function projekteHolen(schluessel: string): Promise<Projekt[]> {
  try {
    const daten = await neon("/projects", schluessel) as { projects?: Projekt[] };
    const projekte = daten.projects ?? [];
    if (projekte.length > 0) return projekte;
  } catch (fehler) {
    if (!(fehler instanceof NeonFehler) || fehler.status !== 404) throw fehler;
    // Ein projektgebundener Schluessel nennt beim Ablehnen sein Projekt. Dann
    // ist die Frage „welches Projekt?" schon beantwortet, und jede weitere
    // Anfrage waere nur ein weiteres 404.
    const ausAbsage = projektAusAbsage(fehler.message);
    if (ausAbsage !== undefined) {
      console.error(`  Schlüssel ist an ein Projekt gebunden: ${ausAbsage}`);
      return [{ id: ausAbsage, name: ausAbsage }];
    }
    console.error("  /projects ohne org_id: 404 — versuche es je Organisation.");
  }

  const orgs = await neon("/users/me/organizations", schluessel) as
    { organizations?: Organisation[] };
  const liste = orgs.organizations ?? [];
  if (liste.length === 0) {
    throw new Error(
      "Der Schlüssel sieht weder Projekte noch Organisationen. "
      + "Er gehört vermutlich zu einem anderen Konto als das Neon-Projekt.",
    );
  }
  console.error(`  ${liste.length} Organisation(en): ${liste.map((o) => o.name).join(", ")}`);

  const gesammelt: Projekt[] = [];
  for (const org of liste) {
    try {
      const daten = await neon(
        `/projects?org_id=${encodeURIComponent(org.id)}`,
        schluessel,
      ) as { projects?: Projekt[] };
      gesammelt.push(...(daten.projects ?? []));
    } catch (fehler) {
      if (!(fehler instanceof NeonFehler) || fehler.status !== 404) throw fehler;
      const ausAbsage = projektAusAbsage(fehler.message);
      if (ausAbsage === undefined) throw fehler;
      console.error(`  Schlüssel ist an ein Projekt gebunden: ${ausAbsage}`);
      return [{ id: ausAbsage, name: ausAbsage }];
    }
  }
  return gesammelt;
}

export async function projektWaehlen(schluessel: string): Promise<Projekt> {
  const gewuenscht = gesetzt("NEON_PROJECT_ID");

  // Steht die Kennung fest, ist die Liste ueberfluessig — und ein
  // projektgebundener Schluessel darf sie ohnehin nicht abrufen. Die Liste
  // dient dem Finden, nicht dem Arbeiten.
  if (gewuenscht !== undefined) {
    return { id: gewuenscht, name: gewuenscht };
  }

  const projekte = await projekteHolen(schluessel);

  if (projekte.length === 0) {
    throw new Error("Im Neon-Konto liegt kein Projekt.");
  }
  if (projekte.length > 1) {
    // Raten waere hier besonders schlecht: die Migration legt Tabellen an,
    // und im falschen Projekt merkt es niemand sofort.
    const namen = projekte.map((p) => `${p.name} (${p.id})`).join(", ");
    throw new Error(
      `Es gibt ${projekte.length} Projekte: ${namen}. `
      + "Bitte NEON_PROJECT_ID als Secret setzen — ich rate hier nicht.",
    );
  }
  const einziges = projekte[0];
  if (einziges === undefined) throw new Error("Projektliste unerwartet leer.");
  return einziges;
}

/**
 * Ein Zweig der Datenbank — eine eigene Kopie, die Sekunden kostet.
 *
 * Das ist der Grund, warum in CLAUDE.md §3 „Neon (Postgres, Branching pro
 * Lauf)" steht: eine Pruefung, die Zeilen anlegt und wieder loescht, darf das
 * nicht dort tun, wo echte Daten liegen. CLAUDE.md §2.3 sagt dasselbe
 * strenger — „nie gegen Produktion, nie gegen etwas mit echten Nutzerdaten".
 */
export interface Zweig {
  readonly id: string;
  readonly name: string;
  /** Verbindungszeichenfolge samt Passwort. Nie ausgeben. */
  readonly verbindung: string;
}

/**
 * Einen frischen Zweig anlegen.
 *
 * Vom **Vorgabezweig** abgezweigt, nicht von irgendeinem: ein Zweig von einem
 * Zweig erbt dessen Zustand, und dann prueft der Nachweis ein Schema, das
 * jemand anderes zwischendurch veraendert hat.
 *
 * Die Verbindungszeichenfolge kommt aus derselben Antwort. Ein zweiter Aufruf
 * dafuer waere eine zweite Stelle, an der etwas schiefgehen kann.
 */
export async function zweigAnlegen(
  projektId: string,
  schluessel: string,
  name: string,
): Promise<Zweig> {
  const datenbank = optional("NEON_DATABASE", "neondb");
  const rolle = optional("NEON_ROLE", "neondb_owner");

  const antwort = await neon(`/projects/${projektId}/branches`, schluessel, {
    method: "POST",
    body: JSON.stringify({
      branch: { name },
      // Ohne Endpunkt gibt es keinen Rechner, mit dem man sich verbindet —
      // der Zweig existiert dann, ist aber nicht erreichbar.
      endpoints: [{ type: "read_write" }],
    }),
  }) as {
    branch?: { id?: unknown; name?: unknown };
    connection_uris?: { connection_uri?: unknown; connection_parameters?: unknown }[];
  };

  const id = antwort.branch?.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Neon hat keinen Zweig zurueckgegeben.");
  }

  const uri = antwort.connection_uris?.[0]?.connection_uri;
  if (typeof uri !== "string" || uri.length === 0) {
    // Der Zweig steht schon. Ihn hier liegen zu lassen waere ein Zweig, den
    // niemand mehr aufraeumt — und Neon zaehlt sie.
    await zweigLoeschen(projektId, schluessel, id).catch(() => undefined);
    throw new Error(
      `Neon hat fuer den Zweig keine Verbindung geliefert `
      + `(Datenbank ${datenbank}, Rolle ${rolle}).`,
    );
  }

  const zweigName = typeof antwort.branch?.name === "string" ? antwort.branch.name : name;
  return { id, name: zweigName, verbindung: uri };
}

/**
 * Einen Zweig loeschen.
 *
 * Wirft nicht bei 404: ein Zweig, den es nicht mehr gibt, ist genau der
 * Zustand, den dieser Aufruf herstellen soll. Beim Aufraeumen in einem
 * `finally` ist ein Fehlschlag darueber hinaus das Letzte, was jemand
 * gebrauchen kann — er ueberdeckte den eigentlichen Fehler.
 */
export async function zweigLoeschen(
  projektId: string,
  schluessel: string,
  zweigId: string,
): Promise<void> {
  try {
    await neon(`/projects/${projektId}/branches/${zweigId}`, schluessel, {
      method: "DELETE",
    });
  } catch (fehler) {
    if (fehler instanceof NeonFehler && fehler.status === 404) return;
    throw fehler;
  }
}
