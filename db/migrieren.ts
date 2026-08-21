/**
 * Die Migration gegen Neon anwenden.
 *
 * Läuft **nur** in der CI, von Hand ausgelöst (workflow_dispatch). Nicht bei
 * jedem Push: eine Migration, die bei jedem Commit gegen die Datenbank läuft,
 * ist die Sorte Automatik, bei der irgendwann jemand ein `drop` durchrutschen
 * lässt und es niemand vorher gesehen hat.
 *
 * Der Weg geht über die Neon-API, nicht über eine Postgres-Verbindung: so
 * braucht der Lauf nur `NEON_API_KEY` und keinen Netzweg zur Datenbank.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { zugang } from "../config/zugaenge.js";
import { entschaerfen, projektAusAbsage } from "./entschaerfen.js";

const API = "https://console.neon.tech/api/v2";

interface Projekt {
  readonly id: string;
  readonly name: string;
}

interface Organisation {
  readonly id: string;
  readonly name: string;
}

class NeonFehler extends Error {
  readonly status: number;
  constructor(status: number, pfad: string, hinweis: string) {
    super(`Neon: HTTP ${status} bei ${pfad}${hinweis}`);
    this.name = "NeonFehler";
    this.status = status;
  }
}

async function neon(
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

async function projektWaehlen(schluessel: string): Promise<Projekt> {
  const gewuenscht = process.env["NEON_PROJECT_ID"]?.trim();

  // Steht die Kennung fest, ist die Liste ueberfluessig — und ein
  // projektgebundener Schluessel darf sie ohnehin nicht abrufen. Die Liste
  // dient dem Finden, nicht dem Arbeiten.
  if (gewuenscht !== undefined && gewuenscht.length > 0) {
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

const schluessel = zugang("neonApiKey");
const projekt = await projektWaehlen(schluessel);
console.error(`Projekt: ${projekt.name} (${projekt.id})`);

const sql = readFileSync(
  fileURLToPath(new URL("./001_grundschema.sql", import.meta.url)),
  "utf8",
);

const nurLesen = process.argv.includes("--trocken");
if (nurLesen) {
  console.error(`Trockenlauf: ${sql.split(";").length - 1} Anweisungen, nichts gesendet.`);
  process.exit(0);
}

await neon(`/projects/${projekt.id}/query`, schluessel, {
  method: "POST",
  // Die Feldnamen sind `db_name` und `role_name`, nicht `database`/`role`.
  // Der erste Anwendungsversuch endete an genau dieser Stelle mit
  // „invalid: db_name (field required)" — die Anfrage war sonst korrekt, sie
  // kam beim richtigen Projekt an und wurde nur wegen der Benennung abgelehnt.
  //
  // Beide ueberschreibbar: `neondb` und `neondb_owner` sind Neons Vorgaben,
  // aber wer sein Projekt selbst angelegt hat, kann andere Namen haben. Ein
  // fester Wert waere hier ein Fehlschlag ohne Ausweg.
  body: JSON.stringify({
    query: sql,
    db_name: process.env["NEON_DATABASE"]?.trim() ?? "neondb",
    role_name: process.env["NEON_ROLE"]?.trim() ?? "neondb_owner",
  }),
});

console.error("Schema angewendet.");
console.error("Row Level Security ist auf jeder Tabelle eingeschaltet UND erzwungen.");
