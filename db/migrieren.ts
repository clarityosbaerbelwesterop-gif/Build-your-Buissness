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

const API = "https://console.neon.tech/api/v2";

interface Projekt {
  readonly id: string;
  readonly name: string;
}

async function neon(pfad: string, schluessel: string, init?: RequestInit): Promise<unknown> {
  const antwort = await fetch(`${API}${pfad}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${schluessel}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!antwort.ok) {
    // Nur Status und Pfad — die Antwort eines Anbieters kann die Anfrage
    // zurueckspiegeln, samt Kopfzeilen.
    throw new Error(`Neon lehnte ab (HTTP ${antwort.status}) bei ${pfad}`);
  }
  return antwort.json();
}

async function projektWaehlen(schluessel: string): Promise<Projekt> {
  const gewuenscht = process.env["NEON_PROJECT_ID"]?.trim();
  const daten = await neon("/projects", schluessel) as { projects?: Projekt[] };
  const projekte = daten.projects ?? [];

  if (projekte.length === 0) {
    throw new Error("Im Neon-Konto liegt kein Projekt.");
  }
  if (gewuenscht !== undefined && gewuenscht.length > 0) {
    const treffer = projekte.find((p) => p.id === gewuenscht);
    if (treffer === undefined) {
      throw new Error(`NEON_PROJECT_ID zeigt auf ein Projekt, das es nicht gibt.`);
    }
    return treffer;
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
  body: JSON.stringify({ query: sql, database: "neondb", role: "neondb_owner" }),
});

console.error("Schema angewendet.");
console.error("Row Level Security ist auf jeder Tabelle eingeschaltet UND erzwungen.");
